import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const adminGetUser = vi.hoisted(() => vi.fn());
const refreshSession = vi.hoisted(() => vi.fn());
const getAccessTokenAal = vi.hoisted(() => vi.fn());

vi.mock("@/lib/records/authServer", () => ({
  getAccessTokenAal,
  getRecordsAuthContext: vi.fn(),
  isSupabaseRecordsMode: () => true,
  recordsAccessCookieName: "records-access",
  recordsRefreshCookieName: "records-refresh",
  recordsSessionScopeCookieName: "records-scope",
}));
vi.mock("@/lib/supabaseAdmin", () => ({
  createSupabaseAdminClient: () => ({ auth: { getUser: adminGetUser } }),
}));
vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseAuthClient: () => ({ auth: { refreshSession } }),
}));

import { getAttorneyGuestAuthContext } from "@/lib/records/attorneyServer";

function request(cookies: string) {
  return new NextRequest("https://custodyfolio.com/api/records/attorney/portal", {
    headers: { Cookie: `records-scope=attorney_guest; ${cookies}` },
  });
}

describe("attorney guest assurance boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminGetUser.mockResolvedValue({
      data: {
        user: {
          id: "attorney-1",
          email: "counsel@example.test",
          email_confirmed_at: "2026-08-01T00:00:00.000Z",
        },
      },
      error: null,
    });
  });

  it("rejects an AAL1 access token even if the guest scope cookie is present", async () => {
    getAccessTokenAal.mockReturnValue("aal1");

    const context = await getAttorneyGuestAuthContext(
      request("records-access=aal1-access; records-refresh=refresh-token")
    );

    expect("error" in context).toBe(true);
    if ("error" in context) {
      expect(context.error.status).toBe(403);
      await expect(context.error.json()).resolves.toMatchObject({ mfaRequired: true });
    }
  });

  it("rejects a refreshed guest session when the new access token is below AAL2", async () => {
    adminGetUser.mockResolvedValue({ data: { user: null }, error: new Error("expired") });
    getAccessTokenAal.mockReturnValue("aal1");
    refreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: "refreshed-aal1",
          refresh_token: "next-refresh",
          expires_in: 3600,
          user: {
            id: "attorney-1",
            email: "counsel@example.test",
            email_confirmed_at: "2026-08-01T00:00:00.000Z",
          },
        },
        user: null,
      },
      error: null,
    });

    const context = await getAttorneyGuestAuthContext(
      request("records-access=expired-access; records-refresh=refresh-token")
    );

    expect("error" in context).toBe(true);
    if ("error" in context) expect(context.error.status).toBe(403);
  });

  it("preserves a confirmed AAL2 guest context", async () => {
    getAccessTokenAal.mockReturnValue("aal2");

    const context = await getAttorneyGuestAuthContext(
      request("records-access=aal2-access; records-refresh=refresh-token")
    );

    expect("error" in context).toBe(false);
    if (!("error" in context)) {
      expect(context.userId).toBe("attorney-1");
      expect(context.assuranceLevel).toBe("aal2");
    }
  });
});
