import { NextRequest, NextResponse } from "next/server";
import { isAuthApiError, type Session } from "@supabase/supabase-js";
import { createServerSupabaseAuthClient } from "@/lib/supabaseClient";
import {
  getAccessTokenAal,
  isRecordsMfaRequired,
  isRecordsSignupEnabled,
  isSupabaseRecordsMode,
  setRecordsSessionCookies,
} from "@/lib/records/authServer";
import { defaultCaseIdForUser } from "@/lib/records/accountBoundary";
import { recordsProfileIsAuthorized, upsertRecordsProfile } from "@/lib/records/profileServer";
import { recordsCsrfError, verifyRecordsTrustedJsonRequest } from "@/lib/security/csrf";
import { checkRateLimit, rateLimitClientAddress, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordSecurityEvent } from "@/lib/security/securityEvents";

export const dynamic = "force-dynamic";

const failedLoginWindowMs = 5 * 60 * 1000;
const maxFailedLogins = 8;
const failedLogins = new Map<string, { count: number; resetAt: number }>();

function disabledResponse() {
  return NextResponse.json(
    {
      error: "Records account access is not enabled.",
      detail: "Authenticated records access is not configured.",
    },
    { status: 501 }
  );
}

function clientKey(request: NextRequest, email: string) {
  const ip = rateLimitClientAddress(request.headers);
  return `${ip}:${email.toLowerCase()}`;
}

function isLimited(key: string) {
  const current = failedLogins.get(key);
  if (!current) return false;
  if (current.resetAt <= Date.now()) {
    failedLogins.delete(key);
    return false;
  }
  return current.count >= maxFailedLogins;
}

function recordFailedLogin(key: string) {
  const current = failedLogins.get(key);
  const resetAt = Date.now() + failedLoginWindowMs;
  failedLogins.set(key, {
    count: current && current.resetAt > Date.now() ? current.count + 1 : 1,
    resetAt,
  });
}

function loginFailure(error: unknown) {
  const code = isAuthApiError(error) ? error.code : "auth_response_invalid";

  if (code === "invalid_credentials") {
    return { code, error: "Invalid email or password.", status: 401 };
  }
  if (code === "email_not_confirmed") {
    return {
      code,
      error: "Confirm your email address before signing in. Check your inbox or contact support.",
      status: 403,
    };
  }
  if (code === "user_banned") {
    return {
      code,
      error: "This account is temporarily unavailable. Contact support for help.",
      status: 403,
    };
  }
  if (code === "over_request_rate_limit") {
    return {
      code,
      error: "Too many sign in attempts. Wait a few minutes and try again.",
      status: 429,
    };
  }

  return {
    code,
    error: "Authentication service is temporarily unavailable.",
    status: 503,
  };
}

function sessionBody(input: { userId: string; email: string }) {
  return {
    userId: input.userId,
    caseId: defaultCaseIdForUser(input.userId),
    email: input.email,
    authMode: "supabase" as const,
  };
}

