import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { recordsAccountBindingHeaderName } from "@/lib/records/accountBoundary";
import { resetRateLimitStore } from "@/lib/security/rateLimit";
import {
  createEmptyRecordsDatasetForUser,
  createRecordsSeed,
  demoUserId,
} from "@/lib/records/seed";
import { buildEvidenceStoragePath } from "@/lib/records/evidenceStorage";

const getRecordsAuthContext = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn());
const invalidateAttorneyAccessForCases = vi.hoisted(() => vi.fn());
const snapshotMaybeSingle = vi.hoisted(() => vi.fn());
const snapshotFrom = vi.hoisted(() => vi.fn());
const compareAndSetRecordsSnapshot = vi.hoisted(() => vi.fn());
const storageList = vi.hoisted(() => vi.fn());
const storageRemove = vi.hoisted(() => vi.fn());

vi.mock("@/lib/records/authServer", () => ({
  attachRefreshedRecordsSession: (
    _request: NextRequest,
    response: Response
  ) => response,
  getRecordsAuthContext,
  getRecordsCaseKey: () => "default",
  isSupabaseRecordsMode: () => true,
}));

vi.mock("@/lib/records/attorneyAccess", () => ({
  invalidateAttorneyAccessForCases,
}));

vi.mock("@/lib/security/securityEvents", () => ({
  recordSecurityEvent,
}));

vi.mock("@/lib/records/snapshotStore", () => ({
  compareAndSetRecordsSnapshot,
  nextRecordsSnapshotTimestamp: (previous: string | null) =>
    previous === "2026-06-01T00:00:00.000Z"
      ? "2026-06-01T00:00:00.001Z"
      : "2026-06-01T00:00:00.002Z",
}));

import { GET, PUT } from "@/app/api/records/dataset/route";

function request(dataset: unknown, expectedUpdatedAt: string | null = null) {
  return new NextRequest("https://custodyfolio.com/api/records/dataset?caseId=default", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      [recordsAccountBindingHeaderName]: demoUserId,
    },
    body: JSON.stringify({ dataset, expectedUpdatedAt }),
  });
}

function getRequest(accountId = demoUserId) {
  return new NextRequest("https://custodyfolio.com/api/records/dataset?caseId=default", {
    headers: { [recordsAccountBindingHeaderName]: accountId },
  });
}

