import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { recordsCsrfCookieName } from "@/lib/security/csrf";
import { resetRateLimitStore } from "@/lib/security/rateLimit";

const getClaims = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());
const findPendingAttorneyInvitationForEmail = vi.hoisted(() => vi.fn());
const checkAttorneyGuestEntitlement = vi.hoisted(() => vi.fn());
const setRecordsSessionCookies = vi.hoisted(() => vi.fn());
const clearAttorneyAcceptanceCookie = vi.hoisted(() => vi.fn((response) => response));
const clearAttorneyMailboxProofCookie = vi.hoisted(() => vi.fn((response) => response));
const clearAttorneyPasswordSetupCookie = vi.hoisted(() => vi.fn((response) => response));
const rpc = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseAuthClient: () => ({ auth: { getClaims } }),
  createServerSupabaseSessionClient: vi.fn(async () => ({ auth: { getUser } })),
}));
vi.mock("@/lib/records/authServer", () => ({
  isSupabaseRecordsMode: () => true,
  setRecordsSessionCookies,
}));
vi.mock("@/lib/records/attorneyServer", () => ({
  clearAttorneyAcceptanceCookie,
  clearAttorneyMailboxProofCookie,
  clearAttorneyPasswordSetupCookie,
  findPendingAttorneyInvitationForEmail,
}));
vi.mock("@/lib/records/attorneyEntitlement", () => ({ checkAttorneyGuestEntitlement }));
vi.mock("@/lib/supabaseAdmin", () => ({ createSupabaseAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/security/securityEvents", () => ({ recordSecurityEvent }));

import { POST } from "@/app/api/records/attorney/accept/session/route";

function request(overrides: { token?: string; accessToken?: string; refreshToken?: string } = {}) {
  const csrf = "invite-session-csrf";
  return new NextRequest("https://custodyfolio.com/api/records/attorney/accept/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://custodyfolio.com",
      Cookie: `${recordsCsrfCookieName}=${csrf}`,
      "X-L2F-CSRF": csrf,
    },
    body: JSON.stringify({
      accessToken: overrides.accessToken ?? "mailbox-access-token-long-enough",
      refreshToken: overrides.refreshToken ?? "mailbox-refresh-token-long-enough",
      onboardingToken: overrides.token ?? "original-invitation-token-long-enough",
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
    rpc.mockResolvedValue({
      data: [{
        grant_id: "grant-1",
        owner_user_id: "owner-1",
        case_key: "default",
        case_id: "case-1",
        access_expires_at: null,
      }],
      error: null,
    });
  });

  it("opens the scoped read only case immediately after fresh mailbox proof", async () => {
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
    expect(rpc).toHaveBeenCalledWith("accept_records_attorney_invitation", {
      p_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_attorney_user_id: "attorney-1",
      p_invited_email_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(setRecordsSessionCookies).toHaveBeenCalled();
    expect(clearAttorneyAcceptanceCookie).toHaveBeenCalledWith(response);
    expect(clearAttorneyMailboxProofCookie).toHaveBeenCalledWith(response);
    expect(clearAttorneyPasswordSetupCookie).toHaveBeenCalledWith(response);
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
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects valid mailbox proof when the invitation token or email does not match", async () => {
    findPendingAttorneyInvitationForEmail.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(setRecordsSessionCookies).not.toHaveBeenCalled();
  });

  it("fails closed when the atomic invitation acceptance does not return a grant", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(setRecordsSessionCookies).not.toHaveBeenCalled();
  });

  it("never grants a user access to their own invitation", async () => {
    rpc.mockResolvedValue({
      data: [{
        grant_id: "grant-1",
        owner_user_id: "attorney-1",
        access_expires_at: null,
      }],
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(setRecordsSessionCookies).not.toHaveBeenCalled();
  });
});
