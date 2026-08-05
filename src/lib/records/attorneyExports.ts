import type { RecordsDataset } from "./types";

export const attorneySelectableRecordKinds = [
  "exchangeRules",
  "custodyDayAssignments",
  "exchangeLogs",
  "dateNotes",
  "evidenceItems",
  "childSupportOrders",
  "childSupportPayments",
  "expenseItems",
] as const;

export type AttorneySelectableRecordKind = typeof attorneySelectableRecordKinds[number];
export type AttorneyRecordSelection = Record<AttorneySelectableRecordKind, Set<string>>;

export function createAttorneyRecordSelection(dataset: RecordsDataset): AttorneyRecordSelection {
  return Object.fromEntries(
    attorneySelectableRecordKinds.map((kind) => [
      kind,
      new Set(dataset[kind].map((record) => record.id)),
    ])
  ) as AttorneyRecordSelection;
}

export function attorneySelectionCounts(
  dataset: RecordsDataset,
  selection: AttorneyRecordSelection
) {
  return attorneySelectableRecordKinds.reduce(
    (counts, kind) => ({
      selected: counts.selected + selection[kind].size,
      total: counts.total + dataset[kind].length,
    }),
    { selected: 0, total: 0 }
  );
}

export function setAllAttorneyRecordsSelected(
  dataset: RecordsDataset,
  selected: boolean
): AttorneyRecordSelection {
  if (selected) return createAttorneyRecordSelection(dataset);
  return Object.fromEntries(
    attorneySelectableRecordKinds.map((kind) => [kind, new Set<string>()])
  ) as AttorneyRecordSelection;
}

export function setAttorneyRecordSelected(
  selection: AttorneyRecordSelection,
  kind: AttorneySelectableRecordKind,
  id: string,
  selected: boolean
): AttorneyRecordSelection {
  const next = new Set(selection[kind]);
  if (selected) next.add(id);
  else next.delete(id);
  return { ...selection, [kind]: next };
}

export function buildAttorneyExportDataset(
  dataset: RecordsDataset,
  selection: AttorneyRecordSelection
): RecordsDataset {
  const selected = <T extends { id: string }>(records: T[], kind: AttorneySelectableRecordKind) =>
    records.filter((record) => selection[kind].has(record.id));
  const exchangeRules = selected(dataset.exchangeRules, "exchangeRules");
  const exchangeRuleIds = new Set(exchangeRules.map((record) => record.id));

  return {
    ...dataset,
    exchangeRules,
    scheduleExceptions: dataset.scheduleExceptions.filter(
      (record) => !record.custodyExchangeRuleId || exchangeRuleIds.has(record.custodyExchangeRuleId)
    ),
    custodyDayAssignments: selected(dataset.custodyDayAssignments, "custodyDayAssignments"),
    exchangeLogs: selected(dataset.exchangeLogs, "exchangeLogs"),
    dateNotes: selected(dataset.dateNotes, "dateNotes").map((record) => ({
      ...record,
      includeInReports: true,
    })),
    evidenceItems: selected(dataset.evidenceItems, "evidenceItems").map((record) => ({
      ...record,
      includeInReports: true,
    })),
    childSupportOrders: selected(dataset.childSupportOrders, "childSupportOrders"),
    childSupportPayments: selected(dataset.childSupportPayments, "childSupportPayments"),
    expenseItems: selected(dataset.expenseItems, "expenseItems"),
  };
}
