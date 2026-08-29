import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimitStore } from "@/lib/security/rateLimit";
import { recordsCsrfCookieName } from "@/lib/security/csrf";

const signInWithOtp = vi.hoisted(() => vi.fn());
const inviteUserByEmail = vi.hoisted(() => vi.fn());
const findPendingAttorneyInvitationForEmail = vi.hoisted(() => vi.fn());
const checkAttorneyGuestEntitlement = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseAuthClient: () => ({ auth: { signInWithOtp } }),
}));
vi.mock("@/lib/supabaseAdmin", () => ({
  createSupabaseAdminClient: () => ({ auth: { admin: { inviteUserByEmail } } }),
}));
vi.mock("@/lib/records/authServer", () => ({
  isSupabaseRecordsMode: () => true,
  recordsAppBaseUrl: () => "https://custodyfolio.com",
}));
vi.mock("@/lib/records/attorneyServer", () => ({
  attorneyAcceptanceCookieName: "l2f-attorney-invite",
  findPendingAttorneyInvitationForEmail,
}));
vi.mock("@/lib/records/attorneyEntitlement", () => ({ checkAttorneyGuestEntitlement }));
vi.mock("@/lib/security/securityEvents", () => ({ recordSecurityEvent }));

import { POST } from "@/app/api/records/attorney/accept/signup/route";

function request(input: {
  email?: string;
  token?: string;
  adultConfirmed?: boolean;
  legalAccepted?: boolean;
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
      legalAccepted: input.legalAccepted ?? true,
      email: input.email || "counsel@example.test",
      password: "attacker-chosen-password-must-be-ignored",
    }),
  });
}

describe("invited attorney account creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    checkAttorneyGuestEntitlement.mockReturnValue({ allowed: true });
    findPendingAttorneyInvitationForEmail.mockResolvedValue({ id: "invite-1" });
    inviteUserByEmail.mockResolvedValue({ data: { user: { id: "attorney-1" } }, error: null });
    signInWithOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });
  });

  it("uses the server-admin invitation path without accepting a caller-chosen password", async () => {
    const response = await POST(request({ email: " Counsel@Example.test " }));

    expect(response.status).toBe(202);
    expect(findPendingAttorneyInvitationForEmail).toHaveBeenCalledWith({
      token: "single-private-invitation-token",
      email: "counsel@example.test",
    });
    expect(inviteUserByEmail).toHaveBeenCalledWith("counsel@example.test", {
      redirectTo:
        "https://custodyfolio.com/records?auth=attorney-invite",
      data: expect.objectContaining({
        custody_folio_legal_acceptance_source: "attorney_signup",
      }),
    });
    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(JSON.stringify(inviteUserByEmail.mock.calls[0][1])).not.toContain("attacker-chosen-password");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      message: expect.stringContaining("secure account link"),
    });
  });

  it("sends a non-creating magic link when the invited identity already exists", async () => {
    inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { code: "email_exists", status: 422, message: "Email already exists" },
    });

    const response = await POST(request());

    expect(response.status).toBe(202);
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "counsel@example.test",
      options: {
        shouldCreateUser: false,
        emailRedirectTo:
          "https://custodyfolio.com/records?auth=attorney-invite",
        data: expect.objectContaining({
          custody_folio_legal_acceptance_source: "attorney_signup",
        }),
      },
    });
  });

  it("supports the legacy existing-user error shape without exposing identity state", async () => {
    inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { status: 422, message: "A user with this email has already been registered" },
    });

    const response = await POST(request());

    expect(response.status).toBe(202);
    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ shouldCreateUser: false }) })
    );
  });

  it("fails closed when the mailbox provider cannot send the authentication link", async () => {
    inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { code: "email_provider_disabled", status: 500, message: "mail provider unavailable" },
    });

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.stringContaining("email_provider_disabled"),
      })
    );
  });

  it("fails closed when an existing account magic link cannot be sent", async () => {
    inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { code: "user_already_exists", status: 422, message: "User already exists" },
    });
    signInWithOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "over_email_send_rate_limit", status: 429, message: "rate limited" },
    });

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.stringContaining("over_email_send_rate_limit"),
      })
    );
  });

  it("rejects a missing, expired, revoked, or email-mismatched invitation", async () => {
    findPendingAttorneyInvitationForEmail.mockResolvedValue(null);

    const response = await POST(request({ email: "wrong@example.test" }));

    expect(response.status).toBe(404);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("requires adult confirmation before sending mailbox authentication", async () => {
    const response = await POST(request({ adultConfirmed: false }));

    expect(response.status).toBe(400);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("requires separate acceptance of the Terms and Privacy Policy", async () => {
    const response = await POST(request({ legalAccepted: false }));

    expect(response.status).toBe(400);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("keeps onboarding disabled when Attorney Access is disabled", async () => {
    checkAttorneyGuestEntitlement.mockReturnValue({
      allowed: false,
      reason: "Attorney guest access is not enabled for this account.",
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(findPendingAttorneyInvitationForEmail).not.toHaveBeenCalled();
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});
