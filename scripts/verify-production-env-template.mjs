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
  "BILLING_MODE",
  "BILLING_CHECKOUT_ENABLED",
  "LIVE_BILLING_APPROVED",
  "BILLING_LIVE_ACTIVATION_AUTHORIZED",
  "BILLING_LIVE_CANARY_AUTHORIZED",
  "BILLING_LIVE_CANARY_USER_ID",
  "BILLING_LIVE_CANARY_EXPIRES_AT",
  "BILLING_RETURN_STATE_SECRET",
  "BILLING_DELETION_HASH_SECRET",
  "BILLING_GRACE_PERIOD_DAYS",
  "BILLING_STALE_TOLERANCE_HOURS",
  "STRIPE_TEST_SECRET_KEY",
  "STRIPE_TEST_WEBHOOK_SECRET",
  "STRIPE_TEST_MONTHLY_PRICE_ID",
  "STRIPE_TEST_ANNUAL_PRICE_ID",
  "STRIPE_TEST_PORTAL_CONFIGURATION_ID",
  "STRIPE_LIVE_RESTRICTED_KEY",
  "STRIPE_LIVE_WEBHOOK_SECRET",
  "STRIPE_LIVE_MONTHLY_PRICE_ID",
  "STRIPE_LIVE_ANNUAL_PRICE_ID",
  "STRIPE_LIVE_PORTAL_CONFIGURATION_ID",
  "STRIPE_CUSTOMER_PORTAL_VERIFIED_AT",
  "APPLE_PURCHASE_ENABLED",
  "APPLE_TESTFLIGHT_CANARY_AUTHORIZED",
  "APPLE_TESTFLIGHT_CANARY_USER_ID",
  "APPLE_TESTFLIGHT_CANARY_EXPIRES_AT",
  "APPLE_BILLING_ENVIRONMENT",
  "APPLE_BUNDLE_ID",
  "APPLE_APP_ID",
  "APPLE_MONTHLY_PRODUCT_ID",
  "APPLE_ANNUAL_PRODUCT_ID",
  "APPLE_ROOT_CA_CERTIFICATES_BASE64",
  "APPLE_APP_STORE_SERVER_PRIVATE_KEY_BASE64",
  "APPLE_APP_STORE_SERVER_KEY_ID",
  "APPLE_APP_STORE_SERVER_ISSUER_ID",
  "APPLE_NOTIFICATIONS_V2_URL",
  "APPLE_NOTIFICATIONS_V2_VERIFIED_AT",
  "APPLE_SMALL_BUSINESS_PROGRAM_STATUS",
  "BILLING_PROVIDER_TESTED_AT",
  "BILLING_RECONCILIATION_TESTED_AT",
  "BILLING_MIGRATION_VERIFIED_AT",
  "BILLING_TERMS_VERSION",
  "BILLING_PRIVACY_VERSION",
  "BILLING_SUBPROCESSOR_VERSION",
  "BILLING_DISCLOSURE_VERSION",
  "BILLING_POLICY_APPROVED",
  "BILLING_POLICY_APPROVAL_BASIS",
  "BILLING_POLICY_VERSIONS_VERIFIED_AT",
  "STRIPE_TAX_MODE",
  "BILLING_TAX_REVIEW_APPROVED",
  "BILLING_TAX_REVIEWED_AT",
  "STRIPE_TAX_REGISTRATIONS_VERIFIED_AT",
  "STRIPE_TAX_PRODUCT_CONFIGURATION_VERIFIED_AT",
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
  "OFFSITE_STORAGE_BACKUP_LIFECYCLE_DELETE_DAYS",
  "OFFSITE_STORAGE_BACKUP_KEY_EXPIRES_AT",
  "BACKUP_RESTORE_TESTED_AT",
  "TWO_USER_ISOLATION_TESTED_AT",
  "DATA_RETENTION_POLICY_APPROVED",
  "INCIDENT_RESPONSE_PLAN_APPROVED",
  "LEGAL_REVIEW_APPROVED",
  "PRODUCTION_APPROVAL_MANIFEST_BASE64",
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

if (entries.get("BILLING_MODE") !== "disabled") {
  findings.push("BILLING_MODE must remain disabled in the production template.");
}

if (entries.get("BILLING_CHECKOUT_ENABLED") !== "false") {
  findings.push("BILLING_CHECKOUT_ENABLED must remain false in the production template.");
}

