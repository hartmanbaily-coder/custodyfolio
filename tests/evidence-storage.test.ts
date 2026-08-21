import { describe, expect, it, vi } from "vitest";
import {
  assertEvidenceItemAccess,
  buildEvidenceStoragePath,
  deleteEvidenceForCases,
  findEvidenceItemInSnapshots,
  findEvidenceRecordInSnapshots,
  isEvidenceStoragePathOwnedByUser,
} from "@/lib/records/evidenceStorage";

describe("evidence storage access helpers", () => {
  it("builds storage paths under the authenticated user and case", () => {
    const path = buildEvidenceStoragePath({
      userId: "user_a",
      caseId: "case_1",
      evidenceId: "evidence_9",
      originalFileName: "exchange note.pdf",
    });

    expect(path).toBe("user_a/case_1/evidence_9/evidence_9.pdf");
    expect(isEvidenceStoragePathOwnedByUser(path, "user_a")).toBe(true);
    expect(isEvidenceStoragePathOwnedByUser(path, "user_b")).toBe(false);
  });

  it("rejects evidence metadata with a mismatched owner or path prefix", () => {
    const path = buildEvidenceStoragePath({
      userId: "user_a",
      caseId: "case_1",
      evidenceId: "evidence_9",
      originalFileName: "exchange note.pdf",
    });

    expect(
      assertEvidenceItemAccess(
        {
          id: "evidence_9",
          userId: "user_a",
          caseId: "case_1",
          originalFileName: "exchange note.pdf",
          storagePath: path,
          malwareScanStatus: "clean",
        },
        { userId: "user_a", caseId: "case_1" }
      )
    ).toEqual({ ok: true });

    expect(
      assertEvidenceItemAccess(
        {
          id: "evidence_9",
          userId: "user_b",
          caseId: "case_1",
          originalFileName: "exchange note.pdf",
          storagePath: path.replace("user_a", "user_b"),
          malwareScanStatus: "clean",
        },
        { userId: "user_a", caseId: "case_1" }
      )
    ).toMatchObject({ ok: false });

    expect(
      assertEvidenceItemAccess(
        {
          id: "evidence_9",
          userId: "user_a",
          caseId: "case_1",
          originalFileName: "exchange note.pdf",
          storagePath: "user_a/case_2/evidence_9/evidence_9.pdf",
          malwareScanStatus: "clean",
        },
        { userId: "user_a", caseId: "case_1" }
      )
    ).toMatchObject({ ok: false });
  });

  it("rejects percent-encoded dot segments even when the raw path has the owner prefix", () => {
    expect(
      assertEvidenceItemAccess(
        {
          id: "evidence_9",
          userId: "user_a",
          caseId: "case_1",
          originalFileName: "exchange note.pdf",
          storagePath:
            "user_a/case_1/evidence_9/%2e%2e/%2e%2e/%2e%2e/user_b/case_2/evidence_7/evidence_7.pdf",
          malwareScanStatus: "clean",
        },
        { userId: "user_a", caseId: "case_1" }
      )
    ).toMatchObject({ ok: false });
  });

  it("rejects every noncanonical storage delimiter before it reaches Storage", () => {
    for (const path of [
      "user_a/case_1/evidence_9/%2E%2E.pdf",
      "user_a/case_1/evidence_9/evidence_9%2fpdf",
      "user_a/case_1/evidence_9\\evidence_9.pdf",
      "user_a/case_1/evidence_9/evidence_9.pdf?download=1",
      "user_a/case_1/evidence_9/evidence_9.pdf#fragment",
    ]) {
      expect(isEvidenceStoragePathOwnedByUser(path, "user_a")).toBe(false);
    }
  });

  it("finds evidence only from the authenticated user's stored snapshot", () => {
    const rows = [
      {
        case_key: "other-snapshot",
        dataset: {
          evidenceItems: [
            {
              id: "evidence_9",
              userId: "user_b",
              caseId: "case_1",
              originalFileName: "other.pdf",
              storedFileName: "evidence_9.pdf",
              fileType: "application/pdf",
              fileSize: 10,
              storagePath: "user_b/case_1/evidence_9/evidence_9.pdf",
              uploadedAt: "2026-06-01T00:00:00.000Z",
              tags: [],
              includeInReports: true,
              createdAt: "2026-06-01T00:00:00.000Z",
              updatedAt: "2026-06-01T00:00:00.000Z",
            },
          ],
        },
      },
      {
        case_key: "authoritative-snapshot",
        dataset: {
          evidenceItems: [
            {
              id: "evidence_9",
              userId: "user_a",
              caseId: "case_1",
              originalFileName: "exchange note.pdf",
              storedFileName: "evidence_9.pdf",
              fileType: "application/pdf",
              fileSize: 10,
              storagePath: "user_a/case_1/evidence_9/evidence_9.pdf",
              uploadedAt: "2026-06-01T00:00:00.000Z",
              tags: [],
              includeInReports: true,
              createdAt: "2026-06-01T00:00:00.000Z",
              updatedAt: "2026-06-01T00:00:00.000Z",
            },
          ],
        },
      },
    ];

    const evidence = findEvidenceItemInSnapshots(rows, {
      userId: "user_a",
      caseId: "case_1",
      evidenceId: "evidence_9",
    });

    expect(evidence?.storagePath).toBe("user_a/case_1/evidence_9/evidence_9.pdf");
    expect(
      findEvidenceRecordInSnapshots(rows, {
        userId: "user_a",
        caseId: "case_1",
        evidenceId: "evidence_9",
      })
    ).toMatchObject({ caseKey: "authoritative-snapshot" });
    expect(
      findEvidenceItemInSnapshots(rows, {
        userId: "user_a",
        caseId: "case_2",
        evidenceId: "evidence_9",
      })
    ).toBeNull();
  });

  it("fails before removal when Storage returns a noncanonical object name", async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const result = await deleteEvidenceForCases({
      supabase: {
        storage: {
          from: vi.fn(() => ({
            list: vi.fn().mockResolvedValue({
              data: [{ id: "object-id", name: "%2e%2e" }],
              error: null,
            }),
            remove,
          })),
        },
      },
      userId: "user_a",
      caseIds: ["case_1"],
    });

    expect(result).toMatchObject({ ok: false });
    expect(remove).not.toHaveBeenCalled();
  });

  it("deduplicates authoritative paths and removes them in Storage API batches", async () => {
    const objects = Array.from({ length: 1001 }, (_, index) => ({
      id: `object-${index}`,
      name: `evidence_${String(index).padStart(4, "0")}.pdf`,
    }));
    const removed = new Set<string>();
    const list = vi.fn(async (
      _prefix: string,
      options: { limit: number; offset: number }
    ) => ({
      data: objects
        .filter((item) => !removed.has(`user_a/case_1/${item.name}`))
        .slice(options.offset, options.offset + options.limit),
      error: null,
    }));
    const remove = vi.fn(async (paths: string[]) => {
      paths.forEach((path) => removed.add(path));
      return { error: null };
    });

    const result = await deleteEvidenceForCases({
      supabase: { storage: { from: vi.fn(() => ({ list, remove })) } },
      userId: "user_a",
      caseIds: ["case_1"],
    });

    expect(result).toEqual({ ok: true, deletedObjects: 1001 });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove.mock.calls[0][0]).toHaveLength(1000);
    expect(remove.mock.calls[1][0]).toHaveLength(1);
  });

  it("returns a fail-closed result when the Storage client throws", async () => {
    const list = vi.fn().mockResolvedValueOnce({
      data: [{ id: "object-id", name: "evidence_9.pdf" }],
      error: null,
    });
    const result = await deleteEvidenceForCases({
      supabase: {
        storage: {
          from: vi.fn(() => ({
            list,
            remove: vi.fn().mockRejectedValue(new Error("network details")),
          })),
        },
      },
      userId: "user_a",
      caseIds: ["case_1"],
    });

    expect(result).toEqual({
      ok: false,
      error: "Unable to delete every private evidence file for the removed case.",
    });
  });
});
