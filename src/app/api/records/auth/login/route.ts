import { NextRequest, NextResponse } from "next/server";
import { isAuthApiError } from "@supabase/supabase-js";
import { createServerSupabaseAuthClient } from "@/lib/supabaseClient";
import {
  isRecordsMfaRequired,
  isRecordsSignupEnabled,
  isSupabaseRecordsMode,
  setRecordsSessionCookies,
} from "@/lib/records/authServer";
import { defaultCaseIdForUser } from "@/lib/records/accountBoundary";
import { recordsProfileIsAuthorized, upsertRecordsProfile } from "@/lib/records/profileServer";
import { recordsAttorneyProfileIsAuthorized } from "@/lib/records/attorneyProfileServer";
import {
  attorneyAcceptanceCookieName,
  acceptPendingAttorneyInvitationForUser,
  clearAttorneyAcceptanceCookie,
  findPendingAttorneyInvitationForEmail,
} from "@/lib/records/attorneyServer";
import { recordsCsrfError, verifyRecordsTrustedJsonRequest } from "@/lib/security/csrf";
import { checkRateLimit, rateLimitClientAddress, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordSecurityEvent } from "@/lib/security/securityEvents";
import { privacyVersion, termsVersion } from "@/lib/legal";
import { recordsMfaPolicyResponse } from "@/lib/records/mfaPolicyServer";
import { BoundedTtlStore } from "@/lib/security/boundedTtlStore";

export const dynamic = "force-dynamic";

const failedLoginWindowMs = 5 * 60 * 1000;
const maxFailedLogins = 8;
const failedLogins = new BoundedTtlStore<{ count: number }>(10_000);

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
  return Boolean(current && current.count >= maxFailedLogins);
}

function recordFailedLogin(key: string) {
  const current = failedLogins.get(key);
  failedLogins.set(
    key,
    { count: current ? current.count + 1 : 1 },
    Date.now() + failedLoginWindowMs
  );
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

  const body = parsed as {
    email?: unknown;
    password?: unknown;
    adultConfirmed?: unknown;
    workspace?: unknown;
  };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const adultConfirmed = body.adultConfirmed === true;
  const attorneyWorkspace = body.workspace === "attorney";

  if (!adultConfirmed || !email.includes("@") || email.length > 254 || password.length < 8) {
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

  const attorneyInvitationToken = attorneyWorkspace
    ? request.cookies.get(attorneyAcceptanceCookieName)?.value || ""
    : "";
  let pendingAttorneyInvitation = null;
  if (attorneyInvitationToken) {
    pendingAttorneyInvitation = await findPendingAttorneyInvitationForEmail({
      token: attorneyInvitationToken,
      email: data.user.email || email,
    });
    if (!pendingAttorneyInvitation || pendingAttorneyInvitation.owner_user_id === data.user.id) {
      await supabase.auth.signOut({ scope: "local" });
      await recordSecurityEvent({
        type: "auth_login_unregistered_identity_blocked",
        severity: "warning",
        request,
        userId: data.user.id,
        status: 403,
        detail: "Password-authenticated attorney invitation was invalid, used, expired, or email-mismatched.",
      });
      return NextResponse.json(
        { error: "This invitation is invalid, expired, already used, or belongs to another account." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  const identityAuthorized = attorneyWorkspace
    ? Boolean(pendingAttorneyInvitation) ||
      await recordsAttorneyProfileIsAuthorized({
          userId: data.user.id,
          email: data.user.email || email,
          accessToken: data.session.access_token,
        })
    : isRecordsSignupEnabled() ||
      await recordsProfileIsAuthorized(data.user.id, data.session.access_token);
  if (!identityAuthorized) {
    await supabase.auth.signOut({ scope: "local" });
    await recordSecurityEvent({
      type: "auth_login_unregistered_identity_blocked",
      severity: "warning",
      request,
      userId: data.user.id,
      status: 403,
      detail: attorneyWorkspace
        ? "Supabase identity has no active invitation-gated attorney grant."
        : "Supabase identity has no approved records profile.",
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

  await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });

  if (isRecordsMfaRequired() || attorneyWorkspace) {
    const mfa = await recordsMfaPolicyResponse({
      request,
      authClient: supabase,
      session: data.session,
      userId: data.user.id,
      sessionScope: attorneyWorkspace ? "attorney_mfa_pending" : "records",
    });
    if (mfa) {
      return mfa;
    }
  }

  let acceptedAttorneyInvitation = false;
  if (attorneyInvitationToken) {
    acceptedAttorneyInvitation = Boolean(
      await acceptPendingAttorneyInvitationForUser({
        token: attorneyInvitationToken,
        userId: data.user.id,
        email: data.user.email || email,
      })
    );
    if (!acceptedAttorneyInvitation) {
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.json(
        { error: "This invitation changed before authenticator verification. Ask the client for a new link." },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  const session = sessionBody({ userId: data.user.id, email: data.user.email || email });
  if (!attorneyWorkspace) {
    await upsertRecordsProfile({ userId: session.userId, email: session.email });
  }
  await recordSecurityEvent({
    type: "auth_login_success",
    severity: "info",
    request,
    userId: session.userId,
    status: 200,
    detail: `Adult use confirmed; Terms ${termsVersion}; Privacy ${privacyVersion}.`,
  });

  const response = NextResponse.json(
    {
      session,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
  setRecordsSessionCookies(
    response,
    data.session,
    defaultCaseIdForUser(data.user.id),
    attorneyWorkspace ? "attorney_guest" : "records"
  );
  return acceptedAttorneyInvitation ? clearAttorneyAcceptanceCookie(response) : response;
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
