import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.hoisted(() => vi.fn());
const refreshSession = vi.hoisted(() => vi.fn());
const recordsProfileExists = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseAdmin", () => ({
  createSupabaseAdminClient: () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseAuthClient: () => ({ auth: { refreshSession } }),
  createServerSupabaseSessionClient: vi.fn(),
}));

vi.mock("@/lib/records/profileServer", () => ({
  recordsProfileIsAuthorized: recordsProfileExists,
}));

import {
  getRecordsAuthContext,
  recordsAccessCookieName,
  recordsRefreshCookieName,
} from "@/lib/records/authServer";

function requestWithCookies(cookie: string) {
  return new NextRequest("https://custodyfolio.com/api/records/dataset", {
    headers: { Cookie: cookie },
  });
}

describe("central records profile authorization", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      RECORDS_ENFORCE_MFA: "false",
      SUPABASE_MFA_POLICY: "optional",
    };
    recordsProfileExists.mockResolvedValue(true);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("rejects a valid access token when the Supabase identity has no approved profile", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "unapproved-user", email: "direct@example.test" } },
      error: null,
    });
    recordsProfileExists.mockResolvedValue(false);

    const context = await getRecordsAuthContext(
      requestWithCookies(`${recordsAccessCookieName}=valid-access-token`)
    );

    expect("error" in context).toBe(true);
    if ("error" in context) expect(context.error?.status).toBe(403);
  });

  it("also enforces the profile gate after refreshing a session", async () => {
    refreshSession.mockResolvedValue({
      data: {
        session: { access_token: "refreshed-access-token", refresh_token: "refresh-token" },
        user: { id: "unapproved-user", email: "direct@example.test" },
      },
      error: null,
    });
    recordsProfileExists.mockResolvedValue(false);

    const context = await getRecordsAuthContext(
      requestWithCookies(`${recordsRefreshCookieName}=valid-refresh-token`)
    );

    expect("error" in context).toBe(true);
    if ("error" in context) expect(context.error?.status).toBe(403);
  });

  it("fails closed if profile authorization cannot be checked", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "user@example.test" } },
      error: null,
    });
    recordsProfileExists.mockRejectedValue(new Error("database unavailable"));

    const context = await getRecordsAuthContext(
      requestWithCookies(`${recordsAccessCookieName}=valid-access-token`)
    );

    expect("error" in context).toBe(true);
    if ("error" in context) expect(context.error?.status).toBe(503);
  });

  it("returns an authenticated context only for an approved profile", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "approved-user",
          email: "approved@example.test",
          email_confirmed_at: "2026-01-01T00:00:00.000Z",
        },
      },
      error: null,
    });

    const context = await getRecordsAuthContext(
      requestWithCookies(`${recordsAccessCookieName}=valid-access-token`)
    );

    expect(context).toMatchObject({
      userId: "approved-user",
      email: "approved@example.test",
    });
  });

  it("returns a refreshed context only for an approved profile", async () => {
    refreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: "refreshed-access-token",
          refresh_token: "rotated-refresh-token",
        },
        user: {
          id: "approved-user",
          email: "approved@example.test",
          email_confirmed_at: "2026-01-01T00:00:00.000Z",
        },
      },
      error: null,
    });

    const context = await getRecordsAuthContext(
      requestWithCookies(`${recordsRefreshCookieName}=valid-refresh-token`)
    );

    expect(context).toMatchObject({
      userId: "approved-user",
      email: "approved@example.test",
      refreshedSession: { access_token: "refreshed-access-token" },
    });
  });
});
