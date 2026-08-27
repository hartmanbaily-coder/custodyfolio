import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  productionPolicyBundleSha256,
  productionPolicyDocumentDigests,
} from "../src/generated/productionPolicyBundle.mjs";
import {
  requiredApprovalDocuments,
  requiredIncidentContactRoles,
} from "../src/lib/production/approvalEvidence.mjs";

const outputPath = path.resolve(
  process.cwd(),
  process.env.PRODUCTION_APPROVAL_MANIFEST_FILE || "ops/production-approval-manifest.json"
);

try {
  await access(outputPath);
  console.error(`Refusing to overwrite existing approval manifest at ${outputPath}.`);
  process.exit(1);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const documentsFor = (approval) => Object.fromEntries(
  requiredApprovalDocuments[approval].map((id) => [id, productionPolicyDocumentDigests[id]])
);
const contact = (role) => ({
  role,
  name: "REPLACE_WITH_NAMED_RESPONDER",
  primaryChannel: {
    type: "email",
    value: "REPLACE_WITH_PRIMARY_CHANNEL",
  },
  backupChannel: {
    type: "phone",
    value: "REPLACE_WITH_INDEPENDENT_BACKUP_CHANNEL",
  },
  testedAt: "YYYY-MM-DD",
});

const template = {
  schemaVersion: 1,
  policyBundleSha256: productionPolicyBundleSha256,
  approvals: {
    retention: {
      decision: "pending",
      approvedBy: "REPLACE_WITH_REVIEWER_NAME",
      approverRole: "privacy_operations_owner",
      approvedAt: "YYYY-MM-DD",
      reviewValidUntil: "YYYY-MM-DD",
      scope: "Retention, active deletion, backup aging, vendor deletion, and privacy-rights operations.",
      limitations: [],
      rightsRequestWorkflowTestedAt: "YYYY-MM-DD",
      documents: documentsFor("retention"),
    },
    incident: {
      decision: "pending",
      approvedBy: "REPLACE_WITH_REVIEWER_NAME",
      approverRole: "incident_response_owner",
      approvedAt: "YYYY-MM-DD",
      reviewValidUntil: "YYYY-MM-DD",
      scope: "Incident containment, escalation, notification analysis, recovery, and exercises.",
      limitations: [],
      tabletopTestedAt: "YYYY-MM-DD",
      contactsValidatedAt: "YYYY-MM-DD",
      contacts: requiredIncidentContactRoles.map(contact),
      documents: documentsFor("incident"),
    },
    legal: {
      decision: "pending",
      approvedBy: "REPLACE_WITH_OPERATOR_NAME",
      approverRole: "product_owner",
      reviewBasis: "operator_self_review",
      counselReviewStatus: "not_obtained",
      approvedAt: "YYYY-MM-DD",
      reviewValidUntil: "YYYY-MM-DD",
      scope: "Privacy, terms, health-data, deletion, retention, incident-response, and launch footprint.",
      limitations: [],
      documents: documentsFor("legal"),
    },
  },
};

await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
await writeFile(outputPath, `${JSON.stringify(template, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
console.log(`Created protected approval manifest template at ${outputPath}.`);
console.log("Fill the real approvals, then run npm run verify:approvals.");
