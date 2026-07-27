import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimitStore } from "@/lib/security/rateLimit";

const getUser = vi.hoisted(() => vi.fn());
const getClaims = vi.hoisted(() => vi.fn());
const recordsProfileExists = vi.hoisted(() => vi.fn());
const upsertRecordsProfile = vi.hoisted(() => vi.fn());
const setRecordsSessionCookies = vi.hoisted(() => vi.fn());
const setRecordsPasswordRecoveryCookie = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseAuthClient: () => ({ auth: { getClaims } }),
  createServerSupabaseSessionClient: async () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/records/authServer", () => ({
  isRecordsSignupEnabled: () => false,
  isSupabaseRecordsMode: () => true,
  setRecordsPasswordRecoveryCookie,
  setRecordsSessionCookies,
}));

vi.mock("@/lib/records/profileServer", () => ({
  recordsProfileIsAuthorized: recordsProfileExists,
  upsertRecordsProfile,
}));

vi.mock("@/lib/security/securityEvents", () => ({ recordSecurityEvent }));

import { POST } from "@/app/api/records/auth/recovery/session/route";

function request() {
  return new NextRequest("https://custodyfolio.com/api/records/auth/recovery/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accessToken: "access-token-long-enough-for-validation",
      refreshToken: "refresh-token-long-enough-for-validation",
      expiresIn: 3600,
    }),
  });
}

describe("records recovery session admission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    getUser.mockResolvedValue({
      data: { user: { id: "provider-user", email: "user@example.test" } },
      error: null,
    });
    getClaims.mockResolvedValue({
      data: {
        claims: {
          amr: [{ method: "recovery" }],
          session_id: "recovery-session-id",
          sub: "provider-user",
        },
      },
      error: null,
    });
  });

  it("does not create an app profile for a provider-only identity while signup is disabled", async () => {
    recordsProfileExists.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(upsertRecordsProfile).not.toHaveBeenCalled();
    expect(setRecordsSessionCookies).not.toHaveBeenCalled();
    expect(setRecordsPasswordRecoveryCookie).not.toHaveBeenCalled();
  });

  it("preserves recovery for an existing app profile after signup is disabled", async () => {
    recordsProfileExists.mockResolvedValue(true);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(upsertRecordsProfile).toHaveBeenCalledWith({
      userId: "provider-user",
      email: "user@example.test",
    });
    expect(setRecordsSessionCookies).toHaveBeenCalled();
    expect(setRecordsPasswordRecoveryCookie).toHaveBeenCalledWith(
      response,
      { userId: "provider-user", sessionId: "recovery-session-id" }
    );
  });

  it("rejects an ordinary valid session that is not recovery-authenticated", async () => {
    recordsProfileExists.mockResolvedValue(true);
    getClaims.mockResolvedValue({
      data: {
        claims: {
          amr: [{ method: "password" }],
          session_id: "ordinary-session-id",
          sub: "provider-user",
        },
      },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(setRecordsSessionCookies).not.toHaveBeenCalled();
    expect(setRecordsPasswordRecoveryCookie).not.toHaveBeenCalled();
  });
});
