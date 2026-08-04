import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  attorneyEmailHash,
  constantTimeEqualStrings,
  normalizeAttorneyEmail,
} from "./attorneyCrypto";
import { recordsCredentialVersionFromAccessToken } from "./profileServer";

export function attorneyGrantExpiryFilter(now = new Date()) {
  return `expires_at.is.null,expires_at.gt.${now.toISOString()}`;
}

export function attorneyGrantIsActive(grant: {
  revoked_at?: string | null;
  left_at?: string | null;
  expires_at?: string | null;
}, now = Date.now()) {
  if (grant.revoked_at || grant.left_at) return false;
  if (!grant.expires_at) return true;
  const expiresAt = new Date(grant.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export async function recordsAttorneyProfileIsAuthorized(input: {
  userId: string;
  email: string;
  accessToken: string;
}) {
  const supabase = createSupabaseAdminClient();
  const [profileResult, grantResult] = await Promise.all([
    supabase
      .from("records_attorney_profiles")
      .select("user_id,email_hash,credential_version")
      .eq("user_id", input.userId)
      .maybeSingle(),
    supabase
      .from("records_attorney_grants")
      .select("id")
      .eq("attorney_user_id", input.userId)
      .is("revoked_at", null)
      .is("left_at", null)
      .or(attorneyGrantExpiryFilter())
      .limit(1)
      .maybeSingle(),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (grantResult.error) throw grantResult.error;
  const profile = profileResult.data;
  if (profile?.user_id !== input.userId || !grantResult.data?.id) return false;

  const suppliedEmailHash = attorneyEmailHash(normalizeAttorneyEmail(input.email));
  if (!constantTimeEqualStrings(profile.email_hash, suppliedEmailHash)) return false;

  const expectedVersion = typeof profile.credential_version === "string"
    ? profile.credential_version
    : null;
  return expectedVersion === null ||
    recordsCredentialVersionFromAccessToken(input.accessToken) === expectedVersion;
}

export async function recordsAttorneyEmailHasActiveGrant(email: string) {
  const supabase = createSupabaseAdminClient();
  const emailHash = attorneyEmailHash(normalizeAttorneyEmail(email));
  const profileResult = await supabase
    .from("records_attorney_profiles")
    .select("user_id")
    .eq("email_hash", emailHash)
    .maybeSingle();
  if (profileResult.error) throw profileResult.error;
  if (!profileResult.data?.user_id) return false;

  const grantResult = await supabase
    .from("records_attorney_grants")
    .select("id")
    .eq("attorney_user_id", profileResult.data.user_id)
    .is("revoked_at", null)
    .is("left_at", null)
    .or(attorneyGrantExpiryFilter())
    .limit(1)
    .maybeSingle();
  if (grantResult.error) throw grantResult.error;
  return Boolean(grantResult.data?.id);
}