async function mfaResponse(input: {
  request: NextRequest;
  authClient: ReturnType<typeof createServerSupabaseAuthClient>;
  session: Session;
}) {
  const assurance = await input.authClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error) {
    await recordSecurityEvent({
      type: "auth_mfa_policy_denied",
      severity: "high",
      request: input.request,
      status: 403,
      detail: "Unable to read MFA assurance level.",
    });
    return NextResponse.json({ error: "Unable to verify MFA status." }, { status: 403 });
  }

  if (assurance.data.currentLevel === "aal2" || getAccessTokenAal(input.session.access_token) === "aal2") {
    return null;
  }

  const factors = await input.authClient.auth.mfa.listFactors();
  if (factors.error) {
    await recordSecurityEvent({
      type: "auth_mfa_policy_denied",
      severity: "high",
      request: input.request,
      status: 403,
      detail: "Unable to list MFA factors.",
    });
    return NextResponse.json({ error: "Unable to verify MFA factors." }, { status: 403 });
  }

  const totpFactors = factors.data.totp;
  const hasVerifiedTotp = totpFactors.some((factor) => factor.status === "verified");
  const hasUnknownStatusTotp = totpFactors.some((factor) => !("status" in factor));
  if (hasVerifiedTotp || (hasUnknownStatusTotp && assurance.data.nextLevel === "aal2")) {
    const response = NextResponse.json(
      {
        error: "Multi factor verification required.",
        mfaRequired: true,
      },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
    setRecordsSessionCookies(
      response,
      input.session,
      defaultCaseIdForUser(input.session.user.id)
    );
    await recordSecurityEvent({
      type: "auth_mfa_required",
      severity: "info",
      request: input.request,
      status: 403,
    });
    return response;
  }

  const unfinishedTotpFactors = totpFactors.filter((factor) => factor.status !== "verified");
  for (const factor of unfinishedTotpFactors) {
    const unenrollment = await input.authClient.auth.mfa.unenroll({ factorId: factor.id });
    if (unenrollment.error) {
      await recordSecurityEvent({
        type: "auth_mfa_enrollment_failed",
        severity: "high",
        request: input.request,
        status: 403,
        detail: "Unable to reset unfinished MFA enrollment.",
      });
      return NextResponse.json({ error: "Unable to reset unfinished MFA enrollment." }, { status: 403 });
    }
  }

  const enrollment = await input.authClient.auth.mfa.enroll({
    factorType: "totp",
    issuer: "Custody Folio",
  });

  if (enrollment.error) {
    await recordSecurityEvent({
      type: "auth_mfa_enrollment_failed",
      severity: "high",
      request: input.request,
      status: 403,
      detail: "Unable to start MFA enrollment.",
    });
    return NextResponse.json({ error: "Unable to start MFA enrollment." }, { status: 403 });
  }

  const response = NextResponse.json(
    {
      error: "Authenticator app enrollment required.",
      mfaRequired: true,
      mfaEnrollmentRequired: true,
      enrollment: {
        factorId: enrollment.data.id,
        qrCode: enrollment.data.totp.qr_code,
        secret: enrollment.data.totp.secret,
      },
    },
    { status: 403, headers: { "Cache-Control": "no-store" } }
  );
  setRecordsSessionCookies(
    response,
    input.session,
    defaultCaseIdForUser(input.session.user.id)
  );
  await recordSecurityEvent({
    type: "auth_mfa_enrollment_started",
    severity: "info",
    request: input.request,
    status: 403,
  });
  return response;
}

async function handleLoginPost(request: NextRequest) {
  if (!isSupabaseRecordsMode()) return disabledResponse();
  if (!verifyRecordsTrustedJsonRequest(request).ok) return recordsCsrfError();

  const rateLimit = checkRateLimit(request, {
    id: "records-auth-login",
    limit: 20,
    windowMs: 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const body = parsed as { email?: unknown; password?: unknown; adultConfirmed?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const adultConfirmed = body.adultConfirmed === true;

  if (!adultConfirmed || !email.includes("@") || password.length < 8) {
    return NextResponse.json({ error: "Check your email, password, and adult use confirmation." }, { status: 400 });
  }

  const key = clientKey(request, email);
  if (isLimited(key)) {
    return NextResponse.json({ error: "Too many sign in attempts. Try again shortly." }, { status: 429 });
  }

  const supabase = createServerSupabaseAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session?.access_token || !data.user?.id) {
    const failure = loginFailure(error);
    if (failure.code === "invalid_credentials") recordFailedLogin(key);
    await recordSecurityEvent({
      type: "auth_login_failed",
      severity: "warning",
      request,
      status: failure.status,
      detail: `Supabase Auth login failure: ${failure.code}.`,
    });
    return NextResponse.json(
      { error: failure.error },
      { status: failure.status, headers: { "Cache-Control": "no-store" } }
    );
  }

  failedLogins.delete(key);

  if (
    !isRecordsSignupEnabled() &&
    !(await recordsProfileIsAuthorized(data.user.id, data.session.access_token))
  ) {
    await supabase.auth.signOut({ scope: "local" });
    await recordSecurityEvent({
      type: "auth_login_unregistered_identity_blocked",
      severity: "warning",
      request,
      userId: data.user.id,
      status: 403,
      detail: "Supabase identity has no approved records profile.",
    });
    return NextResponse.json(
      { error: "This account is not enabled for Custody Folio." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });

  if (isRecordsMfaRequired()) {
    const mfa = await mfaResponse({ request, authClient: supabase, session: data.session });
    if (mfa) return mfa;
  }

  const session = sessionBody({ userId: data.user.id, email: data.user.email || email });
  await upsertRecordsProfile({ userId: session.userId, email: session.email });
  await recordSecurityEvent({
    type: "auth_login_success",
    severity: "info",
    request,
    userId: session.userId,
    status: 200,
  });

  const response = NextResponse.json(
    {
      session,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
  setRecordsSessionCookies(response, data.session, defaultCaseIdForUser(data.user.id));
  return response;
}

export async function POST(request: NextRequest) {
  try {
    return await handleLoginPost(request);
  } catch (error) {
    await recordSecurityEvent({
      type: "auth_login_failed",
      severity: "high",
      request,
      status: 503,
      detail: error instanceof Error ? error.message : "Unhandled records login error.",
    });
    return NextResponse.json(
      { error: "Authentication service is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
