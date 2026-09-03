import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimitStore } from "@/lib/security/rateLimit";
import { recordsCsrfCookieName } from "@/lib/security/csrf";

const signInWithOtp = vi.hoisted(() => vi.fn());
const getClaims = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());
const getAuthenticatorAssuranceLevel = vi.hoisted(() => vi.fn());
const listFactors = vi.hoisted(() => vi.fn());
const enroll = vi.hoisted(() => vi.fn());
const unenroll = vi.hoisted(() => vi.fn());
const recordsAttorneyEmailHasActiveGrant = vi.hoisted(() => vi.fn());
const recordsAttorneyProfileIsAuthorized = vi.hoisted(() => vi.fn());
const setRecordsSessionCookies = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseAuthClient: () => ({ auth: { getClaims, signInWithOtp } }),
  createServerSupabaseSessionClient: async () => ({
    auth: {
      getUser,
      mfa: { getAuthenticatorAssuranceLevel, listFactors, enroll, unenroll },
    },
  }),
}));

vi.mock("@/lib/records/attorneyProfileServer", () => ({
  recordsAttorneyEmailHasActiveGrant,
  recordsAttorneyProfileIsAuthorized,
}));

vi.mock("@/lib/records/authServer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/records/authServer")>();
  return {
    ...actual,
    isSupabaseRecordsMode: () => true,
    recordsAppBaseUrl: () => "https://custodyfolio.com",
    setRecordsSessionCookies,
  };
});

vi.mock("@/lib/security/securityEvents", () => ({ recordSecurityEvent }));

import { POST as requestLink } from "@/app/api/records/attorney/auth/link/route";
import { POST as acceptReturnSession } from "@/app/api/records/attorney/auth/session/route";

function linkRequest(email = "counsel@example.test") {
  return new NextRequest("https://custodyfolio.com/api/records/attorney/auth/link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://custodyfolio.com",
      "Sec-Fetch-Site": "same-origin",
    },
    body: JSON.stringify({ email, adultConfirmed: true }),
  });
}

function sessionRequest() {
  const csrf = "return-auth-csrf";
  return new NextRequest("https://custodyfolio.com/api/records/attorney/auth/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://custodyfolio.com",
      Cookie: `${recordsCsrfCookieName}=${csrf}`,
      "X-L2F-CSRF": csrf,
    },
    body: JSON.stringify({
      accessToken: "return-access-token-long-enough",
      refreshToken: "return-refresh-token-long-enough",
      expiresIn: 3600,
    }),
  });
}

describe("returning attorney authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    recordsAttorneyEmailHasActiveGrant.mockResolvedValue(true);
    recordsAttorneyProfileIsAuthorized.mockResolvedValue(true);
    signInWithOtp.mockResolvedValue({ error: null });
    getClaims.mockResolvedValue({
      data: {
        claims: {
          amr: [{ method: "magiclink", timestamp: Math.floor(Date.now() / 1000) }],
          session_id: "session-id",
          sub: "attorney-1",
        },
      },
      error: null,
    });
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "attorney-1",
          email: "counsel@example.test",
          email_confirmed_at: "2026-08-04T00:00:00.000Z",
        },
      },
      error: null,
    });
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    listFactors.mockResolvedValue({
      data: { totp: [{ id: "factor-1", status: "verified" }] },
      error: null,
    });
  });

  it("sends a non-creating magic link only for an active attorney account", async () => {
    const response = await requestLink(linkRequest(" Counsel@Example.test "));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toContain("If that email has an active attorney matter");
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "counsel@example.test",
      options: {
        emailRedirectTo: "https://custodyfolio.com/attorney/sign-in?auth=attorney-return",
        shouldCreateUser: false,
      },
    });
  });

  it("does not disclose whether an attorney email or active grant exists", async () => {
    recordsAttorneyEmailHasActiveGrant.mockResolvedValue(false);
    const inactive = await requestLink(linkRequest("unknown@example.test"));
    const inactiveBody = await inactive.json();
    recordsAttorneyEmailHasActiveGrant.mockResolvedValue(true);
    signInWithOtp.mockResolvedValue({ error: new Error("mail provider unavailable") });
    const providerFailure = await requestLink(linkRequest("counsel@example.test"));
    const providerBody = await providerFailure.json();

    expect(inactive.status).toBe(200);
    expect(providerFailure.status).toBe(200);
    expect(providerBody).toEqual(inactiveBody);
  });

  it("creates the guest session from fresh mailbox proof without an authenticator step", async () => {
    const response = await acceptReturnSession(sessionRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(recordsAttorneyProfileIsAuthorized).toHaveBeenCalledWith({
      userId: "attorney-1",
      email: "counsel@example.test",
      accessToken: "return-access-token-long-enough",
    });
    expect(setRecordsSessionCookies).toHaveBeenCalledWith(
      response,
      expect.objectContaining({
        access_token: "return-access-token-long-enough",
        refresh_token: "return-refresh-token-long-enough",
      }),
      expect.any(String),
      "attorney_guest"
    );
  });

  it("creates the attorney guest session when the mailbox session is already AAL2", async () => {
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });

    const response = await acceptReturnSession(sessionRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(setRecordsSessionCookies).toHaveBeenCalledWith(
      response,
      expect.objectContaining({ access_token: "return-access-token-long-enough" }),
      expect.any(String),
      "attorney_guest"
    );
  });

  it("rejects a password-only token replay at the mailbox-proof endpoint", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }],
          session_id: "session-id",
          sub: "attorney-1",
        },
      },
      error: null,
    });

    const response = await acceptReturnSession(sessionRequest());

    expect(response.status).toBe(401);
    expect(recordsAttorneyProfileIsAuthorized).not.toHaveBeenCalled();
    expect(setRecordsSessionCookies).not.toHaveBeenCalled();
  });
});
