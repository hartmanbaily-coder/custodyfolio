import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimitStore } from "@/lib/security/rateLimit";

const adminSignOut = vi.hoisted(() => vi.fn());
const refreshSession = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseAdmin", () => ({
  createSupabaseAdminClient: () => ({ auth: { admin: { signOut: adminSignOut } } }),
}));

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseAuthClient: () => ({ auth: { refreshSession } }),
}));

vi.mock("@/lib/security/securityEvents", () => ({ recordSecurityEvent }));

import { POST } from "@/app/api/records/auth/logout/route";

function request(cookies = "") {
  return new NextRequest("https://custodyfolio.com/api/records/auth/logout", {
    method: "POST",
    headers: cookies ? { Cookie: cookies } : undefined,
  });
}

describe("records logout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    process.env.RECORDS_STORAGE_MODE = "supabase";
    process.env.NEXT_PUBLIC_RECORDS_STORAGE_MODE = "supabase";
  });

  it("refreshes a refresh-only session and revokes the resulting server session", async () => {
    refreshSession.mockResolvedValue({
      data: { session: { access_token: "refreshed-access" } },
      error: null,
    });
    adminSignOut.mockResolvedValue({ error: null });

    const response = await POST(request("l2f-records-refresh=refresh-token"));

    expect(response.status).toBe(200);
    expect(refreshSession).toHaveBeenCalledWith({ refresh_token: "refresh-token" });
    expect(adminSignOut).toHaveBeenCalledWith("refreshed-access", "local");
  });

  it("falls back to the refresh token when direct access-token revocation fails", async () => {
    adminSignOut
      .mockResolvedValueOnce({ error: new Error("expired access") })
      .mockResolvedValueOnce({ error: null });
    refreshSession.mockResolvedValue({
      data: { session: { access_token: "replacement-access" } },
      error: null,
    });

    const response = await POST(
      request("l2f-records-access=expired-access; l2f-records-refresh=refresh-token")
    );

    expect(response.status).toBe(200);
    expect(adminSignOut).toHaveBeenNthCalledWith(1, "expired-access", "local");
    expect(adminSignOut).toHaveBeenNthCalledWith(2, "replacement-access", "local");
  });

  it("fails visibly while still clearing local cookies when revocation cannot be confirmed", async () => {
    refreshSession.mockResolvedValue({ data: { session: null }, error: new Error("invalid refresh") });

    const response = await POST(request("l2f-records-refresh=invalid-refresh"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      clearLocalSession: true,
      error: expect.stringContaining("could not be confirmed"),
    });
    expect(response.headers.get("set-cookie")).toContain("l2f-records-access=");
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "auth_logout_session_revocation_failed", status: 503 })
    );
  });

  it("keeps logout idempotent when no server session cookies exist", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(adminSignOut).not.toHaveBeenCalled();
    expect(refreshSession).not.toHaveBeenCalled();
  });
});
