import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimitStore } from "@/lib/security/rateLimit";
import { recordsCsrfCookieName } from "@/lib/security/csrf";

const inviteUserByEmail = vi.hoisted(() => vi.fn());
const signInWithOtp = vi.hoisted(() => vi.fn());
const onboardingMaybeSingle = vi.hoisted(() => vi.fn());
const findPendingAttorneyInvitationForEmail = vi.hoisted(() => vi.fn());
const findPendingAttorneyOnboardingForEmail = vi.hoisted(() => vi.fn());
const checkAttorneyGuestEntitlement = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseAdmin", () => ({
  createSupabaseAdminClient: () => {
    const query = {
      update: vi.fn(() => query),
      eq: vi.fn(() => query),
      select: vi.fn(() => query),
      maybeSingle: onboardingMaybeSingle,
      then: (resolve: (value: { data: null; error: null }) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return {
      auth: { admin: { inviteUserByEmail } },
      from: vi.fn(() => query),
    };
  },
}));

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseAuthClient: () => ({ auth: { signInWithOtp } }),
}));

vi.mock("@/lib/records/authServer", () => ({
  isSupabaseRecordsMode: () => true,
  recordsAppBaseUrl: () => "https://custodyfolio.com",
}));

vi.mock("@/lib/records/attorneyServer", () => ({
  attorneyAcceptanceCookieName: "l2f-attorney-invite",
  findPendingAttorneyOnboardingForEmail,
  findPendingAttorneyInvitationForEmail,
}));

vi.mock("@/lib/records/attorneyEntitlement", () => ({ checkAttorneyGuestEntitlement }));
vi.mock("@/lib/security/securityEvents", () => ({ recordSecurityEvent }));

import { POST } from "@/app/api/records/attorney/accept/signup/route";

function request(input: {
  email?: string;
  token?: string;
  csrf?: string;
  adultConfirmed?: boolean;
} = {}) {
  const csrf = input.csrf || "attorney-signup-csrf";
  const token = input.token || "invite-token";
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
    }),
  });
}

describe("mailbox-verified attorney onboarding request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    checkAttorneyGuestEntitlement.mockReturnValue({ allowed: true });
    findPendingAttorneyInvitationForEmail.mockResolvedValue({ id: "invite-1" });
    findPendingAttorneyOnboardingForEmail.mockResolvedValue(null);
    inviteUserByEmail.mockResolvedValue({
      data: { user: { id: "attorney-1" } },
      error: null,
    });
    onboardingMaybeSingle.mockResolvedValue({ data: { id: "invite-1" }, error: null });
    signInWithOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });
  });

  it("emails a server-admin invite only to the exact pending invitation address", async () => {
    const response = await POST(request({ email: " Counsel@Example.test " }));

    expect(response.status).toBe(200);
    expect(findPendingAttorneyInvitationForEmail).toHaveBeenCalledWith({
      token: "invite-token",
      email: "counsel@example.test",
    });
    expect(inviteUserByEmail).toHaveBeenCalledWith(
      "counsel@example.test",
      {
        redirectTo: expect.stringMatching(
          /^https:\/\/custodyfolio\.com\/records\?auth=attorney-invite&next=%2Fattorney%2Faccept&invite=1&attorney_token=[A-Za-z0-9_-]+$/
        ),
      }
    );
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      message: expect.stringContaining("email provider accepted"),
    });
  });

  it("sends an email proof link without changing credentials for an existing identity", async () => {
    inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { code: "email_exists" },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "counsel@example.test",
      options: {
        emailRedirectTo: expect.stringContaining(
          "https://custodyfolio.com/records?auth=attorney-invite&next=%2Fattorney%2Faccept&invite=1&attorney_token="
        ),
        shouldCreateUser: false,
      },
    });
  });

  it("rejects a missing, expired, revoked, or email-mismatched invitation", async () => {
    findPendingAttorneyInvitationForEmail.mockResolvedValue(null);

    const response = await POST(request({ email: "wrong@example.test" }));

    expect(response.status).toBe(404);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("can issue a fresh mailbox link after an interrupted password setup", async () => {
    findPendingAttorneyInvitationForEmail.mockResolvedValue(null);
    findPendingAttorneyOnboardingForEmail.mockResolvedValue({ id: "invite-1" });

    const response = await POST(request({ token: "current-onboarding-token" }));

    expect(response.status).toBe(200);
    expect(findPendingAttorneyOnboardingForEmail).toHaveBeenCalledWith({
      token: "current-onboarding-token",
      email: "counsel@example.test",
    });
    expect(inviteUserByEmail).toHaveBeenCalled();
  });

  it("keeps onboarding disabled when Attorney Access is disabled", async () => {
    checkAttorneyGuestEntitlement.mockReturnValue({
      allowed: false,
      reason: "Attorney guest access is not enabled for this account.",
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(findPendingAttorneyInvitationForEmail).not.toHaveBeenCalled();
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("requires adult-use confirmation before sending the email link", async () => {
    const response = await POST(request({ adultConfirmed: false }));

    expect(response.status).toBe(400);
    expect(findPendingAttorneyInvitationForEmail).not.toHaveBeenCalled();
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("fails closed when secure email delivery fails", async () => {
    inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { code: "email_address_not_authorized" },
    });

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});
