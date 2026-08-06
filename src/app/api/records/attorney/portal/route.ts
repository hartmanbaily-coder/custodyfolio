import { NextRequest, NextResponse } from "next/server";
import {
  loadAttorneySharedCase,
  recordAttorneyAccessEvent,
} from "@/lib/records/attorneyAccess";
import { sealAttorneyHandle } from "@/lib/records/attorneyCrypto";
import { getAttorneyGuestAuthContext } from "@/lib/records/attorneyServer";
import { attachRefreshedRecordsSession } from "@/lib/records/authServer";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import type { RecordsDataset } from "@/lib/records/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const rateLimit = checkRateLimit(request, {
    id: "records-attorney-portal-read",
    limit: 180,
    windowMs: 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);
  const context = await getAttorneyGuestAuthContext(request);
  if ("error" in context) return context.error;
  const { data, error } = await context.supabase
    .from("records_attorney_grants")
    .select("id,owner_user_id,case_key,case_id,granted_at,expires_at")
    .eq("attorney_user_id", context.userId)
    .is("revoked_at", null)
    .is("left_at", null)
    .order("granted_at", { ascending: false })
    .limit(10);
  if (error) return NextResponse.json({ error: "Unable to load shared matters." }, { status: 500 });
  const grants = data || [];
  const ownerIds = [...new Set(grants.map((grant) => grant.owner_user_id))];
  const snapshots = ownerIds.length
    ? await context.supabase
        .from("records_case_snapshots")
        .select("user_id,case_key,dataset")
        .in("user_id", ownerIds)
        .limit(25)
    : { data: [], error: null };
  if (snapshots.error) {
    return NextResponse.json({ error: "Unable to load shared matter labels." }, { status: 500 });
  }
  const snapshotByOwnerCase = new Map(
    (snapshots.data || []).map((snapshot) => [
      `${snapshot.user_id}:${snapshot.case_key}`,
      snapshot.dataset as RecordsDataset,
    ])
  );
  const response = NextResponse.json(
    {
      matters: grants.map((grant, index) => {
        const dataset = snapshotByOwnerCase.get(`${grant.owner_user_id}:${grant.case_key}`);
        const matter = dataset?.matters.find(
          (item) => item.userId === grant.owner_user_id && item.id === grant.case_id
        );
        const owner = dataset?.users.find((item) => item.userId === grant.owner_user_id);
        const clientLabel = owner?.displayName?.trim() || "Client";
        const caseLabel = matter?.caseName?.trim() || `Shared matter ${index + 1}`;
        return {
          accessHandle: sealAttorneyHandle({
            kind: "grant",
            id: grant.id,
            subject: context.userId,
            expiresAt: Date.now() + 60 * 60 * 1000,
          }),
          label: `${clientLabel} — ${caseLabel}`,
          grantedAt: grant.granted_at,
        };
      }),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
  return attachRefreshedRecordsSession(request, response, context);
}

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(request, {
    id: "records-attorney-portal-open",
    limit: 180,
    windowMs: 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();
  const context = await getAttorneyGuestAuthContext(request);
  if ("error" in context) return context.error;
  const body = (await request.json().catch(() => ({}))) as { accessHandle?: unknown };
  const accessHandle = typeof body.accessHandle === "string" ? body.accessHandle : "";
  if (!accessHandle) {
    return NextResponse.json(
      { error: "Shared matter is unavailable or access has ended." },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  const shared = await loadAttorneySharedCase({
    supabase: context.supabase,
    attorneyUserId: context.userId,
    accessHandle,
  });
  if ("error" in shared) {
    return NextResponse.json({ error: shared.error }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const audit = await recordAttorneyAccessEvent({
    supabase: context.supabase,
    ownerUserId: shared.grant.owner_user_id,
    actorUserId: context.userId,
    caseId: shared.grant.case_id,
    grantId: shared.grant.id,
    eventType: "portal_accessed",
  });
  if (!audit.ok) {
    return NextResponse.json(
      { error: "Shared matter is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  const response = NextResponse.json(
    {
      accessHandle,
      projection: shared.projection,
      updatedAt: shared.updatedAt,
      accessExpiresAt: shared.grant.expires_at,
      readOnly: true,
    },
    { headers: { "Cache-Control": "no-store, private" } }
  );
  return attachRefreshedRecordsSession(request, response, context);
}
