import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { recordsCsrfCookieName } from "@/lib/security/csrf";
import { resetRateLimitStore } from "@/lib/security/rateLimit";

const getClaims = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());
const listFactors = vi.hoisted(() => vi.fn());
const unenroll = vi.hoisted(() => vi.fn());
const enroll = vi.hoisted(() => vi.fn());
const findPendingAttorneyOnboardingForEmail = vi.hoisted(() => vi.fn());
const checkAttorneyGuestEntitlement = vi.hoisted(() => vi.fn());
const recordsProfileExists = vi.hoisted(() => vi.fn());
const setRecordsSessionCookies = vi.hoisted(() => vi.fn());
const setRecordsPasswordRecoveryCookie = vi.hoisted(() => vi.fn());
const setAttorneyAcceptanceCookie = vi.hoisted(() => vi.fn((response) => response));
const setAttorneyMailboxProofCookie = vi.hoisted(() => vi.fn((response) => response));
const setAttorneyPasswordSetupCookie = vi.hoisted(() => vi.fn((response) => response));
const rpc = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseAuthClient: () => ({ auth: { getClaims } }),
  createServerSupabaseSessionClient: vi.fn(async () => ({
    auth: { getUser, mfa: { enroll, listFactors, unenroll } },
  })),
}));
vi.mock("@/lib/records/authServer", () => ({
  isSupabaseRecordsMode: () => true,
  setRecordsPasswordRecoveryCookie,
  setRecordsSessionCookies,
}));
vi.mock("@/lib/records/attorneyServer", () => ({
  findPendingAttorneyOnboardingForEmail,
  setAttorneyAcceptanceCookie,
  setAttorneyMailboxProofCookie,
  setAttorneyPasswordSetupCookie,
}));
vi.mock("@/lib/records/attorneyEntitlement", () => ({ checkAttorneyGuestEntitlement }));
vi.mock("@/lib/records/profileServer", () => ({ recordsProfileExists }));
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
      onboardingToken: overrides.token ?? "onboarding-token-long-enough",
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
    findPendingAttorneyOnboardingForEmail.mockResolvedValue({
      id: "invite-1",
      onboarding_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      onboarding_password_required: false,
    });
    recordsProfileExists.mockResolvedValue(false);
    rpc.mockResolvedValue({ data: true, error: null });
    listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    unenroll.mockResolvedValue({ error: null });
    enroll.mockResolvedValue({
      data: { id: "factor-1", totp: { qr_code: "data:image/svg+xml,qr", secret: "secret" } },
      error: null,
    });
  });

  it("provisions only after mailbox proof and requires a new password for an unapproved identity", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      passwordSetupRequired: true,
      mfaRequired: false,
      mfaEnrollmentRequired: false,
    });
    expect(findPendingAttorneyOnboardingForEmail).toHaveBeenCalledWith({
      token: "onboarding-token-long-enough",
      email: "counsel@example.test",
    });
    expect(rpc).toHaveBeenCalledWith("complete_records_attorney_onboarding", {
      p_invitation_id: "invite-1",
      p_onboarding_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_acceptance_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_attorney_user_id: "attorney-1",
      p_invited_email_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_email: "counsel@example.test",
      p_password_setup_required: true,
    });
    expect(setRecordsPasswordRecoveryCookie).toHaveBeenCalledWith(response, {
      userId: "attorney-1",
      sessionId: "mailbox-session-id",
    });
    expect(setRecordsSessionCookies).toHaveBeenCalled();
    expect(setAttorneyPasswordSetupCookie).toHaveBeenCalledWith(
      response,
      expect.objectContaining({ invitationId: "invite-1", userId: "attorney-1" })
    );
    expect(setAttorneyAcceptanceCookie).toHaveBeenCalledWith(
      response,
      "onboarding-token-long-enough"
    );
    expect(setAttorneyMailboxProofCookie).toHaveBeenCalledWith(
      response,
      expect.objectContaining({
        invitationId: "invite-1",
        userId: "attorney-1",
        token: "onboarding-token-long-enough",
      })
    );
  });

  it("continues an already-approved account without forcing a password change", async () => {
    recordsProfileExists.mockReset();
    recordsProfileExists.mockResolvedValue(true);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      passwordSetupRequired: false,
      mfaRequired: true,
      mfaEnrollmentRequired: true,
      enrollment: {
        factorId: "factor-1",
        qrCode: "data:image/svg+xml,qr",
        secret: "secret",
      },
    });
    expect(rpc).toHaveBeenCalled();
    expect(setRecordsPasswordRecoveryCookie).not.toHaveBeenCalled();
    expect(setAttorneyPasswordSetupCookie).not.toHaveBeenCalled();
    expect(setRecordsSessionCookies).toHaveBeenCalled();
    expect(setAttorneyMailboxProofCookie).toHaveBeenCalled();
    expect(enroll).toHaveBeenCalledWith({ factorType: "totp", issuer: "Custody Folio" });
  });

  it("resumes interrupted password setup even after the records profile exists", async () => {
    recordsProfileExists.mockResolvedValue(true);
    findPendingAttorneyOnboardingForEmail.mockResolvedValue({
      id: "invite-1",
      onboarding_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      onboarding_password_required: true,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      passwordSetupRequired: true,
      mfaEnrollmentRequired: false,
    });
    expect(listFactors).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "complete_records_attorney_onboarding",
      expect.objectContaining({ p_password_setup_required: true })
    );
    expect(setAttorneyPasswordSetupCookie).toHaveBeenCalled();
  });

  it("rejects a password-authenticated token that lacks fresh email proof", async () => {
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
    expect(findPendingAttorneyOnboardingForEmail).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(setRecordsSessionCookies).not.toHaveBeenCalled();
  });

  it("rejects valid email proof when the pending invitation token or email does not match", async () => {
    findPendingAttorneyOnboardingForEmail.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(setRecordsSessionCookies).not.toHaveBeenCalled();
  });

  it("fails closed when the atomic invitation/profile finalization does not persist", async () => {
    rpc.mockResolvedValue({ data: false, error: null });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(rpc).toHaveBeenCalled();
    expect(setRecordsSessionCookies).not.toHaveBeenCalled();
  });
});
