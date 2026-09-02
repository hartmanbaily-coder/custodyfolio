import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseAuthClient } from "@/lib/supabaseClient";
import {
  isRecordsSignupEnabled,
  isSupabaseRecordsMode,
} from "@/lib/records/authServer";
import {
  attorneyAcceptanceCookieName,
  findPendingAttorneyInvitationForEmail,
} from "@/lib/records/attorneyServer";
import { recordsAttorneyEmailHasActiveGrant } from "@/lib/records/attorneyProfileServer";
import { normalizeAttorneyEmail } from "@/lib/records/attorneyCrypto";
import { legalAcceptanceMetadata } from "@/lib/legal";
import { recordsCsrfError, verifyRecordsTrustedJsonRequest } from "@/lib/security/csrf";
import {
  checkRateLimit,
  rateLimitClientAddress,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";
import { recordSecurityEvent } from "@/lib/security/securityEvents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const genericMessage =
  "If that email can access Custody Folio, a 6-digit sign-in code will arrive shortly. Check Inbox and Junk.";

function unavailable() {
  return NextResponse.json(
    { error: "Email-code sign in is not enabled." },
    { status: 501, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
  if (!isSupabaseRecordsMode()) return unavailable();
  if (!verifyRecordsTrustedJsonRequest(request).ok) return recordsCsrfError();

  const rateLimit = checkRateLimit(request, {
    id: "records-auth-email-code-request",
    limit: 8,
    windowMs: 15 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    adultConfirmed?: unknown;
    legalAccepted?: unknown;
    workspace?: unknown;
  };
  const attorneyWorkspace = body.workspace === "attorney";
  const email = attorneyWorkspace
    ? normalizeAttorneyEmail(typeof body.email === "string" ? body.email : "")
    : typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";
  const adultConfirmed = body.adultConfirmed === true;
  const legalAccepted = body.legalAccepted === true;

  if (!adultConfirmed || !legalAccepted || !email.includes("@") || email.length > 254) {
    return NextResponse.json(
      { error: "Enter a valid email, confirm adult use, and accept the Terms and Privacy Policy." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const emailLimit = checkRateLimit(request, {
    id: "records-auth-email-code-request-email",
    key: `${rateLimitClientAddress(request.headers)}:${email}`,
    limit: 4,
    windowMs: 60 * 60 * 1000,
  });
  if (emailLimit.limited) return rateLimitExceededResponse(emailLimit);

  let allowed = !attorneyWorkspace;
  let shouldCreateUser = !attorneyWorkspace && isRecordsSignupEnabled();
  if (attorneyWorkspace) {
    try {
      const invitationToken = request.cookies.get(attorneyAcceptanceCookieName)?.value || "";
      const pendingInvitation = invitationToken
        ? await findPendingAttorneyInvitationForEmail({ token: invitationToken, email })
        : null;
      allowed = Boolean(pendingInvitation) || await recordsAttorneyEmailHasActiveGrant(email);
      shouldCreateUser = Boolean(pendingInvitation);
    } catch {
      allowed = false;
    }
  }

  try {
    if (allowed) {
      const authClient = createServerSupabaseAuthClient();
      const sent = await authClient.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser,
          data: legalAcceptanceMetadata(attorneyWorkspace ? "attorney_login" : "login"),
        },
      });
      if (sent.error) throw sent.error;
    }
  } catch (error) {
    await recordSecurityEvent({
      type: "auth_login_failed",
      severity: "warning",
      request,
      status: 503,
      detail: error instanceof Error
        ? `Email-code delivery failed: ${error.message.slice(0, 120)}`
        : "Email-code delivery failed.",
    });
    // The response remains generic so this route cannot enumerate accounts or attorney grants.
  }

  await recordSecurityEvent({
    type: "auth_signup_requested",
    severity: "info",
    request,
    status: 202,
    detail: attorneyWorkspace
      ? "Invitation-gated or returning attorney email-code sign in requested."
      : "Records email-code sign in requested.",
  });

  return NextResponse.json(
    { ok: true, message: genericMessage },
    { status: 202, headers: { "Cache-Control": "no-store" } }
  );
}
