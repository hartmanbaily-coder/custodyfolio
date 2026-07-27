import { describe, expect, it } from "vitest";
import {
  datasetContainsForeignRecords,
  isRecordsDataset,
  sanitizeRecordsDatasetForUser,
} from "@/lib/records/datasetIsolation";
import {
  createEmptyRecordsDatasetForUser,
  createRecordsSeed,
  demoCaseId,
  demoUserId,
} from "@/lib/records/seed";

describe("records dataset account isolation", () => {
  it("rejects malformed nested records instead of trusting arrays alone", () => {
    const malformed = createEmptyRecordsDatasetForUser(
      "11111111-1111-4111-8111-111111111111",
      "blank@example.test",
      "UTC"
    );
    malformed.evidenceItems = [null as never];

    expect(isRecordsDataset(malformed)).toBe(false);
  });

  it("removes every profile, case, and record owned by another account", () => {
    const contaminated = createRecordsSeed();

    expect(datasetContainsForeignRecords(contaminated, demoUserId)).toBe(true);

    const isolated = sanitizeRecordsDatasetForUser(contaminated, demoUserId);
    expect(isolated.users.every((item) => item.userId === demoUserId)).toBe(true);
    expect(isolated.matters.every((item) => item.userId === demoUserId)).toBe(true);
    expect(isolated.matters.map((item) => item.id)).toEqual([demoCaseId]);

    for (const records of [
      isolated.exchangeRules,
      isolated.scheduleExceptions,
      isolated.custodyDayAssignments,
      isolated.exchangeLogs,
      isolated.dateNotes,
      isolated.evidenceItems,
      isolated.childSupportOrders,
      isolated.childSupportPayments,
      isolated.expenseItems,
    ]) {
      expect(records.every((item) => item.userId === demoUserId && item.caseId === demoCaseId)).toBe(true);
    }
    expect(isolated.auditLogs.every((item) => item.userId === demoUserId)).toBe(true);
    expect(datasetContainsForeignRecords(isolated, demoUserId)).toBe(false);
  });

  it("preserves a legitimate blank account dataset", () => {
    const blank = createEmptyRecordsDatasetForUser(
      "11111111-1111-4111-8111-111111111111",
      "blank@example.test",
      "UTC"
    );

    expect(datasetContainsForeignRecords(blank, blank.users[0].userId)).toBe(false);
    expect(sanitizeRecordsDatasetForUser(blank, blank.users[0].userId)).toEqual(blank);
  });

  it("repairs same-account legacy records whose matter row is missing", () => {
    const legacy = sanitizeRecordsDatasetForUser(createRecordsSeed(), demoUserId);
    const assignmentCount = legacy.custodyDayAssignments.length;
    legacy.matters = [];

    expect(datasetContainsForeignRecords(legacy, demoUserId)).toBe(false);

    const repaired = sanitizeRecordsDatasetForUser(legacy, demoUserId);
    expect(repaired.matters).toEqual([
      expect.objectContaining({
        id: demoCaseId,
        userId: demoUserId,
        caseName: "Parenting Records",
      }),
    ]);
    expect(repaired.custodyDayAssignments).toHaveLength(assignmentCount);
  });
});
