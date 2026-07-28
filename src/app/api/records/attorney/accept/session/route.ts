import { NextRequest, NextResponse } from "next/server";
import {
  isSupabaseRecordsMode,
  setRecordsPasswordRecoveryCookie,
  setRecordsSessionCookies,
} from "@/lib/records/authServer";
import {
  findPendingAttorneyOnboardingForEmail,
  setAttorneyAcceptanceCookie,
  setAttorneyMailboxProofCookie,
  setAttorneyPasswordSetupCookie,
} from "@/lib/records/attorneyServer";
import { checkAttorneyGuestEntitlement } from "@/lib/records/attorneyEntitlement";
import { recordsProfileExists } from "@/lib/records/profileServer";
import {
  attorneyEmailHash,
  hashAttorneyInvitationToken,
} from "@/lib/records/attorneyCrypto";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  createServerSupabaseAuthClient,
  createServerSupabaseSessionClient,
} from "@/lib/supabaseClient";
import { defaultCaseIdForUser } from "@/lib/records/accountBoundary";
import { selectTotpFactorForVerification } from "@/lib/records/mfaServer";
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
    { error: "Attorney account link is invalid, expired, or does not match this invitation." },
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
  const onboardingToken = tokenValue(body.onboardingToken);
  const expiresIn = Number(body.expiresIn || 3600);
  if (!accessToken || !refreshToken || !onboardingToken) return rejected();

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

    const invitation = await findPendingAttorneyOnboardingForEmail({
      token: onboardingToken,
      email: user.email,
    });
    if (!invitation) return rejected();

    const profileAlreadyApproved = await recordsProfileExists(user.id);
    const passwordSetupRequired =
      invitation.onboarding_password_required === true || !profileAlreadyApproved;
    let enrollment: { factorId: string; qrCode: string; secret: string } | undefined;
    if (!passwordSetupRequired) {
      const factors = await authClient.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      const verifiedFactor = selectTotpFactorForVerification(factors.data.totp || []);
      if (!verifiedFactor) {
        for (const factor of factors.data.totp || []) {
          const unenrollment = await authClient.auth.mfa.unenroll({ factorId: factor.id });
          if (unenrollment.error) throw unenrollment.error;
        }
        const started = await authClient.auth.mfa.enroll({
          factorType: "totp",
          issuer: "Custody Folio",
        });
        if (started.error) throw started.error;
        enrollment = {
          factorId: started.data.id,
          qrCode: started.data.totp.qr_code,
          secret: started.data.totp.secret,
        };
      }
    }

    const admin = createSupabaseAdminClient();
    const completed = await admin.rpc("complete_records_attorney_onboarding", {
      p_invitation_id: invitation.id,
      p_onboarding_token_hash: hashAttorneyInvitationToken(onboardingToken),
      p_acceptance_token_hash: hashAttorneyInvitationToken(onboardingToken),
      p_attorney_user_id: user.id,
      p_invited_email_hash: attorneyEmailHash(user.email),
      p_email: user.email,
      p_password_setup_required: passwordSetupRequired,
    });
    if (completed.error || completed.data !== true) {
      throw completed.error || new Error("Attorney onboarding could not be finalized.");
    }

    await recordSecurityEvent({
      type: "auth_email_confirmed",
      severity: "info",
      request,
      userId: user.id,
      status: 200,
      detail: "Mailbox-verified attorney onboarding session accepted.",
    });

    const response = NextResponse.json(
      {
        ok: true,
        passwordSetupRequired,
        mfaRequired: !passwordSetupRequired,
        mfaEnrollmentRequired: Boolean(enrollment),
        enrollment,
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
      defaultCaseIdForUser(user.id)
    );
    if (passwordSetupRequired) {
      const parsedOnboardingExpiry = new Date(invitation.onboarding_expires_at).getTime();
      setRecordsPasswordRecoveryCookie(response, { userId: user.id, sessionId });
      setAttorneyPasswordSetupCookie(response, {
        invitationId: invitation.id,
        userId: user.id,
        expiresAt: Number.isFinite(parsedOnboardingExpiry)
          ? parsedOnboardingExpiry
          : Date.now() + 60 * 60 * 1000,
      });
    }
    const parsedOnboardingExpiry = new Date(invitation.onboarding_expires_at).getTime();
    setAttorneyMailboxProofCookie(response, {
      invitationId: invitation.id,
      userId: user.id,
      token: onboardingToken,
      expiresAt: Number.isFinite(parsedOnboardingExpiry)
        ? parsedOnboardingExpiry
        : Date.now() + 60 * 60 * 1000,
    });
    return setAttorneyAcceptanceCookie(response, onboardingToken);
  } catch {
    await recordSecurityEvent({
      type: "auth_email_confirm_failed",
      severity: "warning",
      request,
      status: 401,
      detail: "Mailbox-verified attorney onboarding session was rejected.",
    });
    return rejected();
  }
}
