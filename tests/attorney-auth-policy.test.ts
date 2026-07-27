import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  attorneyEmailHash,
  createAttorneyInvitationToken,
  hashAttorneyInvitationToken,
} from "@/lib/records/attorneyCrypto";

const getRecordsAuthContext = vi.hoisted(() => vi.fn());
const invitationMaybeSingle = vi.hoisted(() => vi.fn());
const invitationEq = vi.hoisted(() => vi.fn());

vi.mock("@/lib/records/authServer", () => ({
  getRecordsAuthContext,
  isSupabaseRecordsMode: () => true,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  createSupabaseAdminClient: () => {
    const query = {
      select: vi.fn(() => query),
      eq: invitationEq.mockImplementation(() => query),
      gt: vi.fn(() => query),
      maybeSingle: invitationMaybeSingle,
    };
    return { from: vi.fn(() => query) };
  },
}));

import {
  attorneyInvitationDeliveryMode,
  attorneyMailboxProofCookieName,
  attorneyPasswordSetupCookieName,
  findPendingAttorneyOnboardingForEmail,
  findPendingAttorneyInvitationForEmail,
  getAttorneyPasswordSetupInvitationId,
  getAttorneyAuthContext,
  getAttorneyMailboxProofInvitationId,
  setAttorneyAcceptanceCookie,
  setAttorneyMailboxProofCookie,
  setAttorneyPasswordSetupCookie,
} from "@/lib/records/attorneyServer";

const request = new NextRequest("https://custodyfolio.com/api/records/attorney/portal");

