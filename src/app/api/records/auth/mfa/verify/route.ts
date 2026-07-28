import { NextRequest, NextResponse } from "next/server";
import {
  getRecordsSessionAuthClient,
  isRecordsSignupEnabled,
  isSupabaseRecordsMode,
  recordsAccessCookieName,
  setRecordsSessionCookies,
} from "@/lib/records/authServer";
import {
  cleanMfaCode,
  isValidMfaCode,
  selectTotpFactorForVerification,
  sessionFromMfaVerify,
} from "@/lib/records/mfaServer";
import { recordsProfileIsAuthorized, upsertRecordsProfile } from "@/lib/records/profileServer";
import { defaultCaseIdForUser } from "@/lib/records/accountBoundary";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordSecurityEvent } from "@/lib/security/securityEvents";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSupabaseRecordsMode()) {
    return NextResponse.json({ error: "Records account access is not enabled." }, { status: 501 });
  }

  const rateLimit = checkRateLimit(request, {
    id: "records-auth-mfa-verify",
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

  const code = cleanMfaCode((parsed as { code?: unknown }).code);
  if (!isValidMfaCode(code)) {
    return NextResponse.json({ error: "Enter the authenticator code." }, { status: 400 });
  }

  let authClient: Awaited<ReturnType<typeof getRecordsSessionAuthClient>>;
  try {
    authClient = await getRecordsSessionAuthClient(request);
  } catch {
    return NextResponse.json({ error: "Sign in before verifying MFA." }, { status: 401 });
  }

  const factors = await authClient.auth.mfa.listFactors();
  const factor = selectTotpFactorForVerification(factors.data?.totp || []);
  if (factors.error || !factor) {
    await recordSecurityEvent({
      type: "auth_mfa_failed",
      severity: "warning",
      request,
      status: 400,
      detail: "No verified TOTP factor available.",
    });
    return NextResponse.json({ error: "No authenticator factor is available." }, { status: 400 });
  }

  const verify = await authClient.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code,
  });

  if (verify.error || !verify.data?.access_token || !verify.data.refresh_token) {
    await recordSecurityEvent({
      type: "auth_mfa_failed",
      severity: "warning",
      request,
      status: 401,
      detail: "Authenticator verification failed.",
    });
    return NextResponse.json({ error: "Authenticator code was not accepted." }, { status: 401 });
  }

  const session = sessionFromMfaVerify(verify.data);
  const originatingAccessToken = request.cookies.get(recordsAccessCookieName)?.value || "";
  if (
    !isRecordsSignupEnabled() &&
    !(await recordsProfileIsAuthorized(session.userId, originatingAccessToken))
  ) {
    await authClient.auth.signOut({ scope: "local" });
    await recordSecurityEvent({
      type: "auth_login_unregistered_identity_blocked",
      severity: "warning",
      request,
      userId: session.userId,
      status: 403,
      detail: "MFA verification was rejected because the records profile is not approved.",
    });
    return NextResponse.json(
      { error: "This account is not enabled for Custody Folio." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }
  await upsertRecordsProfile({ userId: session.userId, email: session.email });
  await recordSecurityEvent({
    type: "auth_mfa_verified",
    severity: "info",
    request,
    userId: session.userId,
    status: 200,
  });

  const response = NextResponse.json({ session }, { headers: { "Cache-Control": "no-store" } });
  setRecordsSessionCookies(response, verify.data, defaultCaseIdForUser(session.userId));
  return response;
}
