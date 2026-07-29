import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  attorneyEmailHash,
  createAttorneyInvitationToken,
  hashAttorneyInvitationToken,
  isAttorneyInvitationToken,
  openAttorneyHandle,
  protectAttorneyEmail,
  revealAttorneyEmail,
  sealAttorneyHandle,
} from "@/lib/records/attorneyCrypto";
import { projectSharedCaseDataset } from "@/lib/records/attorneyProjection";
import { createRecordsSeed, demoCaseId, demoUserId } from "@/lib/records/seed";
import { createRecordsCsrfToken, recordsCsrfCookieName, verifyRecordsCsrf } from "@/lib/security/csrf";

const env = { ATTORNEY_PORTAL_SECRET: "a-very-long-test-secret-that-is-not-for-production" };

describe("attorney invitation cryptography", () => {
  it("does not reuse the general authentication secret as a fallback", () => {
    expect(() => protectAttorneyEmail("counsel@example.com", {
      AUTH_SECRET: "general-auth-secret-that-is-long-enough-but-not-approved",
    })).toThrow("Attorney portal cryptographic secret is not configured.");
  });

  it("encrypts invited email addresses and uses deterministic keyed hashes", () => {
    const protectedEmail = protectAttorneyEmail(" Counsel@Example.COM ", env);
    expect(protectedEmail.ciphertext).not.toContain("counsel");
    expect(revealAttorneyEmail(protectedEmail, env)).toBe("counsel@example.com");
    expect(protectedEmail.hash).toBe(attorneyEmailHash("counsel@example.com", env));
    expect(protectedEmail.hash).not.toBe(attorneyEmailHash("other@example.com", env));
  });

  it("creates high-entropy tokens and stores only a one-way token hash", () => {
    const token = createAttorneyInvitationToken();
    expect(isAttorneyInvitationToken(token)).toBe(true);
    expect(hashAttorneyInvitationToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashAttorneyInvitationToken(token)).not.toContain(token);
  });

  it("binds opaque handles to role, account, integrity, and expiration", () => {
    const handle = sealAttorneyHandle({
      kind: "grant",
      id: "grant-internal",
      subject: "attorney-1",
      expiresAt: Date.now() + 10_000,
    }, env);
    expect(openAttorneyHandle(handle, { kind: "grant", subject: "attorney-1" }, env)?.id)
      .toBe("grant-internal");
    expect(openAttorneyHandle(handle, { kind: "grant", subject: "attorney-2" }, env)).toBeNull();
    expect(openAttorneyHandle(`${handle}x`, { kind: "grant", subject: "attorney-1" }, env)).toBeNull();
    const expired = sealAttorneyHandle({
      kind: "grant",
      id: "grant-internal",
      subject: "attorney-1",
      expiresAt: Date.now() - 1,
    }, env);
    expect(openAttorneyHandle(expired, { kind: "grant", subject: "attorney-1" }, env)).toBeNull();
  });
});

describe("attorney read-only projection", () => {
  it("includes only the granted case and removes owner/storage/internal identifiers", () => {
    const dataset = createRecordsSeed();
    dataset.dateNotes.push({
      ...dataset.dateNotes[0],
      id: "other-note-secret-id",
      caseId: "other-case",
      title: "Other case must not appear",
    });
    dataset.evidenceItems[0] = {
      ...dataset.evidenceItems[0],
      displayFileName: "May exchange evidence.pdf",
      storagePath: `${demoUserId}/${demoCaseId}/private/path`,
      storageSha256: "secret-hash",
      storageBucket: "private-bucket",
      storedFileName: "internal-name.pdf",
    };
    const projection = projectSharedCaseDataset(
      dataset,
      demoUserId,
      demoCaseId,
      (id) => `opaque-${id}`
    );
    expect(projection).not.toBeNull();
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain("Other case must not appear");
    expect(serialized).not.toContain("other-note-secret-id");
    expect(serialized).not.toContain("private/path");
    expect(serialized).not.toContain("secret-hash");
    expect(serialized).not.toContain("private-bucket");
    expect(serialized).not.toContain("internal-name.pdf");
    expect(serialized).not.toContain(demoUserId);
    expect(projection?.dataset.auditLogs).toEqual([]);
    expect(projection?.evidence[0].downloadHandle).toContain("opaque-");
    expect(projection?.evidence[0].displayFileName).toBe("May exchange evidence.pdf");
    expect(projection?.evidence[0].originalFileName).toBe(
      dataset.evidenceItems[0].originalFileName
    );
  });
});

