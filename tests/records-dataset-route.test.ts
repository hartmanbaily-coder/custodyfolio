import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimitStore } from "@/lib/security/rateLimit";
import {
  createEmptyRecordsDatasetForUser,
  createRecordsSeed,
  demoUserId,
} from "@/lib/records/seed";

const getRecordsAuthContext = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn());
const invalidateAttorneyAccessForCases = vi.hoisted(() => vi.fn());
const snapshotMaybeSingle = vi.hoisted(() => vi.fn());
const snapshotUpsert = vi.hoisted(() => vi.fn());
const snapshotFrom = vi.hoisted(() => vi.fn());

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

import { GET, PUT } from "@/app/api/records/dataset/route";

function request(dataset: unknown) {
  return new NextRequest("https://custodyfolio.com/api/records/dataset?caseId=default", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataset }),
  });
}

describe("records dataset route account isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    snapshotMaybeSingle.mockResolvedValue({ data: null, error: null });
    snapshotUpsert.mockResolvedValue({ error: null });
    snapshotFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: snapshotMaybeSingle }),
        }),
      }),
      upsert: snapshotUpsert,
    }));
    invalidateAttorneyAccessForCases.mockResolvedValue({ ok: true });
    getRecordsAuthContext.mockResolvedValue({
      userId: demoUserId,
      supabase: { from: snapshotFrom },
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
    const response = await GET(
      new NextRequest("https://custodyfolio.com/api/records/dataset?caseId=default")
    );
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
      error: "Records dataset contains data that does not belong to this account.",
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
    expect(snapshotUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: demoUserId,
        case_key: "default",
        dataset,
      }),
      { onConflict: "user_id,case_key" }
    );
    expect(recordSecurityEvent).not.toHaveBeenCalled();
  });
});
