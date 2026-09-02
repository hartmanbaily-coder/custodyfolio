import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verifyOtp = vi.hoisted(() => vi.fn());
const getUserById = vi.hoisted(() => vi.fn());
const generateLink = vi.hoisted(() => vi.fn());
const recordsProfileIsAuthorized = vi.hoisted(() => vi.fn());
const recordsAttorneyProfileIsAuthorized = vi.hoisted(() => vi.fn());
const findPendingAttorneyInvitationForEmail = vi.hoisted(() => vi.fn());
const upsertRecordsProfile = vi.hoisted(() => vi.fn());
const setRecordsSessionCookies = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseAuthClient: () => ({
    auth: {
      verifyOtp,
      setSession: vi.fn(),
      signOut: vi.fn(),
    },
  }),
}));
vi.mock("@/lib/supabaseAdmin", () => ({
  createSupabaseAdminClient: () => ({
    auth: { admin: { getUserById, generateLink } },
  }),
}));
vi.mock("@/lib/records/authServer", () => ({
  isRecordsSignupEnabled: () => false,
  isSupabaseRecordsMode: () => true,
  setRecordsSessionCookies,
}));
vi.mock("@/lib/records/profileServer", () => ({
  recordsProfileIsAuthorized,
  upsertRecordsProfile,
}));
vi.mock("@/lib/records/attorneyProfileServer", () => ({
  recordsAttorneyProfileIsAuthorized,
}));
vi.mock("@/lib/records/attorneyServer", () => ({
  acceptPendingAttorneyInvitationForUser: vi.fn(),
  attorneyAcceptanceCookieName: "attorney-acceptance",
  clearAttorneyAcceptanceCookie: vi.fn((response) => response),
  findPendingAttorneyInvitationForEmail,
}));
vi.mock("@/lib/security/securityEvents", () => ({ recordSecurityEvent: vi.fn() }));

import { POST } from "@/app/api/records/auth/email-code/verify/route";

const reviewUserId = "724f81aa-b6d1-4b8a-ab59-aec5fe29e7ea";

function session(email = "owner@example.test", userId = "owner-1") {
  return {
    access_token: "email-otp-access-token",
    refresh_token: "email-otp-refresh-token",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: userId,
      email,
      email_confirmed_at: "2026-09-02T00:00:00.000Z",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-01-01T00:00:00.000Z",
    },
  };
}

function request(code = "123456", email = "owner@example.test") {
  return new NextRequest("https://custodyfolio.com/api/records/auth/email-code/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://custodyfolio.com",
    },
    body: JSON.stringify({
      email,
      code,
      adultConfirmed: true,
      legalAccepted: true,
      workspace: "records",
    }),
  });
}

describe("email-code verification route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.APPLE_REVIEW_AUTH_CODE_SHA256;
    delete process.env.APPLE_REVIEW_ATTORNEY_USER_ID;
    delete process.env.APPLE_REVIEW_ATTORNEY_AUTH_CODE_SHA256;
    process.env.APPLE_REVIEW_SANDBOX_ENABLED = "false";
    recordsProfileIsAuthorized.mockResolvedValue(true);
    recordsAttorneyProfileIsAuthorized.mockResolvedValue(true);
    findPendingAttorneyInvitationForEmail.mockResolvedValue(null);
    upsertRecordsProfile.mockResolvedValue(undefined);
    verifyOtp.mockResolvedValue({ data: { session: session(), user: session().user }, error: null });
  });

  it("creates a normal AAL1 records session from a valid email OTP", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      session: { userId: "owner-1", email: "owner@example.test" },
      destination: "/records",
    });
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "owner@example.test",
      token: "123456",
      type: "email",
    });
    expect(setRecordsSessionCookies).toHaveBeenCalledWith(
      response,
      expect.objectContaining({ access_token: "email-otp-access-token" }),
      expect.any(String),
      "records"
    );
  });

  it("rejects an invalid or expired code without creating session cookies", async () => {
    verifyOtp.mockResolvedValue({ data: { session: null, user: null }, error: new Error("expired") });
    const response = await POST(request("999999"));
    expect(response.status).toBe(401);
    expect(setRecordsSessionCookies).not.toHaveBeenCalled();
  });

  it("uses the fixed review code only for the scoped review user while the window is open", async () => {
    const reviewCode = "481729";
    process.env.APPLE_REVIEW_SANDBOX_ENABLED = "true";
    process.env.APPLE_REVIEW_SANDBOX_USER_ID = reviewUserId;
    process.env.APPLE_REVIEW_SANDBOX_EXPIRES_AT = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    process.env.APPLE_REVIEW_AUTH_CODE_SHA256 = createHash("sha256").update(reviewCode).digest("hex");
    getUserById.mockResolvedValue({
      data: { user: { id: reviewUserId, email: "appreview@custodyfolio.com", email_confirmed_at: "2026-08-01T00:00:00.000Z" } },
      error: null,
    });
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "server-generated-review-token" } },
      error: null,
    });
    const reviewSession = session("appreview@custodyfolio.com", reviewUserId);
    verifyOtp.mockResolvedValue({ data: { session: reviewSession, user: reviewSession.user }, error: null });

    const response = await POST(request(reviewCode, "appreview@custodyfolio.com"));
    expect(response.status).toBe(200);
    expect(getUserById).toHaveBeenCalledWith(reviewUserId);
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "appreview@custodyfolio.com" });
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "server-generated-review-token", type: "email" });
  });

  it("uses a separately scoped fixed review code for an active attorney account", async () => {
    const attorneyUserId = "4f99752a-ea56-4e56-b067-10957d2c9e22";
    const attorneyCode = "735902";
    process.env.APPLE_REVIEW_SANDBOX_ENABLED = "true";
    process.env.APPLE_REVIEW_SANDBOX_EXPIRES_AT = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    process.env.APPLE_REVIEW_ATTORNEY_USER_ID = attorneyUserId;
    process.env.APPLE_REVIEW_ATTORNEY_AUTH_CODE_SHA256 = createHash("sha256").update(attorneyCode).digest("hex");
    getUserById.mockResolvedValue({
      data: { user: { id: attorneyUserId, email: "attorney-review@example.test", email_confirmed_at: "2026-08-01T00:00:00.000Z" } },
      error: null,
    });
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "server-generated-attorney-review-token" } },
      error: null,
    });
    const attorneySession = session("attorney-review@example.test", attorneyUserId);
    verifyOtp.mockResolvedValue({ data: { session: attorneySession, user: attorneySession.user }, error: null });

    const attorneyRequest = new NextRequest("https://custodyfolio.com/api/records/auth/email-code/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://custodyfolio.com" },
      body: JSON.stringify({
        email: "attorney-review@example.test",
        code: attorneyCode,
        adultConfirmed: true,
        legalAccepted: true,
        workspace: "attorney",
      }),
    });
    const response = await POST(attorneyRequest);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ destination: "/attorney" });
    expect(setRecordsSessionCookies).toHaveBeenCalledWith(
      response,
      expect.objectContaining({ access_token: "email-otp-access-token" }),
      expect.any(String),
      "attorney_guest"
    );
  });
});
