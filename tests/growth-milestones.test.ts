import { describe, expect, it } from "vitest";
import { createBlankRecordsDataset } from "@/lib/records/seed";
import {
  customerRecordCount,
  firstGrowthMilestones,
} from "@/lib/marketing/growthMilestones";

const userId = "customer1";
const timestamp = "2026-08-31T00:00:00.000Z";

describe("growth milestones", () => {
  it("counts only customer owned records across supported collections", () => {
    const dataset = createBlankRecordsDataset();
    dataset.dateNotes.push({
      id: "note1",
      caseId: "matter1",
      userId,
      noteDate: "2026-08-31",
      category: "other",
      title: "Private title",
      body: "Private content",
      tags: [],
      includeInReports: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    dataset.dateNotes.push({
      id: "note2",
      caseId: "matter2",
      userId: "someoneElse",
      noteDate: "2026-08-31",
      category: "other",
      title: "Other private title",
      body: "Other private content",
      tags: [],
      includeInReports: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(customerRecordCount(dataset, userId)).toBe(1);
  });

  it("emits each first value milestone once without returning content", () => {
    const before = createBlankRecordsDataset();
    const after = createBlankRecordsDataset();
    after.matters.push({
      id: "matter1",
      userId,
      caseName: "Private case",
      childDisplayLabels: [],
      userRoleLabel: "Parent",
      otherParentLabel: "Other parent",
      timezone: "UTC",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    after.dateNotes.push({
      id: "note1",
      caseId: "matter1",
      userId,
      noteDate: "2026-08-31",
      category: "other",
      title: "Private title",
      body: "Private content",
      tags: [],
      includeInReports: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    after.auditLogs.push({
      id: "audit1",
      userId,
      caseId: "matter1",
      entityType: "report",
      entityId: "report1",
      action: "exported",
      timestamp,
      metadataSummary: "Private report metadata",
    });

    const events = firstGrowthMilestones({ before, after, userId });

    expect(events).toEqual([
      "customer_first_matter_created",
      "customer_first_record_saved",
      "customer_first_report_created",
    ]);
    expect(JSON.stringify(events)).not.toContain("Private");
    expect(firstGrowthMilestones({ before: after, after, userId })).toEqual([]);
  });
});
