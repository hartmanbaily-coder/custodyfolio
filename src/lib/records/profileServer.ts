import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const recordsCredentialVersionClaim = "records_credential_version";

export function recordsCredentialVersionFromAccessToken(accessToken: string) {
  const [, payload] = accessToken.split(".");
  if (!payload) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      app_metadata?: Record<string, unknown>;
    };
    const version = claims.app_metadata?.[recordsCredentialVersionClaim];
    return typeof version === "string" && /^[A-Za-z0-9_-]{43}$/.test(version)
      ? version
      : null;
  } catch {
    return null;
  }
}

export async function recordsProfileExists(userId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("records_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.user_id === userId;
}

export async function recordsProfileIsAuthorized(userId: string, accessToken: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("records_profiles")
    .select("user_id,credential_version")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (data?.user_id !== userId) return false;

  const expectedVersion = typeof data.credential_version === "string"
    ? data.credential_version
    : null;
  return expectedVersion === null || recordsCredentialVersionFromAccessToken(accessToken) === expectedVersion;
}

export async function upsertRecordsProfile(input: { userId: string; email: string }) {
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("records_profiles").upsert(
      {
        user_id: input.userId,
        email: input.email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.warn(
        JSON.stringify({
          event: "custody_folio_profile_upsert_failed",
          at: new Date().toISOString(),
          reason: error.message.slice(0, 180),
        })
      );
    }
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "custody_folio_profile_upsert_failed",
        at: new Date().toISOString(),
        reason: error instanceof Error ? error.message.slice(0, 180) : "Unknown profile upsert error.",
      })
    );
  }
}
