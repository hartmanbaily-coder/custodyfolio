import { NextRequest, NextResponse } from "next/server";
import {
  attachRefreshedRecordsSession,
  getRecordsAuthContext,
  isSupabaseRecordsMode,
} from "@/lib/records/authServer";
import {
  assertEvidenceItemAccess,
  getAuthoritativeEvidenceItem,
  getEvidenceBucket,
} from "@/lib/records/evidenceStorage";
import type { EvidenceItem } from "@/lib/records/types";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordSecurityEvent } from "@/lib/security/securityEvents";
import { requireRecordsCapability } from "@/lib/billing/capabilities";
import { removeEvidenceMetadataFromDataset } from "@/lib/billing/exportOnlyDeletion";
import { isRecordsDataset } from "@/lib/records/datasetIsolation";
import {
  compareAndSetRecordsSnapshot,
  nextRecordsSnapshotTimestamp,
} from "@/lib/records/snapshotStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function readEvidenceBody(request: NextRequest) {
  try {
    const body = (await request.json()) as { evidence?: Partial<EvidenceItem> };
    return body.evidence || null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseRecordsMode()) {
    return NextResponse.json({ error: "Cloud records storage is not enabled." }, { status: 501 });
  }

  const rateLimit = checkRateLimit(request, {
    id: "records-evidence-delete",
    limit: 30,
    windowMs: 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context.error;
  const capability = await requireRecordsCapability(context, "evidence:delete");
  if (!capability.ok) return capability.error;

  const evidence = await readEvidenceBody(request);
  if (!evidence?.id) {
    return NextResponse.json({ error: "Evidence metadata is incomplete." }, { status: 400 });
  }

  const authoritative = await getAuthoritativeEvidenceItem({
    supabase: context.supabase,
    userId: context.userId,
    evidenceId: evidence.id,
    caseId: evidence.caseId,
  });
  if ("error" in authoritative) {
    return NextResponse.json({ error: authoritative.error }, { status: 404 });
  }

  const storedEvidence = authoritative.evidence;
  const snapshotCaseKey = authoritative.caseKey;
  const access = assertEvidenceItemAccess(
    {
      id: storedEvidence.id,
      userId: storedEvidence.userId,
      caseId: storedEvidence.caseId,
      originalFileName: storedEvidence.originalFileName,
      storagePath: storedEvidence.storagePath,
      malwareScanStatus: storedEvidence.malwareScanStatus,
    },
    { userId: context.userId, caseId: storedEvidence.caseId }
  );
  if (!access.ok) {
    await recordSecurityEvent({
      type: "evidence_delete_denied",
      severity: "high",
      request,
      userId: context.userId,
      caseId: storedEvidence.caseId,
      evidenceId: storedEvidence.id,
      status: 403,
    });
    return NextResponse.json({ error: access.error }, { status: 403 });
  }

  const storageBucket = getEvidenceBucket();
  const { error } = await context.supabase.storage.from(storageBucket).remove([storedEvidence.storagePath]);

  if (error) {
    return NextResponse.json({ error: "Unable to delete evidence file." }, { status: 500 });
  }

  let metadataFinalized = false;
  let databaseError = false;
  for (let attempt = 0; attempt < 3 && !metadataFinalized; attempt += 1) {
    const snapshot = await context.supabase
      .from("records_case_snapshots")
      .select("dataset,updated_at")
      .eq("user_id", context.userId)
      .eq("case_key", snapshotCaseKey)
      .maybeSingle();
    if (
      snapshot.error ||
      !snapshot.data?.dataset ||
      !isRecordsDataset(snapshot.data.dataset) ||
      typeof snapshot.data.updated_at !== "string"
    ) {
      databaseError = true;
      break;
    }
    if (!snapshot.data.dataset.evidenceItems.some((item) => item.id === storedEvidence.id)) {
      metadataFinalized = true;
      break;
    }
    const nextDataset = removeEvidenceMetadataFromDataset({
      dataset: snapshot.data.dataset,
      userId: context.userId,
      evidenceId: storedEvidence.id,
    });
    const saved = await compareAndSetRecordsSnapshot({
      supabase: context.supabase,
      userId: context.userId,
      caseKey: snapshotCaseKey,
      expectedUpdatedAt: snapshot.data.updated_at,
      dataset: nextDataset,
      updatedAt: nextRecordsSnapshotTimestamp(snapshot.data.updated_at),
    });
    if (saved.ok) metadataFinalized = true;
    else if (saved.reason === "database_error") databaseError = true;
  }
  if (!metadataFinalized) {
    return NextResponse.json(
      {
        error: databaseError
          ? "The file was removed, but its record could not be finalized. Reload and retry deletion."
          : "The file was removed, but another records update happened at the same time. Reload to finish deletion safely.",
      },
      { status: databaseError ? 502 : 409, headers: { "Cache-Control": "no-store" } }
    );
  }

  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  return attachRefreshedRecordsSession(request, response, context);
}
