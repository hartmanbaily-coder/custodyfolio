import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/records/auth/password/reset/route";

const resetPasswordForEmail = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseAuthClient: () => ({
    auth: {
      resetPasswordForEmail,
    },
  }),
}));

vi.mock("@/lib/security/securityEvents", () => ({
  recordSecurityEvent,
}));

function fakeJwt(payload: Record<string, unknown>) {
  const encode = (input: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(input)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(payload)}.signature`;
}

function makeRequest(body: unknown) {
  return new NextRequest("https://custodyfolio.com/api/records/auth/password/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("records password reset route", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_RECORDS_STORAGE_MODE: "supabase",
      RECORDS_STORAGE_MODE: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt({ role: "anon" }),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("sends Supabase password reset links back to the records recovery screen", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });

    const response = await POST(makeRequest({
      adultConfirmed: true,
      email: " Reviewer@Example.test ",
    }));

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      message: "If an account exists for that email, a password reset link will be sent.",
    });
    expect(response.status).toBe(200);
    expect(resetPasswordForEmail).toHaveBeenCalledWith("reviewer@example.test", {
      redirectTo: "https://custodyfolio.com/records?auth=recovery",
    });
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "info",
        status: 200,
        type: "auth_password_reset_requested",
      })
    );
  });

  it("does not call Supabase when the request is missing adult confirmation or email", async () => {
    const response = await POST(makeRequest({
      adultConfirmed: false,
      email: "reviewer@example.test",
    }));

    await expect(response.json()).resolves.toMatchObject({
      error: "Enter your email and confirm adult use.",
    });
    expect(response.status).toBe(400);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
