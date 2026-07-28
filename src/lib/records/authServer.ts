import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Session } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  createServerSupabaseAuthClient,
  createServerSupabaseSessionClient,
} from "@/lib/supabaseClient";
import { recordsProfileIsAuthorized } from "./profileServer";
import { defaultCaseIdForUser } from "./accountBoundary";

const secureCookies = process.env.NODE_ENV === "production";

export const recordsAccessCookieName = secureCookies
  ? "__Host-l2f-records-access"
  : "l2f-records-access";
export const recordsRefreshCookieName = secureCookies
  ? "__Host-l2f-records-refresh"
  : "l2f-records-refresh";
export const recordsCaseCookieName = secureCookies ? "__Host-l2f-records-case" : "l2f-records-case";
export const recordsPasswordRecoveryCookieName = secureCookies
  ? "__Host-l2f-records-recovery"
  : "l2f-records-recovery";

const refreshCookieMaxAge = 60 * 60 * 24 * 30;
const passwordRecoveryCookieMaxAge = 15 * 60;

export interface RecordsAuthContext {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  userId: string;
  email: string;
  emailConfirmedAt?: string;
  assuranceLevel: "aal1" | "aal2" | null;
  caseId: string;
  refreshedSession?: Session;
}

export function isSupabaseRecordsMode() {
  return (
    process.env.RECORDS_STORAGE_MODE === "supabase" ||
    process.env.NEXT_PUBLIC_RECORDS_STORAGE_MODE === "supabase"
  );
}

export function isRecordsMfaRequired(env: Record<string, string | undefined> = process.env) {
  return (
    env.RECORDS_ENFORCE_MFA === "true" ||
    (env.NODE_ENV === "production" && env.SUPABASE_MFA_POLICY === "required")
  );
}

export function isRecordsSignupEnabled(env: Record<string, string | undefined> = process.env) {
  return (
    env.RECORDS_SIGNUPS_ENABLED === "true" &&
    env.NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED === "true"
  );
}

export function recordsPasswordMinimumLength(env: Record<string, string | undefined> = process.env) {
  const configured = Number(env.SUPABASE_PASSWORD_MIN_LENGTH || 12);
  return Number.isFinite(configured) ? Math.max(12, configured) : 12;
}

export function isStrongRecordsPassword(
  password: string,
  env: Record<string, string | undefined> = process.env
) {
  return password.length >= recordsPasswordMinimumLength(env) && password.length <= 128;
}

export function recordsAppBaseUrl(request: NextRequest, env: Record<string, string | undefined> = process.env) {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1") {
        return url.origin;
      }
    } catch {
      // Fall back to request origin below.
    }
  }

  return request.nextUrl.origin;
}

export function safeRecordsAuthNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/records";

  try {
    const parsed = new URL(value, "https://custodyfolio.com");
    if (!parsed.pathname.startsWith("/records")) return "/records";
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/records";
  }
}

export function getAccessTokenAal(
  accessToken: string | undefined
): "aal1" | "aal2" | null {
  if (!accessToken) return null;
  const [, payload] = accessToken.split(".");
  if (!payload) return null;

  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { aal?: unknown };
    return parsed.aal === "aal2" || parsed.aal === "aal1" ? parsed.aal : null;
  } catch {
    return null;
  }
}

export function mfaRequiredResponse() {
  return NextResponse.json(
    {
      error: "Multi factor verification required.",
      mfaRequired: true,
    },
    { status: 403, headers: { "Cache-Control": "no-store" } }
  );
}

export function getRecordsCaseKey(request: NextRequest) {
  return request.nextUrl.searchParams.get("caseId")?.slice(0, 120) || "default";
}

export function getRecordsSessionCaseId(request: NextRequest) {
  return request.cookies.get(recordsCaseCookieName)?.value || "";
}

function baseCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax" as const,
    secure: secureCookies,
  };
}

export function setRecordsSessionCookies(
  response: NextResponse,
  session: Pick<Session, "access_token" | "expires_in" | "refresh_token">,
  caseId: string
) {
  response.cookies.set(
    recordsAccessCookieName,
    session.access_token,
    baseCookieOptions(Math.max(60, Math.min(session.expires_in || 3600, 3600)))
  );
  response.cookies.set(
    recordsRefreshCookieName,
    session.refresh_token,
    baseCookieOptions(refreshCookieMaxAge)
  );
  response.cookies.set(recordsCaseCookieName, caseId, baseCookieOptions(refreshCookieMaxAge));
}

export function clearRecordsSessionCookies(response: NextResponse) {
  response.cookies.set(recordsAccessCookieName, "", baseCookieOptions(0));
  response.cookies.set(recordsRefreshCookieName, "", baseCookieOptions(0));
  response.cookies.set(recordsCaseCookieName, "", baseCookieOptions(0));
  response.cookies.set(recordsPasswordRecoveryCookieName, "", baseCookieOptions(0));
}

interface RecordsPasswordRecoveryBinding {
  userId: string;
  sessionId: string;
}

interface RecordsPasswordRecoveryPayload extends RecordsPasswordRecoveryBinding {
  expiresAt: number;
  nonce: string;
  version: 1;
}

function recordsPasswordRecoverySecret(env: Record<string, string | undefined> = process.env) {
  const secret = env.RECORDS_RECOVERY_COOKIE_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("A recovery-cookie signing secret of at least 32 characters is required.");
  }
  return secret;
}

