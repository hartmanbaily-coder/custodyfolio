export const termsVersion = "2026-08-23.1";
export const privacyVersion = "2026-08-23.1";
export const consumerHealthSharingConsentVersion = "2026-08-23.1";

export const legalAcceptanceMetadataKeys = {
  termsVersion: "custody_folio_terms_version",
  privacyVersion: "custody_folio_privacy_version",
  acceptedAt: "custody_folio_legal_accepted_at",
  source: "custody_folio_legal_acceptance_source",
} as const;

export function legalAcceptanceMetadata(source: "signup" | "login" | "attorney_signup" | "attorney_login") {
  return {
    [legalAcceptanceMetadataKeys.termsVersion]: termsVersion,
    [legalAcceptanceMetadataKeys.privacyVersion]: privacyVersion,
    [legalAcceptanceMetadataKeys.acceptedAt]: new Date().toISOString(),
    [legalAcceptanceMetadataKeys.source]: source,
  };
}
