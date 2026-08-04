import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { createServerSupabaseAuthClient } from "@/lib/supabaseClient";
import {
  hashAttorneyInvitationToken,
  isAttorneyInvitationToken,
  revealAttorneyEmail,
} from "@/lib/records/attorneyCrypto";
import { checkAttorneyGuestEntitlement } from "@/lib/records/attorneyEntitlement";
import {
  attorneyAcceptanceCookieName,
  setAttorneyAcceptanceCookie,
} from "@/lib/records/attorneyServer";
import {
  isSupabaseRecordsMode,
  recordsAppBaseUrl,
} from "@/lib/records/authServer";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import { recordSecurityEvent } from "@/lib/security/securityEvents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unavailableInvitation() {
  return NextResponse.json(
    { error: "Invitation is invalid, expired, or already used." },
    { status: 404, headers: { "Cache-Control": "no-store" } }
  );
}

function isExistingAuthIdentityError(error: { code?: string } | null) {
  return error?.code === "email_exists" || error?.code === "user_already_exists";
}

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(request, {
    id: "records-attorney-invitation-prepare",
    limit: 12,
    windowMs: 10 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();
  if (!isSupabaseRecordsMode()) {
    return NextResponse.json(
      { error: "Attorney access is not enabled." },
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

  const body = (await request.json().catch(() => ({}))) as { token?: unknown };
  const suppliedToken = typeof body.token === "string" ? body.token : "";
  const token = suppliedToken || request.cookies.get(attorneyAcceptanceCookieName)?.value || "";
  if (!isAttorneyInvitationToken(token)) return unavailableInvitation();

  const tokenHash = hashAttorneyInvitationToken(token);
  const invitationLimit = checkRateLimit(request, {
    id: "records-attorney-invitation-prepare-token",
    key: tokenHash,
    limit: 4,
    windowMs: 15 * 60 * 1000,
  });
  if (invitationLimit.limited) return rateLimitExceededResponse(invitationLimit);

  const admin = createSupabaseAdminClient();
  const { data: invitation, error: invitationError } = await admin
    .from("records_attorney_invitations")
    .select("id,invited_email_ciphertext,invited_email_nonce,invited_email_tag")
    .eq("token_hash", tokenHash)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (invitationError || !invitation) return unavailableInvitation();

  let email = "";
  try {
    email = revealAttorneyEmail({
      ciphertext: invitation.invited_email_ciphertext,
      nonce: invitation.invited_email_nonce,
      tag: invitation.invited_email_tag,
    });
  } catch {
    return NextResponse.json(
      { error: "The secure invitation could not be opened." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const redirectUrl = new URL("/records", recordsAppBaseUrl(request));
  redirectUrl.searchParams.set("auth", "attorney-invite");
  redirectUrl.searchParams.set("next", "/attorney/accept");
  redirectUrl.searchParams.set("invite", "1");
  redirectUrl.searchParams.set("attorney_token", token);

  try {
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
      throw invited.error || new Error("Supabase did not create the invited identity.");
    }
    await admin
      .from("records_attorney_invitations")
      .update({ last_sent_at: new Date().toISOString() })
      .eq("id", invitation.id)
      .eq("status", "pending");
  } catch {
    await recordSecurityEvent({
      type: "auth_signup_failed",
      severity: "warning",
      request,
      status: 503,
      detail: "Automatic attorney mailbox verification delivery failed.",
    });
    return NextResponse.json(
      { error: "Unable to send the secure attorney access link. Try again shortly." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } }
    );
  }

  await recordSecurityEvent({
    type: "auth_signup_requested",
    severity: "info",
    request,
    status: 200,
    detail: "Automatic mailbox verification requested for an attorney invitation.",
  });

  const response = NextResponse.json(
    {
      ok: true,
      message:
        "The email provider accepted a fresh secure access message for delivery. Look for “Your secure Custody Folio attorney access link” from Custody Folio. Check Inbox and Junk for the invited address. If it is still missing after five minutes, ask the record owner to replace the invitation with an address that is confirmed to receive external mail.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
  return setAttorneyAcceptanceCookie(response, token);
}
