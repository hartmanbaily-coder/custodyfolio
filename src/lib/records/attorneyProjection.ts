import type { EvidenceItem, RecordsDataset } from "./types";

const sharedOwnerId = "shared-owner";
const sharedCaseId = "shared-case";

function createIdMap<T extends { id: string }>(prefix: string, records: T[]) {
  return new Map(records.map((record, index) => [record.id, `${prefix}-${index + 1}`]));
}

function mapped(value: string | undefined, map: Map<string, string>) {
  return value ? map.get(value) : undefined;
}

export type SharedEvidenceItem = Omit<
  EvidenceItem,
  "storageBucket" | "storagePath" | "storageUploadedAt" | "storageSha256" | "storedFileName"
> & { downloadHandle: string };

export interface SharedCaseProjection {
  dataset: RecordsDataset;
  evidence: SharedEvidenceItem[];
  sharedAt: string;
}

export function projectSharedCaseDataset(
  dataset: RecordsDataset,
  ownerUserId: string,
  caseId: string,
  evidenceHandleFor: (evidenceId: string) => string,
  now = new Date()
): SharedCaseProjection | null {
  const matter = dataset.matters.find(
    (record) => record.userId === ownerUserId && record.id === caseId
  );
  if (!matter) return null;

  const owned = <T extends { userId: string; caseId: string }>(records: T[]) =>
    records.filter((record) => record.userId === ownerUserId && record.caseId === caseId);
  const exchangeRules = owned(dataset.exchangeRules);
  const scheduleExceptions = owned(dataset.scheduleExceptions);
  const custodyDayAssignments = owned(dataset.custodyDayAssignments);
  const exchangeLogs = owned(dataset.exchangeLogs);
  const dateNotes = owned(dataset.dateNotes);
  const evidenceItems = owned(dataset.evidenceItems);
  const childSupportOrders = owned(dataset.childSupportOrders);
  const childSupportPayments = owned(dataset.childSupportPayments);
  const expenseItems = owned(dataset.expenseItems);
  const timelineDesignations = owned(dataset.timelineDesignations || []);

  const ruleIds = createIdMap("rule", exchangeRules);
  const custodyDayIds = createIdMap("custody-day", custodyDayAssignments);
  const exchangeIds = createIdMap("exchange", exchangeLogs);
  const noteIds = createIdMap("note", dateNotes);
  const evidenceIds = createIdMap("file", evidenceItems);
  const orderIds = createIdMap("support-order", childSupportOrders);
  const paymentIds = createIdMap("support-payment", childSupportPayments);
  const expenseIds = createIdMap("expense", expenseItems);

  function remapTimelineEventId(eventId: string) {
    const exactPrefixes: Array<[string, Map<string, string>]> = [
      ["custody-scheduled-exchange-", custodyDayIds],
      ["log-", exchangeIds],
      ["note-", noteIds],
      ["evidence-", evidenceIds],
      ["payment-due-", paymentIds],
      ["payment-paid-", paymentIds],
      ["expense-", expenseIds],
    ];

    for (const [prefix, idMap] of exactPrefixes) {
      for (const [sourceId, sharedId] of idMap) {
        if (eventId === `${prefix}${sourceId}`) return `${prefix}${sharedId}`;
      }
    }

    for (const [sourceId, sharedId] of ruleIds) {
      const prefix = `expected-${sourceId}-`;
      if (eventId.startsWith(prefix)) {
        return `expected-${sharedId}-${eventId.slice(prefix.length)}`;
      }
    }

    return null;
  }

  const sharedEvidence: SharedEvidenceItem[] = evidenceItems.map((record) => {
    return {
      id: evidenceIds.get(record.id) || "file",
      userId: sharedOwnerId,
      caseId: sharedCaseId,
      relatedExchangeId: mapped(record.relatedExchangeId, exchangeIds),
      relatedNoteId: mapped(record.relatedNoteId, noteIds),
      relatedChildSupportPaymentId: mapped(record.relatedChildSupportPaymentId, paymentIds),
      relatedExpenseId: mapped(record.relatedExpenseId, expenseIds),
      sourceEvidenceIds: record.sourceEvidenceIds
        ?.map((id) => evidenceIds.get(id))
        .filter((id): id is string => Boolean(id)),
      originalFileName: record.originalFileName,
      fileType: record.fileType,
      fileSize: record.fileSize,
      uploadedAt: record.uploadedAt,
      evidenceDate: record.evidenceDate,
      description: record.description,
      tags: record.tags,
      includeInReports: record.includeInReports,
      reviewStatus: record.reviewStatus,
      reviewedAt: record.reviewedAt,
      submittedAt: record.submittedAt,
      malwareScanStatus: record.malwareScanStatus,
      derivationType: record.derivationType,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      downloadHandle: evidenceHandleFor(record.id),
    };
  });

  const projected: RecordsDataset = {
    users: [],
    matters: [{ ...matter, id: sharedCaseId, userId: sharedOwnerId }],
    exchangeRules: exchangeRules.map((record) => ({
      ...record,
      id: ruleIds.get(record.id) || "rule",
      userId: sharedOwnerId,
      caseId: sharedCaseId,
    })),
    scheduleExceptions: scheduleExceptions.map((record, index) => ({
      ...record,
      id: `schedule-exception-${index + 1}`,
      userId: sharedOwnerId,
      caseId: sharedCaseId,
      custodyExchangeRuleId: mapped(record.custodyExchangeRuleId, ruleIds),
    })),
    custodyDayAssignments: custodyDayAssignments.map((record) => ({
      ...record,
      id: custodyDayIds.get(record.id) || "custody-day",
      userId: sharedOwnerId,
      caseId: sharedCaseId,
    })),
    exchangeLogs: exchangeLogs.map((record) => ({
      ...record,
      id: exchangeIds.get(record.id) || "exchange",
      userId: sharedOwnerId,
      caseId: sharedCaseId,
      custodyExchangeRuleId: mapped(record.custodyExchangeRuleId, ruleIds),
    })),
    dateNotes: dateNotes.map((record) => ({
      ...record,
      id: noteIds.get(record.id) || "note",
      userId: sharedOwnerId,
      caseId: sharedCaseId,
      relatedExchangeId: mapped(record.relatedExchangeId, exchangeIds),
      relatedChildSupportPaymentId: mapped(record.relatedChildSupportPaymentId, paymentIds),
      relatedExpenseId: mapped(record.relatedExpenseId, expenseIds),
    })),
    evidenceItems: sharedEvidence.map((record) => ({
      id: record.id,
      userId: record.userId,
      caseId: record.caseId,
      relatedExchangeId: record.relatedExchangeId,
      relatedNoteId: record.relatedNoteId,
      relatedChildSupportPaymentId: record.relatedChildSupportPaymentId,
      relatedExpenseId: record.relatedExpenseId,
      originalFileName: record.originalFileName,
      storedFileName: "",
      fileType: record.fileType,
      fileSize: record.fileSize,
      uploadedAt: record.uploadedAt,
      evidenceDate: record.evidenceDate,
      description: record.description,
      tags: record.tags,
      includeInReports: record.includeInReports,
      reviewStatus: record.reviewStatus,
      reviewedAt: record.reviewedAt,
      submittedAt: record.submittedAt,
      malwareScanStatus: record.malwareScanStatus,
      derivationType: record.derivationType,
      sourceEvidenceIds: record.sourceEvidenceIds,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    })),
    childSupportOrders: childSupportOrders.map((record) => ({
      ...record,
      id: orderIds.get(record.id) || "support-order",
      userId: sharedOwnerId,
      caseId: sharedCaseId,
    })),
    childSupportPayments: childSupportPayments.map((record) => ({
      ...record,
      id: paymentIds.get(record.id) || "support-payment",
      userId: sharedOwnerId,
      caseId: sharedCaseId,
      childSupportOrderId: orderIds.get(record.childSupportOrderId) || "support-order",
    })),
    expenseItems: expenseItems.map((record) => ({
      ...record,
      id: expenseIds.get(record.id) || "expense",
      userId: sharedOwnerId,
      caseId: sharedCaseId,
    })),
    timelineDesignations: timelineDesignations.flatMap((record, index) => {
      const eventId = remapTimelineEventId(record.eventId);
      if (!eventId) return [];
      return [{
        ...record,
        id: `timeline-designation-${index + 1}`,
        userId: sharedOwnerId,
        caseId: sharedCaseId,
        eventId,
      }];
    }),
    auditLogs: [],
  };

  return { dataset: projected, evidence: sharedEvidence, sharedAt: now.toISOString() };
}
