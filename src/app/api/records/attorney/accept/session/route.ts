import { NextRequest, NextResponse } from "next/server";
import {
  isSupabaseRecordsMode,
  setRecordsSessionCookies,
} from "@/lib/records/authServer";
import {
  clearAttorneyAcceptanceCookie,
  clearAttorneyMailboxProofCookie,
  clearAttorneyPasswordSetupCookie,
  acceptPendingAttorneyInvitationForUser,
  attorneyAcceptanceCookieName,
  findPendingAttorneyInvitationForEmail,
} from "@/lib/records/attorneyServer";
import { checkAttorneyGuestEntitlement } from "@/lib/records/attorneyEntitlement";
import {
  sealAttorneyHandle,
} from "@/lib/records/attorneyCrypto";
import {
  createServerSupabaseAuthClient,
  createServerSupabaseSessionClient,
} from "@/lib/supabaseClient";
import { defaultCaseIdForUser } from "@/lib/records/accountBoundary";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import { recordSecurityEvent } from "@/lib/security/securityEvents";
import { recordsMfaPolicyResponse } from "@/lib/records/mfaPolicyServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function tokenValue(value: unknown, minimumLength = 20) {
  return typeof value === "string" && value.length >= minimumLength && value.length < 8_000
    ? value
    : "";
}

function rejected() {
  return NextResponse.json(
    { error: "Attorney access link is invalid, expired, or does not match this invitation." },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
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
    id: "records-attorney-invite-session",
    limit: 12,
    windowMs: 10 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  const body = (await request.json().catch(() => ({}))) as {
    accessToken?: unknown;
    refreshToken?: unknown;
    expiresIn?: unknown;
  };
  const accessToken = tokenValue(body.accessToken);
  const refreshToken = tokenValue(body.refreshToken, 8);
  const invitationToken = tokenValue(
    request.cookies.get(attorneyAcceptanceCookieName)?.value
  );
  const expiresIn = Number(body.expiresIn || 3600);
  if (!accessToken || !refreshToken || !invitationToken) return rejected();

  let rejectionStage = "mailbox_claim_verification";
  try {
    const claimsClient = createServerSupabaseAuthClient();
    const verifiedClaims = await claimsClient.auth.getClaims(accessToken);
    const claims = verifiedClaims.data?.claims as {
      amr?: Array<{ method?: unknown; timestamp?: unknown }>;
      session_id?: unknown;
      sub?: unknown;
    } | undefined;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const emailProof = claims?.amr?.some((entry) => {
      const emailMethod =
        entry.method === "invite" ||
        entry.method === "magiclink" ||
        entry.method === "otp";
      const timestamp = typeof entry.timestamp === "number" ? entry.timestamp : 0;
      return emailMethod && timestamp >= nowSeconds - 10 * 60 && timestamp <= nowSeconds + 60;
    }) === true;
    const sessionId = typeof claims?.session_id === "string" ? claims.session_id : "";
    const subject = typeof claims?.sub === "string" ? claims.sub : "";
    if (verifiedClaims.error || !emailProof || !sessionId || !subject) {
      throw new Error("Mailbox claim verification failed.");
    }

    rejectionStage = "mailbox_session_validation";
    const authClient = await createServerSupabaseSessionClient({ accessToken, refreshToken });
    const { data, error } = await authClient.auth.getUser();
    const user = data.user;
    if (
      error ||
      !user?.id ||
      user.id !== subject ||
      !user.email ||
      !user.email_confirmed_at
    ) {
      throw new Error("Mailbox session validation failed.");
    }

    rejectionStage = "invitation_identity_binding";
    const invitation = await findPendingAttorneyInvitationForEmail({
      token: invitationToken,
      email: user.email,
    });
    if (!invitation) throw new Error("Invitation identity binding failed.");

    rejectionStage = "mfa_policy";
    const mfa = await recordsMfaPolicyResponse({
      request,
      authClient,
      session: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: Number.isFinite(expiresIn) ? expiresIn : 3600,
      },
      userId: user.id,
      sessionScope: "attorney_mfa_pending",
    });
    if (mfa) {
      clearAttorneyMailboxProofCookie(mfa);
      clearAttorneyPasswordSetupCookie(mfa);
      return mfa;
    }

    rejectionStage = "invitation_acceptance_rpc";
    const row = await acceptPendingAttorneyInvitationForUser({
      token: invitationToken,
      userId: user.id,
      email: user.email,
    });
    if (!row) throw new Error("Attorney invitation acceptance failed.");

    rejectionStage = "acceptance_security_event";
    await recordSecurityEvent({
      type: "auth_email_confirmed",
      severity: "info",
      request,
      userId: user.id,
      status: 200,
      detail: "Mailbox and authenticator verified; attorney invitation accepted into a scoped guest session.",
    });

    rejectionStage = "guest_session_response";
    const response = NextResponse.json(
      {
        ok: true,
        accepted: true,
        accessExpiresAt: row.access_expires_at,
        accessHandle: sealAttorneyHandle({
          kind: "grant",
          id: row.grant_id,
          subject: user.id,
          expiresAt: Date.now() + 60 * 60 * 1000,
        }),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
    setRecordsSessionCookies(
      response,
      {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: Number.isFinite(expiresIn) ? expiresIn : 3600,
      },
      defaultCaseIdForUser(user.id),
      "attorney_guest"
    );
    clearAttorneyMailboxProofCookie(response);
    clearAttorneyPasswordSetupCookie(response);
    return clearAttorneyAcceptanceCookie(response);
  } catch {
    await recordSecurityEvent({
      type: "auth_email_confirm_failed",
      severity: "warning",
      request,
      status: 401,
      detail: `Mailbox-verified attorney invitation acceptance failed at ${rejectionStage}.`,
    });
    return rejected();
  }
}
