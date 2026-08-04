import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { createServerSupabaseAuthClient } from "@/lib/supabaseClient";
import { isSupabaseRecordsMode, recordsAppBaseUrl } from "@/lib/records/authServer";
import {
  attorneyAcceptanceCookieName,
  findPendingAttorneyOnboardingForEmail,
  findPendingAttorneyInvitationForEmail,
} from "@/lib/records/attorneyServer";
import {
  createAttorneyInvitationToken,
  hashAttorneyInvitationToken,
  normalizeAttorneyEmail,
} from "@/lib/records/attorneyCrypto";
import { checkAttorneyGuestEntitlement } from "@/lib/records/attorneyEntitlement";
import { attorneyOnboardingEmailDurationMs } from "@/lib/records/attorneyPolicy";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import { recordSecurityEvent } from "@/lib/security/securityEvents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unavailableInvitation() {
  return NextResponse.json(
    { error: "Invitation is invalid, expired, already used, or does not match that email." },
    { status: 404, headers: { "Cache-Control": "no-store" } }
  );
}

function isExistingAuthIdentityError(error: { code?: string } | null) {
  return error?.code === "email_exists" || error?.code === "user_already_exists";
}

export async function POST(request: NextRequest) {
  if (!isSupabaseRecordsMode()) {
    return NextResponse.json({ error: "Records account access is not enabled." }, { status: 501 });
  }
  const entitlement = checkAttorneyGuestEntitlement("");
  if (!entitlement.allowed) {
    return NextResponse.json(
      { error: entitlement.reason },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();

  const rateLimit = checkRateLimit(request, {
    id: "records-attorney-invited-signup",
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    adultConfirmed?: unknown;
  };
  const email = typeof body.email === "string" ? normalizeAttorneyEmail(body.email) : "";
  const adultConfirmed = body.adultConfirmed === true;
  if (!adultConfirmed || !email.includes("@")) {
    return NextResponse.json(
      { error: "Enter the invited email and confirm adult use." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const token = request.cookies.get(attorneyAcceptanceCookieName)?.value || "";
  let invitation:
    | Awaited<ReturnType<typeof findPendingAttorneyInvitationForEmail>>
    | Awaited<ReturnType<typeof findPendingAttorneyOnboardingForEmail>>;
  try {
    invitation = await findPendingAttorneyInvitationForEmail({ token, email });
    if (!invitation) {
      invitation = await findPendingAttorneyOnboardingForEmail({ token, email });
    }
    if (!invitation) return unavailableInvitation();
  } catch {
    return NextResponse.json(
      { error: "Attorney invitation verification is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } }
    );
  }

  const redirectUrl = new URL("/records", recordsAppBaseUrl(request));
  redirectUrl.searchParams.set("auth", "attorney-invite");
  redirectUrl.searchParams.set("next", "/attorney/accept");
  redirectUrl.searchParams.set("invite", "1");
  const onboardingToken = createAttorneyInvitationToken();
  const onboardingTokenHash = hashAttorneyInvitationToken(onboardingToken);
  const onboardingExpiresAt = new Date(
    Date.now() + attorneyOnboardingEmailDurationMs
  ).toISOString();
  redirectUrl.searchParams.set("attorney_token", onboardingToken);

  const admin = createSupabaseAdminClient();
  let onboardingStored = false;
  try {
    const onboardingUpdate = await admin
      .from("records_attorney_invitations")
      .update({
        onboarding_token_hash: onboardingTokenHash,
        onboarding_expires_at: onboardingExpiresAt,
        last_sent_at: new Date().toISOString(),
      })
      .eq("id", invitation.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (onboardingUpdate.error || !onboardingUpdate.data?.id) {
      throw onboardingUpdate.error || new Error("Attorney onboarding binding was not stored.");
    }
    onboardingStored = true;

    const invited = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectUrl.toString(),
    });

    if (invited.error && isExistingAuthIdentityError(invited.error)) {
      const authClient = createServerSupabaseAuthClient();
      const existingAccountLink = await authClient.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectUrl.toString(),
          shouldCreateUser: false,
        },
      });
      if (existingAccountLink.error) throw existingAccountLink.error;
    } else if (invited.error || !invited.data.user?.id) {
      throw invited.error || new Error("Supabase did not create an invited identity.");
    }
  } catch {
    if (onboardingStored) {
      await admin
        .from("records_attorney_invitations")
        .update({ onboarding_token_hash: null, onboarding_expires_at: null })
        .eq("id", invitation.id)
        .eq("onboarding_token_hash", onboardingTokenHash);
    }
    await recordSecurityEvent({
      type: "auth_signup_failed",
      severity: "warning",
      request,
      status: 503,
      detail: "Secure invited-attorney email delivery failed.",
    });
    return NextResponse.json(
      { error: "Unable to send the secure attorney account link. Try again shortly." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } }
    );
  }

  await recordSecurityEvent({
    type: "auth_signup_requested",
    severity: "info",
    request,
    status: 200,
    detail: "Mailbox-verified attorney onboarding link requested.",
  });

  return NextResponse.json(
    {
      ok: true,
      message:
        "The email provider accepted a fresh secure account message for delivery. Look for “Your secure Custody Folio attorney access link” from Custody Folio. Check Inbox and Junk for the invited address. If it is still missing after five minutes, ask the record owner to replace the invitation with an address that is confirmed to receive external mail.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
