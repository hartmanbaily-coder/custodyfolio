import { describe, expect, it } from "vitest";
import {
  evaluateProductionReadiness,
  summarizeReadinessPhases,
  supabaseFinalCheckIds,
} from "@/lib/production/readiness";

const readyEnv = {
  STARTER_RESOURCE_PROFILE: "false",
  NEXT_PUBLIC_APP_URL: "https://custodyfolio.com",
  NEXT_PUBLIC_RECORDS_HOST: "custodyfolio.com",
  RECORDS_STORAGE_MODE: "supabase",
  NEXT_PUBLIC_RECORDS_STORAGE_MODE: "supabase",
  RECORDS_SIGNUPS_ENABLED: "false",
  NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED: "false",
  NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co",
  EXPECTED_SUPABASE_PROJECT_REF: "project-ref",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test_key",
  SUPABASE_SERVICE_ROLE_KEY: "server-only-service-role-key",
  AUTH_SECRET: "12345678901234567890123456789012",
  ATTORNEY_GUEST_FEATURE_ENABLED: "false",
  ATTORNEY_PORTAL_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
  ATTORNEY_INVITE_OWNER_SHARE_ENABLED: "false",
  ATTORNEY_INVITE_DEV_DELIVERY: "false",
  SUPABASE_MFA_POLICY: "required",
  RECORDS_ENFORCE_MFA: "true",
  SUPABASE_CUSTOM_SMTP_ENABLED: "true",
  SUPABASE_AUTH_REDIRECTS_VERIFIED_AT: "2026-06-10",
  SUPABASE_LEAKED_PASSWORD_PROTECTION_ENABLED: "true",
  PWNED_PASSWORD_CHECK_ENABLED: "false",
  SUPABASE_PASSWORD_MIN_LENGTH: "12",
  SUPABASE_PASSWORD_REAUTH_ENABLED: "true",
  SUPABASE_CURRENT_PASSWORD_REQUIRED: "true",
  SUPABASE_AUTH_HARDENING_VERIFIED_AT: "2026-06-10",
  RECORDS_EVIDENCE_BUCKET: "records-evidence",
  MALWARE_SCAN_PROVIDER: "clamav",
  MALWARE_SCANNER_TESTED_AT: "2026-06-10",
  SECURITY_CONTACT_EMAIL: "security@custodyfolio.com",
  PRIVACY_POLICY_URL: "https://custodyfolio.com/privacy",
  SECURITY_EVENT_SINK: "platform",
  EVIDENCE_MAX_FILE_BYTES: "10485760",
  EDGE_RATE_LIMITING_ENABLED: "true",
  EDGE_RATE_LIMITING_PROVIDER: "cloudflare",
  EDGE_WAF_ENABLED: "true",
  EDGE_WAF_PROVIDER: "cloudflare",
  EDGE_CONTROLS_TESTED_AT: "2026-06-10",
  SECURITY_MONITORING_ENABLED: "true",
  AUDIT_LOG_REVIEW_ENABLED: "true",
  BACKUP_RESTORE_TESTED_AT: "2026-06-01",
  TWO_USER_ISOLATION_TESTED_AT: "2026-06-10",
  DATA_RETENTION_POLICY_APPROVED: "true",
  INCIDENT_RESPONSE_PLAN_APPROVED: "true",
  LEGAL_REVIEW_APPROVED: "true",
  VENDOR_SECURITY_REVIEW_APPROVED: "true",
};

