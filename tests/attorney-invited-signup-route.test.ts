import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { resetRateLimitStore } from "@/lib/security/rateLimit";
import { recordsCsrfCookieName } from "@/lib/security/csrf";

const createUser = vi.hoisted(() => vi.fn());
const listUsers = vi.hoisted(() => vi.fn());
const updateUserById = vi.hoisted(() => vi.fn());
const findPendingAttorneyInvitationForEmail = vi.hoisted(() => vi.fn());
const checkAttorneyGuestEntitlement = vi.hoisted(() => vi.fn());
const checkPwnedPassword = vi.hoisted(() => vi.fn());
const isPwnedPasswordCheckEnabled = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseAdmin", () => ({
  createSupabaseAdminClient: () => ({
    auth: { admin: { createUser, listUsers, updateUserById } },
  }),
}));
vi.mock("@/lib/records/authServer", () => ({
  isSupabaseRecordsMode: () => true,
  isStrongRecordsPassword: (password: string) => password.length >= 12 && password.length <= 128,
  recordsPasswordMinimumLength: () => 12,
}));
vi.mock("@/lib/records/attorneyServer", () => ({
  attorneyAcceptanceCookieName: "l2f-attorney-invite",
  findPendingAttorneyInvitationForEmail,
}));
vi.mock("@/lib/records/attorneyEntitlement", () => ({ checkAttorneyGuestEntitlement }));
vi.mock("@/lib/security/pwnedPasswords", () => ({
  checkPwnedPassword,
  isPwnedPasswordCheckEnabled,
}));
vi.mock("@/lib/security/securityEvents", () => ({ recordSecurityEvent }));

import { POST } from "@/app/api/records/attorney/accept/signup/route";

function request(input: {
  email?: string;
  password?: string;
  token?: string;
  adultConfirmed?: boolean;
} = {}) {
  const csrf = "attorney-signup-csrf";
  const token = input.token || "single-private-invitation-token";
  return new NextRequest("https://custodyfolio.com/api/records/attorney/accept/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://custodyfolio.com",
      Cookie: `l2f-attorney-invite=${token}; ${recordsCsrfCookieName}=${csrf}`,
      "X-L2F-CSRF": csrf,
    },
    body: JSON.stringify({
      adultConfirmed: input.adultConfirmed ?? true,
      email: input.email || "counsel@example.test",
      password: input.password || "strong-attorney-password",
    }),
  });
}

describe("single-link invited attorney account creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    checkAttorneyGuestEntitlement.mockReturnValue({ allowed: true });
    findPendingAttorneyInvitationForEmail.mockResolvedValue({ id: "invite-1" });
    isPwnedPasswordCheckEnabled.mockReturnValue(false);
    checkPwnedPassword.mockResolvedValue({ status: "safe" });
    createUser.mockResolvedValue({
      data: { user: { id: "attorney-1", email: "counsel@example.test" } },
      error: null,
    });
    listUsers.mockResolvedValue({ data: { users: [] }, error: null });
    updateUserById.mockResolvedValue({ data: { user: null }, error: null });
  });

  it("creates a confirmed account directly from the one private link without sending email", async () => {
    const response = await POST(request({ email: " Counsel@Example.test " }));

    expect(response.status).toBe(201);
    expect(findPendingAttorneyInvitationForEmail).toHaveBeenCalledWith({
      token: "single-private-invitation-token",
      email: "counsel@example.test",
    });
    expect(createUser).toHaveBeenCalledWith({
      email: "counsel@example.test",
      password: "strong-attorney-password",
      email_confirm: true,
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      message: expect.stringContaining("Continue with authenticator verification"),
    });
  });

  it("directs an existing identity to sign in instead of sending a magic link", async () => {
    createUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("User already registered", 422, "email_exists"),
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "An account already uses that email. Choose Sign in to existing account instead.",
    });
  });

  it("recovers only an unclaimed legacy invite created by the broken email flow", async () => {
    createUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("User already registered", 422, "email_exists"),
    });
    listUsers.mockResolvedValue({
      data: {
        users: [{
          id: "legacy-attorney-1",
          email: "counsel@example.test",
          invited_at: "2026-08-04T00:00:00.000Z",
          last_sign_in_at: null,
          email_confirmed_at: null,
          confirmed_at: null,
        }],
      },
      error: null,
    });
    updateUserById.mockResolvedValue({
      data: { user: { id: "legacy-attorney-1", email: "counsel@example.test" } },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(updateUserById).toHaveBeenCalledWith("legacy-attorney-1", {
      password: "strong-attorney-password",
      email_confirm: true,
    });
  });

  it("never resets an existing confirmed or previously used account", async () => {
    createUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("User already registered", 422, "email_exists"),
    });
    listUsers.mockResolvedValue({
      data: {
        users: [{
          id: "existing-attorney-1",
          email: "counsel@example.test",
          invited_at: "2026-08-03T00:00:00.000Z",
          last_sign_in_at: "2026-08-04T00:00:00.000Z",
          email_confirmed_at: "2026-08-03T00:00:00.000Z",
          confirmed_at: "2026-08-03T00:00:00.000Z",
        }],
      },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("rejects a missing, expired, revoked, or email-mismatched invitation", async () => {
    findPendingAttorneyInvitationForEmail.mockResolvedValue(null);

    const response = await POST(request({ email: "wrong@example.test" }));

    expect(response.status).toBe(404);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("requires adult confirmation and a strong password before creating an account", async () => {
    const adultResponse = await POST(request({ adultConfirmed: false }));
    const passwordResponse = await POST(request({ password: "too-short" }));

    expect(adultResponse.status).toBe(400);
    expect(passwordResponse.status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("keeps onboarding disabled when Attorney Access is disabled", async () => {
    checkAttorneyGuestEntitlement.mockReturnValue({
      allowed: false,
      reason: "Attorney guest access is not enabled for this account.",
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(findPendingAttorneyInvitationForEmail).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("fails closed when the breached-password check rejects the password", async () => {
    isPwnedPasswordCheckEnabled.mockReturnValue(true);
    checkPwnedPassword.mockResolvedValue({ status: "compromised", occurrenceCount: 20 });

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });
});
