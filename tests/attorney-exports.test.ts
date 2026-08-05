import { describe, expect, it } from "vitest";
import {
  attorneySelectionCounts,
  buildAttorneyExportDataset,
  createAttorneyRecordSelection,
  setAttorneyRecordSelected,
} from "@/lib/records/attorneyExports";
import { createRecordsSeed, demoCaseId, demoUserId } from "@/lib/records/seed";

describe("attorney record export selection", () => {
  it("starts with every shared record selected", () => {
    const dataset = createRecordsSeed();
    const selection = createAttorneyRecordSelection(dataset);
    const counts = attorneySelectionCounts(dataset, selection);

    expect(counts.total).toBeGreaterThan(0);
    expect(counts.selected).toBe(counts.total);
  });

  it("filters only the attorney export copy without changing the shared dataset", () => {
    const dataset = createRecordsSeed();
    const note = dataset.dateNotes.find(
      (record) => record.userId === demoUserId && record.caseId === demoCaseId
    );
    const file = dataset.evidenceItems.find(
      (record) => record.userId === demoUserId && record.caseId === demoCaseId
    );
    expect(note).toBeDefined();
    expect(file).toBeDefined();

    let selection = createAttorneyRecordSelection(dataset);
    selection = setAttorneyRecordSelected(selection, "dateNotes", note!.id, false);
    selection = setAttorneyRecordSelected(selection, "evidenceItems", file!.id, false);
    const exported = buildAttorneyExportDataset(dataset, selection);

    expect(exported.dateNotes.some((record) => record.id === note!.id)).toBe(false);
    expect(exported.evidenceItems.some((record) => record.id === file!.id)).toBe(false);
    expect(dataset.dateNotes.some((record) => record.id === note!.id)).toBe(true);
    expect(dataset.evidenceItems.some((record) => record.id === file!.id)).toBe(true);
  });

  it("lets an attorney include an accessible item even when the client report flag was off", () => {
    const dataset = createRecordsSeed();
    const note = dataset.dateNotes[0];
    const file = dataset.evidenceItems[0];
    note.includeInReports = false;
    file.includeInReports = false;

    const exported = buildAttorneyExportDataset(
      dataset,
      createAttorneyRecordSelection(dataset)
    );

    expect(exported.dateNotes[0].includeInReports).toBe(true);
    expect(exported.evidenceItems[0].includeInReports).toBe(true);
    expect(note.includeInReports).toBe(false);
    expect(file.includeInReports).toBe(false);
  });
});
