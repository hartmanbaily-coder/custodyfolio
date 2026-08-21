import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { recordsCsrfCookieName } from "@/lib/security/csrf";
import { resetRateLimitStore } from "@/lib/security/rateLimit";

const getClaims = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());
const getAuthenticatorAssuranceLevel = vi.hoisted(() => vi.fn());
const listFactors = vi.hoisted(() => vi.fn());
const enroll = vi.hoisted(() => vi.fn());
const unenroll = vi.hoisted(() => vi.fn());
const findPendingAttorneyInvitationForEmail = vi.hoisted(() => vi.fn());
const acceptPendingAttorneyInvitationForUser = vi.hoisted(() => vi.fn());
const checkAttorneyGuestEntitlement = vi.hoisted(() => vi.fn());
const setRecordsSessionCookies = vi.hoisted(() => vi.fn());
const getAccessTokenAal = vi.hoisted(() => vi.fn());
const clearAttorneyAcceptanceCookie = vi.hoisted(() => vi.fn((response) => response));
const clearAttorneyMailboxProofCookie = vi.hoisted(() => vi.fn((response) => response));
const clearAttorneyPasswordSetupCookie = vi.hoisted(() => vi.fn((response) => response));
const recordSecurityEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseAuthClient: () => ({ auth: { getClaims } }),
  createServerSupabaseSessionClient: vi.fn(async () => ({
    auth: {
      getUser,
      mfa: { getAuthenticatorAssuranceLevel, listFactors, enroll, unenroll },
    },
  })),
}));
vi.mock("@/lib/records/authServer", () => ({
  getAccessTokenAal,
  isSupabaseRecordsMode: () => true,
  setRecordsSessionCookies,
}));
vi.mock("@/lib/records/attorneyServer", () => ({
  acceptPendingAttorneyInvitationForUser,
  attorneyAcceptanceCookieName: "l2f-attorney-invite",
  clearAttorneyAcceptanceCookie,
  clearAttorneyMailboxProofCookie,
  clearAttorneyPasswordSetupCookie,
  findPendingAttorneyInvitationForEmail,
}));
vi.mock("@/lib/records/attorneyEntitlement", () => ({ checkAttorneyGuestEntitlement }));
vi.mock("@/lib/security/securityEvents", () => ({ recordSecurityEvent }));

import { POST } from "@/app/api/records/attorney/accept/session/route";

function request(overrides: { token?: string; accessToken?: string; refreshToken?: string } = {}) {
  const csrf = "invite-session-csrf";
  return new NextRequest("https://custodyfolio.com/api/records/attorney/accept/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://custodyfolio.com",
      Cookie: `${recordsCsrfCookieName}=${csrf}; l2f-attorney-invite=${overrides.token ?? "original-invitation-token-long-enough"}`,
      "X-L2F-CSRF": csrf,
    },
    body: JSON.stringify({
      accessToken: overrides.accessToken ?? "mailbox-access-token-long-enough",
      refreshToken: overrides.refreshToken ?? "refresh-1234",
      expiresIn: 3600,
    }),
  });
}

describe("mailbox-verified attorney session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    process.env.ATTORNEY_PORTAL_SECRET =
      "attorney-invite-session-secret-that-is-long-enough-for-tests";
    checkAttorneyGuestEntitlement.mockReturnValue({ allowed: true });
    getClaims.mockResolvedValue({
      data: {
        claims: {
          amr: [{ method: "invite", timestamp: Math.floor(Date.now() / 1000) }],
          session_id: "mailbox-session-id",
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
          email_confirmed_at: "2026-07-21T00:00:00.000Z",
        },
      },
      error: null,
    });
    findPendingAttorneyInvitationForEmail.mockResolvedValue({
      id: "invite-1",
      owner_user_id: "owner-1",
      case_id: "case-1",
    });
    acceptPendingAttorneyInvitationForUser.mockResolvedValue({
      grant_id: "grant-1",
      owner_user_id: "owner-1",
      case_key: "default",
      case_id: "case-1",
      access_expires_at: null,
    });
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });
    listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    getAccessTokenAal.mockReturnValue("aal2");
  });

  it("opens the scoped read only case after mailbox proof and AAL2", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      accepted: true,
      accessHandle: expect.any(String),
      accessExpiresAt: null,
    });
    expect(findPendingAttorneyInvitationForEmail).toHaveBeenCalledWith({
      token: "original-invitation-token-long-enough",
      email: "counsel@example.test",
    });
    expect(acceptPendingAttorneyInvitationForUser).toHaveBeenCalledWith({
      token: "original-invitation-token-long-enough",
      userId: "attorney-1",
      email: "counsel@example.test",
    });
    expect(setRecordsSessionCookies).toHaveBeenCalled();
    expect(clearAttorneyAcceptanceCookie).toHaveBeenCalledWith(response);
    expect(clearAttorneyMailboxProofCookie).toHaveBeenCalledWith(response);
    expect(clearAttorneyPasswordSetupCookie).toHaveBeenCalledWith(response);
  });

  it("accepts a single RPC row returned as an object", async () => {
    acceptPendingAttorneyInvitationForUser.mockResolvedValue({
      grant_id: "grant-1",
      owner_user_id: "owner-1",
      case_key: "default",
      case_id: "case-1",
      access_expires_at: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      accepted: true,
      accessHandle: expect.any(String),
      accessExpiresAt: null,
    });
    expect(setRecordsSessionCookies).toHaveBeenCalled();
  });

  it("keeps an AAL1 mailbox session pending until authenticator verification", async () => {
    getAccessTokenAal.mockReturnValue("aal1");
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    listFactors.mockResolvedValue({
      data: { totp: [{ id: "factor-1", status: "verified" }] },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ mfaRequired: true });
    expect(setRecordsSessionCookies).toHaveBeenCalledWith(
      response,
      expect.objectContaining({ access_token: "mailbox-access-token-long-enough" }),
      expect.any(String),
      "attorney_mfa_pending"
    );
  });

  it("rejects a password session that lacks fresh mailbox proof", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }],
          session_id: "password-session-id",
          sub: "attorney-1",
        },
      },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(findPendingAttorneyInvitationForEmail).not.toHaveBeenCalled();
    expect(acceptPendingAttorneyInvitationForUser).not.toHaveBeenCalled();
  });

  it("rejects valid mailbox proof when the invitation token or email does not match", async () => {
    findPendingAttorneyInvitationForEmail.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(acceptPendingAttorneyInvitationForUser).not.toHaveBeenCalled();
    expect(setRecordsSessionCookies).not.toHaveBeenCalled();
  });

  it("fails closed when the atomic invitation acceptance does not return a grant", async () => {
    acceptPendingAttorneyInvitationForUser.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(setRecordsSessionCookies).not.toHaveBeenCalled();
  });

  it("never grants a user access to their own invitation", async () => {
    acceptPendingAttorneyInvitationForUser.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(setRecordsSessionCookies).not.toHaveBeenCalled();
  });
});
