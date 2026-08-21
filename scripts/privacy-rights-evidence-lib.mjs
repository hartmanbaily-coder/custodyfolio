import { productionPolicyDocumentDigests } from "../src/generated/productionPolicyBundle.mjs";

const dayMs = 24 * 60 * 60 * 1000;
const placeholderPattern = /(?:replace_with|placeholder|yyyy-mm-dd|todo|tbd|unknown|example request)/i;

export const requiredActiveSystemTargets = [
  "records_database",
  "private_evidence_storage",
  "auth_identity",
  "application_exports",
  "security_audit_records",
];

export const requiredDownstreamTargets = [
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
];

const requestTypes = new Set(["access", "deletion", "correction", "consent_withdrawal", "appeal"]);
const completedActiveStatusesByRequestType = new Map([
  ["access", new Set(["exported", "verified_absent"])],
  ["deletion", new Set(["deleted", "verified_absent"])],
  ["correction", new Set(["corrected", "verified_absent"])],
  ["consent_withdrawal", new Set(["deleted", "verified_absent"])],
  ["appeal", new Set(["deleted", "corrected", "exported", "verified_absent"])],
]);

function hasText(value) {
  return typeof value === "string" && value.trim().length >= 2 && !placeholderPattern.test(value);
}

function parsedDate(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function requirePastDate(value, label, now, errors) {
  const parsed = parsedDate(value);
  if (!Number.isFinite(parsed) || parsed > now) errors.push(`${label} must be a valid date that is not in the future`);
  return parsed;
}

function uniqueTargetMap(items, label, errors) {
  if (!Array.isArray(items)) {
    errors.push(`${label} must be an array`);
    return new Map();
  }
  const result = new Map();
  for (const item of items) {
    if (!item || typeof item !== "object" || !hasText(item.targetId)) {
      errors.push(`${label} contains an item without a valid targetId`);
      continue;
    }
    if (result.has(item.targetId)) errors.push(`${label} contains duplicate targetId ${item.targetId}`);
    result.set(item.targetId, item);
  }
  return result;
}

export function validatePrivacyRightsEvidence(evidence, nowIso = new Date().toISOString()) {
  const errors = [];
  const now = parsedDate(nowIso);
  if (!Number.isFinite(now)) return { valid: false, errors: ["verification timestamp is invalid"] };
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return { valid: false, errors: ["privacy-rights evidence must be a JSON object"] };
  }

  if (evidence.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!hasText(evidence.requestId)) errors.push("requestId is missing or contains placeholder text");
  if (!requestTypes.has(evidence.requestType)) errors.push("requestType is not supported");
  if (!hasText(evidence.validatedBy)) errors.push("validatedBy is missing or contains placeholder text");
  if (!hasText(evidence.scopeSummary)) errors.push("scopeSummary is missing or contains placeholder text");
  if (!hasText(evidence.inventoryVersion)) errors.push("inventoryVersion is missing or contains placeholder text");
  if (evidence.subprocessorPolicySha256 !== productionPolicyDocumentDigests.subprocessors) {
    errors.push("subprocessorPolicySha256 does not match the current provider inventory");
  }

  const receivedAt = requirePastDate(evidence.receivedAt, "receivedAt", now, errors);
  const authenticatedAt = requirePastDate(evidence.authenticatedAt, "authenticatedAt", now, errors);
  const inventoryReviewedAt = requirePastDate(evidence.inventoryReviewedAt, "inventoryReviewedAt", now, errors);
  const completedAt = requirePastDate(evidence.completedAt, "completedAt", now, errors);
  const responseSentAt = requirePastDate(evidence.responseSentAt, "responseSentAt", now, errors);
  const deadlineAt = parsedDate(evidence.deadlineAt);
  if (!Number.isFinite(deadlineAt) || deadlineAt < receivedAt) errors.push("deadlineAt must be on or after receivedAt");
  if (authenticatedAt < receivedAt) errors.push("authenticatedAt cannot be before receivedAt");
  if (inventoryReviewedAt < receivedAt) errors.push("inventoryReviewedAt cannot be before receivedAt");
  if (completedAt < authenticatedAt) errors.push("completedAt cannot be before authentication");
  if (responseSentAt < completedAt) errors.push("responseSentAt cannot be before completedAt");
  if (completedAt > deadlineAt || responseSentAt > deadlineAt) errors.push("the request was not completed and answered by deadlineAt");

  const activeSystems = uniqueTargetMap(evidence.activeSystems, "activeSystems", errors);
  const completedActiveStatuses =
    completedActiveStatusesByRequestType.get(evidence.requestType) || new Set();
  for (const targetId of requiredActiveSystemTargets) {
    const target = activeSystems.get(targetId);
    if (!target) {
      errors.push(`activeSystems is missing ${targetId}`);
      continue;
    }
    if (typeof target.applicable !== "boolean") errors.push(`${targetId} applicable must be boolean`);
    if (target.applicable === false) {
      if (target.status !== "not_applicable" || !hasText(target.rationale)) {
        errors.push(`${targetId} must record not_applicable with a rationale`);
      }
      continue;
    }
    if (target.status === "retained_exception") {
      if (!["deletion", "consent_withdrawal", "appeal"].includes(evidence.requestType)) {
        errors.push(
          `${targetId} retained exception does not complete a ${evidence.requestType || "privacy"} request`
        );
      }
      if (!hasText(target.rationale) || !hasText(target.evidenceReference)) {
        errors.push(`${targetId} retained exception requires rationale and evidenceReference`);
      }
      const expiresAt = parsedDate(target.retentionExpiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= completedAt) {
        errors.push(`${targetId} retained exception must have a future retentionExpiresAt`);
      }
    } else if (!completedActiveStatuses.has(target.status)) {
      errors.push(
        `${targetId} status does not complete a ${evidence.requestType || "privacy"} request`
      );
    }
    const targetCompletedAt = parsedDate(target.completedAt);
    if (!Number.isFinite(targetCompletedAt) || targetCompletedAt > completedAt) {
      errors.push(`${targetId} completedAt must be valid and no later than request completedAt`);
    }
    if (!hasText(target.evidenceReference)) errors.push(`${targetId} evidenceReference is missing`);
  }

  const downstreamTargets = uniqueTargetMap(evidence.downstreamTargets, "downstreamTargets", errors);
  for (const targetId of requiredDownstreamTargets) {
    const target = downstreamTargets.get(targetId);
    if (!target) {
      errors.push(`downstreamTargets is missing ${targetId}`);
      continue;
    }
    if (typeof target.applicable !== "boolean") errors.push(`${targetId} applicable must be boolean`);
    if (target.applicable === false) {
      if (target.status !== "not_applicable" || !hasText(target.rationale)) {
        errors.push(`${targetId} must record not_applicable with a rationale`);
      }
      continue;
    }
    if (!["processor", "contractor", "recipient", "user_controlled_copy"].includes(target.relationship)) {
      errors.push(`${targetId} relationship is invalid`);
    }
    if (target.status === "not_controllable") {
      if (target.relationship !== "user_controlled_copy" || !hasText(target.rationale)) {
        errors.push(`${targetId} can be not_controllable only for a documented user-controlled copy`);
      }
      continue;
    }
    if (target.status !== "acknowledged") {
      errors.push(`${targetId} controlled downstream action is not acknowledged`);
      continue;
    }
    const noticeSentAt = parsedDate(target.noticeSentAt);
    const acknowledgedAt = parsedDate(target.acknowledgedAt);
    if (!Number.isFinite(noticeSentAt) || noticeSentAt < receivedAt || noticeSentAt > completedAt) {
      errors.push(`${targetId} noticeSentAt must be within the request window`);
    }
    if (!Number.isFinite(acknowledgedAt) || acknowledgedAt < noticeSentAt || acknowledgedAt > completedAt) {
      errors.push(`${targetId} acknowledgedAt must follow notice and precede completion`);
    }
    if (!hasText(target.evidenceReference)) errors.push(`${targetId} evidenceReference is missing`);
  }

  if (evidence.requestType === "deletion" || evidence.requestType === "consent_withdrawal") {
    const backup = evidence.backupAging;
    if (!backup || typeof backup !== "object") {
      errors.push("backupAging is required for deletion and consent withdrawal");
    } else {
      if (backup.deletionReapplyRecorded !== true) errors.push("backup deletion reapply must be recorded");
      if (!hasText(backup.evidenceReference)) errors.push("backupAging evidenceReference is missing");
      const agesOutBy = parsedDate(backup.agesOutBy);
      if (!Number.isFinite(agesOutBy) || agesOutBy < completedAt || agesOutBy - completedAt > 180 * dayMs) {
        errors.push("backup agesOutBy must be within 180 days after active completion");
      }
    }
  }

  if (evidence.appealInstructionsIncluded !== true) {
    errors.push("appeal instructions must be included in the completion response");
  }

  return { valid: errors.length === 0, errors };
}
