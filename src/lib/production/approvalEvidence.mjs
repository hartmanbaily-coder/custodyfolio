import {
  productionPolicyBundleSha256,
  productionPolicyDocumentDigests,
} from "../../generated/productionPolicyBundle.mjs";

export const requiredApprovalDocuments = {
  retention: [
    "privacy",
    "consumerHealthData",
    "subprocessors",
    "dataRetentionRunbook",
    "privacyRightsOperations",
    "billingOperationsRunbook",
    "billingLaunchChecklist",
  ],
  incident: [
    "privacy",
    "consumerHealthData",
    "dataRetentionRunbook",
    "incidentResponseRunbook",
    "monitoringRunbook",
  ],
  legal: [
    "privacy",
    "terms",
    "consumerHealthData",
    "subprocessors",
    "dataRetentionRunbook",
    "incidentResponseRunbook",
    "monitoringRunbook",
    "legalReviewPacket",
    "privacyRightsOperations",
    "billingOperationsRunbook",
    "billingLaunchChecklist",
  ],
};

export const requiredIncidentContactRoles = [
  "incident_commander_primary",
  "incident_commander_backup",
  "engineering",
  "supabase",
  "infrastructure",
  "communications_support",
  "forensics_vendor",
  "backup_restore",
  "legal_privacy",
];

export const requiredSoloOperatorServiceEscalations = [
  "supabase",
  "hosting",
  "edge_network",
  "backup_storage",
  "business_email",
];

const placeholderPattern = /(?:replace|placeholder|example|tbd|todo|unassigned|unknown)/i;
const dayMs = 24 * 60 * 60 * 1000;

function meaningfulText(value) {
  return typeof value === "string" && value.trim().length >= 2 && !placeholderPattern.test(value);
}

function validPastDate(value, now) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= now;
}

function validFutureDate(value, now) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > now && parsed - now <= 366 * dayMs;
}

function recentDate(value, now, maximumDays) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= now && now - parsed <= maximumDays * dayMs;
}

