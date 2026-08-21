import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

type SecurityEventSeverity = "info" | "warning" | "high" | "critical";

export type SecurityEventType =
  | "auth_login_success"
  | "auth_login_failed"
  | "auth_login_unregistered_identity_blocked"
  | "auth_signup_requested"
  | "auth_signup_failed"
  | "auth_signup_compromised_password_blocked"
  | "auth_signup_confirmation_blocked"
  | "auth_signup_confirmation_resent"
  | "auth_signup_confirmation_resend_failed"
  | "policy_terms_accepted"
  | "auth_email_confirmed"
  | "auth_email_confirm_failed"
  | "auth_password_reset_requested"
  | "auth_password_reset_failed"
  | "auth_password_updated"
  | "auth_password_update_failed"
  | "auth_password_session_revocation_failed"
  | "auth_password_update_compromised_password_blocked"
  | "auth_password_safety_check_unavailable"
  | "auth_recovery_session_accepted"
  | "auth_recovery_session_failed"
  | "auth_logout_session_revocation_failed"
  | "auth_mfa_required"
  | "auth_mfa_verified"
  | "auth_mfa_failed"
  | "auth_mfa_enrollment_started"
  | "auth_mfa_enrollment_verified"
  | "auth_mfa_enrollment_failed"
  | "auth_mfa_policy_denied"
  | "account_deletion_requested"
  | "account_deletion_request_failed"
  | "account_deletion_completed"
  | "account_deletion_failed"
  | "account_deletion_storage_cleanup_failed"
  | "account_deletion_session_revocation_failed"
  | "account_deletion_billing_cancellation_failed"
  | "account_deletion_billing_redaction_failed"
  | "evidence_upload_scanner_blocked"
  | "evidence_upload_scanner_failed"
  | "evidence_storage_failed"
  | "evidence_upload_orphan_cleanup_failed"
  | "records_evidence_account_binding_blocked"
  | "records_evidence_case_boundary_blocked"
  | "evidence_download_denied"
  | "evidence_delete_denied"
  | "records_dataset_account_binding_blocked"
  | "records_dataset_foreign_data_blocked"
  | "records_dataset_foreign_data_removed"
  | "case_evidence_cleanup_failed";

export interface SecurityEventInput {
  type: SecurityEventType;
  severity: SecurityEventSeverity;
  request?: NextRequest;
  userId?: string;
  caseId?: string;
  evidenceId?: string;
  status?: number;
  detail?: string;
}

function hashForLog(value: string | undefined) {
  if (!value) return undefined;
  const salt = process.env.SECURITY_LOG_HASH_SALT || process.env.AUTH_SECRET || "custody-folio-records";
  return createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 24);
}

function securityEventWebhookUrl() {
  const raw = process.env.SECURITY_EVENT_WEBHOOK_URL;
  if (!raw) return "";

  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function requestMetadata(request: NextRequest | undefined) {
  if (!request) return {};
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const userAgent = request.headers.get("user-agent") || undefined;
  const requestId =
    request.headers.get("x-request-id") ||
    request.headers.get("x-vercel-id") ||
    request.headers.get("cf-ray") ||
    randomUUID();

  return {
    method: request.method,
    route: request.nextUrl.pathname,
    requestId,
    ipHash: hashForLog(forwardedFor),
    userAgentHash: hashForLog(userAgent),
  };
}

export async function recordSecurityEvent(input: SecurityEventInput) {
  const event = {
    event: "custody_folio_security_event",
    type: input.type,
    severity: input.severity,
    at: new Date().toISOString(),
    status: input.status,
    detail: input.detail?.slice(0, 180),
    userIdHash: hashForLog(input.userId),
    caseIdHash: hashForLog(input.caseId),
    evidenceId: input.evidenceId,
    ...requestMetadata(input.request),
  };

  console.info(JSON.stringify(event));

  const webhookUrl = securityEventWebhookUrl();
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.SECURITY_EVENT_WEBHOOK_TOKEN
          ? { Authorization: `Bearer ${process.env.SECURITY_EVENT_WEBHOOK_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(event),
    });
  } catch {
    console.warn(
      JSON.stringify({
        event: "custody_folio_security_event_delivery_failed",
        at: new Date().toISOString(),
        type: input.type,
      })
    );
  }
}
