import { NextRequest, NextResponse } from "next/server";
import type { Session } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { createServerSupabaseAuthClient } from "@/lib/supabaseClient";
import {
  isRecordsSignupEnabled,
  isSupabaseRecordsMode,
  setRecordsSessionCookies,
} from "@/lib/records/authServer";
import { defaultCaseIdForUser } from "@/lib/records/accountBoundary";
import { recordsProfileIsAuthorized, upsertRecordsProfile } from "@/lib/records/profileServer";
import { recordsAttorneyProfileIsAuthorized } from "@/lib/records/attorneyProfileServer";
import {
  acceptPendingAttorneyInvitationForUser,
  attorneyAcceptanceCookieName,
  clearAttorneyAcceptanceCookie,
  findPendingAttorneyInvitationForEmail,
} from "@/lib/records/attorneyServer";
import { normalizeAttorneyEmail, sealAttorneyHandle } from "@/lib/records/attorneyCrypto";
import {
  appleReviewAuthConfig,
  appleReviewCodeMatches,
} from "@/lib/records/appleReviewAuth";
import { recordsCsrfError, verifyRecordsTrustedJsonRequest } from "@/lib/security/csrf";
import {
  checkRateLimit,
  rateLimitClientAddress,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";
import { recordSecurityEvent } from "@/lib/security/securityEvents";
import { privacyVersion, termsVersion } from "@/lib/legal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type VerifiedSession = {
  session: Session;
  reviewAccess: boolean;
};

