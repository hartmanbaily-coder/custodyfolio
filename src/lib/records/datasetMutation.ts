import type { RecordsDataset } from "./types";
import type { ExportOnlyDeletableCollection } from "@/lib/billing/exportOnlyDeletion";

export interface ExportOnlyDeletionRequest {
  collection: ExportOnlyDeletableCollection;
  id: string;
}

const deletionCollections: ExportOnlyDeletableCollection[] = [
  "matters",
  "exchangeRules",
  "scheduleExceptions",
  "custodyDayAssignments",
  "exchangeLogs",
  "dateNotes",
  "childSupportOrders",
  "childSupportPayments",
  "expenseItems",
  "timelineDesignations",
];

function unchangedSubset<T extends { id: string }>(before: T[], after: T[]) {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  return after.every((item) => {
    const prior = beforeById.get(item.id);
    return prior !== undefined && JSON.stringify(prior) === JSON.stringify(item);
  });
}

function removedIds<T extends { id: string }>(before: T[], after: T[]) {
  const afterIds = new Set(after.map((item) => item.id));
  return before.filter((item) => !afterIds.has(item.id)).map((item) => item.id);
}

export function planExportOnlyDatasetMutation(
  before: RecordsDataset,
  after: RecordsDataset
):
  | { kind: "audit_only" }
  | { kind: "delete"; deletions: ExportOnlyDeletionRequest[] }
  | null {
  if (JSON.stringify(before.users) !== JSON.stringify(after.users)) return null;
  if (!unchangedSubset(after.auditLogs, before.auditLogs)) return null;

  const changes = deletionCollections.map((collection) => ({
    collection,
    unchanged: unchangedSubset(before[collection] as Array<{ id: string }>, after[collection] as Array<{ id: string }>),
    removed: removedIds(before[collection] as Array<{ id: string }>, after[collection] as Array<{ id: string }>),
  }));
  if (changes.some((change) => !change.unchanged)) return null;

  const allRemoved = changes.flatMap((change) =>
    change.removed.map((id) => ({ collection: change.collection, id }))
  );
  if (allRemoved.length === 0) {
    return after.auditLogs.length >= before.auditLogs.length
      ? { kind: "audit_only" }
      : null;
  }

  const removedMatterIds = new Set(
    allRemoved
      .filter((item) => item.collection === "matters")
      .map((item) => item.id)
  );
  if (removedMatterIds.size > 0) {
    return {
      kind: "delete",
      deletions: allRemoved.filter((item) => item.collection === "matters"),
    };
  }

  const removedOrderIds = new Set(
    allRemoved
      .filter((item) => item.collection === "childSupportOrders")
      .map((item) => item.id)
  );
  const removedRuleIds = new Set(
    allRemoved
      .filter((item) => item.collection === "exchangeRules")
      .map((item) => item.id)
  );
  const deletions = allRemoved.filter((item) => {
    if (
      item.collection === "childSupportPayments" &&
      before.childSupportPayments.some(
        (payment) =>
          payment.id === item.id && removedOrderIds.has(payment.childSupportOrderId)
      )
    ) {
      return false;
    }
    if (
      item.collection === "scheduleExceptions" &&
      before.scheduleExceptions.some(
        (exception) =>
          exception.id === item.id &&
          Boolean(
            exception.custodyExchangeRuleId &&
              removedRuleIds.has(exception.custodyExchangeRuleId)
          )
      )
    ) {
      return false;
    }
    return true;
  });
  return deletions.length > 0 ? { kind: "delete", deletions } : null;
}
