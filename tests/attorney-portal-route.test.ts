import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createRecordsSeed } from "@/lib/records/seed";

const getAttorneyGuestAuthContext = vi.hoisted(() => vi.fn());

vi.mock("@/lib/records/attorneyServer", () => ({
  getAttorneyGuestAuthContext,
}));

vi.mock("@/lib/records/authServer", () => ({
  attachRefreshedRecordsSession: (_request: unknown, response: unknown) => response,
}));

import { GET } from "@/app/api/records/attorney/portal/route";

function datasetFor(ownerUserId: string, clientName: string, caseName: string) {
  const dataset = createRecordsSeed();
  dataset.users[0] = { ...dataset.users[0], userId: ownerUserId, displayName: clientName };
  dataset.matters[0] = { ...dataset.matters[0], userId: ownerUserId, caseName };
  return dataset;
}

function resolvedQuery(data: unknown[]) {
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    or: () => query,
    order: () => query,
    limit: () => query,
    in: () => query,
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data, error: null })),
  };
  return query;
}

describe("attorney multi-client portal list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ATTORNEY_PORTAL_SECRET =
      "attorney-portal-route-secret-that-is-long-enough";
  });

  it("returns named, permanent matters for every active client grant", async () => {
    const grants = [
      {
        id: "grant-1",
        owner_user_id: "owner-1",
        case_key: "default",
        case_id: "case-1",
        granted_at: "2026-08-01T00:00:00.000Z",
        expires_at: null,
      },
      {
        id: "grant-2",
        owner_user_id: "owner-2",
        case_key: "default",
        case_id: "case-2",
        granted_at: "2026-08-02T00:00:00.000Z",
        expires_at: null,
      },
    ];
    const firstDataset = datasetFor("owner-1", "Jordan Client", "Jordan v. Taylor");
    firstDataset.matters[0].id = "case-1";
    const secondDataset = datasetFor("owner-2", "Morgan Client", "Parenting plan review");
    secondDataset.matters[0].id = "case-2";
    const snapshots = [
      { user_id: "owner-1", case_key: "default", dataset: firstDataset },
      { user_id: "owner-2", case_key: "default", dataset: secondDataset },
    ];
    const supabase = {
      from: (table: string) => {
        if (table === "records_attorney_grants") return resolvedQuery(grants);
        if (table === "records_case_snapshots") return resolvedQuery(snapshots);
        throw new Error(`Unexpected table ${table}`);
      },
    };
    getAttorneyGuestAuthContext.mockResolvedValue({
      supabase,
      userId: "attorney-1",
      email: "counsel@example.test",
      assuranceLevel: "aal2",
    });

    const response = await GET(
      new NextRequest("https://custodyfolio.com/api/records/attorney/portal")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.matters).toHaveLength(2);
    expect(body.matters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientName: "Jordan Client",
        caseName: "Jordan v. Taylor",
        label: "Jordan Client — Jordan v. Taylor",
        profileConfirmed: true,
        expiresAt: null,
        accessHandle: expect.any(String),
      }),
      expect.objectContaining({
        clientName: "Morgan Client",
        caseName: "Parenting plan review",
        profileConfirmed: true,
        expiresAt: null,
      }),
    ]));
  });
});