function rejected(message = "The email or sign-in code is invalid or expired.") {
  return NextResponse.json(
    { error: message },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
}

async function verifyReviewAccess(
  email: string,
  code: string,
  workspace: "records" | "attorney"
): Promise<VerifiedSession | null> {
  const config = appleReviewAuthConfig(process.env, Date.now(), workspace);
  if (!config || !appleReviewCodeMatches(code, config)) return null;

  const admin = createSupabaseAdminClient();
  const userResult = await admin.auth.admin.getUserById(config.userId);
  const reviewUser = userResult.data.user;
  if (
    userResult.error ||
    !reviewUser?.email ||
    reviewUser.email.trim().toLowerCase() !== email ||
    !reviewUser.email_confirmed_at
  ) {
    return null;
  }

  const generated = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = generated.data.properties?.hashed_token;
  if (generated.error || !tokenHash) return null;

  const authClient = createServerSupabaseAuthClient();
  const verified = await authClient.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (
    verified.error ||
    !verified.data.session ||
    verified.data.user?.id !== config.userId
  ) {
    return null;
  }
  return { session: verified.data.session, reviewAccess: true };
}

async function verifyEmailCode(email: string, code: string): Promise<VerifiedSession | null> {
  const authClient = createServerSupabaseAuthClient();
  const verified = await authClient.auth.verifyOtp({ email, token: code, type: "email" });
  if (verified.error || !verified.data.session || !verified.data.user?.id) return null;
  return { session: verified.data.session, reviewAccess: false };
}

export async function POST(request: NextRequest) {
  if (!isSupabaseRecordsMode()) {
    return NextResponse.json({ error: "Email-code sign in is not enabled." }, { status: 501 });
  }
  if (!verifyRecordsTrustedJsonRequest(request).ok) return recordsCsrfError();

  const rateLimit = checkRateLimit(request, {
    id: "records-auth-email-code-verify",
    limit: 12,
    windowMs: 10 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    code?: unknown;
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
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (
    body.adultConfirmed !== true ||
    body.legalAccepted !== true ||
    !email.includes("@") ||
    email.length > 254 ||
    !/^\d{6}$/.test(code)
  ) {
    return NextResponse.json(
      { error: "Enter the email and 6-digit code, confirm adult use, and accept the current policies." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const emailLimit = checkRateLimit(request, {
    id: "records-auth-email-code-verify-email",
    key: `${rateLimitClientAddress(request.headers)}:${email}`,
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (emailLimit.limited) return rateLimitExceededResponse(emailLimit);

  try {
    const verified = await verifyReviewAccess(
      email,
      code,
      attorneyWorkspace ? "attorney" : "records"
    ) || await verifyEmailCode(email, code);
    const session = verified?.session;
    const user = session?.user;
    if (!session?.access_token || !session.refresh_token || !user?.id || !user.email_confirmed_at) {
      await recordSecurityEvent({
        type: "auth_login_failed",
        severity: "warning",
        request,
        status: 401,
        detail: "Email-code verification failed.",
      });
      return rejected();
    }

    const invitationToken = attorneyWorkspace
      ? request.cookies.get(attorneyAcceptanceCookieName)?.value || ""
      : "";
    const pendingInvitation = invitationToken
      ? await findPendingAttorneyInvitationForEmail({ token: invitationToken, email: user.email || email })
      : null;
    const authorized = attorneyWorkspace
      ? Boolean(pendingInvitation) || await recordsAttorneyProfileIsAuthorized({
          userId: user.id,
          email: user.email || email,
          accessToken: session.access_token,
        })
      : isRecordsSignupEnabled() || await recordsProfileIsAuthorized(user.id, session.access_token);

    if (!authorized || (pendingInvitation && pendingInvitation.owner_user_id === user.id)) {
      const authClient = createServerSupabaseAuthClient();
      await authClient.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      await authClient.auth.signOut({ scope: "local" });
      await recordSecurityEvent({
        type: "auth_login_unregistered_identity_blocked",
        severity: "warning",
        request,
        userId: user.id,
        status: 403,
        detail: attorneyWorkspace
          ? "Email-authenticated identity has no invitation-gated attorney grant."
          : "Email-authenticated identity has no approved records profile.",
      });
      return NextResponse.json(
        {
          error: attorneyWorkspace
            ? "No active shared matters are available for this attorney account."
            : "This account is not enabled for Custody Folio.",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    let acceptedGrant: { grant_id: string; access_expires_at: string | null } | null = null;
    if (pendingInvitation) {
      acceptedGrant = await acceptPendingAttorneyInvitationForUser({
        token: invitationToken,
        userId: user.id,
        email: user.email || email,
      });
      if (!acceptedGrant) return rejected("This invitation changed before the email code was verified. Ask the client for a new link.");
    }

    if (!attorneyWorkspace) {
      await upsertRecordsProfile({ userId: user.id, email: user.email || email });
    }

    const response = NextResponse.json(
      {
        session: {
          userId: user.id,
          caseId: defaultCaseIdForUser(user.id),
          email: user.email || email,
          authMode: "supabase" as const,
        },
        destination: attorneyWorkspace ? "/attorney" : "/records",
        attorneyAccessHandle: acceptedGrant
          ? sealAttorneyHandle({
              kind: "grant",
              id: acceptedGrant.grant_id,
              subject: user.id,
              expiresAt: Date.now() + 60 * 60 * 1000,
            })
          : undefined,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
    setRecordsSessionCookies(
      response,
      session,
      defaultCaseIdForUser(user.id),
      attorneyWorkspace ? "attorney_guest" : "records"
    );
    if (acceptedGrant) clearAttorneyAcceptanceCookie(response);

    await recordSecurityEvent({
      type: "auth_login_success",
      severity: "info",
      request,
      userId: user.id,
      status: 200,
      detail: verified?.reviewAccess === true
        ? `Time-limited App Review email-code access; Terms ${termsVersion}; Privacy ${privacyVersion}.`
        : `Passwordless email code verified; Terms ${termsVersion}; Privacy ${privacyVersion}.`,
    });
    await recordSecurityEvent({
      type: "policy_terms_accepted",
      severity: "info",
      request,
      userId: user.id,
      status: 200,
      detail: `Terms ${termsVersion}; Privacy ${privacyVersion}; source email_code_login.`,
    });
    return response;
  } catch (error) {
    await recordSecurityEvent({
      type: "auth_login_failed",
      severity: "high",
      request,
      status: 503,
      detail: error instanceof Error ? error.message : "Unhandled email-code verification error.",
    });
    return NextResponse.json(
      { error: "Authentication service is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } }
    );
  }
}
