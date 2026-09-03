import { NextRequest, NextResponse } from "next/server";
import {
  attachRefreshedRecordsSession,
  getRecordsAuthContext,
  getRecordsCaseKey,
  isSupabaseRecordsMode,
} from "@/lib/records/authServer";
import type { RecordsDataset } from "@/lib/records/types";
import { recordsAccountBindingHeaderName } from "@/lib/records/accountBoundary";
import {
  datasetContainsForeignRecords,
  isRecordsDataset,
  sanitizeRecordsDatasetForUser,
} from "@/lib/records/datasetIsolation";
import { invalidateAttorneyAccessForCases } from "@/lib/records/attorneyAccess";
import { deleteEvidenceForCases } from "@/lib/records/evidenceStorage";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordSecurityEvent } from "@/lib/security/securityEvents";
import {
  readTextBodyWithLimit,
  RequestBodyTooLargeError,
} from "@/lib/security/requestBody";
import { requireRecordsCapability } from "@/lib/billing/capabilities";
import {
  compareAndSetRecordsSnapshot,
  nextRecordsSnapshotTimestamp,
} from "@/lib/records/snapshotStore";
import { recordGrowthEvent } from "@/lib/marketing/growthEvents";
import { firstGrowthMilestones } from "@/lib/marketing/growthMilestones";
import { isNativeIosUserAgent } from "@/lib/billing/config";

export const dynamic = "force-dynamic";

function configuredMaxDatasetBytes() {
  const configured = Number(process.env.RECORDS_DATASET_MAX_BYTES || 2_000_000);
  return Number.isSafeInteger(configured) && configured >= 1 && configured <= 10_000_000
    ? configured
    : 2_000_000;
}

const maxDatasetBytes = configuredMaxDatasetBytes();

function disabledResponse() {
  return NextResponse.json(
    {
      error: "Cloud records storage is not enabled.",
      detail: "Records storage is not configured for authenticated cloud access.",
    },
    { status: 501 }
  );
}

