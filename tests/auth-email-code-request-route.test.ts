import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const signInWithOtp = vi.hoisted(() => vi.fn());
const isRecordsSignupEnabled = vi.hoisted(() => vi.fn(() => true));
const findPendingAttorneyInvitationForEmail = vi.hoisted(() => vi.fn());
const recordsAttorneyEmailHasActiveGrant = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseAuthClient: () => ({ auth: { signInWithOtp } }),
}));
vi.mock("@/lib/records/authServer", () => ({
  isRecordsSignupEnabled,
  isSupabaseRecordsMode: () => true,
}));
vi.mock("@/lib/records/attorneyServer", () => ({
  attorneyAcceptanceCookieName: "attorney-acceptance",
  findPendingAttorneyInvitationForEmail,
}));
vi.mock("@/lib/records/attorneyProfileServer", () => ({
  recordsAttorneyEmailHasActiveGrant,
}));
vi.mock("@/lib/security/securityEvents", () => ({ recordSecurityEvent: vi.fn() }));

import { POST } from "@/app/api/records/auth/email-code/request/route";

function request(body: Record<string, unknown>, cookie = "") {
  return new NextRequest("https://custodyfolio.com/api/records/auth/email-code/request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://custodyfolio.com",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("email-code request route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRecordsSignupEnabled.mockReturnValue(true);
    signInWithOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });
    recordsAttorneyEmailHasActiveGrant.mockResolvedValue(false);
    findPendingAttorneyInvitationForEmail.mockResolvedValue(null);
  });

  it("requests a passwordless code without exposing a password or authenticator flow", async () => {
    const response = await POST(request({
      email: " User@Example.test ",
      adultConfirmed: true,
      legalAccepted: true,
      workspace: "records",
    }));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      message: expect.stringContaining("6-digit sign-in code"),
    });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "user@example.test",
      options: expect.objectContaining({ shouldCreateUser: true }),
    });
  });

  it("requires affirmative adult and policy acceptance before sending", async () => {
    const response = await POST(request({
      email: "user@example.test",
      adultConfirmed: true,
      legalAccepted: false,
    }));
    expect(response.status).toBe(400);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("allows an invited attorney code only for the exact invitation email", async () => {
    findPendingAttorneyInvitationForEmail.mockResolvedValue({ id: "invite-1" });
    const response = await POST(request({
      email: " Counsel@Example.test ",
      adultConfirmed: true,
      legalAccepted: true,
      workspace: "attorney",
    }, "attorney-acceptance=private-token"));
    expect(response.status).toBe(202);
    expect(findPendingAttorneyInvitationForEmail).toHaveBeenCalledWith({
      token: "private-token",
      email: "counsel@example.test",
    });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "counsel@example.test",
      options: expect.objectContaining({ shouldCreateUser: true }),
    });
  });

  it("does not enumerate an unknown attorney email", async () => {
    const response = await POST(request({
      email: "unknown@example.test",
      adultConfirmed: true,
      legalAccepted: true,
      workspace: "attorney",
    }));
    expect(response.status).toBe(202);
    expect(signInWithOtp).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });
});
