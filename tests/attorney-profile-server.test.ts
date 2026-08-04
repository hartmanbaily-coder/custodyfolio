import { beforeEach, describe, expect, it, vi } from "vitest";
import { attorneyEmailHash } from "@/lib/records/attorneyCrypto";
import {
  attorneyGrantExpiryFilter,
  attorneyGrantIsActive,
  recordsAttorneyEmailHasActiveGrant,
  recordsAttorneyProfileIsAuthorized,
} from "@/lib/records/attorneyProfileServer";

const from = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseAdmin", () => ({
  createSupabaseAdminClient: () => ({ from }),
}));

function query(result: { data: unknown; error: unknown }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    or: () => chain,
    limit: () => chain,
    maybeSingle: async () => result,
  };
  return chain;
}

describe("invitation-gated attorney profiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ATTORNEY_PORTAL_SECRET =
      "attorney-profile-test-secret-that-is-long-enough";
  });

  it("authorizes only a matching server profile with an active grant", async () => {
    from.mockImplementation((table: string) => {
      if (table === "records_attorney_profiles") {
        return query({
          data: {
            user_id: "attorney-1",
            email_hash: attorneyEmailHash("counsel@example.test"),
            credential_version: null,
          },
          error: null,
        });
      }
      if (table === "records_attorney_grants") {
        return query({ data: { id: "grant-1" }, error: null });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(recordsAttorneyProfileIsAuthorized({
      userId: "attorney-1",
      email: "Counsel@Example.test",
      accessToken: "header.payload.signature",
    })).resolves.toBe(true);

    await expect(recordsAttorneyProfileIsAuthorized({
      userId: "attorney-1",
      email: "other@example.test",
      accessToken: "header.payload.signature",
    })).resolves.toBe(false);

    await expect(recordsAttorneyEmailHasActiveGrant("counsel@example.test"))
      .resolves.toBe(true);
  });

  it("treats null expiration as permanent but keeps legacy expiry semantics", () => {
    expect(attorneyGrantIsActive({
      expires_at: null,
      revoked_at: null,
      left_at: null,
    })).toBe(true);
    expect(attorneyGrantIsActive({
      expires_at: "2020-01-01T00:00:00.000Z",
      revoked_at: null,
      left_at: null,
    })).toBe(false);
    expect(attorneyGrantIsActive({
      expires_at: null,
      revoked_at: "2026-08-04T00:00:00.000Z",
      left_at: null,
    })).toBe(false);
    expect(attorneyGrantExpiryFilter(new Date("2026-08-04T00:00:00.000Z"))).toBe(
      "expires_at.is.null,expires_at.gt.2026-08-04T00:00:00.000Z"
    );
  });
});
