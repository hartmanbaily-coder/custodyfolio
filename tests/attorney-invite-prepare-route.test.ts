import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  createAttorneyInvitationToken,
  protectAttorneyEmail,
} from "@/lib/records/attorneyCrypto";
import { recordsCsrfCookieName } from "@/lib/security/csrf";
import { resetRateLimitStore } from "@/lib/security/rateLimit";

const inviteUserByEmail = vi.hoisted(() => vi.fn());
const signInWithOtp = vi.hoisted(() => vi.fn());
const invitationMaybeSingle = vi.hoisted(() => vi.fn());
const checkAttorneyGuestEntitlement = vi.hoisted(() => vi.fn());
const setAttorneyAcceptanceCookie = vi.hoisted(() => vi.fn((response) => response));
const recordSecurityEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseAdmin", () => ({
  createSupabaseAdminClient: () => {
    const query = {
      select: vi.fn(() => query),
      update: vi.fn(() => query),
      eq: vi.fn(() => query),
      gt: vi.fn(() => query),
      maybeSingle: invitationMaybeSingle,
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
vi.mock("@/lib/records/attorneyEntitlement", () => ({ checkAttorneyGuestEntitlement }));
vi.mock("@/lib/records/attorneyServer", () => ({
  attorneyAcceptanceCookieName: "l2f-attorney-invite",
  setAttorneyAcceptanceCookie,
}));
vi.mock("@/lib/security/securityEvents", () => ({ recordSecurityEvent }));

import { POST } from "@/app/api/records/attorney/accept/prepare/route";

function request(token: string) {
  const csrf = "attorney-prepare-csrf";
  return new NextRequest("https://custodyfolio.com/api/records/attorney/accept/prepare", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://custodyfolio.com",
      Cookie: `${recordsCsrfCookieName}=${csrf}`,
      "X-L2F-CSRF": csrf,
    },
    body: JSON.stringify({ token }),
  });
}

describe("automatic attorney mailbox verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    process.env.ATTORNEY_PORTAL_SECRET =
      "attorney-prepare-secret-that-is-long-enough-for-tests";
    checkAttorneyGuestEntitlement.mockReturnValue({ allowed: true });
    const protectedEmail = protectAttorneyEmail("counsel@example.test");
    invitationMaybeSingle.mockResolvedValue({
      data: {
        id: "invite-1",
        invited_email_ciphertext: protectedEmail.ciphertext,
        invited_email_nonce: protectedEmail.nonce,
        invited_email_tag: protectedEmail.tag,
      },
      error: null,
    });
    inviteUserByEmail.mockResolvedValue({
      data: { user: { id: "attorney-1" } },
      error: null,
    });
    signInWithOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });
  });

  it("sends the invited mailbox a link bound to the original private invitation", async () => {
    const token = createAttorneyInvitationToken();
    const response = await POST(request(token));

    expect(response.status).toBe(200);
    expect(inviteUserByEmail).toHaveBeenCalledWith("counsel@example.test", {
      redirectTo: expect.stringContaining(
        `https://custodyfolio.com/records?auth=attorney-invite&next=%2Fattorney%2Faccept&invite=1&attorney_token=${token}`
      ),
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      message: expect.stringContaining("email provider accepted"),
    });
    expect(setAttorneyAcceptanceCookie).toHaveBeenCalledWith(response, token);
  });

  it("uses a magic link for an attorney who already has a Supabase identity", async () => {
    inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { code: "email_exists" },
    });

    const response = await POST(request(createAttorneyInvitationToken()));

    expect(response.status).toBe(200);
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "counsel@example.test",
      options: {
        emailRedirectTo: expect.stringContaining("auth=attorney-invite"),
        shouldCreateUser: false,
      },
    });
  });

  it("does not send email for an invalid, expired, or used invitation", async () => {
    invitationMaybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await POST(request(createAttorneyInvitationToken()));

    expect(response.status).toBe(404);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});
