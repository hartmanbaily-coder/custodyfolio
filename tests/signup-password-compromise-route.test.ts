import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimitStore } from "@/lib/security/rateLimit";
import { POST } from "@/app/api/records/auth/signup/route";

const signUp = vi.hoisted(() => vi.fn());
const checkPwnedPassword = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseAuthClient: () => ({ auth: { signUp } }),
}));

vi.mock("@/lib/records/authServer", () => ({
  isRecordsSignupEnabled: () => true,
  isStrongRecordsPassword: (password: string) => password.length >= 12,
  isSupabaseRecordsMode: () => true,
  recordsAppBaseUrl: () => "https://custodyfolio.com",
  recordsPasswordMinimumLength: () => 12,
}));

vi.mock("@/lib/security/pwnedPasswords", () => ({
  checkPwnedPassword,
  isPwnedPasswordCheckEnabled: () => true,
}));

vi.mock("@/lib/security/securityEvents", () => ({ recordSecurityEvent }));

function request(password = "Long-Password!42") {
  return new NextRequest("https://custodyfolio.com/api/records/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "new-user@example.test",
      password,
      adultConfirmed: true,
    }),
  });
}

describe("signup compromised-password guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    signUp.mockResolvedValue({ error: null });
  });

  it("rejects a compromised password before creating the Supabase account", async () => {
    checkPwnedPassword.mockResolvedValue({ status: "compromised", occurrenceCount: 12 });

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("known data breaches"),
    });
    expect(signUp).not.toHaveBeenCalled();
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "auth_signup_compromised_password_blocked" })
    );
  });

  it("fails closed when password safety cannot be verified", async () => {
    checkPwnedPassword.mockResolvedValue({ status: "unavailable" });

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(signUp).not.toHaveBeenCalled();
  });

  it("preserves normal signup for a verified safe password", async () => {
    checkPwnedPassword.mockResolvedValue({ status: "safe" });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: expect.stringContaining("separately set up an authenticator"),
    });
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "new-user@example.test", password: "Long-Password!42" })
    );
  });
});
