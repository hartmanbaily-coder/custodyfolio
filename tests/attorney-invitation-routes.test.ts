import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimitStore } from "@/lib/security/rateLimit";
import { recordsCsrfCookieName } from "@/lib/security/csrf";
import { hashAttorneyInvitationToken, sealAttorneyHandle } from "@/lib/records/attorneyCrypto";

const getAttorneyAuthContext = vi.hoisted(() => vi.fn());
const recordAttorneyAccessEvent = vi.hoisted(() => vi.fn());
const ownerAttorneySharingProfile = vi.hoisted(() => vi.fn());

vi.mock("@/lib/records/attorneyServer", () => ({
  attorneyInvitationDeliveryMode: () => "owner_share",
  getAttorneyAuthContext,
  ownerAttorneySharingProfile,
}));

vi.mock("@/lib/records/attorneyAccess", () => ({
  recordAttorneyAccessEvent,
}));

import { POST as createInvitation } from "@/app/api/records/attorney/invitations/route";
import { POST as invitationAction } from "@/app/api/records/attorney/invitations/action/route";

const ownerId = "11111111-1111-4111-8111-111111111111";
const secret = "route-test-secret-that-is-at-least-thirty-two-characters";

function request(path: string, body: unknown) {
  const csrf = "csrf-token-for-route-test";
  return new NextRequest(`https://custodyfolio.com${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://custodyfolio.com",
      Cookie: `${recordsCsrfCookieName}=${csrf}`,
      "X-L2F-CSRF": csrf,
    },
    body: JSON.stringify(body),
  });
}

describe("attorney invitation owner routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    process.env.ATTORNEY_PORTAL_SECRET = secret;
    ownerAttorneySharingProfile.mockResolvedValue({
      clientName: "Jordan Client",
      caseName: "Jordan v. Taylor",
      confirmed: true,
    });
    recordAttorneyAccessEvent.mockResolvedValue({ ok: true });
  });

  it("creates a seven-day invitation while persisting only encrypted email and token hash", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const supabase = {
      from(table: string) {
        if (table === "records_attorney_grants") {
          const query = {
            select: () => query,
            eq: () => query,
            is: () => query,
            or: () => query,
            maybeSingle: async () => ({ data: null, error: null }),
          };
          return query;
        }
        if (table === "records_attorney_invitations") {
          const query = {
            select: () => query,
            eq: () => query,
            maybeSingle: async () => ({ data: null, error: null }),
            insert: (value: Record<string, unknown>) => {
              inserted.push(value);
              return {
                select: () => ({
                  single: async () => ({
                    data: { id: "invite-1", created_at: "2026-07-18T00:00:00.000Z" },
                    error: null,
                  }),
                }),
              };
            },
          };
          return query;
        }
        throw new Error(`Unexpected table ${table}`);
      },
    };
    getAttorneyAuthContext.mockResolvedValue({
      supabase,
      userId: ownerId,
      email: "owner@example.com",
      emailConfirmedAt: "2026-01-01T00:00:00.000Z",
      assuranceLevel: "aal2",
    });

    const response = await createInvitation(request("/api/records/attorney/invitations", {
      email: "Counsel@Example.com",
      caseId: "case-1",
      healthDataSharingAuthorized: true,
    }));
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.invitationUrl).toMatch(/\/attorney\/accept#token=[A-Za-z0-9_-]{43}$/);
    expect(body.delivery).toBe("owner_share");
    const rawToken = body.invitationUrl.split("#token=")[1];
    expect(inserted[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(inserted[0].token_hash).not.toBe(rawToken);
    expect(String(inserted[0].invited_email_ciphertext)).not.toContain("counsel@example.com");
    expect(inserted[0]).not.toHaveProperty("invited_email");
    const expiresAt = new Date(String(inserted[0].expires_at)).getTime();
    expect(expiresAt - Date.now()).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(recordAttorneyAccessEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "invitation_created",
      ownerUserId: ownerId,
    }));
  });

  it("requires the client to confirm the name and case label shown to the attorney", async () => {
    ownerAttorneySharingProfile.mockResolvedValue({
      clientName: "owner",
      caseName: "Parenting Records",
      confirmed: false,
    });
    getAttorneyAuthContext.mockResolvedValue({
      supabase: {},
      userId: ownerId,
      email: "owner@example.com",
      emailConfirmedAt: "2026-01-01T00:00:00.000Z",
      assuranceLevel: "aal2",
    });

    const response = await createInvitation(request("/api/records/attorney/invitations", {
      email: "counsel@example.com",
      caseId: "case-1",
      healthDataSharingAuthorized: true,
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Confirm the client name and case name shown to the attorney before creating an invitation.",
    });
    expect(recordAttorneyAccessEvent).not.toHaveBeenCalled();
  });

  it("revokes the invitation and active grant immediately", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const supabase = {
      from(table: string) {
        if (table === "records_attorney_invitations") {
          const selected = {
            select: () => selected,
            eq: () => selected,
            maybeSingle: async () => ({ data: { id: "invite-1", case_id: "case-1", status: "accepted" }, error: null }),
          };
          return selected;
        }
        throw new Error(`Unexpected table ${table}`);
      },
      rpc,
    };
    getAttorneyAuthContext.mockResolvedValue({
      supabase,
      userId: ownerId,
      email: "owner@example.com",
      emailConfirmedAt: "2026-01-01T00:00:00.000Z",
      assuranceLevel: "aal2",
    });
    const handle = sealAttorneyHandle({
      kind: "invitation",
      id: "invite-1",
      subject: ownerId,
      expiresAt: Date.now() + 60_000,
    }, { ATTORNEY_PORTAL_SECRET: secret });

    const response = await invitationAction(request(
      "/api/records/attorney/invitations/action",
      { handle, action: "revoke" }
    ));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("revoke_records_attorney_invitation", {
      p_owner_user_id: ownerId,
      p_invitation_id: "invite-1",
    });
    expect(recordAttorneyAccessEvent).not.toHaveBeenCalled();
  });

  it("replaces an expired invitation with a newly hashed token", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "invite-2", error: null });
    const selected = {
      select: () => selected,
      eq: () => selected,
      maybeSingle: async () => ({
        data: { id: "invite-1", case_id: "case-1", status: "expired" },
        error: null,
      }),
    };
    getAttorneyAuthContext.mockResolvedValue({
      supabase: {
        from: () => selected,
        rpc,
      },
      userId: ownerId,
      email: "owner@example.com",
      emailConfirmedAt: "2026-01-01T00:00:00.000Z",
      assuranceLevel: "aal2",
    });
    const handle = sealAttorneyHandle({
      kind: "invitation",
      id: "invite-1",
      subject: ownerId,
      expiresAt: Date.now() + 60_000,
    }, { ATTORNEY_PORTAL_SECRET: secret });

    const response = await invitationAction(request(
      "/api/records/attorney/invitations/action",
      { handle, action: "resend", healthDataSharingAuthorized: true }
    ));
    const body = await response.json();
    const rawToken = String(body.invitationUrl).split("#token=")[1];
    expect(response.status).toBe(200);
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rpc).toHaveBeenCalledWith("replace_records_attorney_invitation", expect.objectContaining({
      p_owner_user_id: ownerId,
      p_invitation_id: "invite-1",
      p_token_hash: hashAttorneyInvitationToken(rawToken),
    }));
    expect(recordAttorneyAccessEvent).toHaveBeenCalledWith(expect.objectContaining({
      invitationId: "invite-2",
      eventType: "invitation_resent",
      metadata: {
        consumerHealthSharingConsent: true,
        consentVersion: "2026-08-10",
      },
    }));
  });

  it("does not issue an invitation without separate case-sharing authorization", async () => {
    getAttorneyAuthContext.mockResolvedValue({
      supabase: {},
      userId: ownerId,
      email: "owner@example.com",
      emailConfirmedAt: "2026-01-01T00:00:00.000Z",
      assuranceLevel: "aal2",
    });

    const response = await createInvitation(request("/api/records/attorney/invitations", {
      email: "counsel@example.com",
      caseId: "case-1",
      healthDataSharingAuthorized: false,
    }));

    expect(response.status).toBe(400);
    expect(recordAttorneyAccessEvent).not.toHaveBeenCalled();
  });

  it("rate-limits repeated invitation creation attempts before authentication", async () => {
    const unauthenticated = () => new NextRequest("https://custodyfolio.com/api/records/attorney/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    for (let index = 0; index < 12; index += 1) {
      const response = await createInvitation(unauthenticated());
      expect(response.status).toBe(403);
    }
    const limited = await createInvitation(unauthenticated());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    expect(getAttorneyAuthContext).not.toHaveBeenCalled();
  });

  it("does not let invalid pre-auth requests consume the attorney action quota", async () => {
    const invalidRequest = () => new NextRequest(
      "https://custodyfolio.com/api/records/attorney/invitations/action",
      {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      }
    );
    for (let index = 0; index < 25; index += 1) {
      const response = await invitationAction(invalidRequest());
      expect(response.status).toBe(403);
    }

    getAttorneyAuthContext.mockResolvedValue({
      supabase: {},
      userId: ownerId,
      email: "owner@example.com",
      emailConfirmedAt: "2026-01-01T00:00:00.000Z",
      assuranceLevel: "aal2",
    });
    const legitimate = await invitationAction(request(
      "/api/records/attorney/invitations/action",
      { handle: "invalid-handle", action: "revoke" }
    ));

    expect(legitimate.status).toBe(404);
  });
});
