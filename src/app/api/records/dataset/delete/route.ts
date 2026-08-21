import { NextRequest, NextResponse } from "next/server";
import { requireRecordsCapability } from "@/lib/billing/capabilities";
import {
  deleteOwnedRecordFromDataset,
  isExportOnlyDeletableCollection,
} from "@/lib/billing/exportOnlyDeletion";
import { invalidateAttorneyAccessForCases } from "@/lib/records/attorneyAccess";
import {
  attachRefreshedRecordsSession,
  getRecordsAuthContext,
  getRecordsCaseKey,
  isSupabaseRecordsMode,
} from "@/lib/records/authServer";
import {
  datasetContainsForeignRecords,
  isRecordsDataset,
  sanitizeRecordsDatasetForUser,
} from "@/lib/records/datasetIsolation";
import { deleteEvidenceForCases } from "@/lib/records/evidenceStorage";
import { recordsAccountBindingHeaderName } from "@/lib/records/accountBoundary";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import {
  compareAndSetRecordsSnapshot,
  nextRecordsSnapshotTimestamp,
} from "@/lib/records/snapshotStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSupabaseRecordsMode()) {
    return NextResponse.json({ error: "Cloud records storage is not enabled." }, { status: 501 });
  }
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();

  const rateLimit = checkRateLimit(request, {
    id: "records-dataset-delete",
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context.error;
  if (request.headers.get(recordsAccountBindingHeaderName) !== context.userId) {
    return NextResponse.json(
      { error: "The records session changed. Reload before deleting this record." },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }
  const capability = await requireRecordsCapability(context, "records:delete");
  if (!capability.ok) return capability.error;

  const body = (await request.json().catch(() => ({}))) as {
    collection?: unknown;
    id?: unknown;
    expectedUpdatedAt?: unknown;
  };
  const id = typeof body.id === "string" ? body.id.slice(0, 180) : "";
  if (!id || !isExportOnlyDeletableCollection(body.collection)) {
    return NextResponse.json(
      { error: "Choose a supported record to delete." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (
    !("expectedUpdatedAt" in body) ||
    (body.expectedUpdatedAt !== null &&
      (typeof body.expectedUpdatedAt !== "string" ||
        !Number.isFinite(Date.parse(body.expectedUpdatedAt))))
  ) {
    return NextResponse.json(
      { error: "Reload the latest records dataset before deleting." },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }
  const expectedUpdatedAt = body.expectedUpdatedAt as string | null;
  const caseKey = getRecordsCaseKey(request);

  const { data, error } = await context.supabase
    .from("records_case_snapshots")
    .select("dataset,updated_at")
    .eq("user_id", context.userId)
    .eq("case_key", caseKey)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Unable to load the record for deletion." }, { status: 503 });
  }
  if (!data?.dataset || !isRecordsDataset(data.dataset)) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }
  if (datasetContainsForeignRecords(data.dataset, context.userId)) {
    return NextResponse.json({ error: "Stored records dataset is invalid." }, { status: 500 });
  }
  const currentUpdatedAt = (data.updated_at as string | undefined) || null;
  if (currentUpdatedAt !== expectedUpdatedAt) {
    return NextResponse.json(
      { error: "These records changed in another session. Reload before deleting." },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }

  const current = sanitizeRecordsDatasetForUser(data.dataset, context.userId);
  const deletion = deleteOwnedRecordFromDataset({
    dataset: current,
    userId: context.userId,
    collection: body.collection,
    id,
  });
  if (!deletion.ok) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  let writeExpectedAt = currentUpdatedAt;
  if (deletion.deletedCase) {
    const pendingAt = nextRecordsSnapshotTimestamp(currentUpdatedAt);
    const pendingDataset = {
      ...current,
      matters: current.matters.map((matter) =>
        matter.id === id && matter.userId === context.userId
          ? { ...matter, deletionPendingAt: pendingAt, updatedAt: pendingAt }
          : matter
      ),
    };
    const pending = await compareAndSetRecordsSnapshot({
      supabase: context.supabase,
      userId: context.userId,
      caseKey,
      expectedUpdatedAt: currentUpdatedAt,
      dataset: pendingDataset,
      updatedAt: pendingAt,
    });
    if (!pending.ok) {
      return NextResponse.json(
        {
          error:
            pending.reason === "conflict"
              ? "These records changed in another session. Reload before deleting."
              : "Case deletion stopped because uploads could not be paused.",
        },
        { status: pending.reason === "conflict" ? 409 : 503 }
      );
    }
    writeExpectedAt = pending.updatedAt;

    const invalidation = await invalidateAttorneyAccessForCases({
      supabase: context.supabase,
      ownerUserId: context.userId,
      caseIds: [id],
      reason: "case_deleted",
    });
    if (!invalidation.ok) {
      return NextResponse.json(
        { error: "Case deletion stopped because attorney access could not be revoked." },
        { status: 503 }
      );
    }
    const evidence = await deleteEvidenceForCases({
      supabase: context.supabase,
      userId: context.userId,
      caseIds: [id],
    });
    if (!evidence.ok) {
      return NextResponse.json(
        { error: "Case deletion stopped because private files could not be removed." },
        { status: 503 }
      );
    }
  }

  const savedAt = nextRecordsSnapshotTimestamp(writeExpectedAt);
  const saved = await compareAndSetRecordsSnapshot({
    supabase: context.supabase,
    userId: context.userId,
    caseKey,
    expectedUpdatedAt: writeExpectedAt,
    dataset: deletion.dataset,
    updatedAt: savedAt,
  });
  if (!saved.ok) {
    return NextResponse.json(
      {
        error:
          saved.reason === "conflict"
            ? "These records changed in another session. Reload before deleting."
            : "Unable to delete this record.",
      },
      { status: saved.reason === "conflict" ? 409 : 500 }
    );
  }

  return attachRefreshedRecordsSession(
    request,
    NextResponse.json(
      { ok: true, deletedAt: savedAt, updatedAt: saved.updatedAt },
      { headers: { "Cache-Control": "no-store" } }
    ),
    context
  );
}
