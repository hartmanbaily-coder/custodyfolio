import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/records/auth/login/route";
import { resetRateLimitStore } from "@/lib/security/rateLimit";
import { recordsSessionScopeCookieName } from "@/lib/records/authServer";

const signInWithPassword = vi.hoisted(() => vi.fn());
const setSession = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());
const recordsProfileExists = vi.hoisted(() => vi.fn());
const upsertRecordsProfile = vi.hoisted(() => vi.fn());
const recordsAttorneyProfileIsAuthorized = vi.hoisted(() => vi.fn());
const recordSecurityEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseAuthClient: () => ({
    auth: {
      signInWithPassword,
      setSession,
      signOut,
    },
  }),
}));

vi.mock("@/lib/records/profileServer", () => ({
  recordsProfileIsAuthorized: recordsProfileExists,
  upsertRecordsProfile,
}));

vi.mock("@/lib/records/attorneyProfileServer", () => ({
  recordsAttorneyProfileIsAuthorized,
}));

vi.mock("@/lib/security/securityEvents", () => ({
  recordSecurityEvent,
}));

function fakeJwt(payload: Record<string, unknown>) {
  const encode = (input: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(input)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(payload)}.signature`;
}

function makeRequest(email: string, invitationToken = "", workspace: "records" | "attorney" = "records") {
  return new NextRequest("https://custodyfolio.com/api/records/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://custodyfolio.com",
      "X-Forwarded-For": "192.0.2.10",
      ...(invitationToken ? { Cookie: `l2f-attorney-invite=${invitationToken}` } : {}),
    },
    body: JSON.stringify({
      adultConfirmed: true,
      email,
      password: "not-the-real-password",
      workspace,
    }),
  });
}

describe("records login route", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_RECORDS_STORAGE_MODE: "supabase",
      RECORDS_STORAGE_MODE: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt({ role: "anon" }),
      RECORDS_ENFORCE_MFA: "false",
      SUPABASE_MFA_POLICY: "optional",
      RECORDS_SIGNUPS_ENABLED: "true",
      NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED: "true",
    };
    recordsProfileExists.mockResolvedValue(true);
    recordsAttorneyProfileIsAuthorized.mockResolvedValue(true);
    setSession.mockResolvedValue({ data: {}, error: null });
    signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("normalizes email and preserves the generic invalid credential response", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
    });

    const response = await POST(makeRequest(" Reviewer@Example.test "));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Invalid email or password." });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "reviewer@example.test",
      password: "not-the-real-password",
    });
    expect(recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: "Supabase Auth login failure: invalid_credentials.",
        status: 401,
        type: "auth_login_failed",
      })
    );
  });

  it("rejects cross-origin simple requests before credentials reach Supabase", async () => {
    const response = await POST(
      new NextRequest("https://custodyfolio.com/api/records/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          Origin: "https://attacker.example",
          "Sec-Fetch-Site": "cross-site",
        },
        body: JSON.stringify({
          adultConfirmed: true,
          email: "attacker@example.test",
          password: "not-the-real-password",
        }),
      })
    );

    expect(response.status).toBe(403);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("tells a user when email confirmation is the actual blocker", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthApiError("Email not confirmed", 400, "email_not_confirmed"),
    });

    const response = await POST(makeRequest("unconfirmed@example.test"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Confirm your email address before signing in. Check your inbox or contact support.",
    });
  });

  it("does not mislabel upstream Auth failures as a bad password", async () => {
    signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthApiError("Request timeout", 504, "request_timeout"),
    });

    const response = await POST(makeRequest("timeout@example.test"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication service is temporarily unavailable.",
    });
  });

  it("blocks a direct Supabase identity without an existing records profile when signup is disabled", async () => {
    process.env.RECORDS_SIGNUPS_ENABLED = "false";
    process.env.NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED = "false";
    recordsProfileExists.mockResolvedValue(false);
    signInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: fakeJwt({ aal: "aal1" }),
          refresh_token: "refresh-token",
          expires_in: 3600,
        },
        user: { id: "direct-provider-user", email: "direct@example.test" },
      },
      error: null,
    });

    const response = await POST(makeRequest("direct@example.test"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This account is not enabled for Custody Folio.",
    });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(setSession).not.toHaveBeenCalled();
    expect(upsertRecordsProfile).not.toHaveBeenCalled();
  });

  it("preserves login for an existing records profile after signup is disabled", async () => {
    process.env.RECORDS_SIGNUPS_ENABLED = "false";
    process.env.NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED = "false";
    recordsProfileExists.mockResolvedValue(true);
    signInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: fakeJwt({ aal: "aal1" }),
          refresh_token: "refresh-token",
          expires_in: 3600,
        },
        user: { id: "existing-user", email: "existing@example.test" },
      },
      error: null,
    });

    const response = await POST(makeRequest("existing@example.test"));

    expect(response.status).toBe(200);
    expect(setSession).toHaveBeenCalled();
    expect(upsertRecordsProfile).toHaveBeenCalledWith({
      userId: "existing-user",
      email: "existing@example.test",
    });
  });

  it("does not let a pending invitation bypass profile approval at password login", async () => {
    process.env.RECORDS_SIGNUPS_ENABLED = "false";
    process.env.NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED = "false";
    recordsProfileExists.mockResolvedValue(false);
    signInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: fakeJwt({ aal: "aal1" }),
          refresh_token: "refresh-token",
          expires_in: 3600,
        },
        user: { id: "invited-user", email: "counsel@example.test" },
      },
      error: null,
    });

    const response = await POST(makeRequest("counsel@example.test", "valid-invite-token"));

    expect(response.status).toBe(403);
    expect(upsertRecordsProfile).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(setSession).not.toHaveBeenCalled();
  });

  it("returns a scoped attorney session only for an active invitation-gated attorney profile", async () => {
    signInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: fakeJwt({ aal: "aal1" }),
          refresh_token: "refresh-token",
          expires_in: 3600,
        },
        user: { id: "attorney-user", email: "counsel@example.test" },
      },
      error: null,
    });

    const response = await POST(makeRequest("counsel@example.test", "", "attorney"));

    expect(response.status).toBe(200);
    expect(recordsAttorneyProfileIsAuthorized).toHaveBeenCalledWith({
      userId: "attorney-user",
      email: "counsel@example.test",
      accessToken: expect.any(String),
    });
    expect(response.cookies.get(recordsSessionScopeCookieName)?.value).toBe("attorney_guest");
    expect(upsertRecordsProfile).not.toHaveBeenCalled();
  });
});
