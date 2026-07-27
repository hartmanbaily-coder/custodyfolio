import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  getRecordsAuthContext,
  isSupabaseRecordsMode,
  type RecordsAuthContext,
} from "./authServer";
import {
  attorneyEmailHash,
  constantTimeEqualStrings,
  hashAttorneyInvitationToken,
  isAttorneyInvitationToken,
  normalizeAttorneyEmail,
  openAttorneyHandle,
  sealAttorneyHandle,
} from "./attorneyCrypto";
import { attorneyAcceptanceCookieMaxAge } from "./attorneyPolicy";
import {
  isRecordsDataset,
  sanitizeRecordsDatasetForUser,
} from "./datasetIsolation";

const secureCookies = process.env.NODE_ENV === "production";
export const attorneyAcceptanceCookieName = secureCookies
  ? "__Secure-l2f-attorney-invite"
  : "l2f-attorney-invite";
export const attorneyPasswordSetupCookieName = secureCookies
  ? "__Secure-l2f-attorney-password-setup"
  : "l2f-attorney-password-setup";
export const attorneyMailboxProofCookieName = secureCookies
  ? "__Secure-l2f-attorney-mailbox-proof"
  : "l2f-attorney-mailbox-proof";

export function setAttorneyAcceptanceCookie(response: NextResponse, token: string) {
  response.cookies.set(attorneyAcceptanceCookieName, token, {
    httpOnly: true,
    maxAge: attorneyAcceptanceCookieMaxAge,
    path: "/",
    sameSite: "strict",
    secure: secureCookies,
  });
  return response;
}

export function clearAttorneyAcceptanceCookie(response: NextResponse) {
  response.cookies.set(attorneyAcceptanceCookieName, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "strict",
    secure: secureCookies,
  });
  return response;
}

export function setAttorneyMailboxProofCookie(
  response: NextResponse,
  input: { invitationId: string; userId: string; token: string; expiresAt: number }
) {
  const now = Date.now();
  const expiresAt = Math.max(now + 60_000, input.expiresAt);
  response.cookies.set(
    attorneyMailboxProofCookieName,
    sealAttorneyHandle({
      kind: "invitation",
      id: input.invitationId,
      subject: input.userId,
      tokenHash: hashAttorneyInvitationToken(input.token),
      expiresAt,
    }),
    {
      httpOnly: true,
      maxAge: Math.max(60, Math.floor((expiresAt - now) / 1000)),
      path: "/api/records/attorney/accept",
      sameSite: "strict",
      secure: secureCookies,
    }
  );
  return response;
}

export function getAttorneyMailboxProofInvitationId(
  request: NextRequest,
  input: { userId: string; token: string }
) {
  const value = request.cookies.get(attorneyMailboxProofCookieName)?.value || "";
  const handle = openAttorneyHandle(value, {
    kind: "invitation",
    subject: input.userId,
  });
  if (
    !handle?.id ||
    !handle.tokenHash ||
    !constantTimeEqualStrings(handle.tokenHash, hashAttorneyInvitationToken(input.token))
  ) {
    return null;
  }
  return handle.id;
}

export function clearAttorneyMailboxProofCookie(response: NextResponse) {
  response.cookies.set(attorneyMailboxProofCookieName, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/api/records/attorney/accept",
    sameSite: "strict",
    secure: secureCookies,
  });
  return response;
}

export function setAttorneyPasswordSetupCookie(
  response: NextResponse,
  input: { invitationId: string; userId: string; expiresAt: number }
) {
  const now = Date.now();
  const expiresAt = Math.max(now + 60_000, input.expiresAt);
  response.cookies.set(
    attorneyPasswordSetupCookieName,
    sealAttorneyHandle({
      kind: "invitation",
      id: input.invitationId,
      subject: input.userId,
      expiresAt,
    }),
    {
      httpOnly: true,
      maxAge: Math.max(60, Math.floor((expiresAt - now) / 1000)),
      path: "/",
      sameSite: "strict",
      secure: secureCookies,
    }
  );
  return response;
}