function fakeJwt(payload: Record<string, unknown>) {
  const encode = (input: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(input)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(payload)}.signature`;
}

describe("production readiness", () => {
  it("blocks missing production records configuration", () => {
    const report = evaluateProductionReadiness({}, "2026-06-15T00:00:00.000Z");

    expect(report.ready).toBe(false);
    expect(report.blockers.map((item) => item.id)).toContain("supabase-url");
    expect(report.blockers.map((item) => item.id)).toContain("records-storage-mode");
    expect(report.blockers.map((item) => item.id)).toContain("auth-secret");
    expect(report.blockers.map((item) => item.id)).toContain("malware-provider");
  });

  it("passes when production blockers are configured", () => {
    const report = evaluateProductionReadiness(
      readyEnv,
      "2026-06-15T00:00:00.000Z"
    );

    expect(report.ready).toBe(true);
    expect(report.blockers).toHaveLength(0);
  });

  it("requires a distinct cryptographic secret when attorney invitations are enabled", () => {
    const report = evaluateProductionReadiness({
      ...readyEnv,
      ATTORNEY_GUEST_FEATURE_ENABLED: "true",
      ATTORNEY_PORTAL_SECRET: readyEnv.AUTH_SECRET,
    }, "2026-06-15T00:00:00.000Z");

    expect(report.ready).toBe(false);
    expect(report.blockers.map((item) => item.id)).toContain("attorney-portal-secret");
  });

  it("requires owner sharing when attorney invitations are enabled", () => {
    const report = evaluateProductionReadiness({
      ...readyEnv,
      ATTORNEY_GUEST_FEATURE_ENABLED: "true",
      ATTORNEY_INVITE_OWNER_SHARE_ENABLED: "false",
    }, "2026-06-15T00:00:00.000Z");

    expect(report.ready).toBe(false);
    expect(report.blockers.map((item) => item.id)).toContain("attorney-owner-share-delivery");
  });

  it("accepts reviewed owner sharing without development delivery", () => {
    const report = evaluateProductionReadiness({
      ...readyEnv,
      ATTORNEY_GUEST_FEATURE_ENABLED: "true",
      ATTORNEY_INVITE_OWNER_SHARE_ENABLED: "true",
    }, "2026-06-15T00:00:00.000Z");

    expect(report.blockers.map((item) => item.id)).not.toContain("attorney-owner-share-delivery");
    expect(report.blockers.map((item) => item.id)).not.toContain("attorney-development-delivery");
  });

  it("requires the dedicated attorney secret even while new invitations are disabled", () => {
    const report = evaluateProductionReadiness({
      ...readyEnv,
      ATTORNEY_PORTAL_SECRET: "",
    }, "2026-06-15T00:00:00.000Z");

    expect(report.ready).toBe(false);
    expect(report.blockers.map((item) => item.id)).toContain("attorney-portal-secret");
  });

  it("accepts the app-level leaked-password guard as a free-plan compensating control", () => {
    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        SUPABASE_LEAKED_PASSWORD_PROTECTION_ENABLED: "false",
        PWNED_PASSWORD_CHECK_ENABLED: "true",
      },
      "2026-06-15T00:00:00.000Z"
    );

    expect(report.blockers.map((item) => item.id)).not.toContain("supabase-leaked-passwords");
  });

  it("warns without blocking while the 4 GiB starter profile is active", () => {
    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        STARTER_RESOURCE_PROFILE: "true",
      },
      "2026-06-15T00:00:00.000Z"
    );

    expect(report.ready).toBe(true);
    expect(report.blockers.map((item) => item.id)).not.toContain("customer-resource-profile");
    expect(report.warnings.map((item) => item.id)).toContain("customer-resource-profile");
  });

  it("does not trust edge-control flags without a recent live verification", () => {
    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        EDGE_CONTROLS_TESTED_AT: "",
      },
      "2026-06-15T00:00:00.000Z"
    );

    expect(report.ready).toBe(false);
    expect(report.blockers.map((item) => item.id)).toContain("edge-controls-tested");
  });

  it("allows non-Supabase safety gates to pass while Supabase final work is deferred", () => {
    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        RECORDS_STORAGE_MODE: "local",
        NEXT_PUBLIC_RECORDS_STORAGE_MODE: "local",
        NEXT_PUBLIC_SUPABASE_URL: "",
        EXPECTED_SUPABASE_PROJECT_REF: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
        SUPABASE_SERVICE_ROLE_KEY: "",
        SUPABASE_MFA_POLICY: "",
        RECORDS_ENFORCE_MFA: "",
        SUPABASE_CUSTOM_SMTP_ENABLED: "",
        SUPABASE_AUTH_REDIRECTS_VERIFIED_AT: "",
        SUPABASE_LEAKED_PASSWORD_PROTECTION_ENABLED: "",
        SUPABASE_PASSWORD_MIN_LENGTH: "",
        SUPABASE_PASSWORD_REAUTH_ENABLED: "",
        SUPABASE_CURRENT_PASSWORD_REQUIRED: "",
        SUPABASE_AUTH_HARDENING_VERIFIED_AT: "",
        RECORDS_EVIDENCE_BUCKET: "",
        BACKUP_RESTORE_TESTED_AT: "",
        TWO_USER_ISOLATION_TESTED_AT: "",
      },
      "2026-06-15T00:00:00.000Z"
    );
    const phases = summarizeReadinessPhases(report);

    expect(report.ready).toBe(false);
    expect(phases.preSupabaseReady).toBe(true);
    expect(phases.supabaseFinalReady).toBe(false);
    expect(phases.supabaseFinalBlockers.map((item) => item.id)).toEqual(
      expect.arrayContaining(["supabase-url", "two-user-isolation-tested"])
    );
  });

  it("documents the checks saved for the Supabase final step", () => {
    expect(supabaseFinalCheckIds).toEqual(
      expect.arrayContaining([
        "supabase-url",
        "supabase-production-project",
        "records-mfa-enforced",
        "supabase-custom-smtp",
        "supabase-auth-redirects",
        "records-evidence-bucket",
        "supabase-auth-hardening-verified",
        "two-user-isolation-tested",
      ])
    );
  });

  it("blocks HTTP malware scanners without an HTTPS endpoint", () => {
    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        MALWARE_SCAN_PROVIDER: "http",
      },
      "2026-06-15T00:00:00.000Z"
    );

    expect(report.ready).toBe(false);
    expect(report.blockers.map((item) => item.id)).toContain("malware-http-endpoint");
  });

  it("blocks the old staging Supabase project in production readiness", () => {
    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        NEXT_PUBLIC_SUPABASE_URL: "https://adhnoiicwfvppzenwcgv.supabase.co",
        EXPECTED_SUPABASE_PROJECT_REF: "cieuilbpnwuvnrxrlczj",
      },
      "2026-06-15T00:00:00.000Z"
    );

    expect(report.ready).toBe(false);
    expect(report.blockers.map((item) => item.id)).toContain("supabase-production-project");
  });

  it("blocks Supabase project URLs that do not match the expected production ref", () => {
    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        NEXT_PUBLIC_SUPABASE_URL: "https://other-project.supabase.co",
        EXPECTED_SUPABASE_PROJECT_REF: "project-ref",
      },
      "2026-06-15T00:00:00.000Z"
    );

    expect(report.ready).toBe(false);
    expect(report.blockers.map((item) => item.id)).toContain("supabase-production-project");
  });

  it("blocks Supabase project URLs when the expected production ref is missing", () => {
    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        EXPECTED_SUPABASE_PROJECT_REF: "",
      },
      "2026-06-15T00:00:00.000Z"
    );

    expect(report.ready).toBe(false);
    expect(report.blockers.map((item) => item.id)).toContain("supabase-production-project");
  });

  it("blocks placeholder Supabase public keys", () => {
    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_REPLACE_WITH_DEFAULT_PUBLISHABLE_KEY",
      },
      "2026-06-15T00:00:00.000Z"
    );

    expect(report.ready).toBe(false);
    expect(report.blockers.map((item) => item.id)).toContain("supabase-anon-key");
  });

  it("blocks service-role JWTs in the public Supabase browser key", () => {
    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt({ role: "service_role" }),
      },
      "2026-06-15T00:00:00.000Z"
    );

    expect(report.ready).toBe(false);
    expect(report.blockers.map((item) => item.id)).toContain("supabase-anon-key");
  });

  it("blocks mismatched public and server signup gates", () => {
    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        RECORDS_SIGNUPS_ENABLED: "true",
        NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED: "false",
      },
      "2026-06-15T00:00:00.000Z"
    );

    expect(report.ready).toBe(false);
    expect(report.blockers.map((item) => item.id)).toContain("records-signup-mode");
  });

  it("blocks the non-production mock malware scanner", () => {
    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        MALWARE_SCAN_PROVIDER: "mock-clean",
      },
      "2026-06-15T00:00:00.000Z"
    );

    expect(report.ready).toBe(false);
    expect(report.blockers.map((item) => item.id)).toContain("malware-provider");
  });

  it("blocks missing privacy and operational controls", () => {
    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        SUPABASE_MFA_POLICY: "optional",
        RECORDS_ENFORCE_MFA: "false",
        SUPABASE_CUSTOM_SMTP_ENABLED: "false",
        SUPABASE_AUTH_REDIRECTS_VERIFIED_AT: "2026-01-01",
        SUPABASE_LEAKED_PASSWORD_PROTECTION_ENABLED: "false",
        SUPABASE_AUTH_HARDENING_VERIFIED_AT: "2026-01-01",
        MALWARE_SCANNER_TESTED_AT: "2026-01-01",
        EDGE_RATE_LIMITING_ENABLED: "false",
        EDGE_RATE_LIMITING_PROVIDER: "",
        EDGE_WAF_PROVIDER: "",
        EDGE_CONTROLS_TESTED_AT: "2026-01-01",
        SECURITY_MONITORING_ENABLED: "false",
        SECURITY_EVENT_SINK: "",
        BACKUP_RESTORE_TESTED_AT: "2025-01-01",
        TWO_USER_ISOLATION_TESTED_AT: "2026-01-01",
        DATA_RETENTION_POLICY_APPROVED: "false",
        INCIDENT_RESPONSE_PLAN_APPROVED: "false",
        LEGAL_REVIEW_APPROVED: "false",
        PRIVACY_POLICY_URL: "http://custodyfolio.com/privacy",
      },
      "2026-06-15T00:00:00.000Z"
    );

    expect(report.ready).toBe(false);
    expect(report.blockers.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "supabase-mfa-policy",
        "records-mfa-enforced",
        "supabase-custom-smtp",
        "supabase-auth-redirects",
        "supabase-leaked-passwords",
        "supabase-auth-hardening-verified",
        "malware-scanner-tested",
        "edge-rate-limits",
        "edge-waf",
        "edge-controls-tested",
        "security-monitoring",
        "security-event-sink",
        "backup-restore-tested",
        "two-user-isolation-tested",
        "data-retention-policy",
        "incident-response-plan",
        "legal-review",
        "privacy-policy",
      ])
    );
  });
});
