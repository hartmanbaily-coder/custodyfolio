import { readFileSync } from "node:fs";

const templatePath = new URL("../.env.production.example", import.meta.url);
const body = readFileSync(templatePath, "utf8");

const requiredKeys = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_RECORDS_HOST",
  "NEXT_PUBLIC_RECORDS_STORAGE_MODE",
  "NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED",
  "RECORDS_STORAGE_MODE",
  "RECORDS_SIGNUPS_ENABLED",
  "STARTER_RESOURCE_PROFILE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "EXPECTED_SUPABASE_PROJECT_REF",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_MFA_POLICY",
  "RECORDS_ENFORCE_MFA",
  "SUPABASE_CUSTOM_SMTP_ENABLED",
  "SUPABASE_AUTH_REDIRECTS_VERIFIED_AT",
  "SUPABASE_LEAKED_PASSWORD_PROTECTION_ENABLED",
  "PWNED_PASSWORD_CHECK_ENABLED",
  "SUPABASE_PASSWORD_MIN_LENGTH",
  "SUPABASE_PASSWORD_REAUTH_ENABLED",
  "SUPABASE_CURRENT_PASSWORD_REQUIRED",
  "SUPABASE_AUTH_HARDENING_VERIFIED_AT",
  "RECORDS_EVIDENCE_BUCKET",
  "RECORDS_DATASET_MAX_BYTES",
  "RECORDS_ALLOW_BEARER_AUTH",
  "RECORDS_AI_IMPORT_ENABLED",
  "RECORDS_AI_IMPORT_MAX_CHARS",
  "OPENAI_API_KEY",
  "OPENAI_IMPORT_MODEL",
  "AUTH_SECRET",
  "AUTH_TRUST_HOST",
  "ATTORNEY_GUEST_FEATURE_ENABLED",
  "ATTORNEY_PORTAL_SECRET",
  "ATTORNEY_INVITE_OWNER_SHARE_ENABLED",
  "ATTORNEY_INVITE_DEV_DELIVERY",
  "EVIDENCE_MAX_FILE_BYTES",
  "MALWARE_SCAN_PROVIDER",
  "MALWARE_SCANNER_TESTED_AT",
  "CLAMAV_HOST",
  "CLAMAV_PORT",
  "CLAMAV_TIMEOUT_MS",
  "MALWARE_SCAN_ENDPOINT",
  "MALWARE_SCAN_API_KEY",
  "SECURITY_CONTACT_EMAIL",
  "PRIVACY_POLICY_URL",
  "SECURITY_EVENT_SINK",
  "SECURITY_EVENT_WEBHOOK_URL",
  "SECURITY_EVENT_WEBHOOK_TOKEN",
  "SECURITY_LOG_HASH_SALT",
  "EDGE_RATE_LIMITING_ENABLED",
  "EDGE_RATE_LIMITING_PROVIDER",
  "EDGE_WAF_ENABLED",
  "EDGE_WAF_PROVIDER",
  "EDGE_CONTROLS_TESTED_AT",
  "SECURITY_MONITORING_ENABLED",
  "AUDIT_LOG_REVIEW_ENABLED",
  "OFFSITE_STORAGE_BACKUP_ENABLED",
  "OFFSITE_STORAGE_BACKUP_RETENTION_DAYS",
  "BACKUP_RESTORE_TESTED_AT",
  "TWO_USER_ISOLATION_TESTED_AT",
  "DATA_RETENTION_POLICY_APPROVED",
  "INCIDENT_RESPONSE_PLAN_APPROVED",
  "LEGAL_REVIEW_APPROVED",
  "VENDOR_SECURITY_REVIEW_APPROVED",
  "RECORDS_APP_BASE_URL",
  "RECORDS_ISOLATION_EMAIL_DOMAIN",
  "KEEP_ISOLATION_TEST_USERS",
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

const entries = new Map();
const duplicateKeys = new Set();

for (const line of body.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(trimmed);
  if (!match) continue;
  if (entries.has(match[1])) duplicateKeys.add(match[1]);
  entries.set(match[1], match[2]);
}

const findings = [];
const missingKeys = requiredKeys.filter((key) => !entries.has(key));

if (missingKeys.length > 0) {
  findings.push(`Missing keys: ${missingKeys.join(", ")}`);
}

