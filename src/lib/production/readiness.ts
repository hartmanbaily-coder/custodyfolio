import { evaluateProductionApprovalEvidence } from "@/lib/production/approvalEvidence.mjs";
import { publicLegalClausesAreOperative } from "@/lib/legalRelease";

export type ProductionReadinessSeverity = "blocker" | "warning";

export interface ProductionReadinessCheck {
  id: string;
  label: string;
  ready: boolean;
  severity: ProductionReadinessSeverity;
  detail: string;
}

export interface ProductionReadinessReport {
  ready: boolean;
  generatedAt: string;
  checks: ProductionReadinessCheck[];
  blockers: ProductionReadinessCheck[];
  warnings: ProductionReadinessCheck[];
}

export interface ProductionReadinessPhaseSummary {
  preSupabaseReady: boolean;
  supabaseFinalReady: boolean;
  preSupabaseChecks: ProductionReadinessCheck[];
  supabaseFinalChecks: ProductionReadinessCheck[];
  preSupabaseBlockers: ProductionReadinessCheck[];
  supabaseFinalBlockers: ProductionReadinessCheck[];
  preSupabaseWarnings: ProductionReadinessCheck[];
  supabaseFinalWarnings: ProductionReadinessCheck[];
}

type EnvSource = Record<string, string | undefined>;

export const supabaseFinalCheckIds = [
  "records-storage-mode",
  "supabase-url",
  "supabase-production-project",
  "supabase-anon-key",
  "supabase-service-role",
  "records-signup-mode",
  "records-auth-method",
  "supabase-email-otp",
  "legacy-mfa-disabled",
  "supabase-custom-smtp",
  "supabase-auth-redirects",
  "supabase-email-otp-expiry",
  "supabase-auth-hardening-verified",
  "records-evidence-bucket",
  "customer-growth-schema",
  "attorney-guest-feature-flag",
  "attorney-portal-secret",
  "attorney-owner-share-delivery",
  "attorney-development-delivery",
  "offsite-storage-backup",
  "backup-restore-tested",
  "two-user-isolation-tested",
] as const;

const supabaseFinalCheckIdSet = new Set<string>(supabaseFinalCheckIds);

const placeholderValues = new Set([
  "",
  "changeme",
  "change-me",
  "example",
  "example.invalid",
  "clamav-or-vendor-name",
  "cloudflare-or-provider",
  "mock-clean",
  "platform-or-siem",
  "security@example.invalid",
]);

function hasValue(value: string | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  return Boolean(
    normalized &&
      !placeholderValues.has(normalized) &&
      !normalized.includes("replace_with") &&
      !normalized.includes("placeholder")
  );
}

function isHttpsUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function isCanonicalPrivacyPolicyUrl(
  policyValue: string | undefined,
  appValue: string | undefined
) {
  if (!policyValue || !appValue) return false;
  try {
    const policy = new URL(policyValue);
    const app = new URL(appValue);
    return (
      policy.protocol === "https:" &&
      app.protocol === "https:" &&
      policy.origin === app.origin &&
      policy.pathname === "/privacy" &&
      policy.search === "" &&
      policy.hash === "" &&
      policy.username === "" &&
      policy.password === ""
    );
  } catch {
    return false;
  }
}

function isValidEmail(value: string | undefined) {
  return hasValue(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || "");
}

function hasStrongSecret(value: string | undefined) {
  return hasValue(value) && (value || "").length >= 32;
}

function readJwtPayload(value: string) {
  const [, payload] = value.split(".");
  if (!payload) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { role?: unknown };
  } catch {
    return null;
  }
}

function isUsableSupabasePublicKey(value: string | undefined) {
  const key = String(value || "").trim();
  if (!hasValue(key)) return false;
  if (key.startsWith("sb_publishable_")) return true;
  if (!/^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(key)) return false;
  return readJwtPayload(key)?.role === "anon";
}

function isEnabled(value: string | undefined) {
  return ["true", "enabled", "yes", "1"].includes((value || "").trim().toLowerCase());
}

function isBooleanString(value: string | undefined) {
  return ["true", "false"].includes((value || "").trim().toLowerCase());
}

function isOneOf(value: string | undefined, allowed: string[]) {
  return hasValue(value) && allowed.includes((value || "").trim().toLowerCase());
}

