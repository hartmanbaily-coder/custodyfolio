import { NextRequest, NextResponse } from "next/server";
import {
  isSupabaseRecordsMode,
  setRecordsSessionCookies,
} from "@/lib/records/authServer";
import { defaultCaseIdForUser } from "@/lib/records/accountBoundary";
import { recordsAttorneyProfileIsAuthorized } from "@/lib/records/attorneyProfileServer";
import {
  createServerSupabaseAuthClient,
  createServerSupabaseSessionClient,
} from "@/lib/supabaseClient";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import { recordSecurityEvent } from "@/lib/security/securityEvents";
import { recordsMfaPolicyResponse } from "@/lib/records/mfaPolicyServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function tokenValue(value: unknown) {
  return typeof value === "string" && value.length > 20 && value.length < 8_000 ? value : "";
}

function rejected() {
  return NextResponse.json(
    { error: "Secure attorney sign-in is invalid, expired, or no active matter is available." },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
  if (!isSupabaseRecordsMode()) {
    return NextResponse.json({ error: "Attorney account access is not enabled." }, { status: 501 });
  }
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();
  const rateLimit = checkRateLimit(request, {
    id: "records-attorney-return-session",
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
  const refreshToken = tokenValue(body.refreshToken);
  const expiresIn = Number(body.expiresIn || 3600);
  if (!accessToken || !refreshToken) return rejected();

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
      const validMethod = entry.method === "magiclink" || entry.method === "otp";
      const timestamp = typeof entry.timestamp === "number" ? entry.timestamp : 0;
      return validMethod && timestamp >= nowSeconds - 10 * 60 && timestamp <= nowSeconds + 60;
    }) === true;
    const subject = typeof claims?.sub === "string" ? claims.sub : "";
    const sessionId = typeof claims?.session_id === "string" ? claims.session_id : "";
    if (verifiedClaims.error || !emailProof || !subject || !sessionId) return rejected();

    const authClient = await createServerSupabaseSessionClient({ accessToken, refreshToken });
    const userResult = await authClient.auth.getUser();
    const user = userResult.data.user;
    if (
      userResult.error ||
      !user?.id ||
      user.id !== subject ||
      !user.email ||
      !user.email_confirmed_at
    ) return rejected();

    const authorized = await recordsAttorneyProfileIsAuthorized({
      userId: user.id,
      email: user.email,
      accessToken,
    });
    if (!authorized) return rejected();

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
    if (mfa) return mfa;

    const response = NextResponse.json(
      { ok: true },
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
    await recordSecurityEvent({
      type: "auth_login_success",
      severity: "info",
      request,
      userId: user.id,
      status: 200,
      detail: "Mailbox-verified returning attorney session established.",
    });
    return response;
  } catch {
    await recordSecurityEvent({
      type: "auth_login_failed",
      severity: "warning",
      request,
      status: 401,
      detail: "Mailbox-verified returning attorney session was rejected.",
    });
    return rejected();
  }
}
