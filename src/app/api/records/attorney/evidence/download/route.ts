import { NextRequest, NextResponse } from "next/server";
import { openAttorneyHandle } from "@/lib/records/attorneyCrypto";
import { recordAttorneyAccessEvent, resolveActiveAttorneyGrant } from "@/lib/records/attorneyAccess";
import { getAttorneyAuthContext } from "@/lib/records/attorneyServer";
import {
  assertEvidenceItemAccess,
  getAuthoritativeEvidenceItem,
  getEvidenceBucket,
} from "@/lib/records/evidenceStorage";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import { evidenceFileName } from "@/lib/records/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeDownloadName(value: string) {
  return value.replace(/[^a-zA-Z0-9 ._-]/g, "_").replace(/\.{2,}/g, ".").slice(0, 160) || "evidence-file";
}

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(request, {
    id: "records-attorney-evidence-download",
    limit: 120,
    windowMs: 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();
  const context = await getAttorneyAuthContext(request);
  if ("error" in context) return context.error;
  const body = (await request.json().catch(() => ({}))) as {
    accessHandle?: unknown;
    evidenceHandle?: unknown;
  };
  const accessHandle = typeof body.accessHandle === "string" ? body.accessHandle : "";
  const evidenceHandle = typeof body.evidenceHandle === "string" ? body.evidenceHandle : "";
  const access = await resolveActiveAttorneyGrant({
    supabase: context.supabase,
    attorneyUserId: context.userId,
    accessHandle,
  });
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const evidenceAccess = openAttorneyHandle(evidenceHandle, {
    kind: "evidence",
    subject: context.userId,
  });
  if (!evidenceAccess || evidenceAccess.grantId !== access.grant.id) {
    return NextResponse.json(
      { error: "Evidence file is unavailable or access has ended." },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  const authoritative = await getAuthoritativeEvidenceItem({
    supabase: context.supabase,
    userId: access.grant.owner_user_id,
    evidenceId: evidenceAccess.id,
    caseId: access.grant.case_id,
  });
  if ("error" in authoritative) {
    return NextResponse.json(
      { error: "Evidence file is unavailable or access has ended." },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }
  const storedEvidence = authoritative.evidence;
  const owned = assertEvidenceItemAccess(storedEvidence, {
    userId: access.grant.owner_user_id,
    caseId: access.grant.case_id,
  });
  if (!owned.ok || storedEvidence.malwareScanStatus !== "clean") {
    return NextResponse.json(
      { error: "Evidence file is unavailable or access has ended." },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }
  const { data, error } = await context.supabase.storage
    .from(getEvidenceBucket())
    .download(storedEvidence.storagePath);
  if (error || !data) {
    return NextResponse.json({ error: "Evidence file is unavailable." }, { status: 404 });
  }
  const audit = await recordAttorneyAccessEvent({
    supabase: context.supabase,
    ownerUserId: access.grant.owner_user_id,
    actorUserId: context.userId,
    caseId: access.grant.case_id,
    grantId: access.grant.id,
    eventType: "evidence_downloaded",
  });
  if (!audit.ok) {
    return NextResponse.json(
      { error: "Unable to record the required evidence access event." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  return new NextResponse(data, {
    headers: {
      "Cache-Control": "no-store, private",
      "Content-Disposition": `attachment; filename="${safeDownloadName(evidenceFileName(storedEvidence))}"`,
      "Content-Type": storedEvidence.fileType || data.type || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
