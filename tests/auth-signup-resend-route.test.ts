import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/records/auth/signup/resend/route";
import { resetRateLimitStore } from "@/lib/security/rateLimit";

const resend = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseAuthClient: () => ({ auth: { resend } }),
}));

vi.mock("@/lib/security/securityEvents", () => ({ recordSecurityEvent }));

function fakeJwt(payload: Record<string, unknown>) {
  const encode = (input: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(input)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(payload)}.signature`;
}

function makeRequest(body: unknown) {
  return new NextRequest("https://custodyfolio.com/api/records/auth/signup/resend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("records signup confirmation resend route", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_RECORDS_STORAGE_MODE: "supabase",
      RECORDS_STORAGE_MODE: "supabase",
      NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED: "true",
      RECORDS_SIGNUPS_ENABLED: "true",
      NEXT_PUBLIC_APP_URL: "https://custodyfolio.com",
      NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt({ role: "anon" }),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("requests a new confirmation email without revealing whether the account exists", async () => {
    resend.mockResolvedValue({ error: null });

    const response = await POST(
      makeRequest({ adultConfirmed: true, email: " New.User@Example.test " })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      message: expect.stringContaining("If an unconfirmed account exists"),
    });
    expect(resend).toHaveBeenCalledWith({
      type: "signup",
      email: "new.user@example.test",
      options: { emailRedirectTo: "https://custodyfolio.com/records?auth=confirmed" },
    });
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "auth_signup_confirmation_resent", status: 200 })
    );
  });

  it("returns the same generic response when Supabase declines the resend", async () => {
    resend.mockResolvedValue({ error: new Error("account is already confirmed") });

    const response = await POST(
      makeRequest({ adultConfirmed: true, email: "existing@example.test" })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      message: expect.stringContaining("If an unconfirmed account exists"),
    });
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "auth_signup_confirmation_resend_failed", status: 200 })
    );
  });

  it("requires a valid email and adult confirmation", async () => {
    const response = await POST(
      makeRequest({ adultConfirmed: false, email: "existing@example.test" })
    );

    expect(response.status).toBe(400);
    expect(resend).not.toHaveBeenCalled();
  });
});
