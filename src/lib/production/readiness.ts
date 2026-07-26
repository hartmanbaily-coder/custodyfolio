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
  "supabase-mfa-policy",
  "records-mfa-enforced",
  "supabase-custom-smtp",
  "supabase-auth-redirects",
  "supabase-leaked-passwords",
  "supabase-password-minimum",
  "supabase-password-reauth",
  "supabase-auth-hardening-verified",
  "records-evidence-bucket",
  "attorney-guest-feature-flag",
  "attorney-portal-secret",
  "attorney-owner-share-delivery",
  "attorney-development-delivery",
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

function numberAtLeast(value: string | undefined, minimum: number) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed >= minimum;
}

function isRecentDate(value: string | undefined, nowIso: string, maxAgeDays: number) {
  if (!value) return false;
  const testedAt = Date.parse(value);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(testedAt) || !Number.isFinite(now) || testedAt > now) return false;
  return now - testedAt <= maxAgeDays * 24 * 60 * 60 * 1000;
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
      hasStrongSecret(env.ATTORNEY_PORTAL_SECRET)
        && env.ATTORNEY_PORTAL_SECRET !== env.AUTH_SECRET,
      "blocker",
      "Set ATTORNEY_PORTAL_SECRET to a separate random value of at least 32 characters."
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
      "supabase-mfa-policy",
      "Supabase MFA policy is required",
      env.SUPABASE_MFA_POLICY === "required",
      "blocker",
      "Set SUPABASE_MFA_POLICY=required after enforcing MFA enrollment and AAL2 checks for production users."
    ),
    check(
      "records-mfa-enforced",
      "Records API enforces MFA assurance level",
      isEnabled(env.RECORDS_ENFORCE_MFA),
      "blocker",
      "Set RECORDS_ENFORCE_MFA=true so production records APIs require an AAL2 Supabase session."
    ),
    check(
      "supabase-custom-smtp",
      "Supabase Auth uses production email delivery",
      isEnabled(env.SUPABASE_CUSTOM_SMTP_ENABLED),
      "blocker",
      "Configure custom SMTP for Supabase Auth before relying on signup or password reset emails."
    ),
    check(
      "supabase-auth-redirects",
      "Supabase Auth redirect URLs were verified recently",
      isRecentDate(env.SUPABASE_AUTH_REDIRECTS_VERIFIED_AT, generatedAt, 30),
      "blocker",
      "Verify custodyfolio.com auth redirects, /auth/confirm, and password reset recovery links, then set SUPABASE_AUTH_REDIRECTS_VERIFIED_AT."
    ),
    check(
      "supabase-leaked-passwords",
      "Leaked password protection is enabled",
      isEnabled(env.SUPABASE_LEAKED_PASSWORD_PROTECTION_ENABLED) ||
        isEnabled(env.PWNED_PASSWORD_CHECK_ENABLED),
      "blocker",
      "Enable Supabase leaked password protection or the app-level Have I Been Pwned range check."
    ),
    check(
      "supabase-password-minimum",
      "Password minimum length is strong",
      numberAtLeast(env.SUPABASE_PASSWORD_MIN_LENGTH, 12),
      "blocker",
      "Set Supabase password minimum length to at least 12 and declare SUPABASE_PASSWORD_MIN_LENGTH=12 or higher."
    ),
    check(
      "supabase-password-reauth",
      "Sensitive password changes require reauthentication",
      isEnabled(env.SUPABASE_PASSWORD_REAUTH_ENABLED) &&
        isEnabled(env.SUPABASE_CURRENT_PASSWORD_REQUIRED),
      "blocker",
      "Enable reauthentication and current password checks for password changes."
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
      isEnabled(env.DATA_RETENTION_POLICY_APPROVED),
      "blocker",
      "Approve retention, deletion, export, and backup aging policy before real records are accepted."
    ),
    check(
      "incident-response-plan",
      "Incident response plan is approved",
      isEnabled(env.INCIDENT_RESPONSE_PLAN_APPROVED),
      "blocker",
      "Approve an incident response and breach notification plan before real records are accepted."
    ),
    check(
      "privacy-policy",
      "Production privacy policy URL is configured",
      isHttpsUrl(env.PRIVACY_POLICY_URL),
      "blocker",
      "Set PRIVACY_POLICY_URL to the reviewed production privacy policy."
    ),
    check(
      "legal-review",
      "Privacy, terms, and runbooks have counsel approval",
      isEnabled(env.LEGAL_REVIEW_APPROVED),
      "blocker",
      "Have qualified counsel review privacy, terms, deletion, retention, and incident response materials, then set LEGAL_REVIEW_APPROVED=true."
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