if (entries.get("LIVE_BILLING_APPROVED") !== "false") {
  findings.push("LIVE_BILLING_APPROVED must remain false in the production template.");
}

if (entries.get("BILLING_LIVE_ACTIVATION_AUTHORIZED") !== "false") {
  findings.push("BILLING_LIVE_ACTIVATION_AUTHORIZED must remain false in the production template.");
}

if (entries.get("BILLING_LIVE_CANARY_AUTHORIZED") !== "false") {
  findings.push("BILLING_LIVE_CANARY_AUTHORIZED must remain false in the production template.");
}

if (entries.get("BILLING_LIVE_CANARY_USER_ID") !== "") {
  findings.push("BILLING_LIVE_CANARY_USER_ID must remain empty in the production template.");
}

if (entries.get("BILLING_LIVE_CANARY_EXPIRES_AT") !== "") {
  findings.push("BILLING_LIVE_CANARY_EXPIRES_AT must remain empty in the production template.");
}

if (entries.get("BILLING_POLICY_APPROVED") !== "false") {
  findings.push("BILLING_POLICY_APPROVED must remain false until the exact policy versions are adopted.");
}

if (entries.get("BILLING_POLICY_APPROVAL_BASIS") !== "operator_self_review") {
  findings.push("BILLING_POLICY_APPROVAL_BASIS must disclose operator_self_review in the template.");
}

if (entries.get("APPLE_PURCHASE_ENABLED") !== "false") {
  findings.push("APPLE_PURCHASE_ENABLED must remain false in the fail-closed template until the App Store activation window.");
}

if (entries.get("STRIPE_TAX_MODE") !== "disabled") {
  findings.push("STRIPE_TAX_MODE must remain disabled until a documented tax decision is recorded.");
}

if (entries.get("BILLING_TAX_REVIEW_APPROVED") !== "false") {
  findings.push("BILLING_TAX_REVIEW_APPROVED must remain false pending tax review.");
}

for (const key of [
  "STRIPE_TEST_SECRET_KEY",
  "STRIPE_TEST_WEBHOOK_SECRET",
  "STRIPE_TEST_MONTHLY_PRICE_ID",
  "STRIPE_TEST_ANNUAL_PRICE_ID",
  "STRIPE_TEST_PORTAL_CONFIGURATION_ID",
]) {
  if (entries.get(key) !== "") findings.push(`${key} must remain empty in the production template.`);
}

if (entries.get("OFFSITE_STORAGE_BACKUP_ENABLED") !== "true") {
  findings.push("OFFSITE_STORAGE_BACKUP_ENABLED must be true in the production template.");
}

if (entries.get("OFFSITE_STORAGE_BACKUP_RETENTION_DAYS") !== "178") {
  findings.push("OFFSITE_STORAGE_BACKUP_RETENTION_DAYS must be 178 in the production template.");
}

if (entries.get("OFFSITE_STORAGE_BACKUP_LIFECYCLE_DELETE_DAYS") !== "1") {
  findings.push("OFFSITE_STORAGE_BACKUP_LIFECYCLE_DELETE_DAYS must be 1 in the production template.");
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

for (const key of [
  "BILLING_RETURN_STATE_SECRET",
  "BILLING_DELETION_HASH_SECRET",
  "STRIPE_LIVE_RESTRICTED_KEY",
  "STRIPE_LIVE_WEBHOOK_SECRET",
  "APPLE_ROOT_CA_CERTIFICATES_BASE64",
  "APPLE_APP_STORE_SERVER_PRIVATE_KEY_BASE64",
  "APPLE_APP_STORE_SERVER_KEY_ID",
  "APPLE_APP_STORE_SERVER_ISSUER_ID",
  "MALWARE_SCAN_API_KEY",
  "SECURITY_EVENT_WEBHOOK_TOKEN",
]) {
  const value = String(entries.get(key) || "").trim();
  if (value && !/^REPLACE_WITH_|^PLACEHOLDER/i.test(value)) {
    findings.push(`${key} must remain empty or a placeholder in .env.production.example.`);
  }
}

if (String(entries.get("PRODUCTION_APPROVAL_MANIFEST_BASE64") || "").trim()) {
  findings.push("PRODUCTION_APPROVAL_MANIFEST_BASE64 must remain empty in .env.production.example.");
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