async function verifyAccountBinding(
  request: NextRequest,
  userId: string
) {
  if (request.headers.get(recordsAccountBindingHeaderName) === userId) return null;

  await recordSecurityEvent({
    type: "records_dataset_account_binding_blocked",
    severity: "critical",
    request,
    userId,
    status: 409,
    detail: "A records request did not match the authenticated account boundary.",
  });
  return NextResponse.json(
    { error: "The records session changed. Reload before accessing this account." },
    { status: 409, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: NextRequest) {
  if (!isSupabaseRecordsMode()) return disabledResponse();

  const rateLimit = checkRateLimit(request, {
    id: "records-dataset-read",
    limit: 240,
    windowMs: 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context.error;

  const { supabase, userId } = context;
  const bindingError = await verifyAccountBinding(request, userId);
  if (bindingError) return bindingError;
  const capability = await requireRecordsCapability(context, "records:read");
  if (!capability.ok) return capability.error;
  const caseKey = getRecordsCaseKey(request);
  const { data, error } = await supabase
    .from("records_case_snapshots")
    .select("dataset, updated_at")
    .eq("user_id", userId)
    .eq("case_key", caseKey)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Unable to load records dataset." }, { status: 500 });
  }

  if (data?.dataset && !isRecordsDataset(data.dataset)) {
    return NextResponse.json({ error: "Stored records dataset is invalid." }, { status: 500 });
  }

  const storedDataset = data?.dataset || null;
  const dataset = storedDataset
    ? sanitizeRecordsDatasetForUser(storedDataset, userId)
    : null;
  if (storedDataset && datasetContainsForeignRecords(storedDataset, userId)) {
    await recordSecurityEvent({
      type: "records_dataset_foreign_data_removed",
      severity: "critical",
      request,
      userId,
      status: 200,
      detail: "Foreign-owned or orphaned records were removed from an account snapshot response.",
    });
  }

  const response = NextResponse.json(
    {
      dataset,
      updatedAt: data?.updated_at || null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
  return attachRefreshedRecordsSession(request, response, context);
}

export async function PUT(request: NextRequest) {
  if (!isSupabaseRecordsMode()) return disabledResponse();

  const rateLimit = checkRateLimit(request, {
    id: "records-dataset-write",
    limit: 60,
    windowMs: 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context.error;

  const bindingError = await verifyAccountBinding(request, context.userId);
  if (bindingError) return bindingError;
  const capability = await requireRecordsCapability(context, "records:write");
  if (!capability.ok) return capability.error;

  let rawBody: string;
  try {
    rawBody = await readTextBodyWithLimit(request, maxDatasetBytes);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Records dataset is too large." }, { status: 413 });
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const body = parsed as { dataset?: unknown; expectedUpdatedAt?: unknown };
  if (!isRecordsDataset(body.dataset)) {
    return NextResponse.json({ error: "Invalid records dataset shape." }, { status: 400 });
  }
  if (
    !("expectedUpdatedAt" in body) ||
    (body.expectedUpdatedAt !== null &&
      (typeof body.expectedUpdatedAt !== "string" ||
        !Number.isFinite(Date.parse(body.expectedUpdatedAt))))
  ) {
    return NextResponse.json(
      { error: "Reload the latest records dataset before saving." },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }
  const expectedUpdatedAt = body.expectedUpdatedAt as string | null;

  const { supabase, userId } = context;
  if (datasetContainsForeignRecords(body.dataset, userId)) {
    await recordSecurityEvent({
      type: "records_dataset_foreign_data_blocked",
      severity: "critical",
      request,
      userId,
      status: 403,
      detail: "A snapshot write attempted to include foreign-owned or orphaned records.",
    });
    return NextResponse.json(
      { error: "Records dataset contains records outside the current account or case." },
      { status: 403 }
    );
  }
  const ownedDataset = sanitizeRecordsDatasetForUser(body.dataset, userId);

  const caseKey = getRecordsCaseKey(request);
  const { data: currentRow, error: currentError } = await supabase
    .from("records_case_snapshots")
    .select("dataset,updated_at")
    .eq("user_id", userId)
    .eq("case_key", caseKey)
    .maybeSingle();
  if (currentError) {
    return NextResponse.json({ error: "Unable to verify current records dataset." }, { status: 500 });
  }
  if (currentRow?.dataset && !isRecordsDataset(currentRow.dataset)) {
    return NextResponse.json({ error: "Stored records dataset is invalid." }, { status: 500 });
  }
  const currentDataset = currentRow?.dataset as RecordsDataset | undefined;
  if (currentDataset && datasetContainsForeignRecords(currentDataset, userId)) {
    return NextResponse.json({ error: "Stored records dataset is invalid." }, { status: 500 });
  }
  const currentUpdatedAt = (currentRow?.updated_at as string | undefined) || null;
  if (currentUpdatedAt !== expectedUpdatedAt) {
    return NextResponse.json(
      { error: "These records changed in another session. Reload before saving." },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }
  const pendingCaseIds = new Set(
    (currentDataset?.matters || [])
      .filter((matter) => Boolean(matter.deletionPendingAt))
      .map((matter) => matter.id)
  );
  if (
    ownedDataset.matters.some((matter) => pendingCaseIds.has(matter.id))
  ) {
    return NextResponse.json(
      { error: "Case deletion is already in progress. Reload before saving." },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }
  const nextCaseIds = new Set(
    ownedDataset.matters.map((matter) => matter.id)
  );
  const removedCaseIds = (currentDataset?.matters || [])
    .filter((matter) => matter.userId === userId && !nextCaseIds.has(matter.id))
    .map((matter) => matter.id);
  let writeExpectedAt = currentUpdatedAt;
  if (currentDataset && removedCaseIds.length > 0) {
    const deletionPendingAt = nextRecordsSnapshotTimestamp(currentUpdatedAt);
    const pendingDataset: RecordsDataset = {
      ...currentDataset,
      matters: currentDataset.matters.map((matter) =>
        removedCaseIds.includes(matter.id)
          ? { ...matter, deletionPendingAt, updatedAt: deletionPendingAt }
          : matter
      ),
    };
    const pending = await compareAndSetRecordsSnapshot({
      supabase,
      userId,
      caseKey,
      expectedUpdatedAt: currentUpdatedAt,
      dataset: pendingDataset,
      updatedAt: deletionPendingAt,
    });
    if (!pending.ok) {
      return NextResponse.json(
        {
          error:
            pending.reason === "conflict"
              ? "These records changed in another session. Reload before deleting."
              : "Case deletion was stopped because uploads could not be paused safely.",
        },
        { status: pending.reason === "conflict" ? 409 : 503 }
      );
    }
    writeExpectedAt = pending.updatedAt;
  }
  const invalidation = await invalidateAttorneyAccessForCases({
    supabase,
    ownerUserId: userId,
    caseIds: removedCaseIds,
    reason: "case_deleted",
  });
  if (!invalidation.ok) {
    return NextResponse.json(
      { error: "Case deletion was stopped because shared access could not be revoked." },
      { status: 503 }
    );
  }
  const evidenceCleanup = await deleteEvidenceForCases({
    supabase,
    userId,
    caseIds: removedCaseIds,
  });
  if (!evidenceCleanup.ok) {
    await recordSecurityEvent({
      type: "case_evidence_cleanup_failed",
      severity: "high",
      request,
      userId,
      status: 503,
      detail: "Case deletion stopped because private evidence cleanup could not be confirmed.",
    });
    return NextResponse.json(
      { error: "Case deletion was stopped because private evidence cleanup could not be confirmed." },
      { status: 503 }
    );
  }
  const savedAt = nextRecordsSnapshotTimestamp(writeExpectedAt);
  const saved = await compareAndSetRecordsSnapshot({
    supabase,
    userId,
    caseKey,
    expectedUpdatedAt: writeExpectedAt,
    dataset: ownedDataset,
    updatedAt: savedAt,
  });

  if (!saved.ok) {
    return NextResponse.json(
      {
        error:
          saved.reason === "conflict"
            ? "These records changed in another session. Reload before saving."
            : "Unable to save records dataset.",
      },
      { status: saved.reason === "conflict" ? 409 : 500 }
    );
  }

  const milestoneEvents = firstGrowthMilestones({
    before: currentDataset,
    after: ownedDataset,
    userId,
  });
  for (const eventName of milestoneEvents) {
    await recordGrowthEvent({
      supabase,
      eventName,
      request,
      userId,
      platform: isNativeIosUserAgent(request.headers.get("user-agent")) ? "ios" : "web",
    });
  }

  const response = NextResponse.json(
    { ok: true, updatedAt: saved.updatedAt },
    { headers: { "Cache-Control": "no-store" } }
  );
  return attachRefreshedRecordsSession(request, response, context);
}
