import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseAuthClient } from "@/lib/supabaseClient";
import {
  isSupabaseRecordsMode,
  recordsAppBaseUrl,
} from "@/lib/records/authServer";
import {
  attorneyAcceptanceCookieName,
  findPendingAttorneyInvitationForEmail,
} from "@/lib/records/attorneyServer";
import { normalizeAttorneyEmail } from "@/lib/records/attorneyCrypto";
import { checkAttorneyGuestEntitlement } from "@/lib/records/attorneyEntitlement";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import { recordSecurityEvent } from "@/lib/security/securityEvents";
import {
  legalAcceptanceMetadata,
  privacyVersion,
  termsVersion,
} from "@/lib/legal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unavailableInvitation() {
  return NextResponse.json(
    { error: "Invitation is invalid, expired, already used, or does not match that email." },
    { status: 404, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
  if (!isSupabaseRecordsMode()) {
    return NextResponse.json(
      { error: "Records account access is not enabled." },
      { status: 501, headers: { "Cache-Control": "no-store" } }
    );
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
    legalAccepted?: unknown;
  };
  const email = typeof body.email === "string" ? normalizeAttorneyEmail(body.email) : "";
  const adultConfirmed = body.adultConfirmed === true;
  const legalAccepted = body.legalAccepted === true;
  if (!adultConfirmed || !legalAccepted || !email.includes("@")) {
    return NextResponse.json(
      {
        error: "Enter the invited email, confirm adult use, and accept the Terms and Privacy Policy.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const token = request.cookies.get(attorneyAcceptanceCookieName)?.value || "";
  try {
    const invitation = await findPendingAttorneyInvitationForEmail({ token, email });
    if (!invitation) return unavailableInvitation();
  } catch {
    return NextResponse.json(
      { error: "Attorney invitation verification is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } }
    );
  }

  const authClient = createServerSupabaseAuthClient();
  const redirectUrl = new URL("/records", recordsAppBaseUrl(request));
  redirectUrl.searchParams.set("auth", "attorney-invite");
  const created = await authClient.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: redirectUrl.toString(),
      data: legalAcceptanceMetadata("attorney_signup"),
    },
  });
  if (created.error) {
    await recordSecurityEvent({
      type: "auth_signup_failed",
      severity: "warning",
      request,
      status: 503,
      detail: "Invited-attorney mailbox verification could not be sent.",
    });
    return NextResponse.json(
      { error: "Unable to send the secure account verification email. Try again shortly." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "60" },
      }
    );
  }

  await recordSecurityEvent({
    type: "auth_signup_requested",
    severity: "info",
    request,
    status: 202,
    detail: "Invitation-gated attorney account requested; mailbox authentication is pending.",
  });
  await recordSecurityEvent({
    type: "policy_terms_accepted",
    severity: "info",
    request,
    status: 202,
    detail: `Terms ${termsVersion}; Privacy ${privacyVersion}; source attorney signup.`,
  });

  return NextResponse.json(
    {
      ok: true,
      message: "Check the invited email and open the secure account link in that message. Custody Folio will then require authenticator verification before opening the shared matter.",
    },
    { status: 202, headers: { "Cache-Control": "no-store" } }
  );
}
