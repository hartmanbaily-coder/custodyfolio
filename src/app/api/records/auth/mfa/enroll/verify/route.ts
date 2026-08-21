import { NextRequest, NextResponse } from "next/server";
import {
  getRecordsSessionAuthClient,
  isRecordsSignupEnabled,
  isSupabaseRecordsMode,
  recordsAccessCookieName,
  recordsSessionScopeCookieName,
  setRecordsSessionCookies,
} from "@/lib/records/authServer";
import { cleanMfaCode, isValidMfaCode, sessionFromMfaVerify } from "@/lib/records/mfaServer";
import { recordsProfileIsAuthorized, upsertRecordsProfile } from "@/lib/records/profileServer";
import { recordsAttorneyProfileIsAuthorized } from "@/lib/records/attorneyProfileServer";
import {
  acceptPendingAttorneyInvitationForUser,
  attorneyAcceptanceCookieName,
  clearAttorneyAcceptanceCookie,
} from "@/lib/records/attorneyServer";
import { defaultCaseIdForUser } from "@/lib/records/accountBoundary";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordSecurityEvent } from "@/lib/security/securityEvents";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSupabaseRecordsMode()) {
    return NextResponse.json({ error: "Records account access is not enabled." }, { status: 501 });
  }

  const rateLimit = checkRateLimit(request, {
    id: "records-auth-mfa-enroll-verify",
    limit: 12,
    windowMs: 10 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const body = parsed as { factorId?: unknown; code?: unknown };
  const factorId = typeof body.factorId === "string" ? body.factorId.trim() : "";
  const code = cleanMfaCode(body.code);
  if (!factorId || !isValidMfaCode(code)) {
    return NextResponse.json({ error: "Enter the authenticator enrollment code." }, { status: 400 });
  }

  let authClient: Awaited<ReturnType<typeof getRecordsSessionAuthClient>>;
  try {
    authClient = await getRecordsSessionAuthClient(request);
  } catch {
    return NextResponse.json({ error: "Sign in before verifying MFA enrollment." }, { status: 401 });
  }

  const challenge = await authClient.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data?.id) {
    await recordSecurityEvent({
      type: "auth_mfa_enrollment_failed",
      severity: "warning",
      request,
      status: 400,
      detail: "Unable to challenge enrollment factor.",
    });
    return NextResponse.json({ error: "Unable to verify authenticator enrollment." }, { status: 400 });
  }

  const verify = await authClient.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });

  if (verify.error || !verify.data?.access_token || !verify.data.refresh_token) {
    await recordSecurityEvent({
      type: "auth_mfa_enrollment_failed",
      severity: "warning",
      request,
      status: 401,
      detail: "Authenticator enrollment verification failed.",
    });
    return NextResponse.json({ error: "Authenticator enrollment code was not accepted." }, { status: 401 });
  }

  const session = sessionFromMfaVerify(verify.data);
  const originatingAccessToken = request.cookies.get(recordsAccessCookieName)?.value || "";
  const attorneyWorkspace =
    request.cookies.get(recordsSessionScopeCookieName)?.value === "attorney_mfa_pending";
  const invitationToken = attorneyWorkspace
    ? request.cookies.get(attorneyAcceptanceCookieName)?.value || ""
    : "";
  const acceptedInvitation = invitationToken
    ? await acceptPendingAttorneyInvitationForUser({
        token: invitationToken,
        userId: session.userId,
        email: session.email,
      })
    : null;
  const identityAuthorized = attorneyWorkspace
    ? Boolean(acceptedInvitation) ||
      await recordsAttorneyProfileIsAuthorized({
          userId: session.userId,
          email: session.email,
          accessToken: originatingAccessToken,
        })
    : isRecordsSignupEnabled() ||
      await recordsProfileIsAuthorized(session.userId, originatingAccessToken);
  if (!identityAuthorized) {
    await authClient.auth.signOut({ scope: "local" });
    await recordSecurityEvent({
      type: "auth_login_unregistered_identity_blocked",
      severity: "warning",
      request,
      userId: session.userId,
      status: 403,
      detail: attorneyWorkspace
        ? "MFA enrollment was rejected because no active attorney grant is available."
        : "MFA enrollment verification was rejected because the records profile is not approved.",
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
  if (!attorneyWorkspace) {
    await upsertRecordsProfile({ userId: session.userId, email: session.email });
  }
  await recordSecurityEvent({
    type: "auth_mfa_enrollment_verified",
    severity: "info",
    request,
    userId: session.userId,
    status: 200,
  });

  const response = NextResponse.json({ session }, { headers: { "Cache-Control": "no-store" } });
  setRecordsSessionCookies(
    response,
    verify.data,
    defaultCaseIdForUser(session.userId),
    attorneyWorkspace ? "attorney_guest" : "records"
  );
  return acceptedInvitation ? clearAttorneyAcceptanceCookie(response) : response;
}
