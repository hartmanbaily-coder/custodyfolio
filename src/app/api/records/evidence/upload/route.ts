import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  attachRefreshedRecordsSession,
  getRecordsAuthContext,
  isSupabaseRecordsMode,
} from "@/lib/records/authServer";
import { evaluateEvidenceIntakeReadiness, validateEvidencePreflight } from "@/lib/records/evidenceSecurity";
import {
  buildEvidenceStoragePath,
  getEvidenceBucket,
} from "@/lib/records/evidenceStorage";
import { recordsAccountBindingHeaderName } from "@/lib/records/accountBoundary";
import { scanEvidenceFile } from "@/lib/records/malwareScanner";
import {
  buildStoredEvidenceName,
  normalizeEvidenceFileType,
  validateEvidenceFileSignature,
} from "@/lib/records/validation";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordSecurityEvent } from "@/lib/security/securityEvents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function disabledResponse() {
  return NextResponse.json(
    {
      error: "Cloud records storage is not enabled.",
      detail: "Enable authenticated cloud records storage before evidence upload.",
    },
    { status: 501 }
  );
}

function isFileLike(value: unknown): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "type" in value &&
    "size" in value &&
    "arrayBuffer" in value
  );
}

function datasetOwnsCase(
  dataset: unknown,
  userId: string,
  caseId: string
) {
  if (!dataset || typeof dataset !== "object" || !("matters" in dataset)) return false;
  const matters = (dataset as { matters?: unknown }).matters;
  return (
    Array.isArray(matters) &&
    matters.some(
      (matter) =>
        matter &&
        typeof matter === "object" &&
        "id" in matter &&
        "userId" in matter &&
        matter.id === caseId &&
        matter.userId === userId
    )
  );
}

export async function POST(request: NextRequest) {
  if (!isSupabaseRecordsMode()) return disabledResponse();

  const rateLimit = checkRateLimit(request, {
    id: "records-evidence-upload",
    limit: 12,
    windowMs: 10 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context.error;

  if (request.headers.get(recordsAccountBindingHeaderName) !== context.userId) {
    await recordSecurityEvent({
      type: "records_evidence_account_binding_blocked",
      severity: "critical",
      request,
      userId: context.userId,
      status: 409,
      detail: "An evidence upload did not match the authenticated account boundary.",
    });
    return NextResponse.json(
      { error: "The records session changed. Reload before uploading a file." },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }

  const readiness = evaluateEvidenceIntakeReadiness();
  if (!readiness.ready) {
    return attachRefreshedRecordsSession(
      request,
      NextResponse.json(
        {
          error: "Evidence upload is temporarily unavailable.",
        },
        { status: 503 }
      ),
      context
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const caseId = String(formData.get("caseId") || "");
  const evidenceId = String(formData.get("evidenceId") || "");

  if (!caseId || !evidenceId) {
    return NextResponse.json({ error: "Missing evidence case or id." }, { status: 400 });
  }

  const { data: snapshot, error: snapshotError } = await context.supabase
    .from("records_case_snapshots")
    .select("dataset")
    .eq("user_id", context.userId)
    .eq("case_key", "default")
    .maybeSingle();
  if (snapshotError) {
    return NextResponse.json(
      { error: "Unable to verify the selected case." },
      { status: 503 }
    );
  }
  if (!datasetOwnsCase(snapshot?.dataset, context.userId, caseId)) {
    await recordSecurityEvent({
      type: "records_evidence_case_boundary_blocked",
      severity: "critical",
      request,
      userId: context.userId,
      caseId,
      evidenceId,
      status: 403,
      detail: "An evidence upload referenced a case outside the authenticated account snapshot.",
    });
    return NextResponse.json(
      { error: "The selected case is unavailable. Reload before uploading a file." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!isFileLike(file)) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }

  const normalizedFileType = normalizeEvidenceFileType({
    originalFileName: file.name,
    fileType: file.type,
  });
  const validation = validateEvidencePreflight({
    originalFileName: file.name,
    fileType: normalizedFileType,
    fileSize: file.size,
  });

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const signatureValidation = validateEvidenceFileSignature(
    {
      originalFileName: file.name,
      fileType: normalizedFileType,
      fileSize: file.size,
    },
    buffer
  );
  if (!signatureValidation.ok) {
    return NextResponse.json({ error: signatureValidation.error }, { status: 400 });
  }

  const scan = await scanEvidenceFile({
    buffer,
    fileName: file.name,
    fileType: normalizedFileType,
  });

  if (scan.status === "blocked") {
    await recordSecurityEvent({
      type: "evidence_upload_scanner_blocked",
      severity: "high",
      request,
      userId: context.userId,
      caseId,
      evidenceId,
      status: 422,
      detail: scan.provider,
    });
    return NextResponse.json(
      {
        error: "Evidence upload blocked by malware scan.",
        malwareScanStatus: "blocked",
      },
      { status: 422 }
    );
  }

  if (scan.status !== "clean") {
    await recordSecurityEvent({
      type: "evidence_upload_scanner_failed",
      severity: "high",
      request,
      userId: context.userId,
      caseId,
      evidenceId,
      status: 503,
      detail: scan.provider,
    });
    return NextResponse.json(
      {
        error: "Evidence upload could not be scanned.",
        malwareScanStatus: "failed",
      },
      { status: 503 }
    );
  }

  const storageBucket = getEvidenceBucket();
  const storagePath = buildEvidenceStoragePath({
    userId: context.userId,
    caseId,
    evidenceId,
    originalFileName: file.name,
  });
  const storedFileName = buildStoredEvidenceName({ id: evidenceId, originalFileName: file.name });
  const storageSha256 = createHash("sha256").update(buffer).digest("hex");

  const { error: uploadError } = await context.supabase.storage.from(storageBucket).upload(
    storagePath,
    buffer,
    {
      cacheControl: "0",
      contentType: normalizedFileType,
      upsert: false,
    }
  );

  if (uploadError) {
    await recordSecurityEvent({
      type: "evidence_storage_failed",
      severity: "high",
      request,
      userId: context.userId,
      caseId,
      evidenceId,
      status: 500,
    });
    return NextResponse.json({ error: "Unable to store evidence file." }, { status: 500 });
  }

  const response = NextResponse.json(
    {
      evidence: {
        id: evidenceId,
        userId: context.userId,
        caseId,
        originalFileName: file.name,
        storedFileName,
        fileType: normalizedFileType,
        fileSize: file.size,
        storageBucket,
        storagePath,
        storageSha256,
        storageUploadedAt: new Date().toISOString(),
        malwareScanStatus: "clean",
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );

  return attachRefreshedRecordsSession(request, response, context);
}
