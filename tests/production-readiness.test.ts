import { describe, expect, it } from "vitest";
import {
  evaluateProductionReadiness,
  summarizeReadinessPhases,
  supabaseFinalCheckIds,
} from "@/lib/production/readiness";
import {
  encodeProductionApprovalManifest,
  requiredIncidentContactRoles,
  requiredSoloOperatorServiceEscalations,
} from "@/lib/production/approvalEvidence.mjs";
import {
  productionPolicyBundleSha256,
  productionPolicyDocumentDigests,
} from "@/generated/productionPolicyBundle.mjs";
import { publicLegalClausesAreOperative } from "@/lib/legalRelease";

function validApprovalManifest() {
  const common = {
    decision: "approved",
    approvedAt: "2026-06-01T00:00:00.000Z",
    reviewValidUntil: "2027-06-15T00:00:00.000Z",
    limitations: [],
    documents: { ...productionPolicyDocumentDigests },
  };

  return {
    schemaVersion: 1,
    policyBundleSha256: productionPolicyBundleSha256,
    approvals: {
      retention: {
        ...common,
        approvedBy: "Privacy operations lead",
        approverRole: "privacy_operations_owner",
        scope: "Retention, deletion, processor notification, and backup aging operations.",
        rightsRequestWorkflowTestedAt: "2026-06-01T00:00:00.000Z",
      },
      incident: {
        ...common,
        approvedBy: "Incident response lead",
        approverRole: "incident_response_owner",
        scope: "Security and privacy incident response, recovery, and notification analysis.",
        tabletopTestedAt: "2026-06-01T00:00:00.000Z",
        contactsValidatedAt: "2026-06-01T00:00:00.000Z",
        contacts: requiredIncidentContactRoles.map((role) => ({
          role,
          name: `Named responder ${role}`,
          primaryChannel: {
            type: "email",
            value: `primary-${role}@custodyfolio.com`,
          },
          backupChannel: {
            type: "phone",
            value: `backup-${role}-phone`,
          },
          testedAt: "2026-06-01T00:00:00.000Z",
        })),
      },
      legal: {
        ...common,
        approvedBy: "Independent privacy counsel",
        approverRole: "qualified_counsel",
        reviewerOrganization: "North Counsel PLLC",
        licenseJurisdictions: ["Synthetic jurisdiction"],
        scope: "Privacy, terms, retention, incident response, and launch jurisdiction.",
      },
    },
  };
}

function validSoloOperatorApprovalManifest() {
  const manifest = validApprovalManifest();
  const incident = Object.fromEntries(
    Object.entries(manifest.approvals.incident).filter(([key]) => key !== "contacts")
  );
  return {
    ...manifest,
    approvals: {
      ...manifest.approvals,
      incident: {
        ...incident,
        operatingModel: "solo_operator",
        limitations: [
          "No alternate human responder is currently designated; response may be delayed if the operator is unavailable.",
          "No retained legal or forensics provider is represented.",
        ],
        acceptedNoAlternateHumanResponder: true,
        soloOperator: {
          name: "Named solo operator",
          primaryChannel: {
            type: "email",
            value: "operator@provider.test",
          },
          testedAt: "2026-06-01T00:00:00.000Z",
        },
        serviceEscalations: requiredSoloOperatorServiceEscalations.map((service) => ({
          service,
          provider: `Provider for ${service}`,
          channel: {
            type: "vendor_portal",
            value: `https://provider.test/support/${service}`,
          },
          testedAt: "2026-06-01T00:00:00.000Z",
        })),
      },
    },
  };
}

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
  OFFSITE_STORAGE_BACKUP_ENABLED: "true",
  OFFSITE_STORAGE_BACKUP_RETENTION_DAYS: "178",
  OFFSITE_STORAGE_BACKUP_LIFECYCLE_DELETE_DAYS: "1",
  OFFSITE_STORAGE_BACKUP_KEY_EXPIRES_AT: "2027-08-10",
  BACKUP_RESTORE_TESTED_AT: "2026-06-01",
  TWO_USER_ISOLATION_TESTED_AT: "2026-06-10",
  DATA_RETENTION_POLICY_APPROVED: "true",
  INCIDENT_RESPONSE_PLAN_APPROVED: "true",
  LEGAL_REVIEW_APPROVED: "true",
  PRODUCTION_APPROVAL_MANIFEST_BASE64: encodeProductionApprovalManifest(validApprovalManifest()),
  VENDOR_SECURITY_REVIEW_APPROVED: "true",
};

