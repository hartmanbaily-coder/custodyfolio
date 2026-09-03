import type { RecordsDataset } from "@/lib/records/types";
import type { GrowthEventName } from "./growthEvents";

const customerRecordCollections = [
  "custodyDayAssignments",
  "exchangeLogs",
  "dateNotes",
  "evidenceItems",
  "childSupportOrders",
  "childSupportPayments",
  "expenseItems",
] as const;

export function customerRecordCount(
  dataset: RecordsDataset | null | undefined,
  userId: string
) {
  if (!dataset) return 0;
  return customerRecordCollections.reduce(
    (total, collection) =>
      total + dataset[collection].filter((row) => row.userId === userId).length,
    0
  );
}

function customerMatterCount(
  dataset: RecordsDataset | null | undefined,
  userId: string
) {
  return dataset?.matters.filter((matter) => matter.userId === userId).length || 0;
}

function customerReportCount(
  dataset: RecordsDataset | null | undefined,
  userId: string
) {
  return (
    dataset?.auditLogs.filter(
      (entry) => entry.userId === userId && entry.action === "exported"
    ).length || 0
  );
}

export function firstGrowthMilestones(input: {
  before: RecordsDataset | null | undefined;
  after: RecordsDataset;
  userId: string;
}) {
  const events: GrowthEventName[] = [];
  if (
    customerMatterCount(input.before, input.userId) === 0 &&
    customerMatterCount(input.after, input.userId) > 0
  ) {
    events.push("customer_first_matter_created");
  }
  if (
    customerRecordCount(input.before, input.userId) === 0 &&
    customerRecordCount(input.after, input.userId) > 0
  ) {
    events.push("customer_first_record_saved");
  }
  if (
    customerReportCount(input.before, input.userId) === 0 &&
    customerReportCount(input.after, input.userId) > 0
  ) {
    events.push("customer_first_report_created");
  }
  return events;
}
