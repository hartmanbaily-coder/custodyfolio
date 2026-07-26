import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/auth/confirm/route";

const verifyOtp = vi.hoisted(() => vi.fn());
const getClaims = vi.hoisted(() => vi.fn());
const setRecordsSessionCookies = vi.hoisted(() => vi.fn());
const setRecordsPasswordRecoveryCookie = vi.hoisted(() => vi.fn());
const isRecordsSignupEnabled = vi.hoisted(() => vi.fn());
const upsertRecordsProfile = vi.hoisted(() => vi.fn());
const recordsProfileExists = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseAuthClient: () => ({ auth: { getClaims, verifyOtp } }),
}));

vi.mock("@/lib/records/authServer", () => ({
  isSupabaseRecordsMode: () => true,
  isRecordsSignupEnabled,
  recordsAppBaseUrl: () => "https://custodyfolio.com",
  setRecordsPasswordRecoveryCookie,
  setRecordsSessionCookies,
}));

vi.mock("@/lib/records/profileServer", () => ({
  recordsProfileIsAuthorized: recordsProfileExists,
  upsertRecordsProfile,
}));
vi.mock("@/lib/security/securityEvents", () => ({ recordSecurityEvent }));

const session = {
  access_token: "access-token",
  refresh_token: "refresh-token",
  expires_in: 3600,
};
const user = { id: "8c76755a-dc41-4cb6-a8ab-c031e2cb50c4", email: "user@example.test" };

describe("Supabase email callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRecordsSignupEnabled.mockReturnValue(true);
    verifyOtp.mockResolvedValue({ data: { session, user }, error: null });
    recordsProfileExists.mockResolvedValue(true);
    getClaims.mockResolvedValue({
      data: {
        claims: {
          amr: [{ method: "recovery" }],
          session_id: "recovery-session-id",
          sub: user.id,
        },
      },
      error: null,
    });
  });

  it("confirms signup without creating a signed-in app session", async () => {
    const response = await GET(
      new NextRequest("https://custodyfolio.com/auth/confirm?token_hash=hash&type=email")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://custodyfolio.com/records?auth=confirmed");
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "hash", type: "email" });
    expect(upsertRecordsProfile).toHaveBeenCalledWith({
      userId: user.id,
      email: user.email,
    });
    expect(setRecordsSessionCookies).not.toHaveBeenCalled();
    expect(setRecordsPasswordRecoveryCookie).not.toHaveBeenCalled();
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "auth_email_confirmed", status: 307 })
    );
  });

  it("creates a short-lived recovery session only for recovery links", async () => {
    const response = await GET(
      new NextRequest("https://custodyfolio.com/auth/confirm?token_hash=hash&type=recovery")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://custodyfolio.com/records?auth=recovery");
    expect(setRecordsSessionCookies).toHaveBeenCalledWith(
      response,
      session,
      expect.any(String)
    );
    expect(setRecordsPasswordRecoveryCookie).toHaveBeenCalledWith(response, {
      userId: user.id,
      sessionId: "recovery-session-id",
    });
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "auth_recovery_session_accepted", status: 307 })
    );
  });

  it("rejects unsupported email actions", async () => {
    const response = await GET(
      new NextRequest("https://custodyfolio.com/auth/confirm?token_hash=hash&type=magiclink")
    );

    expect(response.headers.get("location")).toBe(
      "https://custodyfolio.com/records?auth=confirm-error"
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("does not confirm a new signup after account creation is disabled", async () => {
    isRecordsSignupEnabled.mockReturnValue(false);
    recordsProfileExists.mockResolvedValue(false);

    const response = await GET(
      new NextRequest("https://custodyfolio.com/auth/confirm?token_hash=hash&type=signup")
    );

    expect(response.headers.get("location")).toBe(
      "https://custodyfolio.com/records?auth=confirm-error"
    );
    expect(verifyOtp).toHaveBeenCalled();
    expect(upsertRecordsProfile).not.toHaveBeenCalled();
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "auth_signup_confirmation_blocked", status: 403 })
    );
  });

  it("does not create recovery cookies when token verification fails", async () => {
    verifyOtp.mockResolvedValue({
      data: { session: null, user: null },
      error: new Error("expired"),
    });

    const response = await GET(
      new NextRequest("https://custodyfolio.com/auth/confirm?token_hash=hash&type=recovery")
    );

    expect(response.headers.get("location")).toBe(
      "https://custodyfolio.com/records?auth=confirm-error"
    );
    expect(setRecordsSessionCookies).not.toHaveBeenCalled();
    expect(setRecordsPasswordRecoveryCookie).not.toHaveBeenCalled();
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "auth_recovery_session_failed", status: 401 })
    );
  });

  it("rejects a stale recovery JWT when account creation is disabled", async () => {
    isRecordsSignupEnabled.mockReturnValue(false);
    recordsProfileExists.mockResolvedValue(false);

    const response = await GET(
      new NextRequest("https://custodyfolio.com/auth/confirm?token_hash=hash&type=recovery")
    );

    expect(response.headers.get("location")).toBe(
      "https://custodyfolio.com/records?auth=confirm-error"
    );
    expect(recordsProfileExists).toHaveBeenCalledWith(user.id, session.access_token);
    expect(setRecordsSessionCookies).not.toHaveBeenCalled();
    expect(setRecordsPasswordRecoveryCookie).not.toHaveBeenCalled();
  });

  it("rejects a callback whose verified access token is not recovery-authenticated", async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          amr: [{ method: "password" }],
          session_id: "ordinary-session-id",
          sub: user.id,
        },
      },
      error: null,
    });

    const response = await GET(
      new NextRequest("https://custodyfolio.com/auth/confirm?token_hash=hash&type=recovery")
    );

    expect(response.headers.get("location")).toBe(
      "https://custodyfolio.com/records?auth=confirm-error"
    );
    expect(setRecordsSessionCookies).not.toHaveBeenCalled();
    expect(setRecordsPasswordRecoveryCookie).not.toHaveBeenCalled();
  });
});
