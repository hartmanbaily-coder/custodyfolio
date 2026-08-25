export type PublicLegalClausesStatus =
  | "feature_disabled_pending_review"
  | "operative";

// The proposed subscription and attorney-sharing language is awaiting the
// operator's explicit review. Non-production acceptance tests may still run,
// but production remains fail closed until these source-controlled states are
// deliberately changed after that review.
export const billingLegalClausesStatus: PublicLegalClausesStatus =
  "feature_disabled_pending_review";
export const attorneyLegalClausesStatus: PublicLegalClausesStatus =
  "feature_disabled_pending_review";

export function billingLegalClausesAreOperative() {
  return billingLegalClausesStatus === "operative";
}

export function attorneyLegalClausesAreOperative() {
  return attorneyLegalClausesStatus === "operative";
}

export function publicLegalClausesAreOperative(
  env: Record<string, string | undefined> = process.env
) {
  const attorneyEnabled =
    env.ATTORNEY_GUEST_FEATURE_ENABLED?.trim().toLowerCase() === "true";
  return (
    billingLegalClausesAreOperative() &&
    (!attorneyEnabled || attorneyLegalClausesAreOperative())
  );
}

export function billingFeatureMayRun(
  env: Record<string, string | undefined> = process.env
) {
  return env.NODE_ENV !== "production" || billingLegalClausesAreOperative();
}

export function attorneyFeatureMayRun(
  env: Record<string, string | undefined> = process.env
) {
  return env.NODE_ENV !== "production" || attorneyLegalClausesAreOperative();
}