function signRecordsPasswordRecoveryPayload(encodedPayload: string) {
  return createHmac("sha256", recordsPasswordRecoverySecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function setRecordsPasswordRecoveryCookie(
  response: NextResponse,
  binding: RecordsPasswordRecoveryBinding
) {
  const payload: RecordsPasswordRecoveryPayload = {
    ...binding,
    expiresAt: Date.now() + passwordRecoveryCookieMaxAge * 1000,
    nonce: randomBytes(24).toString("base64url"),
    version: 1,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const value = `${encodedPayload}.${signRecordsPasswordRecoveryPayload(encodedPayload)}`;
  response.cookies.set(
    recordsPasswordRecoveryCookieName,
    value,
    baseCookieOptions(passwordRecoveryCookieMaxAge)
  );
}

export function hasRecordsPasswordRecoveryCookie(
  request: NextRequest,
  binding: RecordsPasswordRecoveryBinding
) {
  const value = request.cookies.get(recordsPasswordRecoveryCookieName)?.value || "";
  const [encodedPayload, suppliedSignature, extra] = value.split(".");
  if (!encodedPayload || !suppliedSignature || extra) return false;

  try {
    const expectedSignature = signRecordsPasswordRecoveryPayload(encodedPayload);
    const supplied = Buffer.from(suppliedSignature, "base64url");
    const expected = Buffer.from(expectedSignature, "base64url");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as Partial<RecordsPasswordRecoveryPayload>;
    return (
      payload.version === 1 &&
      payload.userId === binding.userId &&
      payload.sessionId === binding.sessionId &&
      typeof payload.expiresAt === "number" &&
      payload.expiresAt > Date.now() &&
      typeof payload.nonce === "string" &&
      payload.nonce.length >= 24
    );
  } catch {
    return false;
  }
}

function getAllowedBearerToken(request: NextRequest) {
  if (process.env.NODE_ENV === "production" || process.env.RECORDS_ALLOW_BEARER_AUTH !== "true") {
    return "";
  }

  const header = request.headers.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" ? token || "" : "";
}

export function authError(message = "Authentication required.") {
  return NextResponse.json({ error: message }, { status: 401 });
}

function mfaSatisfied(accessToken: string | undefined) {
  return !isRecordsMfaRequired() || getAccessTokenAal(accessToken) === "aal2";
}

async function approvedRecordsProfile(userId: string, accessToken: string) {
  try {
    return await recordsProfileIsAuthorized(userId, accessToken);
  } catch {
    return null;
  }
}

function unapprovedRecordsProfileResponse(profileApproved: boolean | null) {
  if (profileApproved === null) {
    return NextResponse.json(
      { error: "Account authorization is temporarily unavailable." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "60" },
      }
    );
  }

  return NextResponse.json(
    { error: "This account is not enabled for Custody Folio." },
    { status: 403, headers: { "Cache-Control": "no-store" } }
  );
}

export async function getRecordsSessionAuthClient(request: NextRequest) {
  const accessToken = request.cookies.get(recordsAccessCookieName)?.value;
  const refreshToken = request.cookies.get(recordsRefreshCookieName)?.value;

  if (!accessToken || !refreshToken) {
    throw new Error("Records session cookies are missing.");
  }

  return createServerSupabaseSessionClient({ accessToken, refreshToken });
}

export function attachRefreshedRecordsSession(
  request: NextRequest,
  response: NextResponse,
  context: RecordsAuthContext
) {
  if (context.refreshedSession) {
    setRecordsSessionCookies(response, context.refreshedSession, context.caseId);
  }
  return response;
}

export async function getRecordsAuthContext(request: NextRequest) {
  const accessToken =
    request.cookies.get(recordsAccessCookieName)?.value || getAllowedBearerToken(request);
  const refreshToken = request.cookies.get(recordsRefreshCookieName)?.value;

  if (!accessToken && !refreshToken) {
    return { error: authError("Sign in before accessing records.") };
  }

  const supabase = createSupabaseAdminClient();
  const requestedCaseId = getRecordsSessionCaseId(request);

  if (accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (!error && data.user?.id) {
      const profileApproved = await approvedRecordsProfile(data.user.id, accessToken);
      if (profileApproved !== true) {
        return { error: unapprovedRecordsProfileResponse(profileApproved) };
      }
      if (!mfaSatisfied(accessToken)) return { error: mfaRequiredResponse() };

      return {
        supabase,
        userId: data.user.id,
        email: data.user.email || "",
        emailConfirmedAt: data.user.email_confirmed_at,
        assuranceLevel: getAccessTokenAal(accessToken),
        caseId: requestedCaseId || defaultCaseIdForUser(data.user.id),
      };
    }
  }

  if (refreshToken) {
    const authClient = createServerSupabaseAuthClient();
    const { data, error } = await authClient.auth.refreshSession({ refresh_token: refreshToken });
    const refreshed = data.session;
    const user = data.user || refreshed?.user;

    if (!error && refreshed?.access_token && user?.id) {
      const profileApproved = await approvedRecordsProfile(user.id, refreshed.access_token);
      if (profileApproved !== true) {
        return { error: unapprovedRecordsProfileResponse(profileApproved) };
      }
      if (!mfaSatisfied(refreshed.access_token)) return { error: mfaRequiredResponse() };

      return {
        supabase,
        userId: user.id,
        email: user.email || "",
        emailConfirmedAt: user.email_confirmed_at,
        assuranceLevel: getAccessTokenAal(refreshed.access_token),
        caseId: requestedCaseId || defaultCaseIdForUser(user.id),
        refreshedSession: refreshed,
      };
    }
  }

  return { error: authError("Session expired. Sign in again.") };
}
