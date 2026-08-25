import { attorneyFeatureMayRun } from "@/lib/legalRelease";

export function checkAttorneyGuestEntitlement(
  _ownerUserId: string,
  env: Record<string, string | undefined> = process.env
) {
  if (env.ATTORNEY_GUEST_FEATURE_ENABLED === "false") {
    return {
      allowed: false as const,
      reason: "Attorney guest access is not enabled for this account.",
    };
  }
  if (!attorneyFeatureMayRun(env)) {
    return {
      allowed: false as const,
      reason: "Attorney guest access is unavailable until the published terms are operative.",
    };
  }
  return { allowed: true as const };
}
