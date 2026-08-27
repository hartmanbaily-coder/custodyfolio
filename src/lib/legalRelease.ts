export type PublicLegalClausesStatus =
  | "feature_disabled_pending_review"
  | "operative";

// Slantwire Studios, LLC approved the published subscription and
// attorney-sharing language through operator self-review on August 24, 2026.
// Operational environment controls remain independently fail closed.
export const billingLegalClausesStatus: PublicLegalClausesStatus =
  "operative";
export const attorneyLegalClausesStatus: PublicLegalClausesStatus =
  "operative";

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