export function getAttorneyPasswordSetupInvitationId(
  request: NextRequest,
  userId: string
) {
  const value = request.cookies.get(attorneyPasswordSetupCookieName)?.value || "";
  return openAttorneyHandle(value, { kind: "invitation", subject: userId })?.id || null;
}

export function clearAttorneyPasswordSetupCookie(response: NextResponse) {
  response.cookies.set(attorneyPasswordSetupCookieName, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "strict",
    secure: secureCookies,
  });
  return response;
}

export async function findPendingAttorneyInvitationForEmail(input: {
  token: string;
  email: string;
}) {
  if (!isAttorneyInvitationToken(input.token)) return null;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("records_attorney_invitations")
    .select("id,owner_user_id,case_id,invited_email_hash,expires_at")
    .eq("token_hash", hashAttorneyInvitationToken(input.token))
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  if (!data?.invited_email_hash) return null;

  const suppliedEmailHash = attorneyEmailHash(normalizeAttorneyEmail(input.email));
  return constantTimeEqualStrings(data.invited_email_hash, suppliedEmailHash) ? data : null;
}

export async function findPendingAttorneyOnboardingForEmail(input: {
  token: string;
  email: string;
}) {
  if (!isAttorneyInvitationToken(input.token)) return null;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("records_attorney_invitations")
    .select("id,owner_user_id,case_id,invited_email_hash,onboarding_token_hash,onboarding_expires_at,onboarding_password_required")
    .eq("onboarding_token_hash", hashAttorneyInvitationToken(input.token))
    .eq("status", "pending")
    .gt("onboarding_expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  if (!data?.invited_email_hash) return null;

  const suppliedEmailHash = attorneyEmailHash(normalizeAttorneyEmail(input.email));
  return constantTimeEqualStrings(data.invited_email_hash, suppliedEmailHash) ? data : null;
}

export function attorneyDisabledResponse() {
  return NextResponse.json(
    { error: "Attorney access is not enabled." },
    { status: 501, headers: { "Cache-Control": "no-store" } }
  );
}

export async function getAttorneyAuthContext(
  request: NextRequest
): Promise<RecordsAuthContext | { error: NextResponse }> {
  if (!isSupabaseRecordsMode()) return { error: attorneyDisabledResponse() } as const;
  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context;
  if (context.assuranceLevel !== "aal2") {
    return {
      error: NextResponse.json(
        { error: "Authenticator verification is required.", mfaRequired: true },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      ),
    } as const;
  }
  if (!context.email || !context.emailConfirmedAt) {
    return {
      error: NextResponse.json(
        { error: "Confirm the account email before using attorney access." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      ),
    } as const;
  }
  return context;
}

export async function ownerCaseExists(input: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  ownerUserId: string;
  caseKey: string;
  caseId: string;
}) {
  const { data, error } = await input.supabase
    .from("records_case_snapshots")
    .select("dataset")
    .eq("user_id", input.ownerUserId)
    .eq("case_key", input.caseKey)
    .maybeSingle();
  if (error || !data?.dataset) return false;
  if (!isRecordsDataset(data.dataset)) return false;

  const dataset = sanitizeRecordsDatasetForUser(
    data.dataset,
    input.ownerUserId
  );
  return dataset.matters.some((matter) => matter.id === input.caseId);
}

export function isAttorneyDevelopmentDeliveryEnabled(
  env: Record<string, string | undefined> = process.env
) {
  return env.NODE_ENV !== "production" && env.ATTORNEY_INVITE_DEV_DELIVERY === "true";
}

export function isAttorneyOwnerShareEnabled(
  env: Record<string, string | undefined> = process.env
) {
  return env.ATTORNEY_INVITE_OWNER_SHARE_ENABLED === "true";
}

export function attorneyInvitationDeliveryMode(
  env: Record<string, string | undefined> = process.env
) {
  if (isAttorneyOwnerShareEnabled(env)) return "owner_share" as const;
  if (isAttorneyDevelopmentDeliveryEnabled(env)) return "development_link" as const;
  return "not_configured" as const;
}
