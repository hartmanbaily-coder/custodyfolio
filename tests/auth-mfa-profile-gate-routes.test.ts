import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimitStore } from "@/lib/security/rateLimit";

const recordsProfileExists = vi.hoisted(() => vi.fn());
const recordsAttorneyProfileIsAuthorized = vi.hoisted(() => vi.fn());
const upsertRecordsProfile = vi.hoisted(() => vi.fn());
const setRecordsSessionCookies = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn());
const challenge = vi.hoisted(() => vi.fn());
const verify = vi.hoisted(() => vi.fn());
const listFactors = vi.hoisted(() => vi.fn());
const challengeAndVerify = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());

const authClient = {
  auth: {
    mfa: { challenge, challengeAndVerify, listFactors, verify },
    signOut,
  },
};

vi.mock("@/lib/records/authServer", () => ({
  getRecordsSessionAuthClient: async () => authClient,
  isRecordsSignupEnabled: () => false,
  isSupabaseRecordsMode: () => true,
  recordsAccessCookieName: "l2f-records-access",
  recordsSessionScopeCookieName: "l2f-records-scope",
  setRecordsSessionCookies,
}));

vi.mock("@/lib/records/profileServer", () => ({
  recordsProfileIsAuthorized: recordsProfileExists,
  upsertRecordsProfile,
}));

vi.mock("@/lib/records/attorneyProfileServer", () => ({
  recordsAttorneyProfileIsAuthorized,
}));

vi.mock("@/lib/security/securityEvents", () => ({ recordSecurityEvent }));

import { POST as verifyEnrollment } from "@/app/api/records/auth/mfa/enroll/verify/route";
import { POST as verifyExistingFactor } from "@/app/api/records/auth/mfa/verify/route";

const verifiedTokens = {
  access_token: "verified-access-token",
  refresh_token: "verified-refresh-token",
  expires_in: 3600,
  user: { id: "provider-user", email: "user@example.test" },
};

function request(path: string, body: unknown, cookie = "") {
  return new NextRequest(`https://custodyfolio.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

describe("MFA records-profile approval gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    recordsProfileExists.mockResolvedValue(false);
    recordsAttorneyProfileIsAuthorized.mockResolvedValue(false);
    signOut.mockResolvedValue({ error: null });
    challenge.mockResolvedValue({ data: { id: "challenge-id" }, error: null });
    verify.mockResolvedValue({ data: verifiedTokens, error: null });
    listFactors.mockResolvedValue({
      data: { totp: [{ id: "factor-id", status: "verified" }] },
      error: null,
    });
    challengeAndVerify.mockResolvedValue({ data: verifiedTokens, error: null });
  });

  it("does not recreate a removed profile through enrollment verification", async () => {
    const response = await verifyEnrollment(
      request("/api/records/auth/mfa/enroll/verify", {
        factorId: "factor-id",
        code: "123456",
      })
    );

    expect(response.status).toBe(403);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(upsertRecordsProfile).not.toHaveBeenCalled();
    expect(setRecordsSessionCookies).not.toHaveBeenCalled();
  });

  it("does not recreate a removed profile through existing-factor verification", async () => {
    const response = await verifyExistingFactor(
      request("/api/records/auth/mfa/verify", { code: "123456" })
    );

    expect(response.status).toBe(403);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(upsertRecordsProfile).not.toHaveBeenCalled();
    expect(setRecordsSessionCookies).not.toHaveBeenCalled();
  });

  it("keeps existing approved profiles functional", async () => {
    recordsProfileExists.mockResolvedValue(true);

    const response = await verifyExistingFactor(
      request("/api/records/auth/mfa/verify", { code: "123456" })
    );

    expect(response.status).toBe(200);
    expect(upsertRecordsProfile).toHaveBeenCalledWith({
      userId: "provider-user",
      email: "user@example.test",
    });
    expect(setRecordsSessionCookies).toHaveBeenCalled();
  });

  it("preserves attorney-only scope after authenticator verification", async () => {
    recordsAttorneyProfileIsAuthorized.mockResolvedValue(true);

    const response = await verifyExistingFactor(
      request(
        "/api/records/auth/mfa/verify",
        { code: "123456" },
        "l2f-records-scope=attorney_mfa_pending; l2f-records-access=originating-token"
      )
    );

    expect(response.status).toBe(200);
    expect(recordsAttorneyProfileIsAuthorized).toHaveBeenCalledWith({
      userId: "provider-user",
      email: "user@example.test",
      accessToken: "originating-token",
    });
    expect(upsertRecordsProfile).not.toHaveBeenCalled();
    expect(setRecordsSessionCookies).toHaveBeenCalledWith(
      expect.anything(),
      verifiedTokens,
      expect.any(String),
      "attorney_guest"
    );
  });
});
