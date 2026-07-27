import type { RecordsDataset } from "./types";

const datasetKeys = [
  "users",
  "matters",
  "exchangeRules",
  "scheduleExceptions",
  "custodyDayAssignments",
  "exchangeLogs",
  "dateNotes",
  "evidenceItems",
  "childSupportOrders",
  "childSupportPayments",
  "expenseItems",
  "auditLogs",
] as const satisfies ReadonlyArray<keyof RecordsDataset>;

const caseRecordKeys = [
  "exchangeRules",
  "scheduleExceptions",
  "custodyDayAssignments",
  "exchangeLogs",
  "dateNotes",
  "evidenceItems",
  "childSupportOrders",
  "childSupportPayments",
  "expenseItems",
] as const satisfies ReadonlyArray<keyof RecordsDataset>;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function recoveryMatter(
  dataset: RecordsDataset,
  userId: string,
  caseId: string
): RecordsDataset["matters"][number] {
  const profile = dataset.users.find((item) => item.userId === userId);
  const timestamp = profile?.createdAt || "1970-01-01T00:00:00.000Z";

  return {
    id: caseId,
    userId,
    caseName: "Parenting Records",
    childDisplayLabels: [],
    userRoleLabel: "Parent A",
    otherParentLabel: "Parent B",
    timezone: profile?.timezone || "UTC",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function isRecordsDataset(input: unknown): input is RecordsDataset {
  if (!input || typeof input !== "object") return false;
  const candidate = input as Partial<Record<keyof RecordsDataset, unknown>>;
  if (!datasetKeys.every((key) => Array.isArray(candidate[key]))) return false;
  if (
    !(candidate.users as unknown[]).every(
      (item) => isObject(item) && typeof item.userId === "string"
    ) ||
    !(candidate.matters as unknown[]).every(
      (item) =>
        isObject(item) &&
        typeof item.id === "string" &&
        typeof item.userId === "string"
    )
  ) {
    return false;
  }

  for (const key of caseRecordKeys) {
    if (
      !(candidate[key] as unknown[]).every(
        (item) =>
          isObject(item) &&
          typeof item.userId === "string" &&
          typeof item.caseId === "string"
      )
    ) {
      return false;
    }
  }

  return (candidate.auditLogs as unknown[]).every(
    (item) =>
      isObject(item) &&
      typeof item.userId === "string" &&
      (item.caseId === undefined || typeof item.caseId === "string")
  );
}

export function sanitizeRecordsDatasetForUser(
  dataset: RecordsDataset,
  userId: string
): RecordsDataset {
  const users = dataset.users.filter((item) => item.userId === userId);
  const ownedMatters = dataset.matters.filter((item) => item.userId === userId);
  const ownsCaseRecord = (item: { userId: string; caseId: string }) => item.userId === userId;
  const ownedCaseRecords = Object.fromEntries(
    caseRecordKeys.map((key) => [key, dataset[key].filter(ownsCaseRecord)])
  ) as Pick<RecordsDataset, (typeof caseRecordKeys)[number]>;
  const knownCaseIds = new Set(ownedMatters.map((item) => item.id));
  const recoveredCaseIds = new Set<string>();

  for (const key of caseRecordKeys) {
    for (const item of ownedCaseRecords[key]) {
      if (!knownCaseIds.has(item.caseId)) recoveredCaseIds.add(item.caseId);
    }
  }
  const matters = [
    ...ownedMatters,
    ...Array.from(recoveredCaseIds)
      .sort()
      .map((caseId) => recoveryMatter({ ...dataset, users }, userId, caseId)),
  ];
  const caseIds = new Set(matters.map((item) => item.id));

  return {
    users,
    matters,
    ...ownedCaseRecords,
    auditLogs: dataset.auditLogs.filter(
      (item) => item.userId === userId && (!item.caseId || caseIds.has(item.caseId))
    ),
  };
}

export function datasetContainsForeignRecords(dataset: RecordsDataset, userId: string) {
  return datasetKeys.some((key) =>
    dataset[key].some((item) => item.userId !== userId)
  );
}
