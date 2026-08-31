import {
  recordsCapabilities,
  type EntitlementMode,
  type RecordsCapability,
  type RecordsCapabilityMap,
} from "./types";

const exportOnlyCapabilities = new Set<RecordsCapability>([
  "records:read",
  "records:delete",
  "evidence:download",
  "evidence:delete",
  "exports:create",
  "attorney:read",
  "attorney:revoke",
  "billing:manage",
  "account:delete",
]);

export function capabilitiesForEntitlementMode(
  mode: EntitlementMode
): RecordsCapabilityMap {
  const fullAccess = mode !== "export_only";
  return Object.fromEntries(
    recordsCapabilities.map((capability) => [
      capability,
      fullAccess || exportOnlyCapabilities.has(capability),
    ])
  ) as RecordsCapabilityMap;
}

export function subscriptionPurchaseEligible(mode: EntitlementMode) {
  return mode === "trial" || mode === "export_only";
}
