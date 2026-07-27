import { describe, expect, it, vi } from "vitest";
import { ownerCaseExists } from "@/lib/records/attorneyServer";
import { createRecordsSeed, demoCaseId, demoUserId } from "@/lib/records/seed";

function supabaseWithDataset(dataset: unknown) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: { dataset },
      error: null,
    })),
  };

  return {
    client: {
      from: vi.fn(() => query),
    },
    query,
  };
}

describe("attorney owner case lookup", () => {
  it("finds a directly stored case owned by the account", async () => {
    const { client, query } = supabaseWithDataset(createRecordsSeed());

    await expect(ownerCaseExists({
      supabase: client as never,
      ownerUserId: demoUserId,
      caseKey: "default",
      caseId: demoCaseId,
    })).resolves.toBe(true);

    expect(query.eq).toHaveBeenCalledWith("user_id", demoUserId);
    expect(query.eq).toHaveBeenCalledWith("case_key", "default");
  });

  it("finds a recoverable same-account case when an older snapshot lost its matter row", async () => {
    const dataset = createRecordsSeed();
    dataset.matters = dataset.matters.filter((matter) => matter.id !== demoCaseId);
    const { client } = supabaseWithDataset(dataset);

    await expect(ownerCaseExists({
      supabase: client as never,
      ownerUserId: demoUserId,
      caseKey: "default",
      caseId: demoCaseId,
    })).resolves.toBe(true);
  });

  it("does not recover a case from another account's records", async () => {
    const dataset = createRecordsSeed();
    dataset.matters = [];
    const { client } = supabaseWithDataset(dataset);

    await expect(ownerCaseExists({
      supabase: client as never,
      ownerUserId: demoUserId,
      caseKey: "default",
      caseId: "case-other-user",
    })).resolves.toBe(false);
  });
});
