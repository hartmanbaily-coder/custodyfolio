import { describe, expect, it } from "vitest";
import { validatePrivacyRightsEvidence } from "../scripts/privacy-rights-evidence-lib.mjs";
import { productionPolicyDocumentDigests } from "@/generated/productionPolicyBundle.mjs";

const now = "2026-08-12T12:00:00.000Z";

function validEvidence() {
  return {
    schemaVersion: 1,
    requestId: "prr_7f62c19",
    requestType: "deletion",
    receivedAt: "2026-08-01T00:00:00.000Z",
    authenticatedAt: "2026-08-01T01:00:00.000Z",
    deadlineAt: "2026-09-15T00:00:00.000Z",
    completedAt: "2026-08-02T00:00:00.000Z",
    responseSentAt: "2026-08-02T01:00:00.000Z",
    validatedBy: "Privacy operations lead",
    scopeSummary: "Synthetic full-account deletion rehearsal with no customer content.",
    inventoryReviewedAt: "2026-08-01T02:00:00.000Z",
    inventoryVersion: "2026-08-12",
    subprocessorPolicySha256: productionPolicyDocumentDigests.subprocessors,
    activeSystems: [
      "records_database",
      "private_evidence_storage",
      "auth_identity",
      "application_exports",
      "security_audit_records",
    ].map((targetId) => ({
      targetId,
      applicable: true,
      status: targetId === "security_audit_records" ? "retained_exception" : "deleted",
      completedAt: "2026-08-01T20:00:00.000Z",
      evidenceReference: `ticket-${targetId}`,
      ...(targetId === "security_audit_records"
        ? {
            rationale: "Minimized audit proof retained under the published security period.",
            retentionExpiresAt: "2027-08-01T00:00:00.000Z",
          }
        : {}),
    })),
    downstreamTargets: [
      "supabase",
      "hetzner",
      "backblaze",
      "cloudflare",
      "apple_icloud_mail",
      "resend",
      "have_i_been_pwned",
      "security_monitoring",
      "attorney_recipient_copies",
      "other_recipients",
    ].map((targetId) => ({
      targetId,
      relationship: targetId === "attorney_recipient_copies" ? "user_controlled_copy" : "processor",
      applicable: true,
      status: "acknowledged",
      noticeSentAt: "2026-08-01T10:00:00.000Z",
      acknowledgedAt: "2026-08-01T18:00:00.000Z",
      evidenceReference: `provider-${targetId}`,
      rationale: "",
    })),
    backupAging: {
      deletionReapplyRecorded: true,
      agesOutBy: "2027-01-28T00:00:00.000Z",
      evidenceReference: "deletion-ledger-prr-7f62c19",
    },
    appealInstructionsIncluded: true,
  };
}

describe("privacy-rights operational evidence", () => {
  it("accepts a fully accounted deletion request", () => {
    expect(validatePrivacyRightsEvidence(validEvidence(), now)).toEqual({ valid: true, errors: [] });
  });

  it("keeps completion fail-closed while a controlled processor is pending", () => {
    const evidence = validEvidence();
    evidence.downstreamTargets[0].status = "pending";

    const result = validatePrivacyRightsEvidence(evidence, now);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("supabase controlled downstream action is not acknowledged");
  });

  it("rejects export-only evidence for deletion and consent withdrawal", () => {
    for (const requestType of ["deletion", "consent_withdrawal"]) {
      const evidence = validEvidence();
      evidence.requestType = requestType;
      evidence.activeSystems = evidence.activeSystems.map((target) => ({
        ...target,
        status: "exported",
        rationale: "",
        retentionExpiresAt: undefined,
      }));

      const result = validatePrivacyRightsEvidence(evidence, now);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        `records_database status does not complete a ${requestType} request`
      );
    }
  });

  it("does not allow a processor to be declared outside Custody Folio control", () => {
    const evidence = validEvidence();
    evidence.downstreamTargets[0] = {
      ...evidence.downstreamTargets[0],
      status: "not_controllable",
      rationale: "Provider did not respond.",
    };

    const result = validatePrivacyRightsEvidence(evidence, now);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "supabase can be not_controllable only for a documented user-controlled copy"
    );
  });

  it("rejects backup aging beyond the published 180-day maximum", () => {
    const evidence = validEvidence();
    evidence.backupAging.agesOutBy = "2027-02-15T00:00:00.000Z";

    const result = validatePrivacyRightsEvidence(evidence, now);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("backup agesOutBy must be within 180 days after active completion");
  });

  it("rejects templates and incomplete inventory entries", () => {
    const evidence = validEvidence();
    evidence.requestId = "REPLACE_WITH_OPAQUE_REQUEST_ID";
    evidence.activeSystems = evidence.activeSystems.filter(
      (target) => target.targetId !== "private_evidence_storage"
    );

    const result = validatePrivacyRightsEvidence(evidence, now);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "requestId is missing or contains placeholder text",
        "activeSystems is missing private_evidence_storage",
      ])
    );
  });

  it("rejects evidence tied to an old subprocessor inventory", () => {
    const evidence = validEvidence();
    evidence.subprocessorPolicySha256 = "sha256:stale";

    const result = validatePrivacyRightsEvidence(evidence, now);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "subprocessorPolicySha256 does not match the current provider inventory"
    );
  });
});
