import type { RecordsDataset } from "./types";

export const recordsAccountBindingHeaderName = "x-custody-folio-account";

export function defaultCaseIdForUser(userId: string) {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error("An account identifier is required to create a case identifier.");
  }
  return `case-${normalizedUserId}`;
}

export function datasetAccountId(dataset: RecordsDataset) {
  const accountIds = new Set(dataset.users.map((profile) => profile.userId));
  if (accountIds.size !== 1) {
    throw new Error("Cloud records must contain exactly one account profile.");
  }
  return Array.from(accountIds)[0];
}