function expectReadyApartFromPendingPublicClauses(
  report: ReturnType<typeof evaluateProductionReadiness>,
  env: Record<string, string | undefined>
) {
  const publicClausesReady = publicLegalClausesAreOperative(env);
  expect(report.ready).toBe(publicClausesReady);
  expect(report.blockers.map((item) => item.id)).toEqual(
    publicClausesReady ? [] : ["public-legal-clauses"]
  );
}

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

  it("keeps growth measurement disabled by default", () => {
    const report = evaluateProductionReadiness(
      readyEnv,
      "2026-06-15T00:00:00.000Z"
    );
    const analytics = report.checks.find(
      (item) => item.id === "marketing-analytics-privacy"
    );

    expect(analytics?.ready).toBe(true);
  });

  it("requires a strong secret and approved retention before growth measurement", () => {
    const weakSecret = evaluateProductionReadiness(
      {
        ...readyEnv,
        MARKETING_ANALYTICS_ENABLED: "true",
        MARKETING_ANALYTICS_SECRET: "short",
      },
      "2026-06-15T00:00:00.000Z"
    );
    const missingRetention = evaluateProductionReadiness(
      {
        ...readyEnv,
        MARKETING_ANALYTICS_ENABLED: "true",
        MARKETING_ANALYTICS_SECRET: "01234567890123456789012345678901",
        DATA_RETENTION_POLICY_APPROVED: "false",
      },
      "2026-06-15T00:00:00.000Z"
    );

    expect(weakSecret.blockers.map((item) => item.id)).toContain(
      "marketing-analytics-privacy"
    );
    expect(missingRetention.blockers.map((item) => item.id)).toContain(
      "marketing-analytics-privacy"
    );
  });

  it("requires recent schema verification before measurement or feedback activation", () => {
    const analytics = evaluateProductionReadiness(
      {
        ...readyEnv,
        MARKETING_ANALYTICS_ENABLED: "true",
        MARKETING_ANALYTICS_SECRET: "01234567890123456789012345678901",
      },
      "2026-06-15T00:00:00.000Z"
    );
    const feedback = evaluateProductionReadiness(
      {
        ...readyEnv,
        CUSTOMER_FEEDBACK_INVITE_ENABLED: "true",
      },
      "2026-06-15T00:00:00.000Z"
    );
    const verified = evaluateProductionReadiness(
      {
        ...readyEnv,
        CUSTOMER_FEEDBACK_INVITE_ENABLED: "true",
        CUSTOMER_GROWTH_SCHEMA_VERIFIED_AT: "2026-06-10",
      },
      "2026-06-15T00:00:00.000Z"
    );

    expect(analytics.blockers.map((item) => item.id)).toContain(
      "customer-growth-schema"
    );
    expect(feedback.blockers.map((item) => item.id)).toContain(
      "customer-growth-schema"
    );
    expect(verified.blockers.map((item) => item.id)).not.toContain(
      "customer-growth-schema"
    );
  });

  it("allows attorney access when its policy and operational controls are enabled", () => {
    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        ATTORNEY_GUEST_FEATURE_ENABLED: "true",
        ATTORNEY_INVITE_OWNER_SHARE_ENABLED: "true",
      },
      "2026-06-15T00:00:00.000Z"
    );

    expectReadyApartFromPendingPublicClauses(report, {
      ...readyEnv,
      ATTORNEY_GUEST_FEATURE_ENABLED: "true",
      ATTORNEY_INVITE_OWNER_SHARE_ENABLED: "true",
    });
  });

  it("does not accept approval booleans without structured evidence", () => {
    const report = evaluateProductionReadiness(
      { ...readyEnv, PRODUCTION_APPROVAL_MANIFEST_BASE64: "" },
      "2026-06-15T00:00:00.000Z"
    );

    expect(report.blockers.map((item) => item.id)).toEqual(
      expect.arrayContaining(["data-retention-policy", "incident-response-plan", "legal-review"])
    );
  });

  it("invalidates approval evidence when an approved document digest changes", () => {
    const manifest = validApprovalManifest();
    manifest.approvals.retention.documents.privacy = "sha256:stale";

    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        PRODUCTION_APPROVAL_MANIFEST_BASE64: encodeProductionApprovalManifest(manifest),
      },
      "2026-06-15T00:00:00.000Z"
    );

    expect(report.blockers.map((item) => item.id)).toContain("data-retention-policy");
  });

  it("requires qualified counsel for legal approval", () => {
    const manifest = validApprovalManifest();
    manifest.approvals.legal.approverRole = "product_owner";

    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        PRODUCTION_APPROVAL_MANIFEST_BASE64: encodeProductionApprovalManifest(manifest),
      },
      "2026-06-15T00:00:00.000Z"
    );

    expect(report.blockers.map((item) => item.id)).toContain("legal-review");
  });

  it("requires every named incident responder and independent tested channels", () => {
    const manifest = validApprovalManifest();
    manifest.approvals.incident.contacts = manifest.approvals.incident.contacts.slice(1);

    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        PRODUCTION_APPROVAL_MANIFEST_BASE64: encodeProductionApprovalManifest(manifest),
      },
      "2026-06-15T00:00:00.000Z"
    );

    expect(report.blockers.map((item) => item.id)).toContain("incident-response-plan");
  });

  it("accepts a disclosed solo operator with no phone and tested provider escalations", () => {
    const manifest = validSoloOperatorApprovalManifest();
    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        PRODUCTION_APPROVAL_MANIFEST_BASE64: encodeProductionApprovalManifest(manifest),
      },
      "2026-06-15T00:00:00.000Z"
    );

    expectReadyApartFromPendingPublicClauses(report, readyEnv);
    expect(JSON.stringify(manifest.approvals.incident)).not.toContain('"phone"');
  });

  it("rejects a solo operator plan that hides the lack of an alternate responder", () => {
    const manifest = validSoloOperatorApprovalManifest();
    manifest.approvals.incident.acceptedNoAlternateHumanResponder = false;
    manifest.approvals.incident.limitations = [];

    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        PRODUCTION_APPROVAL_MANIFEST_BASE64: encodeProductionApprovalManifest(manifest),
      },
      "2026-06-15T00:00:00.000Z"
    );

    expect(report.blockers.map((item) => item.id)).toContain("incident-response-plan");
  });

  it("rejects a solo operator plan with an untested provider escalation", () => {
    const manifest = validSoloOperatorApprovalManifest();
    manifest.approvals.incident.serviceEscalations =
      manifest.approvals.incident.serviceEscalations.slice(1);

    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        PRODUCTION_APPROVAL_MANIFEST_BASE64: encodeProductionApprovalManifest(manifest),
      },
      "2026-06-15T00:00:00.000Z"
    );

    expect(report.blockers.map((item) => item.id)).toContain("incident-response-plan");
  });

  it("requires the exact same-origin privacy route without query or fragment", () => {
    for (const invalidUrl of [
      "https://other.example/privacy",
      "https://custodyfolio.com/privacy?draft=true",
      "https://custodyfolio.com/privacy#old",
    ]) {
      const report = evaluateProductionReadiness(
        { ...readyEnv, PRIVACY_POLICY_URL: invalidUrl },
        "2026-06-15T00:00:00.000Z"
      );
      expect(report.blockers.map((item) => item.id)).toContain("privacy-policy");
    }
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

  it("does not require an attorney secret while attorney access is disabled", () => {
    const report = evaluateProductionReadiness({
      ...readyEnv,
      ATTORNEY_PORTAL_SECRET: "",
    }, "2026-06-15T00:00:00.000Z");

    expectReadyApartFromPendingPublicClauses(report, {
      ...readyEnv,
      ATTORNEY_PORTAL_SECRET: "",
    });
    expect(report.blockers.map((item) => item.id)).not.toContain("attorney-portal-secret");
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

    expectReadyApartFromPendingPublicClauses(report, {
      ...readyEnv,
      STARTER_RESOURCE_PROFILE: "true",
    });
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

  it("blocks launch without a bounded immutable off-site evidence backup", () => {
    const report = evaluateProductionReadiness(
      {
        ...readyEnv,
        OFFSITE_STORAGE_BACKUP_ENABLED: "false",
        OFFSITE_STORAGE_BACKUP_RETENTION_DAYS: "179",
        OFFSITE_STORAGE_BACKUP_LIFECYCLE_DELETE_DAYS: "2",
        OFFSITE_STORAGE_BACKUP_KEY_EXPIRES_AT: "2026-06-20",
      },
      "2026-06-15T00:00:00.000Z"
    );

    expect(report.ready).toBe(false);
    expect(report.blockers.map((item) => item.id)).toContain("offsite-storage-backup");
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
        OFFSITE_STORAGE_BACKUP_ENABLED: "",
        OFFSITE_STORAGE_BACKUP_RETENTION_DAYS: "",
        OFFSITE_STORAGE_BACKUP_LIFECYCLE_DELETE_DAYS: "",
        OFFSITE_STORAGE_BACKUP_KEY_EXPIRES_AT: "",
        BACKUP_RESTORE_TESTED_AT: "",
        TWO_USER_ISOLATION_TESTED_AT: "",
      },
      "2026-06-15T00:00:00.000Z"
    );
    const phases = summarizeReadinessPhases(report);

    expect(report.ready).toBe(false);
    const publicClausesReady = publicLegalClausesAreOperative(readyEnv);
    expect(phases.preSupabaseReady).toBe(publicClausesReady);
    expect(phases.preSupabaseBlockers.map((item) => item.id)).toEqual(
      publicClausesReady ? [] : ["public-legal-clauses"]
    );
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
        "customer-growth-schema",
        "records-evidence-bucket",
        "offsite-storage-backup",
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