function supabaseProjectRef(value: string | undefined) {
  if (!value) return "";
  try {
    const host = new URL(value).hostname;
    if (!host.endsWith(".supabase.co")) return "";
    return host.split(".")[0] || "";
  } catch {
    return "";
  }
}

function isRecentDate(value: string | undefined, nowIso: string, maxAgeDays: number) {
  if (!value) return false;
  const testedAt = Date.parse(value);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(testedAt) || !Number.isFinite(now) || testedAt > now) return false;
  return now - testedAt <= maxAgeDays * 24 * 60 * 60 * 1000;
}

function isFutureDateAtLeast(value: string | undefined, nowIso: string, minimumDays: number) {
  if (!value) return false;
  const expiresAt = Date.parse(value);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(now)) return false;
  return expiresAt - now >= minimumDays * 24 * 60 * 60 * 1000;
}

function check(
  id: string,
  label: string,
  ready: boolean,
  severity: ProductionReadinessSeverity,
  detail: string
): ProductionReadinessCheck {
  return { id, label, ready, severity, detail };
}

export function isSupabaseFinalCheck(checkOrId: ProductionReadinessCheck | string) {
  const id = typeof checkOrId === "string" ? checkOrId : checkOrId.id;
  return supabaseFinalCheckIdSet.has(id);
}

export function summarizeReadinessPhases(
  report: ProductionReadinessReport
): ProductionReadinessPhaseSummary {
  const preSupabaseChecks = report.checks.filter((item) => !isSupabaseFinalCheck(item));
  const supabaseFinalChecks = report.checks.filter((item) => isSupabaseFinalCheck(item));
  const preSupabaseBlockers = preSupabaseChecks.filter(
    (item) => !item.ready && item.severity === "blocker"
  );
  const supabaseFinalBlockers = supabaseFinalChecks.filter(
    (item) => !item.ready && item.severity === "blocker"
  );
  const preSupabaseWarnings = preSupabaseChecks.filter(
    (item) => !item.ready && item.severity === "warning"
  );
  const supabaseFinalWarnings = supabaseFinalChecks.filter(
    (item) => !item.ready && item.severity === "warning"
  );

  return {
    preSupabaseReady: preSupabaseBlockers.length === 0,
    supabaseFinalReady: supabaseFinalBlockers.length === 0,
    preSupabaseChecks,
    supabaseFinalChecks,
    preSupabaseBlockers,
    supabaseFinalBlockers,
    preSupabaseWarnings,
    supabaseFinalWarnings,
  };
}

