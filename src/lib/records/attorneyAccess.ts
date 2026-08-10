import type { NextRequest } from "next/server";
import type { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import type { RecordsDataset } from "./types";
import { openAttorneyHandle, sealAttorneyHandle } from "./attorneyCrypto";
import { projectSharedCaseDataset } from "./attorneyProjection";
import { attorneyGrantExpiryFilter } from "./attorneyProfileServer";

export type AttorneyAccessEventType =
  | "invitation_created"
  | "invitation_resent"
  | "invitation_accepted"
  | "invitation_revoked"
  | "attorney_left"
  | "portal_accessed"
  | "report_generated"
  | "report_downloaded"
  | "evidence_downloaded"
  | "access_denied"
  | "access_expired"
  | "case_access_invalidated"
  | "account_access_invalidated";

export interface ActiveAttorneyGrant {
  id: string;
  owner_user_id: string;
  attorney_user_id: string;
  invitation_id: string;
  case_key: string;
  case_id: string;
  permission_scope: "read_only";
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  left_at: string | null;
}

type ServiceSupabase = ReturnType<typeof createSupabaseAdminClient>;
const allowedAttorneyAuditMetadata = new Set([
  "reason",
  "reportType",
  "sectionId",
  "route",
  "consumerHealthSharingConsent",
  "consentVersion",
]);

export function sanitizeAttorneyAuditMetadata(
  metadata: Record<string, string | number | boolean> | undefined
) {
  return Object.fromEntries(
    Object.entries(metadata || {})
      .filter(([key]) => allowedAttorneyAuditMetadata.has(key))
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value.slice(0, 120) : value,
      ])
  ) as Record<string, string | number | boolean>;
}

export function genericAttorneyAccessError() {
  return "Shared matter is unavailable or access has ended.";
}

export async function resolveActiveAttorneyGrant(input: {
  supabase: unknown;
  attorneyUserId: string;
  accessHandle: string;
}) {
  const handle = openAttorneyHandle(input.accessHandle, {
    kind: "grant",
    subject: input.attorneyUserId,
  });
  if (!handle) return { error: genericAttorneyAccessError() } as const;

  const supabase = input.supabase as ServiceSupabase;
  const { data, error } = await supabase
    .from("records_attorney_grants")
    .select("id,owner_user_id,attorney_user_id,invitation_id,case_key,case_id,permission_scope,granted_at,expires_at,revoked_at,left_at")
    .eq("id", handle.id)
    .eq("attorney_user_id", input.attorneyUserId)
    .is("revoked_at", null)
    .is("left_at", null)
    .or(attorneyGrantExpiryFilter())
    .maybeSingle();

  if (error || !data || data.permission_scope !== "read_only") {
    return { error: genericAttorneyAccessError() } as const;
  }
  return { grant: data as ActiveAttorneyGrant } as const;
}

export async function loadAttorneySharedCase(input: {
  supabase: unknown;
  attorneyUserId: string;
  accessHandle: string;
}) {
  const access = await resolveActiveAttorneyGrant(input);
  if ("error" in access) return { error: access.error } as const;
  const supabase = input.supabase as ServiceSupabase;
  const { data, error } = await supabase
    .from("records_case_snapshots")
    .select("dataset,updated_at")
    .eq("user_id", access.grant.owner_user_id)
    .eq("case_key", access.grant.case_key)
    .maybeSingle();

  if (error || !data?.dataset) return { error: genericAttorneyAccessError() } as const;
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const projection = projectSharedCaseDataset(
    data.dataset as RecordsDataset,
    access.grant.owner_user_id,
    access.grant.case_id,
    (evidenceId) => sealAttorneyHandle({
      kind: "evidence",
      id: evidenceId,
      grantId: access.grant.id,
      subject: input.attorneyUserId,
      expiresAt,
    })
  );
  if (!projection) return { error: genericAttorneyAccessError() } as const;
  return { grant: access.grant, projection, updatedAt: data.updated_at as string | null } as const;
}

export async function recordAttorneyAccessEvent(input: {
  supabase: unknown;
  ownerUserId: string;
  actorUserId?: string;
  caseId?: string;
  invitationId?: string;
  grantId?: string;
  eventType: AttorneyAccessEventType;
  metadata?: Record<string, string | number | boolean>;
}) {
  const supabase = input.supabase as ServiceSupabase;
  const { error } = await supabase.from("records_attorney_access_events").insert({
    owner_user_id: input.ownerUserId,
    actor_user_id: input.actorUserId || null,
    case_id: input.caseId || null,
    invitation_id: input.invitationId || null,
    grant_id: input.grantId || null,
    event_type: input.eventType,
    metadata: sanitizeAttorneyAuditMetadata(input.metadata),
  });
  return error
    ? { ok: false as const, error: "Unable to record the required access event." }
    : { ok: true as const };
}

export function attorneyRequestAuditMetadata(request: NextRequest) {
  return { route: request.nextUrl.pathname.slice(0, 120) };
}

export async function invalidateAttorneyAccessForCases(input: {
  supabase: unknown;
  ownerUserId: string;
  caseIds: string[];
  reason: "case_deleted" | "account_deletion_requested";
}) {
  if (input.caseIds.length === 0) return { ok: true as const };
  const supabase = input.supabase as ServiceSupabase;
  const now = new Date().toISOString();
  const invitationResult = await supabase
    .from("records_attorney_invitations")
    .update({ status: "revoked", revoked_at: now })
    .eq("owner_user_id", input.ownerUserId)
    .in("case_id", input.caseIds)
    .eq("status", "pending");
  const grantResult = await supabase
    .from("records_attorney_grants")
    .update({ revoked_at: now, revocation_reason: input.reason })
    .eq("owner_user_id", input.ownerUserId)
    .in("case_id", input.caseIds)
    .is("revoked_at", null)
    .is("left_at", null);
  if (invitationResult.error || grantResult.error) {
    return { ok: false as const, error: "Unable to invalidate attorney access." };
  }

  for (const caseId of input.caseIds) {
    await recordAttorneyAccessEvent({
      supabase,
      ownerUserId: input.ownerUserId,
      caseId,
      eventType: input.reason === "case_deleted" ? "case_access_invalidated" : "account_access_invalidated",
      metadata: { reason: input.reason },
    });
  }
  return { ok: true as const };
}

export async function invalidateAllAttorneyAccessForOwner(input: {
  supabase: unknown;
  ownerUserId: string;
  reason: "account_deletion_requested";
}) {
  const supabase = input.supabase as ServiceSupabase;
  const now = new Date().toISOString();
  const [invitations, grants] = await Promise.all([
    supabase
      .from("records_attorney_invitations")
      .update({ status: "revoked", revoked_at: now })
      .eq("owner_user_id", input.ownerUserId)
      .eq("status", "pending"),
    supabase
      .from("records_attorney_grants")
      .update({ revoked_at: now, revocation_reason: input.reason })
      .eq("owner_user_id", input.ownerUserId)
      .is("revoked_at", null)
      .is("left_at", null),
  ]);
  if (invitations.error || grants.error) {
    return { ok: false as const, error: "Unable to invalidate attorney access." };
  }
  await recordAttorneyAccessEvent({
    supabase,
    ownerUserId: input.ownerUserId,
    eventType: "account_access_invalidated",
    metadata: { reason: input.reason },
  });
  return { ok: true as const };
}