function validEmail(value) {
  return meaningfulText(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validHttpsUrl(value) {
  if (!meaningfulText(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function decodeManifest(encoded) {
  if (typeof encoded !== "string" || !encoded.trim()) {
    throw new Error("Production approval manifest is not configured.");
  }
  const normalized = encoded.trim();
  if (normalized.length > 262_144) {
    throw new Error("Production approval manifest exceeds the size limit.");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error("Production approval manifest is not valid base64url.");
  }
  const decoded = Buffer.from(normalized, "base64url");
  if (decoded.toString("base64url") !== normalized) {
    throw new Error("Production approval manifest encoding is not canonical.");
  }
  const manifest = JSON.parse(decoded.toString("utf8"));
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Production approval manifest must be a JSON object.");
  }
  return manifest;
}

export function encodeProductionApprovalManifest(manifest) {
  return Buffer.from(JSON.stringify(manifest), "utf8").toString("base64url");
}

function validateDocuments(approval, requiredIds, errors) {
  if (!approval.documents || typeof approval.documents !== "object") {
    errors.push("reviewed document digests are missing");
    return;
  }
  for (const id of requiredIds) {
    if (approval.documents[id] !== productionPolicyDocumentDigests[id]) {
      errors.push(`${id} is not approved at the deployed digest`);
    }
  }
}

function validateCommonApproval(approval, expectedRoles, requiredIds, now, errors) {
  if (!approval || typeof approval !== "object") {
    errors.push("approval record is missing");
    return;
  }
  if (approval.decision !== "approved") errors.push("decision is not approved");
  if (!meaningfulText(approval.approvedBy)) errors.push("approvedBy is missing or a placeholder");
  if (!expectedRoles.includes(approval.approverRole)) errors.push("approverRole is not authorized");
  if (!validPastDate(approval.approvedAt, now) || !recentDate(approval.approvedAt, now, 365)) {
    errors.push("approvedAt is invalid or older than 365 days");
  }
  if (!validFutureDate(approval.reviewValidUntil, now)) {
    errors.push("reviewValidUntil is missing, expired, or more than 366 days away");
  }
  if (!meaningfulText(approval.scope)) errors.push("approval scope is missing");
  if (!Array.isArray(approval.limitations)) errors.push("approval limitations must be recorded as an array");
  validateDocuments(approval, requiredIds, errors);
}

function validateRetention(approval, now) {
  const errors = [];
  validateCommonApproval(
    approval,
    ["privacy_operations_owner", "product_owner"],
    requiredApprovalDocuments.retention,
    now,
    errors
  );
  if (!recentDate(approval?.rightsRequestWorkflowTestedAt, now, 180)) {
    errors.push("privacy rights workflow rehearsal is older than 180 days or missing");
  }
  return { ready: errors.length === 0, errors };
}

function validateIncident(approval, now) {
  const errors = [];
  validateCommonApproval(
    approval,
    ["incident_response_owner"],
    requiredApprovalDocuments.incident,
    now,
    errors
  );
  if (!recentDate(approval?.tabletopTestedAt, now, 180)) {
    errors.push("incident-response tabletop is older than 180 days or missing");
  }
  if (!recentDate(approval?.contactsValidatedAt, now, 90)) {
    errors.push("incident contacts were not validated within 90 days");
  }

  if (approval?.operatingModel === "solo_operator") {
    const operator = approval?.soloOperator;
    if (!meaningfulText(operator?.name)) {
      errors.push("solo operator name is missing or a placeholder");
    }
    if (operator?.primaryChannel?.type !== "email" || !validEmail(operator?.primaryChannel?.value)) {
      errors.push("solo operator monitored email is missing or invalid");
    }
    if (!recentDate(operator?.testedAt, now, 90)) {
      errors.push("solo operator contact test is stale or missing");
    }
    if (approval?.acceptedNoAlternateHumanResponder !== true) {
      errors.push("solo operator must explicitly accept that no alternate human responder is designated");
    }
    if (
      !Array.isArray(approval?.limitations) ||
      !approval.limitations.some(
        (value) => meaningfulText(value) && /no alternate human responder/i.test(value)
      )
    ) {
      errors.push("solo-operator limitations must disclose the lack of an alternate human responder");
    }

    const escalations = Array.isArray(approval?.serviceEscalations)
      ? approval.serviceEscalations
      : [];
    for (const service of requiredSoloOperatorServiceEscalations) {
      const escalation = escalations.find((candidate) => candidate?.service === service);
      if (!escalation) {
        errors.push(`${service} service escalation is missing`);
        continue;
      }
      if (!meaningfulText(escalation.provider)) {
        errors.push(`${service} service escalation provider is missing or a placeholder`);
      }
      if (escalation.channel?.type !== "vendor_portal" || !validHttpsUrl(escalation.channel?.value)) {
        errors.push(`${service} service escalation portal is missing or invalid`);
      }
      if (!recentDate(escalation.testedAt, now, 90)) {
        errors.push(`${service} service escalation test is stale or missing`);
      }
    }
    return { ready: errors.length === 0, errors };
  }

  const contacts = Array.isArray(approval?.contacts) ? approval.contacts : [];
  for (const role of requiredIncidentContactRoles) {
    const contact = contacts.find((candidate) => candidate?.role === role);
    if (!contact) {
      errors.push(`${role} contact is missing`);
      continue;
    }
    if (!meaningfulText(contact.name)) errors.push(`${role} name is missing or a placeholder`);
    const channelTypes = ["email", "phone", "pager", "secure_chat", "vendor_portal"];
    const primaryType = contact.primaryChannel?.type;
    const backupType = contact.backupChannel?.type;
    if (!channelTypes.includes(primaryType) || !meaningfulText(contact.primaryChannel?.value)) {
      errors.push(`${role} primary channel is missing or invalid`);
    }
    if (!channelTypes.includes(backupType) || !meaningfulText(contact.backupChannel?.value)) {
      errors.push(`${role} backup channel is missing or invalid`);
    }
    if (primaryType === backupType) {
      errors.push(`${role} primary and backup channels must use independent channel types`);
    }
    if (!recentDate(contact.testedAt, now, 90)) errors.push(`${role} contact test is stale or missing`);
  }
  return { ready: errors.length === 0, errors };
}

function validateLegal(approval, now) {
  const errors = [];
  validateCommonApproval(
    approval,
    ["qualified_counsel", "product_owner"],
    requiredApprovalDocuments.legal,
    now,
    errors
  );
  if (approval?.approverRole === "qualified_counsel") {
    if (!meaningfulText(approval?.reviewerOrganization)) {
      errors.push("reviewer organization is missing or a placeholder");
    }
    if (
      !Array.isArray(approval?.licenseJurisdictions) ||
      approval.licenseJurisdictions.length === 0 ||
      approval.licenseJurisdictions.some((value) => !meaningfulText(value))
    ) {
      errors.push("counsel license jurisdiction is missing");
    }
  } else if (
    approval?.reviewBasis !== "operator_self_review" ||
    approval?.counselReviewStatus !== "not_obtained"
  ) {
    errors.push(
      "operator legal approval must disclose operator_self_review and counsel review not_obtained"
    );
  }
  return { ready: errors.length === 0, errors };
}

export function evaluateProductionApprovalEvidence(encoded, generatedAt = new Date().toISOString()) {
  const now = Date.parse(generatedAt);
  const invalid = (message) => ({ ready: false, errors: [message] });
  if (!Number.isFinite(now)) {
    return {
      bundleSha256: productionPolicyBundleSha256,
      retention: invalid("readiness timestamp is invalid"),
      incident: invalid("readiness timestamp is invalid"),
      legal: invalid("readiness timestamp is invalid"),
    };
  }

  let manifest;
  try {
    manifest = decodeManifest(encoded);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Production approval manifest is invalid.";
    return {
      bundleSha256: productionPolicyBundleSha256,
      retention: invalid(message),
      incident: invalid(message),
      legal: invalid(message),
    };
  }

  if (manifest.schemaVersion !== 1 || manifest.policyBundleSha256 !== productionPolicyBundleSha256) {
    const message = "Production approval manifest does not match the deployed policy bundle.";
    return {
      bundleSha256: productionPolicyBundleSha256,
      retention: invalid(message),
      incident: invalid(message),
      legal: invalid(message),
    };
  }

  return {
    bundleSha256: productionPolicyBundleSha256,
    retention: validateRetention(manifest.approvals?.retention, now),
    incident: validateIncident(manifest.approvals?.incident, now),
    legal: validateLegal(manifest.approvals?.legal, now),
  };
}
