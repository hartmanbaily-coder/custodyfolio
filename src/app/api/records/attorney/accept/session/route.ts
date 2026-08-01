import { NextRequest, NextResponse } from "next/server";
import {
  isSupabaseRecordsMode,
  setRecordsSessionCookies,
} from "@/lib/records/authServer";
import {
  clearAttorneyAcceptanceCookie,
  clearAttorneyMailboxProofCookie,
  clearAttorneyPasswordSetupCookie,
  findPendingAttorneyInvitationForEmail,
} from "@/lib/records/attorneyServer";
import { checkAttorneyGuestEntitlement } from "@/lib/records/attorneyEntitlement";
import {
  attorneyEmailHash,
  hashAttorneyInvitationToken,
  sealAttorneyHandle,
} from "@/lib/records/attorneyCrypto";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  createServerSupabaseAuthClient,
  createServerSupabaseSessionClient,
} from "@/lib/supabaseClient";
import { defaultCaseIdForUser } from "@/lib/records/accountBoundary";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import { recordSecurityEvent } from "@/lib/security/securityEvents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function tokenValue(value: unknown) {
  return typeof value === "string" && value.length > 20 && value.length < 8_000 ? value : "";
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
    onboardingToken?: unknown;
  };
  const accessToken = tokenValue(body.accessToken);
  const refreshToken = tokenValue(body.refreshToken);
  const invitationToken = tokenValue(body.onboardingToken);
  const expiresIn = Number(body.expiresIn || 3600);
  if (!accessToken || !refreshToken || !invitationToken) return rejected();

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
    if (verifiedClaims.error || !emailProof || !sessionId || !subject) return rejected();

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
      return rejected();
    }

    const invitation = await findPendingAttorneyInvitationForEmail({
      token: invitationToken,
      email: user.email,
    });
    if (!invitation) return rejected();

    const admin = createSupabaseAdminClient();
    const accepted = await admin.rpc("accept_records_attorney_invitation", {
      p_token_hash: hashAttorneyInvitationToken(invitationToken),
      p_attorney_user_id: user.id,
      p_invited_email_hash: attorneyEmailHash(user.email),
    });
    const row = Array.isArray(accepted.data) ? accepted.data[0] : null;
    if (accepted.error || !row?.grant_id || row.owner_user_id === user.id) {
      throw accepted.error || new Error("Attorney invitation acceptance failed.");
    }

    await recordSecurityEvent({
      type: "auth_email_confirmed",
      severity: "info",
      request,
      userId: user.id,
      status: 200,
      detail: "Mailbox-verified attorney invitation accepted into a scoped guest session.",
    });

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
      detail: "Mailbox-verified attorney invitation acceptance was rejected.",
    });
    return rejected();
  }
}