if (duplicateKeys.size > 0) {
  findings.push(`Duplicate keys: ${Array.from(duplicateKeys).join(", ")}`);
}

if (entries.get("NEXT_PUBLIC_APP_URL") !== "https://custodyfolio.com") {
  findings.push("NEXT_PUBLIC_APP_URL must point at https://custodyfolio.com.");
}

if (entries.get("NEXT_PUBLIC_RECORDS_HOST") !== "custodyfolio.com") {
  findings.push("NEXT_PUBLIC_RECORDS_HOST must be custodyfolio.com.");
}

if (entries.get("NEXT_PUBLIC_SUPABASE_URL") !== "https://cieuilbpnwuvnrxrlczj.supabase.co") {
  findings.push("NEXT_PUBLIC_SUPABASE_URL must point at the clean records production Supabase project.");
}

if (entries.get("EXPECTED_SUPABASE_PROJECT_REF") !== "cieuilbpnwuvnrxrlczj") {
  findings.push("EXPECTED_SUPABASE_PROJECT_REF must be cieuilbpnwuvnrxrlczj.");
}

if (entries.get("STARTER_RESOURCE_PROFILE") !== "true") {
  findings.push("STARTER_RESOURCE_PROFILE must remain true in the 4 GiB starter template.");
}

if (entries.get("OFFSITE_STORAGE_BACKUP_ENABLED") !== "true") {
  findings.push("OFFSITE_STORAGE_BACKUP_ENABLED must be true in the production template.");
}

if (entries.get("OFFSITE_STORAGE_BACKUP_RETENTION_DAYS") !== "180") {
  findings.push("OFFSITE_STORAGE_BACKUP_RETENTION_DAYS must be 180 in the production template.");
}

if (/eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/.test(body)) {
  findings.push("The production template must not contain legacy Supabase JWT keys.");
}

const serviceRoleValue = String(entries.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
if (serviceRoleValue && !/^REPLACE_WITH_|^PLACEHOLDER/i.test(serviceRoleValue)) {
  findings.push("SUPABASE_SERVICE_ROLE_KEY must remain a placeholder in .env.production.example.");
}

const authSecretValue = String(entries.get("AUTH_SECRET") || "").trim();
if (authSecretValue && !/^REPLACE_WITH_|^PLACEHOLDER/i.test(authSecretValue)) {
  findings.push("AUTH_SECRET must remain a placeholder in .env.production.example.");
}

const attorneySecretValue = String(entries.get("ATTORNEY_PORTAL_SECRET") || "").trim();
if (attorneySecretValue && !/^REPLACE_WITH_|^PLACEHOLDER/i.test(attorneySecretValue)) {
  findings.push("ATTORNEY_PORTAL_SECRET must remain a placeholder in .env.production.example.");
}

if (entries.get("ATTORNEY_GUEST_FEATURE_ENABLED") !== "false") {
  findings.push("ATTORNEY_GUEST_FEATURE_ENABLED must remain false in the production template.");
}

if (entries.get("ATTORNEY_INVITE_OWNER_SHARE_ENABLED") !== "false") {
  findings.push("ATTORNEY_INVITE_OWNER_SHARE_ENABLED must remain false in the production template.");
}

if (entries.get("ATTORNEY_INVITE_DEV_DELIVERY") !== "false") {
  findings.push("ATTORNEY_INVITE_DEV_DELIVERY must be false in production.");
}

const logSaltValue = String(entries.get("SECURITY_LOG_HASH_SALT") || "").trim();
if (logSaltValue && !/^REPLACE_WITH_|^PLACEHOLDER/i.test(logSaltValue)) {
  findings.push("SECURITY_LOG_HASH_SALT must remain a placeholder in .env.production.example.");
}

const openAiKeyValue = String(entries.get("OPENAI_API_KEY") || "").trim();
if (openAiKeyValue && !/^REPLACE_WITH_|^PLACEHOLDER/i.test(openAiKeyValue)) {
  findings.push("OPENAI_API_KEY must remain a placeholder in .env.production.example.");
}

if (findings.length > 0) {
  fail(`Production env template verification failed:\n- ${findings.join("\n- ")}`);
}

console.log(`Production env template verified with ${requiredKeys.length} expected keys.`);
