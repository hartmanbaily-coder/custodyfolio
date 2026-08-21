import { describe, expect, it, vi } from "vitest";
import {
  compareAndSetRecordsSnapshot,
  nextRecordsSnapshotTimestamp,
} from "@/lib/records/snapshotStore";
import { createEmptyRecordsDatasetForUser, demoUserId } from "@/lib/records/seed";

const dataset = createEmptyRecordsDatasetForUser(
  demoUserId,
  "owner@example.test",
  "UTC"
);

function updateClient(result: { data: unknown; error: unknown }) {
  const filters: Array<[string, string]> = [];
  const builder = {
    eq: vi.fn((column: string, value: string) => {
      filters.push([column, value]);
      return builder;
    }),
    select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue(result) })),
  };
  return {
    filters,
    supabase: {
      from: vi.fn(() => ({ update: vi.fn(() => builder) })),
    },
  };
}

describe("records snapshot compare-and-set", () => {
  it("requires the expected row timestamp for an update", async () => {
    const current = updateClient({
      data: { updated_at: "2026-08-15T00:00:00.001Z" },
      error: null,
    });

    await expect(
      compareAndSetRecordsSnapshot({
        supabase: current.supabase as never,
        userId: demoUserId,
        caseKey: "case-key",
        expectedUpdatedAt: "2026-08-15T00:00:00.000Z",
        dataset,
        updatedAt: "2026-08-15T00:00:00.001Z",
      })
    ).resolves.toEqual({ ok: true, updatedAt: "2026-08-15T00:00:00.001Z" });

    expect(current.filters).toContainEqual([
      "updated_at",
      "2026-08-15T00:00:00.000Z",
    ]);
  });

  it("reports a conflict when a concurrent update wins", async () => {
    const current = updateClient({ data: null, error: null });
    await expect(
      compareAndSetRecordsSnapshot({
        supabase: current.supabase as never,
        userId: demoUserId,
        caseKey: "case-key",
        expectedUpdatedAt: "2026-08-15T00:00:00.000Z",
        dataset,
        updatedAt: "2026-08-15T00:00:00.001Z",
      })
    ).resolves.toEqual({ ok: false, reason: "conflict" });
  });

  it("treats a concurrent first insert as a conflict", async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "23505" },
    });
    const supabase = {
      from: vi.fn(() => ({
        insert: vi.fn(() => ({ select: vi.fn(() => ({ single })) })),
      })),
    };

    await expect(
      compareAndSetRecordsSnapshot({
        supabase: supabase as never,
        userId: demoUserId,
        caseKey: "case-key",
        expectedUpdatedAt: null,
        dataset,
        updatedAt: "2026-08-15T00:00:00.001Z",
      })
    ).resolves.toEqual({ ok: false, reason: "conflict" });
  });

  it("always advances the timestamp beyond the previous version", () => {
    const future = "2099-01-01T00:00:00.000Z";
    expect(Date.parse(nextRecordsSnapshotTimestamp(future))).toBe(
      Date.parse(future) + 1
    );
  });
});
