import type { EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseAuthClient } from "@/lib/supabaseClient";
import {
  isRecordsSignupEnabled,
  isSupabaseRecordsMode,
  recordsAppBaseUrl,
  setRecordsPasswordRecoveryCookie,
  setRecordsSessionCookies,
} from "@/lib/records/authServer";
import { defaultCaseIdForUser } from "@/lib/records/accountBoundary";
import { recordsProfileIsAuthorized, upsertRecordsProfile } from "@/lib/records/profileServer";
import { recordSecurityEvent } from "@/lib/security/securityEvents";

export const dynamic = "force-dynamic";

const allowedOtpTypes = new Set(["email", "recovery", "signup"]);

export async function GET(request: NextRequest) {
  const baseUrl = recordsAppBaseUrl(request);
  const errorRedirect = new URL("/records?auth=confirm-error", baseUrl);

  if (!isSupabaseRecordsMode()) {
    return NextResponse.redirect(errorRedirect);
  }

  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const isRecovery = type === "recovery";
  const redirectUrl = new URL(
    isRecovery ? "/records?auth=recovery" : "/records?auth=confirmed",
    baseUrl
  );

  if (!tokenHash || !type || !allowedOtpTypes.has(type)) {
    return NextResponse.redirect(errorRedirect);
  }
  const supabase = createServerSupabaseAuthClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as EmailOtpType,
  });

  if (error || !data.session?.access_token || !data.session.refresh_token || !data.user?.id) {
    await recordSecurityEvent({
      type: isRecovery ? "auth_recovery_session_failed" : "auth_email_confirm_failed",
      severity: "warning",
      request,
      status: 401,
    });
    return NextResponse.redirect(errorRedirect);
  }

  if (!isRecovery && !isRecordsSignupEnabled()) {
    try {
      const existingProfile = await recordsProfileIsAuthorized(
        data.user.id,
        data.session.access_token
      );
      if (!existingProfile) {
        await recordSecurityEvent({
          type: "auth_signup_confirmation_blocked",
          severity: "warning",
          request,
          userId: data.user.id,
          status: 403,
          detail: "Signup confirmation lacked an approved records profile.",
        });
        return NextResponse.redirect(errorRedirect);
      }
    } catch {
      await recordSecurityEvent({
        type: "auth_signup_confirmation_blocked",
        severity: "high",
        request,
        userId: data.user.id,
        status: 503,
        detail: "Signup confirmation approval could not be verified.",
      });
      return NextResponse.redirect(errorRedirect);
    }
  }

  let recoverySessionId = "";
  if (isRecovery) {
    const verifiedClaims = await supabase.auth.getClaims(data.session.access_token);
    const claims = verifiedClaims.data?.claims as {
      amr?: Array<{ method?: unknown }>;
      session_id?: unknown;
      sub?: unknown;
    } | undefined;
    const recoveryMethod = claims?.amr?.some((entry) => entry.method === "recovery") === true;
    recoverySessionId = typeof claims?.session_id === "string" ? claims.session_id : "";
    if (
      verifiedClaims.error ||
      !recoveryMethod ||
      !recoverySessionId ||
      claims?.sub !== data.user.id ||
      (
        !isRecordsSignupEnabled() &&
        !(await recordsProfileIsAuthorized(data.user.id, data.session.access_token))
      )
    ) {
      await recordSecurityEvent({
        type: "auth_recovery_session_failed",
        severity: "warning",
        request,
        userId: data.user.id,
        status: 401,
        detail: "Verified recovery callback did not satisfy the records recovery binding.",
      });
      return NextResponse.redirect(errorRedirect);
    }
  }

  await upsertRecordsProfile({ userId: data.user.id, email: data.user.email || "" });
  await recordSecurityEvent({
    type: isRecovery ? "auth_recovery_session_accepted" : "auth_email_confirmed",
    severity: "info",
    request,
    userId: data.user.id,
    status: 307,
  });

  const response = NextResponse.redirect(redirectUrl);
  if (isRecovery) {
    setRecordsSessionCookies(
      response,
      data.session,
      defaultCaseIdForUser(data.user.id)
    );
    setRecordsPasswordRecoveryCookie(response, {
      userId: data.user.id,
      sessionId: recoverySessionId,
    });
  }
  return response;
}
