import type { RecordsDataset } from "@/lib/records/types";

export const exportOnlyDeletableCollections = [
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
] as const;

export type ExportOnlyDeletableCollection =
  (typeof exportOnlyDeletableCollections)[number];

export function isExportOnlyDeletableCollection(
  value: unknown
): value is ExportOnlyDeletableCollection {
  return (
    typeof value === "string" &&
    exportOnlyDeletableCollections.some((collection) => collection === value)
  );
}

function deleteAuditEntry(
  dataset: RecordsDataset,
  userId: string,
  caseId: string | undefined,
  collection: string,
  id: string,
  now: string
) {
  return [
    {
      id: `billing-delete-${crypto.randomUUID()}`,
      userId,
      caseId,
      entityType: collection,
      entityId: id,
      action: "deleted" as const,
      timestamp: now,
      metadataSummary: "Record deleted without private record contents in audit metadata.",
    },
    ...dataset.auditLogs,
  ];
}

export function deleteOwnedRecordFromDataset(input: {
  dataset: RecordsDataset;
  userId: string;
  collection: ExportOnlyDeletableCollection;
  id: string;
  now?: string;
}) {
  const { dataset, userId, collection, id } = input;
  const now = input.now || new Date().toISOString();
  const record = dataset[collection].find(
    (item) => item.id === id && item.userId === userId
  );
  if (!record) return { ok: false as const, reason: "not_found" as const };

  if (collection === "matters") {
    const caseId = id;
    const next: RecordsDataset = {
      ...dataset,
      matters: dataset.matters.filter(
        (item) => item.id !== caseId || item.userId !== userId
      ),
      exchangeRules: dataset.exchangeRules.filter(
        (item) => item.caseId !== caseId || item.userId !== userId
      ),
      scheduleExceptions: dataset.scheduleExceptions.filter(
        (item) => item.caseId !== caseId || item.userId !== userId
      ),
      custodyDayAssignments: dataset.custodyDayAssignments.filter(
        (item) => item.caseId !== caseId || item.userId !== userId
      ),
      exchangeLogs: dataset.exchangeLogs.filter(
        (item) => item.caseId !== caseId || item.userId !== userId
      ),
      dateNotes: dataset.dateNotes.filter(
        (item) => item.caseId !== caseId || item.userId !== userId
      ),
      evidenceItems: dataset.evidenceItems.filter(
        (item) => item.caseId !== caseId || item.userId !== userId
      ),
      childSupportOrders: dataset.childSupportOrders.filter(
        (item) => item.caseId !== caseId || item.userId !== userId
      ),
      childSupportPayments: dataset.childSupportPayments.filter(
        (item) => item.caseId !== caseId || item.userId !== userId
      ),
      expenseItems: dataset.expenseItems.filter(
        (item) => item.caseId !== caseId || item.userId !== userId
      ),
      timelineDesignations: dataset.timelineDesignations.filter(
        (item) => item.caseId !== caseId || item.userId !== userId
      ),
      auditLogs: deleteAuditEntry(
        dataset,
        userId,
        caseId,
        collection,
        id,
        now
      ),
    };
    return { ok: true as const, dataset: next, caseId, deletedCase: true };
  }

  const caseId = "caseId" in record ? record.caseId : undefined;
  const next = structuredClone(dataset);
  (next[collection] as Array<{ id: string; userId: string }>).splice(
    next[collection].findIndex((item) => item.id === id && item.userId === userId),
    1
  );

  if (collection === "exchangeRules") {
    next.scheduleExceptions = next.scheduleExceptions.filter(
      (item) => item.custodyExchangeRuleId !== id
    );
    next.exchangeLogs = next.exchangeLogs.map((item) =>
      item.custodyExchangeRuleId === id
        ? { ...item, custodyExchangeRuleId: undefined }
        : item
    );
  }
  if (collection === "exchangeLogs") {
    next.dateNotes = next.dateNotes.map((item) =>
      item.relatedExchangeId === id ? { ...item, relatedExchangeId: undefined } : item
    );
    next.evidenceItems = next.evidenceItems.map((item) =>
      item.relatedExchangeId === id ? { ...item, relatedExchangeId: undefined } : item
    );
  }
  if (collection === "dateNotes") {
    next.evidenceItems = next.evidenceItems.map((item) =>
      item.relatedNoteId === id ? { ...item, relatedNoteId: undefined } : item
    );
  }
  if (collection === "childSupportOrders") {
    const paymentIds = new Set(
      next.childSupportPayments
        .filter((item) => item.childSupportOrderId === id)
        .map((item) => item.id)
    );
    next.childSupportPayments = next.childSupportPayments.filter(
      (item) => item.childSupportOrderId !== id
    );
    next.dateNotes = next.dateNotes.map((item) =>
      item.relatedChildSupportPaymentId &&
      paymentIds.has(item.relatedChildSupportPaymentId)
        ? { ...item, relatedChildSupportPaymentId: undefined }
        : item
    );
    next.evidenceItems = next.evidenceItems.map((item) =>
      item.relatedChildSupportPaymentId &&
      paymentIds.has(item.relatedChildSupportPaymentId)
        ? { ...item, relatedChildSupportPaymentId: undefined }
        : item
    );
  }
  if (collection === "childSupportPayments") {
    next.dateNotes = next.dateNotes.map((item) =>
      item.relatedChildSupportPaymentId === id
        ? { ...item, relatedChildSupportPaymentId: undefined }
        : item
    );
    next.evidenceItems = next.evidenceItems.map((item) =>
      item.relatedChildSupportPaymentId === id
        ? { ...item, relatedChildSupportPaymentId: undefined }
        : item
    );
  }
  if (collection === "expenseItems") {
    next.dateNotes = next.dateNotes.map((item) =>
      item.relatedExpenseId === id ? { ...item, relatedExpenseId: undefined } : item
    );
    next.evidenceItems = next.evidenceItems.map((item) =>
      item.relatedExpenseId === id
        ? { ...item, relatedExpenseId: undefined }
        : item
    );
  }
  next.timelineDesignations = next.timelineDesignations.filter(
    (item) => item.eventId !== id
  );
  next.auditLogs = deleteAuditEntry(
    dataset,
    userId,
    caseId,
    collection,
    id,
    now
  );
  return { ok: true as const, dataset: next, caseId, deletedCase: false };
}

export function removeEvidenceMetadataFromDataset(input: {
  dataset: RecordsDataset;
  userId: string;
  evidenceId: string;
  now?: string;
}) {
  const evidence = input.dataset.evidenceItems.find(
    (item) => item.id === input.evidenceId && item.userId === input.userId
  );
  if (!evidence) return input.dataset;
  const now = input.now || new Date().toISOString();
  return {
    ...input.dataset,
    evidenceItems: input.dataset.evidenceItems.filter(
      (item) => item.id !== input.evidenceId || item.userId !== input.userId
    ),
    timelineDesignations: input.dataset.timelineDesignations.filter(
      (item) => item.eventId !== input.evidenceId
    ),
    auditLogs: deleteAuditEntry(
      input.dataset,
      input.userId,
      evidence.caseId,
      "evidenceItems",
      input.evidenceId,
      now
    ),
  };
}
