import { describe, expect, it, vi } from "vitest";
import { ownerAttorneySharingProfile, ownerCaseExists } from "@/lib/records/attorneyServer";
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

  it("does not recreate a case from orphaned records when its matter row is missing", async () => {
    const dataset = createRecordsSeed();
    dataset.matters = dataset.matters.filter((matter) => matter.id !== demoCaseId);
    const { client } = supabaseWithDataset(dataset);

    await expect(ownerCaseExists({
      supabase: client as never,
      ownerUserId: demoUserId,
      caseKey: "default",
      caseId: demoCaseId,
    })).resolves.toBe(false);
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

  it("returns the confirmed client and case labels used by the attorney selector", async () => {
    const dataset = createRecordsSeed();
    dataset.users[0].displayName = "Jordan Client";
    dataset.matters[0].caseName = "Jordan v. Taylor";
    const { client } = supabaseWithDataset(dataset);

    await expect(ownerAttorneySharingProfile({
      supabase: client as never,
      ownerUserId: demoUserId,
      caseKey: "default",
      caseId: demoCaseId,
    })).resolves.toEqual({
      clientName: "Jordan Client",
      caseName: "Jordan v. Taylor",
      confirmed: true,
    });
  });

  it("does not treat an automatically populated name as attorney-profile confirmation", async () => {
    const dataset = createRecordsSeed();
    delete dataset.users[0].attorneySharingProfileConfirmedAt;
    const { client } = supabaseWithDataset(dataset);

    await expect(ownerAttorneySharingProfile({
      supabase: client as never,
      ownerUserId: demoUserId,
      caseKey: "default",
      caseId: demoCaseId,
    })).resolves.toMatchObject({ confirmed: false });
  });
});
