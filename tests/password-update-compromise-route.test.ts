import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimitStore } from "@/lib/security/rateLimit";
import { POST } from "@/app/api/records/auth/password/update/route";

const getUser = vi.hoisted(() => vi.fn());
const getClaims = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());
const updateUser = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());
const updateUserById = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const checkPwnedPassword = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn());
const hasRecordsPasswordRecoveryCookie = vi.hoisted(() => vi.fn());
const getAttorneyPasswordSetupInvitationId = vi.hoisted(() => vi.fn());
const clearAttorneyPasswordSetupCookie = vi.hoisted(() => vi.fn());
const onboardingToken = "a".repeat(43);

vi.mock("@/lib/supabaseAdmin", () => ({
  createSupabaseAdminClient: () => ({ auth: { admin: { signOut, updateUserById } }, rpc }),
}));

vi.mock("@/lib/records/authServer", () => ({
  clearRecordsSessionCookies: vi.fn(),
  getRecordsSessionAuthClient: async () => ({ auth: { getClaims, getSession, getUser, updateUser } }),
  hasRecordsPasswordRecoveryCookie,
  isStrongRecordsPassword: (password: string) => password.length >= 12,
  isSupabaseRecordsMode: () => true,
  recordsPasswordMinimumLength: () => 12,
}));

vi.mock("@/lib/records/attorneyServer", () => ({
  attorneyAcceptanceCookieName: "l2f-attorney-invite",
  clearAttorneyPasswordSetupCookie,
  getAttorneyPasswordSetupInvitationId,
}));

vi.mock("@/lib/security/pwnedPasswords", () => ({
  checkPwnedPassword,
  isPwnedPasswordCheckEnabled: () => true,
}));

vi.mock("@/lib/security/securityEvents", () => ({ recordSecurityEvent }));

function request(password = "Replacement-Password!42", attorneyToken = "") {
  return new NextRequest("https://custodyfolio.com/api/records/auth/password/update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: [
        "l2f-records-access=test-access-token",
        attorneyToken ? `l2f-attorney-invite=${attorneyToken}` : "",
      ].filter(Boolean).join("; "),
    },
    body: JSON.stringify({ password }),
  });
}

describe("password update compromised-password guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    getUser.mockResolvedValue({
      data: { user: { id: "test-user-id", email: "counsel@example.test" } },
      error: null,
    });
    getClaims.mockResolvedValue({
      data: { claims: { session_id: "recovery-session-id", sub: "test-user-id" } },
      error: null,
    });
    getSession.mockResolvedValue({
      data: { session: { access_token: "current-access-token" } },
      error: null,
    });
    hasRecordsPasswordRecoveryCookie.mockReturnValue(true);
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    updateUserById.mockResolvedValue({ data: { user: {} }, error: null });
    getAttorneyPasswordSetupInvitationId.mockReturnValue(null);
    rpc.mockResolvedValue({ data: true, error: null });
  });

  it("rejects a compromised replacement before updating Supabase Auth", async () => {
    checkPwnedPassword.mockResolvedValue({ status: "compromised", occurrenceCount: 9 });

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("known data breaches"),
    });
    expect(getUser).toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("preserves a verified safe password update", async () => {
    checkPwnedPassword.mockResolvedValue({ status: "safe" });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith({ password: "Replacement-Password!42" });
    expect(signOut).toHaveBeenCalledWith("current-access-token", "global");
  });

  it("rejects an ordinary session without a signed same-session recovery binding", async () => {
    hasRecordsPasswordRecoveryCookie.mockReturnValue(false);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(checkPwnedPassword).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("surfaces global revocation failure after changing the password", async () => {
    checkPwnedPassword.mockResolvedValue({ status: "safe" });
    signOut.mockResolvedValue({ error: new Error("revocation unavailable") });

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("other sessions could not be confirmed signed out"),
    });
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "auth_password_session_revocation_failed", severity: "high" })
    );
  });

  it("approves invited-attorney login only after password change and confirmed session revocation", async () => {
    checkPwnedPassword.mockResolvedValue({ status: "safe" });
    getAttorneyPasswordSetupInvitationId.mockReturnValue("invite-1");
    process.env.ATTORNEY_PORTAL_SECRET =
      "attorney-password-update-secret-that-is-long-enough-for-tests";

    const response = await POST(request(
      "Replacement-Password!42",
      onboardingToken
    ));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("complete_records_attorney_password_setup", {
      p_invitation_id: "invite-1",
      p_onboarding_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_attorney_user_id: "test-user-id",
      p_invited_email_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_email: "counsel@example.test",
      p_credential_version: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(clearAttorneyPasswordSetupCookie).toHaveBeenCalledWith(response);
    expect(signOut).toHaveBeenCalledWith("current-access-token", "global");
    expect(updateUser.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0]);
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(updateUserById.mock.invocationCallOrder[0]);
    expect(updateUserById.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0]);
  });

  it("does not approve an invited identity when prior-session revocation fails", async () => {
    checkPwnedPassword.mockResolvedValue({ status: "safe" });
    getAttorneyPasswordSetupInvitationId.mockReturnValue("invite-1");
    signOut.mockResolvedValue({ error: new Error("revocation unavailable") });

    const response = await POST(request("Replacement-Password!42", onboardingToken));

    expect(response.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
    expect(clearAttorneyPasswordSetupCookie).toHaveBeenCalledWith(response);
  });

  it("does not approve an invited identity when credential rotation fails", async () => {
    checkPwnedPassword.mockResolvedValue({ status: "safe" });
    getAttorneyPasswordSetupInvitationId.mockReturnValue("invite-1");
    updateUserById.mockResolvedValue({ data: { user: null }, error: new Error("metadata unavailable") });

    const response = await POST(request("Replacement-Password!42", onboardingToken));

    expect(response.status).toBe(503);
    expect(signOut).toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires a fresh mailbox session if post-revocation attorney finalization fails", async () => {
    checkPwnedPassword.mockResolvedValue({ status: "safe" });
    getAttorneyPasswordSetupInvitationId.mockReturnValue("invite-1");
    rpc.mockResolvedValue({ data: false, error: null });
    process.env.ATTORNEY_PORTAL_SECRET =
      "attorney-password-update-secret-that-is-long-enough-for-tests";

    const response = await POST(request(
      "Replacement-Password!42",
      onboardingToken
    ));

    expect(response.status).toBe(503);
    expect(signOut).toHaveBeenCalledWith("current-access-token", "global");
    expect(clearAttorneyPasswordSetupCookie).toHaveBeenCalledWith(response);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("fresh secure email link"),
    });
  });
});
