import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  genericAttorneyAccessError,
  invalidateAttorneyAccessForCases,
  recordAttorneyAccessEvent,
  resolveActiveAttorneyGrant,
  sanitizeAttorneyAuditMetadata,
} from "@/lib/records/attorneyAccess";
import { sealAttorneyHandle } from "@/lib/records/attorneyCrypto";

const secret = "central-access-test-secret-longer-than-thirty-two-characters";

describe("centralized attorney grant authorization", () => {
  beforeEach(() => {
    process.env.ATTORNEY_PORTAL_SECRET = secret;
  });

  it("binds the active grant to the authenticated attorney and blocks the next request after revocation", async () => {
    let active = true;
    const grant = {
      id: "grant-1",
      owner_user_id: "owner-1",
      attorney_user_id: "attorney-1",
      invitation_id: "invite-1",
      case_key: "default",
      case_id: "case-1",
      permission_scope: "read_only",
      granted_at: "2026-07-18T00:00:00.000Z",
      expires_at: "2026-07-25T00:00:00.000Z",
      revoked_at: null,
      left_at: null,
    };
    const query = {
      select: () => query,
      eq: () => query,
      is: () => query,
      or: () => query,
      maybeSingle: async () => ({ data: active ? grant : null, error: null }),
    };
    const supabase = { from: () => query };
    const accessHandle = sealAttorneyHandle({
      kind: "grant",
      id: grant.id,
      subject: grant.attorney_user_id,
      expiresAt: Date.now() + 60_000,
    }, { ATTORNEY_PORTAL_SECRET: secret });

    await expect(resolveActiveAttorneyGrant({
      supabase,
      attorneyUserId: "attorney-1",
      accessHandle,
    })).resolves.toMatchObject({ grant: { case_id: "case-1", permission_scope: "read_only" } });

    active = false;
    await expect(resolveActiveAttorneyGrant({
      supabase,
      attorneyUserId: "attorney-1",
      accessHandle,
    })).resolves.toEqual({ error: genericAttorneyAccessError() });
  });

  it("uses the same non-enumerating response for another account or a malformed handle", async () => {
    const query = {
      select: () => query,
      eq: () => query,
      is: () => query,
      or: () => query,
      maybeSingle: async () => ({ data: null, error: null }),
    };
    const supabase = { from: () => query };
    const handle = sealAttorneyHandle({
      kind: "grant",
      id: "grant-1",
      subject: "attorney-1",
      expiresAt: Date.now() + 60_000,
    }, { ATTORNEY_PORTAL_SECRET: secret });
    const wrongUser = await resolveActiveAttorneyGrant({
      supabase,
      attorneyUserId: "attorney-2",
      accessHandle: handle,
    });
    const malformed = await resolveActiveAttorneyGrant({
      supabase,
      attorneyUserId: "attorney-2",
      accessHandle: "case-1",
    });
    expect(wrongUser).toEqual({ error: genericAttorneyAccessError() });
    expect(malformed).toEqual({ error: genericAttorneyAccessError() });
  });

  it("accepts permanent grants and filters out expired legacy grants", async () => {
    const or = vi.fn();
    const query = {
      select: () => query,
      eq: () => query,
      is: () => query,
      or: (value: string) => { or(value); return query; },
      maybeSingle: async () => ({ data: null, error: null }),
    };
    const handle = sealAttorneyHandle({
      kind: "grant",
      id: "grant-1",
      subject: "attorney-1",
      expiresAt: Date.now() + 60_000,
    }, { ATTORNEY_PORTAL_SECRET: secret });

    await resolveActiveAttorneyGrant({
      supabase: { from: () => query },
      attorneyUserId: "attorney-1",
      accessHandle: handle,
    });

    expect(or).toHaveBeenCalledWith(
      expect.stringMatching(/^expires_at\.is\.null,expires_at\.gt\.\d{4}-\d{2}-\d{2}T/)
    );
  });

  it("reports audit storage failures so protected routes can fail closed", async () => {
    const insert = async () => ({ error: { message: "database unavailable" } });
    const supabase = { from: () => ({ insert }) };
    await expect(recordAttorneyAccessEvent({
      supabase,
      ownerUserId: "owner-1",
      actorUserId: "attorney-1",
      eventType: "report_downloaded",
    })).resolves.toEqual({
      ok: false,
      error: "Unable to record the required access event.",
    });
  });

  it("allowlists audit metadata and discards record contents and storage details", () => {
    expect(sanitizeAttorneyAuditMetadata({
      reportType: "combined_attorney_summary",
      route: "/api/records/attorney/portal",
      reason: "case_deleted",
      noteBody: "sensitive allegation",
      fileName: "child-name.pdf",
      rawToken: "secret",
      storagePath: "owner/case/file",
      paymentReference: "private-payment-reference",
    })).toEqual({
      reportType: "combined_attorney_summary",
      route: "/api/records/attorney/portal",
      reason: "case_deleted",
    });
  });

  it("revokes pending invitations and active grants before a case deletion can continue", async () => {
    const operations: Array<{ table: string; kind: string; value?: unknown }> = [];
    function query(table: string) {
      const chain = {
        update: (value: unknown) => { operations.push({ table, kind: "update", value }); return chain; },
        insert: (value: unknown) => { operations.push({ table, kind: "insert", value }); return chain; },
        eq: () => chain,
        in: (_column: string, value: unknown) => { operations.push({ table, kind: "in", value }); return chain; },
        is: () => chain,
        then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
      };
      return chain;
    }
    const result = await invalidateAttorneyAccessForCases({
      supabase: { from: (table: string) => query(table) },
      ownerUserId: "owner-1",
      caseIds: ["case-1"],
      reason: "case_deleted",
    });
    expect(result).toEqual({ ok: true });
    expect(operations).toContainEqual(expect.objectContaining({
      table: "records_attorney_invitations",
      kind: "update",
      value: expect.objectContaining({ status: "revoked" }),
    }));
    expect(operations).toContainEqual(expect.objectContaining({
      table: "records_attorney_grants",
      kind: "update",
      value: expect.objectContaining({ revocation_reason: "case_deleted" }),
    }));
    expect(operations).toContainEqual(expect.objectContaining({
      table: "records_attorney_access_events",
      kind: "insert",
      value: expect.objectContaining({ event_type: "case_access_invalidated" }),
    }));
  });
});