export function evaluateProductionReadiness(
  env: EnvSource = process.env,
  generatedAt = new Date().toISOString()
): ProductionReadinessReport {
  const malwareProvider = (env.MALWARE_SCAN_PROVIDER || "").trim().toLowerCase();
  const usesHttpMalwareProvider = malwareProvider === "http" || malwareProvider === "webhook";
  const securityEventSink = (env.SECURITY_EVENT_SINK || "").trim().toLowerCase();
  const configuredSupabaseRef = supabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL);
  const expectedSupabaseRef = (env.EXPECTED_SUPABASE_PROJECT_REF || "").trim();
  const recordsSignupsEnabled = isEnabled(env.RECORDS_SIGNUPS_ENABLED);
  const publicRecordsSignupsEnabled = isEnabled(env.NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED);
  const marketingAnalyticsEnabled = isEnabled(env.MARKETING_ANALYTICS_ENABLED);
  const customerFeedbackInvitesEnabled = isEnabled(
    env.CUSTOMER_FEEDBACK_INVITE_ENABLED
  );
  const approvalEvidence = evaluateProductionApprovalEvidence(
    env.PRODUCTION_APPROVAL_MANIFEST_BASE64,
    generatedAt
  );

  const checks = [
    check(
      "customer-resource-profile",
      "Starter-capacity host profile is enabled",
      env.STARTER_RESOURCE_PROFILE === "false",
      "warning",
      "The 4 GiB starter profile may accept customers. Upgrade by 100 customer accounts, or sooner if monitoring shows sustained memory or CPU pressure, slower responses, or evidence-upload retries. After upgrading and retesting ClamAV, set STARTER_RESOURCE_PROFILE=false."
    ),
    check(
      "app-url",
      "Production app URL is HTTPS",
      isHttpsUrl(env.NEXT_PUBLIC_APP_URL),
      "blocker",
      "Set NEXT_PUBLIC_APP_URL to the final https:// URL for custodyfolio.com."
    ),
    check(
      "records-host",
      "Records host is configured",
      hasValue(env.NEXT_PUBLIC_RECORDS_HOST) &&
        !["localhost", "127.0.0.1"].includes(env.NEXT_PUBLIC_RECORDS_HOST || ""),
      "blocker",
      "Set NEXT_PUBLIC_RECORDS_HOST to the host only production records domain."
    ),
    check(
      "records-storage-mode",
      "Records storage mode is Supabase",
      env.RECORDS_STORAGE_MODE === "supabase" &&
        env.NEXT_PUBLIC_RECORDS_STORAGE_MODE === "supabase",
      "blocker",
      "Set both RECORDS_STORAGE_MODE and NEXT_PUBLIC_RECORDS_STORAGE_MODE to supabase before production."
    ),
    check(
      "attorney-guest-feature-flag",
      "Attorney guest feature flag is explicit",
      isBooleanString(env.ATTORNEY_GUEST_FEATURE_ENABLED),
      "blocker",
      "Set ATTORNEY_GUEST_FEATURE_ENABLED to an explicit true or false value."
    ),
    check(
      "attorney-portal-secret",
      "Attorney portal has a separate strong cryptographic secret",
      !isEnabled(env.ATTORNEY_GUEST_FEATURE_ENABLED) ||
        (hasStrongSecret(env.ATTORNEY_PORTAL_SECRET) &&
          env.ATTORNEY_PORTAL_SECRET !== env.AUTH_SECRET),
      "blocker",
      "When attorney guest access is enabled, set ATTORNEY_PORTAL_SECRET to a separate random value of at least 32 characters."
    ),
    check(
      "attorney-owner-share-delivery",
      "Owner shared attorney invitation links are configured",
      isBooleanString(env.ATTORNEY_INVITE_OWNER_SHARE_ENABLED)
        && (!isEnabled(env.ATTORNEY_GUEST_FEATURE_ENABLED)
          || isEnabled(env.ATTORNEY_INVITE_OWNER_SHARE_ENABLED)),
      "blocker",
      "Set ATTORNEY_INVITE_OWNER_SHARE_ENABLED=true when attorney guest access is enabled."
    ),
    check(
      "attorney-development-delivery",
      "Development invitation links are disabled in production",
      env.ATTORNEY_INVITE_DEV_DELIVERY === "false",
      "blocker",
      "Set ATTORNEY_INVITE_DEV_DELIVERY=false in production. Development fragment links are not production email delivery."
    ),
    check(
      "supabase-url",
      "Supabase project URL is HTTPS",
      isHttpsUrl(env.NEXT_PUBLIC_SUPABASE_URL),
      "blocker",
      "Set NEXT_PUBLIC_SUPABASE_URL to the HTTPS Supabase project URL."
    ),
    check(
      "supabase-production-project",
      "Supabase project is the records production project",
      configuredSupabaseRef !== "adhnoiicwfvppzenwcgv" &&
        hasValue(expectedSupabaseRef) &&
        configuredSupabaseRef === expectedSupabaseRef,
      "blocker",
      "Set EXPECTED_SUPABASE_PROJECT_REF and point production records at the clean records only Supabase project, not the older staging or mixed use project."
    ),
    check(
      "supabase-anon-key",
      "Supabase public browser key is configured",
      isUsableSupabasePublicKey(env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      "blocker",
      "Set NEXT_PUBLIC_SUPABASE_ANON_KEY to a real Supabase publishable key or legacy anon role JWT, not a placeholder or service role key."
    ),
    check(
      "supabase-service-role",
      "Supabase service role key is server only",
      hasValue(env.SUPABASE_SERVICE_ROLE_KEY) &&
        !String(env.SUPABASE_SERVICE_ROLE_KEY).startsWith("NEXT_PUBLIC_"),
      "blocker",
      "Set SUPABASE_SERVICE_ROLE_KEY only in server side secret storage."
    ),
    check(
      "bearer-auth-disabled",
      "Bearer token records auth fallback is disabled",
      env.RECORDS_ALLOW_BEARER_AUTH !== "true",
      "blocker",
      "Do not enable RECORDS_ALLOW_BEARER_AUTH in production."
    ),
    check(
      "records-signup-mode",
      "Account creation gate is explicit",
      isBooleanString(env.RECORDS_SIGNUPS_ENABLED) &&
        isBooleanString(env.NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED) &&
        recordsSignupsEnabled === publicRecordsSignupsEnabled,
      "blocker",
      "Set RECORDS_SIGNUPS_ENABLED and NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED to matching true or false values."
    ),
    check(
      "auth-secret",
      "Auth secret is strong",
      hasStrongSecret(env.AUTH_SECRET),
      "blocker",
      "Set AUTH_SECRET to a high entropy value with at least 32 characters."
    ),
    check(
      "records-auth-method",
      "Records authentication uses passwordless email OTP",
      env.RECORDS_AUTH_METHOD === "email_otp",
      "blocker",
      "Set RECORDS_AUTH_METHOD=email_otp after enabling the verified passwordless email-code flow."
    ),
    check(
      "supabase-email-otp",
      "Supabase email OTP is explicitly enabled",
      isEnabled(env.SUPABASE_EMAIL_OTP_ENABLED) && env.SUPABASE_EMAIL_OTP_LENGTH === "6",
      "blocker",
      "Enable Supabase email OTP and set SUPABASE_EMAIL_OTP_LENGTH=6."
    ),
    check(
      "legacy-mfa-disabled",
      "Retired authenticator-app enforcement is disabled",
      env.SUPABASE_MFA_POLICY === "optional" && !isEnabled(env.RECORDS_ENFORCE_MFA),
      "blocker",
      "Set SUPABASE_MFA_POLICY=optional and RECORDS_ENFORCE_MFA=false."
    ),
    check(
      "supabase-custom-smtp",
      "Supabase Auth uses production email delivery",
      isEnabled(env.SUPABASE_CUSTOM_SMTP_ENABLED),
      "blocker",
      "Configure Resend-backed custom SMTP before relying on passwordless sign-in codes."
    ),
    check(
      "supabase-auth-redirects",
      "Supabase Auth redirect URLs were verified recently",
      isRecentDate(env.SUPABASE_AUTH_REDIRECTS_VERIFIED_AT, generatedAt, 30),
      "blocker",
      "Verify custodyfolio.com auth redirects, invitation callbacks, and /auth/confirm, then set SUPABASE_AUTH_REDIRECTS_VERIFIED_AT."
    ),
    check(
      "supabase-email-otp-expiry",
      "Email OTP expiration is limited to ten minutes",
      env.SUPABASE_EMAIL_OTP_EXPIRY_SECONDS === "600",
      "blocker",
      "Set the Supabase Email OTP expiration to 600 seconds and record SUPABASE_EMAIL_OTP_EXPIRY_SECONDS=600."
    ),
    check(
      "supabase-auth-hardening-verified",
      "Supabase Auth hardening was verified recently",
      isRecentDate(env.SUPABASE_AUTH_HARDENING_VERIFIED_AT, generatedAt, 30),
      "blocker",
      "Verify Supabase Auth dashboard settings and advisors, then set SUPABASE_AUTH_HARDENING_VERIFIED_AT to the ISO date."
    ),
    check(
      "records-evidence-bucket",
      "Private evidence bucket is configured",
      hasValue(env.RECORDS_EVIDENCE_BUCKET),
      "blocker",
      "Set RECORDS_EVIDENCE_BUCKET to the private Supabase Storage bucket."
    ),
    check(
      "malware-provider",
      "Evidence malware scanning provider is selected",
      hasValue(env.MALWARE_SCAN_PROVIDER),
      "blocker",
      "Set MALWARE_SCAN_PROVIDER before accepting real evidence uploads."
    ),
    check(
      "malware-http-endpoint",
      "HTTP malware scanner endpoint is configured when required",
      !usesHttpMalwareProvider || isHttpsUrl(env.MALWARE_SCAN_ENDPOINT),
      "blocker",
      "Set MALWARE_SCAN_ENDPOINT to the HTTPS scanner endpoint when MALWARE_SCAN_PROVIDER is http or webhook."
    ),
    check(
      "malware-scanner-tested",
      "Malware scanner has blocked a test payload recently",
      isRecentDate(env.MALWARE_SCANNER_TESTED_AT, generatedAt, 30),
      "blocker",
      "Run npm run verify:malware against the production scanner and set MALWARE_SCANNER_TESTED_AT to its ISO date."
    ),
    check(
      "edge-rate-limits",
      "Edge or WAF rate limiting is configured",
      isEnabled(env.EDGE_RATE_LIMITING_ENABLED) && hasValue(env.EDGE_RATE_LIMITING_PROVIDER),
      "blocker",
      "Configure provider level rate limits for auth, evidence, exports, and write heavy routes, then set EDGE_RATE_LIMITING_PROVIDER."
    ),
    check(
      "edge-waf",
      "Production WAF protections are enabled",
      isEnabled(env.EDGE_WAF_ENABLED) && hasValue(env.EDGE_WAF_PROVIDER),
      "blocker",
      "Enable WAF/bot protections at the hosting or CDN edge, then set EDGE_WAF_PROVIDER."
    ),
    check(
      "edge-controls-tested",
      "Production WAF and rate limits were verified recently",
      isRecentDate(env.EDGE_CONTROLS_TESTED_AT, generatedAt, 30),
      "blocker",
      "Run npm run verify:edge-controls against production and set EDGE_CONTROLS_TESTED_AT to the emitted ISO date."
    ),
    check(
      "security-monitoring",
      "Security monitoring and alerting are enabled",
      isEnabled(env.SECURITY_MONITORING_ENABLED),
      "blocker",
      "Enable monitoring/alerting for failed logins, evidence downloads, storage errors, and server errors."
    ),
    check(
      "security-event-sink",
      "Security events have a monitoring sink",
      isOneOf(env.SECURITY_EVENT_SINK, ["platform", "siem", "webhook"]) &&
        (securityEventSink !== "webhook" || isHttpsUrl(env.SECURITY_EVENT_WEBHOOK_URL)),
      "blocker",
      "Set SECURITY_EVENT_SINK to platform, siem, or webhook. Webhook sinks require HTTPS SECURITY_EVENT_WEBHOOK_URL."
    ),
    check(
      "audit-log-review",
      "Audit log review process is enabled",
      isEnabled(env.AUDIT_LOG_REVIEW_ENABLED),
      "warning",
      "Define recurring review of auth, evidence, export, and administrative audit events."
    ),
    check(
      "offsite-storage-backup",
      "Private evidence has an immutable off-site backup",
      isEnabled(env.OFFSITE_STORAGE_BACKUP_ENABLED) &&
        Number.isInteger(Number(env.OFFSITE_STORAGE_BACKUP_RETENTION_DAYS)) &&
        Number.isInteger(Number(env.OFFSITE_STORAGE_BACKUP_LIFECYCLE_DELETE_DAYS)) &&
        Number(env.OFFSITE_STORAGE_BACKUP_RETENTION_DAYS) >= 1 &&
        Number(env.OFFSITE_STORAGE_BACKUP_LIFECYCLE_DELETE_DAYS) >= 1 &&
        Number(env.OFFSITE_STORAGE_BACKUP_RETENTION_DAYS) +
          Number(env.OFFSITE_STORAGE_BACKUP_LIFECYCLE_DELETE_DAYS) <=
          180 &&
        isFutureDateAtLeast(env.OFFSITE_STORAGE_BACKUP_KEY_EXPIRES_AT, generatedAt, 30),
      "blocker",
      "Configure the daily isolated backup so Object Lock plus lifecycle deletion is no more than 180 days, and rotate its scoped key at least 30 days before expiry."
    ),
    check(
      "backup-restore-tested",
      "Backup restore has been tested recently",
      isRecentDate(env.BACKUP_RESTORE_TESTED_AT, generatedAt, 180),
      "blocker",
      "Run and document a backup restore test, then set BACKUP_RESTORE_TESTED_AT to its ISO date."
    ),
    check(
      "two-user-isolation-tested",
      "Two user isolation has been verified recently",
      isRecentDate(env.TWO_USER_ISOLATION_TESTED_AT, generatedAt, 30),
      "blocker",
      "Verify user A cannot access user B records or evidence, then set TWO_USER_ISOLATION_TESTED_AT."
    ),
    check(
      "data-retention-policy",
      "Data retention and deletion policy is approved",
      isEnabled(env.DATA_RETENTION_POLICY_APPROVED) && approvalEvidence.retention.ready,
      "blocker",
      "Approve the exact retention/deletion policy bundle, verify a recent privacy-rights rehearsal, and provide the validated approval manifest before real records are accepted."
    ),
    check(
      "marketing-analytics-privacy",
      "Growth measurement has an approved privacy configuration",
      !marketingAnalyticsEnabled ||
        (hasStrongSecret(env.MARKETING_ANALYTICS_SECRET) &&
          isEnabled(env.DATA_RETENTION_POLICY_APPROVED) &&
          approvalEvidence.retention.ready),
      "blocker",
      "Keep MARKETING_ANALYTICS_ENABLED false until the dedicated secret and exact 180 day aggregate event retention are covered by approved retention evidence."
    ),
    check(
      "customer-growth-schema",
      "Growth and feedback database schema is verified",
      (!marketingAnalyticsEnabled && !customerFeedbackInvitesEnabled) ||
        isRecentDate(env.CUSTOMER_GROWTH_SCHEMA_VERIFIED_AT, generatedAt, 30),
      "blocker",
      "Keep measurement and feedback invitations disabled until the growth and feedback migration has been applied and CUSTOMER_GROWTH_SCHEMA_VERIFIED_AT records the verification date."
    ),
    check(
      "incident-response-plan",
      "Incident response plan is approved",
      isEnabled(env.INCIDENT_RESPONSE_PLAN_APPROVED) && approvalEvidence.incident.ready,
      "blocker",
      "Approve the exact incident plan, validate the staffed-team contacts or disclosed solo-operator escalation model and a recent tabletop, and provide the validated approval manifest before real records are accepted."
    ),
    check(
      "privacy-policy",
      "Production privacy policy URL is canonical",
      isCanonicalPrivacyPolicyUrl(env.PRIVACY_POLICY_URL, env.NEXT_PUBLIC_APP_URL),
      "blocker",
      "Set PRIVACY_POLICY_URL to the exact /privacy page on NEXT_PUBLIC_APP_URL, without credentials, query parameters, or fragments."
    ),
    check(
      "public-legal-clauses",
      "Published subscription and attorney clauses are operative",
      publicLegalClausesAreOperative(env),
      "blocker",
      "Keep any feature whose published clauses are not operative disabled. Stripe billing and attorney access have separate source-controlled release states."
    ),
    check(
      "legal-review",
      "Privacy, terms, and runbooks have documented approval",
      isEnabled(env.LEGAL_REVIEW_APPROVED) && approvalEvidence.legal.ready,
      "blocker",
      "Record either qualified-counsel review or explicit operator self-review of the exact deployed policy digests in the protected approval manifest. Operator self-review is not a claim of legal compliance."
    ),
    check(
      "vendor-security-review",
      "Vendor security review is complete",
      isEnabled(env.VENDOR_SECURITY_REVIEW_APPROVED),
      "warning",
      "Review Supabase, hosting, malware scanning, email, logging, and monitoring vendors."
    ),
    check(
      "security-contact",
      "Security contact email is configured",
      isValidEmail(env.SECURITY_CONTACT_EMAIL),
      "warning",
      "Set SECURITY_CONTACT_EMAIL to a monitored address for vulnerability reports."
    ),
    check(
      "evidence-size-limit",
      "Evidence upload size limit is bounded",
      Number(env.EVIDENCE_MAX_FILE_BYTES || 0) > 0 &&
        Number(env.EVIDENCE_MAX_FILE_BYTES || 0) <= 25 * 1024 * 1024,
      "warning",
      "Set EVIDENCE_MAX_FILE_BYTES to a positive production limit, recommended <= 25 MB."
    ),
  ];

  const blockers = checks.filter((item) => !item.ready && item.severity === "blocker");
  const warnings = checks.filter((item) => !item.ready && item.severity === "warning");

  return {
    ready: blockers.length === 0,
    generatedAt,
    checks,
    blockers,
    warnings,
  };
}
