import type { Session } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseAuthClient } from "@/lib/supabaseClient";
import { recordSecurityEvent } from "@/lib/security/securityEvents";
import { defaultCaseIdForUser } from "./accountBoundary";
import { getAccessTokenAal, setRecordsSessionCookies } from "./authServer";

export async function recordsMfaPolicyResponse(input: {
  request: NextRequest;
  authClient: ReturnType<typeof createServerSupabaseAuthClient>;
  session: Pick<Session, "access_token" | "expires_in" | "refresh_token">;
  userId: string;
  sessionScope: "records" | "attorney_mfa_pending";
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
      { error: "Multi factor verification required.", mfaRequired: true },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
    setRecordsSessionCookies(
      response,
      input.session,
      defaultCaseIdForUser(input.userId),
      input.sessionScope
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
    defaultCaseIdForUser(input.userId),
    input.sessionScope
  );
  await recordSecurityEvent({
    type: "auth_mfa_enrollment_started",
    severity: "info",
    request: input.request,
    status: 403,
  });
  return response;
}