describe("attorney authentication policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ATTORNEY_PORTAL_SECRET =
      "attorney-auth-policy-secret-that-is-long-enough-for-tests";
  });

  it("requires AAL2 even when ordinary records policy is not being exercised", async () => {
    getRecordsAuthContext.mockResolvedValue({
      userId: "attorney-1",
      email: "counsel@example.com",
      emailConfirmedAt: "2026-01-01T00:00:00.000Z",
      assuranceLevel: "aal1",
    });
    const context = await getAttorneyAuthContext(request);
    expect("error" in context).toBe(true);
    if ("error" in context) expect(context.error.status).toBe(403);
  });

  it("requires a confirmed invited email", async () => {
    getRecordsAuthContext.mockResolvedValue({
      userId: "attorney-1",
      email: "counsel@example.com",
      emailConfirmedAt: undefined,
      assuranceLevel: "aal2",
    });
    const context = await getAttorneyAuthContext(request);
    expect("error" in context).toBe(true);
    if ("error" in context) await expect(context.error.json()).resolves.toMatchObject({
      error: expect.stringContaining("Confirm"),
    });
  });

  it("accepts a confirmed AAL2 adult account context", async () => {
    const expected = {
      userId: "attorney-1",
      email: "counsel@example.com",
      emailConfirmedAt: "2026-01-01T00:00:00.000Z",
      assuranceLevel: "aal2",
      supabase: {},
    };
    getRecordsAuthContext.mockResolvedValue(expected);
    await expect(getAttorneyAuthContext(request)).resolves.toBe(expected);
  });

  it("allows reviewed owner sharing in production without development delivery", () => {
    expect(attorneyInvitationDeliveryMode({
      NODE_ENV: "production",
      ATTORNEY_INVITE_OWNER_SHARE_ENABLED: "true",
      ATTORNEY_INVITE_DEV_DELIVERY: "false",
    })).toBe("owner_share");
  });

  it("never treats the development flag as production delivery", () => {
    expect(attorneyInvitationDeliveryMode({
      NODE_ENV: "production",
      ATTORNEY_INVITE_OWNER_SHARE_ENABLED: "false",
      ATTORNEY_INVITE_DEV_DELIVERY: "true",
    })).toBe("not_configured");
  });

  it("matches a pending invitation only to its exact normalized email", async () => {
    const token = createAttorneyInvitationToken();
    invitationMaybeSingle.mockResolvedValue({
      data: {
        id: "invite-1",
        owner_user_id: "owner-1",
        case_id: "case-1",
        invited_email_hash: attorneyEmailHash("counsel@example.test"),
        expires_at: "2026-08-01T00:00:00.000Z",
      },
      error: null,
    });

    await expect(findPendingAttorneyInvitationForEmail({
      token,
      email: " Counsel@Example.test ",
    })).resolves.toMatchObject({ id: "invite-1" });
    await expect(findPendingAttorneyInvitationForEmail({
      token,
      email: "other@example.test",
    })).resolves.toBeNull();
    expect(invitationEq).toHaveBeenCalledWith(
      "token_hash",
      hashAttorneyInvitationToken(token)
    );
    expect(invitationEq).toHaveBeenCalledWith("status", "pending");
  });

  it("matches a current mailbox-onboarding token only to its exact invited email", async () => {
    const token = createAttorneyInvitationToken();
    invitationMaybeSingle.mockResolvedValue({
      data: {
        id: "invite-1",
        owner_user_id: "owner-1",
        case_id: "case-1",
        invited_email_hash: attorneyEmailHash("counsel@example.test"),
        onboarding_token_hash: hashAttorneyInvitationToken(token),
        onboarding_expires_at: "2026-08-01T00:00:00.000Z",
      },
      error: null,
    });

    await expect(
      findPendingAttorneyOnboardingForEmail({ token, email: "counsel@example.test" })
    ).resolves.toMatchObject({ id: "invite-1" });
    await expect(
      findPendingAttorneyOnboardingForEmail({ token, email: "other@example.test" })
    ).resolves.toBeNull();
    expect(invitationEq).toHaveBeenCalledWith(
      "onboarding_token_hash",
      hashAttorneyInvitationToken(token)
    );
  });

  it("keeps the HttpOnly acceptance capability through the seven-day onboarding window", () => {
    const response = setAttorneyAcceptanceCookie(
      NextResponse.json({ ok: true }),
      createAttorneyInvitationToken()
    );
    const cookie = response.headers.get("set-cookie") || "";

    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=strict");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=604800");
  });

  it("binds password-setup authorization to the invited identity", () => {
    const response = setAttorneyPasswordSetupCookie(
      NextResponse.json({ ok: true }),
      {
        invitationId: "invite-1",
        userId: "attorney-1",
        expiresAt: Date.now() + 10 * 60 * 1000,
      }
    );
    const cookie = response.cookies.get(attorneyPasswordSetupCookieName)?.value || "";
    const boundRequest = new NextRequest("https://custodyfolio.com/api/records/auth/password/update", {
      headers: { Cookie: `${attorneyPasswordSetupCookieName}=${cookie}` },
    });

    expect(getAttorneyPasswordSetupInvitationId(boundRequest, "attorney-1")).toBe("invite-1");
    expect(getAttorneyPasswordSetupInvitationId(boundRequest, "other-user")).toBeNull();
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Path=/");
  });

  it("binds mailbox proof to both the invited identity and acceptance token", () => {
    const token = createAttorneyInvitationToken();
    const response = setAttorneyMailboxProofCookie(
      NextResponse.json({ ok: true }),
      {
        invitationId: "invite-1",
        userId: "attorney-1",
        token,
        expiresAt: Date.now() + 10 * 60 * 1000,
      }
    );
    const cookie = response.cookies.get(attorneyMailboxProofCookieName)?.value || "";
    const boundRequest = new NextRequest("https://custodyfolio.com/api/records/attorney/accept", {
      headers: { Cookie: `${attorneyMailboxProofCookieName}=${cookie}` },
    });

    expect(
      getAttorneyMailboxProofInvitationId(boundRequest, { userId: "attorney-1", token })
    ).toBe("invite-1");
    expect(
      getAttorneyMailboxProofInvitationId(boundRequest, {
        userId: "attorney-1",
        token: createAttorneyInvitationToken(),
      })
    ).toBeNull();
    expect(
      getAttorneyMailboxProofInvitationId(boundRequest, { userId: "other-user", token })
    ).toBeNull();
    expect(response.headers.get("set-cookie")).toContain(
      "Path=/api/records/attorney/accept"
    );
  });
});