describe("attorney CSRF protection", () => {
  it("requires matching double-submit tokens and a same-origin request", () => {
    const token = createRecordsCsrfToken();
    const accepted = new NextRequest("https://custodyfolio.com/api/records/attorney/portal/action", {
      method: "POST",
      headers: {
        Origin: "https://custodyfolio.com",
        Cookie: `${recordsCsrfCookieName}=${token}`,
        "X-L2F-CSRF": token,
      },
    });
    expect(verifyRecordsCsrf(accepted)).toEqual({ ok: true });

    const rejected = new NextRequest("https://custodyfolio.com/api/records/attorney/portal/action", {
      method: "POST",
      headers: {
        Origin: "https://attacker.example",
        Cookie: `${recordsCsrfCookieName}=${token}`,
        "X-L2F-CSRF": token,
      },
    });
    expect(verifyRecordsCsrf(rejected)).toMatchObject({ ok: false });
  });
});

describe("attorney migration controls", () => {
  it("enforces single-use, expiry, email binding, one active guest, and service-role-only access", async () => {
    const sql = await readFile(
      new URL("../supabase/migrations/20260718055611_attorney_portal_access.sql", import.meta.url),
      "utf8"
    );
    expect(sql).toContain("invitation.status <> 'pending'");
    expect(sql).toContain("invitation.expires_at <= now()");
    expect(sql).toContain("created_grant.expires_at");
    expect(sql).toContain("now() + interval '7 days'");
    expect(sql).toContain("g.expires_at > now()");
    expect(sql).toContain("'access_expired'");
    expect(sql).toContain("invitation.invited_email_hash <> p_invited_email_hash");
    expect(sql).toContain("records_attorney_one_active_guest_per_owner_idx");
    expect(sql).toContain("records_attorney_one_pending_invite_per_owner_idx");
    expect(sql).toContain("for update");
    expect(sql).toContain("revoke all on");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("security definer");
    expect(sql).toContain("revoke_records_attorney_invitation");
    expect(sql).toContain("revocation_reason = 'owner_revoked'");
    expect(sql).toContain("set status = 'replaced', replaced_at = now()");

    const durationMigration = await readFile(
      new URL(
        "../supabase/migrations/20260721215319_extend_attorney_access_to_30_days.sql",
        import.meta.url
      ),
      "utf8"
    );
    expect(durationMigration).toContain("now() + interval '30 days'");
    expect(durationMigration).not.toContain("update public.records_attorney_grants\nset expires_at");
    expect(durationMigration).toContain("for update");
    expect(durationMigration).toContain("invitation.status <> 'pending'");
    expect(durationMigration).toContain("invitation.expires_at <= now()");
    expect(durationMigration).toContain(
      "invitation.invited_email_hash <> p_invited_email_hash"
    );
    expect(durationMigration).toContain("invitation.owner_user_id = p_attorney_user_id");
    expect(durationMigration).toContain("expires_at > now()");
    expect(durationMigration).toContain("revoked_at is null");
    expect(durationMigration).toContain("left_at is null");
    expect(durationMigration).toContain("permission_scope");
    expect(durationMigration).toContain("'read_only'");
    expect(durationMigration).toContain("security definer");
    expect(durationMigration).toContain("revoke all on function");
    expect(durationMigration).toContain("from public, anon, authenticated");
    expect(durationMigration).toContain("to service_role");
    expect(durationMigration).toContain("onboarding_token_hash");
    expect(durationMigration).toContain("onboarding_expires_at > now()");
    expect(durationMigration).toContain("onboarding_password_required");
    expect(durationMigration).toContain("onboarding_password_established_at");
    expect(durationMigration).toContain("credential_version");
    expect(durationMigration).toContain("complete_records_attorney_onboarding");
    expect(durationMigration).toContain("complete_records_attorney_password_setup");
    expect(durationMigration).toContain("insert into public.records_profiles");
    expect(durationMigration).toContain("on conflict (user_id) do update");
    expect(durationMigration).toMatch(
      /if not p_password_setup_required then\s+insert into public\.records_profiles/
    );
    expect(durationMigration).toMatch(
      /complete_records_attorney_password_setup\([\s\S]*?if not found then[\s\S]*?insert into public\.records_profiles/
    );
    expect(durationMigration).toContain(
      "complete_records_attorney_password_setup(uuid, text, uuid, text, text, text)"
    );
    expect(durationMigration).toContain(
      "revoke all on function public.complete_records_attorney_onboarding"
    );

    const productionSchema = await readFile(
      new URL("../database/supabase/production_schema.sql", import.meta.url),
      "utf8"
    );
    expect(productionSchema).toContain("now(), now() + interval '30 days'");
  });

  it("keeps the attorney portal and all protected APIs out of service-worker caches", async () => {
    const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
    expect(serviceWorker).toContain('"/api/"');
    expect(serviceWorker).toContain('"/attorney"');
    expect(serviceWorker).toContain("PRIVATE_PREFIXES.some");
  });
});