describe("records dataset route account isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    snapshotMaybeSingle.mockResolvedValue({ data: null, error: null });
    compareAndSetRecordsSnapshot.mockImplementation(async (input) => ({
      ok: true,
      updatedAt: input.updatedAt,
    }));
    storageList.mockResolvedValue({ data: [], error: null });
    storageRemove.mockResolvedValue({ data: [], error: null });
    snapshotFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: snapshotMaybeSingle }),
        }),
      }),
    }));
    invalidateAttorneyAccessForCases.mockResolvedValue({ ok: true });
    getRecordsAuthContext.mockResolvedValue({
      userId: demoUserId,
      supabase: {
        from: snapshotFrom,
        storage: { from: () => ({ list: storageList, remove: storageRemove }) },
      },
    });
  });

  it("filters a legacy contaminated snapshot before returning it to the account", async () => {
    snapshotMaybeSingle.mockResolvedValue({
      data: {
        dataset: createRecordsSeed(),
        updated_at: "2026-07-23T00:00:00.000Z",
      },
      error: null,
    });
    const response = await GET(getRequest());
    expect(response).toBeDefined();
    if (!response) throw new Error("Dataset route did not return a response.");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.dataset.users.every((item: { userId: string }) => item.userId === demoUserId)).toBe(true);
    expect(body.dataset.matters.every((item: { userId: string }) => item.userId === demoUserId)).toBe(true);
    expect(body.dataset.matters).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "case-other-user" })])
    );
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "records_dataset_foreign_data_removed",
        severity: "critical",
        userId: demoUserId,
        status: 200,
      })
    );
  });

  it("rejects a snapshot containing another account's profile, matter, or records", async () => {
    const response = await PUT(request(createRecordsSeed()));
    expect(response).toBeDefined();
    if (!response) throw new Error("Dataset route did not return a response.");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Records dataset contains records outside the current account or case.",
    });
    expect(snapshotFrom).not.toHaveBeenCalled();
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "records_dataset_foreign_data_blocked",
        severity: "critical",
        userId: demoUserId,
        status: 403,
      })
    );
  });

  it("preserves and stores a legitimate blank account dataset", async () => {
    const dataset = createEmptyRecordsDatasetForUser(
      demoUserId,
      "blank@example.test",
      "UTC"
    );

    const response = await PUT(request(dataset));
    expect(response).toBeDefined();
    if (!response) throw new Error("Dataset route did not return a response.");

    expect(response.status).toBe(200);
    expect(compareAndSetRecordsSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: demoUserId,
        caseKey: "default",
        dataset,
        expectedUpdatedAt: null,
      })
    );
    expect(recordSecurityEvent).not.toHaveBeenCalled();
  });

  it("deletes authoritative private evidence before committing a case deletion", async () => {
    const current = createEmptyRecordsDatasetForUser(
      demoUserId,
      "owner@example.test",
      "UTC"
    );
    const caseId = current.matters[0].id;
    const storagePath = buildEvidenceStoragePath({
      userId: demoUserId,
      caseId,
      evidenceId: "evidence-delete-me",
      originalFileName: "order.pdf",
    });
    current.evidenceItems.push({
      id: "evidence-delete-me",
      userId: demoUserId,
      caseId,
      originalFileName: "order.pdf",
      storedFileName: "evidence-delete-me.pdf",
      fileType: "application/pdf",
      fileSize: 128,
      storagePath,
      uploadedAt: "2026-06-01T00:00:00.000Z",
      tags: [],
      includeInReports: true,
      malwareScanStatus: "clean",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    current.evidenceItems = [];
    snapshotMaybeSingle.mockResolvedValue({
      data: { dataset: current, updated_at: "2026-06-01T00:00:00.000Z" },
      error: null,
    });
    let removed = false;
    storageList.mockImplementation(async (prefix: string) => {
      if (removed) return { data: [], error: null };
      if (prefix === `${demoUserId}/${caseId}`) {
        return { data: [{ id: null, name: "evidence-delete-me" }], error: null };
      }
      if (prefix === `${demoUserId}/${caseId}/evidence-delete-me`) {
        return { data: [{ id: "storage-object-id", name: "evidence-delete-me.pdf" }], error: null };
      }
      return { data: [], error: null };
    });
    storageRemove.mockImplementation(async () => {
      removed = true;
      return { data: [], error: null };
    });

    const next = structuredClone(current);
    next.matters = [];
    next.evidenceItems = [];

    const response = await PUT(request(next, "2026-06-01T00:00:00.000Z"));

    expect(response?.status).toBe(200);
    expect(storageRemove).toHaveBeenCalledWith([storagePath]);
    expect(compareAndSetRecordsSnapshot).toHaveBeenCalledTimes(2);
    expect(compareAndSetRecordsSnapshot.mock.calls[0][0].dataset.matters[0].deletionPendingAt).toEqual(
      expect.any(String)
    );
    expect(compareAndSetRecordsSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      storageRemove.mock.invocationCallOrder[0]
    );
    expect(storageRemove.mock.invocationCallOrder[0]).toBeLessThan(
      compareAndSetRecordsSnapshot.mock.invocationCallOrder[1]
    );
  });

  it("fails closed without committing case deletion when Storage cleanup fails", async () => {
    const current = createEmptyRecordsDatasetForUser(
      demoUserId,
      "owner@example.test",
      "UTC"
    );
    const caseId = current.matters[0].id;
    current.evidenceItems.push({
      id: "evidence-delete-me",
      userId: demoUserId,
      caseId,
      originalFileName: "order.pdf",
      storedFileName: "evidence-delete-me.pdf",
      fileType: "application/pdf",
      fileSize: 128,
      storagePath: buildEvidenceStoragePath({
        userId: demoUserId,
        caseId,
        evidenceId: "evidence-delete-me",
        originalFileName: "order.pdf",
      }),
      uploadedAt: "2026-06-01T00:00:00.000Z",
      tags: [],
      includeInReports: true,
      malwareScanStatus: "clean",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    snapshotMaybeSingle.mockResolvedValue({
      data: { dataset: current, updated_at: "2026-06-01T00:00:00.000Z" },
      error: null,
    });
    storageList.mockImplementation(async (prefix: string) => {
      if (prefix === `${demoUserId}/${caseId}`) {
        return { data: [{ id: null, name: "evidence-delete-me" }], error: null };
      }
      return { data: [{ id: "storage-object-id", name: "evidence-delete-me.pdf" }], error: null };
    });
    storageRemove.mockResolvedValue({ data: null, error: new Error("unavailable") });

    const next = structuredClone(current);
    next.matters = [];
    next.evidenceItems = [];

    const response = await PUT(request(next, "2026-06-01T00:00:00.000Z"));

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({
      error: "Case deletion was stopped because private evidence cleanup could not be confirmed.",
    });
    expect(compareAndSetRecordsSnapshot).toHaveBeenCalledTimes(1);
    expect(compareAndSetRecordsSnapshot.mock.calls[0][0].dataset.matters[0]).toMatchObject({
      id: caseId,
      deletionPendingAt: expect.any(String),
    });
  });

  it("rejects an oversized dataset from Content-Length before reading or storing it", async () => {
    const response = await PUT(
      new NextRequest("https://custodyfolio.com/api/records/dataset?caseId=default", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(2_000_001),
          [recordsAccountBindingHeaderName]: demoUserId,
        },
        body: "{}",
      })
    );

    expect(response).toBeDefined();
    if (!response) throw new Error("Dataset route did not return a response.");
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Records dataset is too large." });
    expect(snapshotFrom).not.toHaveBeenCalled();
  });

  it("rejects same-account records whose matter is missing", async () => {
    const dataset = createEmptyRecordsDatasetForUser(
      demoUserId,
      "blank@example.test",
      "UTC"
    );
    dataset.matters = [];
    dataset.custodyDayAssignments = [
      {
        id: "legacy-day",
        userId: demoUserId,
        caseId: "legacy-case",
        date: "2026-07-27",
        caregiverLabel: "Parent A",
        color: "#0f766e",
        createdAt: "2026-07-27T00:00:00.000Z",
        updatedAt: "2026-07-27T00:00:00.000Z",
      },
    ];

    const response = await PUT(request(dataset));
    expect(response).toBeDefined();
    if (!response) throw new Error("Dataset route did not return a response.");
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Records dataset contains records outside the current account or case.",
    });
    expect(compareAndSetRecordsSnapshot).not.toHaveBeenCalled();
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "records_dataset_foreign_data_blocked",
        severity: "critical",
        userId: demoUserId,
        status: 403,
      })
    );
  });

  it("rejects a request whose client account binding does not match the session", async () => {
    const response = await GET(getRequest("22222222-2222-4222-8222-222222222222"));
    expect(response).toBeDefined();
    if (!response) throw new Error("Dataset route did not return a response.");

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "The records session changed. Reload before accessing this account.",
    });
    expect(snapshotFrom).not.toHaveBeenCalled();
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "records_dataset_account_binding_blocked",
        severity: "critical",
        userId: demoUserId,
        status: 409,
      })
    );
  });

  it("rejects a stale snapshot version before cleanup or persistence", async () => {
    const current = createEmptyRecordsDatasetForUser(
      demoUserId,
      "owner@example.test",
      "UTC"
    );
    snapshotMaybeSingle.mockResolvedValue({
      data: { dataset: current, updated_at: "2026-06-01T00:00:00.500Z" },
      error: null,
    });

    const response = await PUT(
      request(current, "2026-06-01T00:00:00.000Z")
    );

    expect(response?.status).toBe(409);
    expect(compareAndSetRecordsSnapshot).not.toHaveBeenCalled();
    expect(storageRemove).not.toHaveBeenCalled();
  });
});
