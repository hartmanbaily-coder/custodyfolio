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
import { evidenceFileName } from "@/lib/records/validation";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordSecurityEvent } from "@/lib/security/securityEvents";
import { requireRecordsCapability } from "@/lib/billing/capabilities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeDownloadName(value: string) {
  return value.replace(/[^a-zA-Z0-9 ._-]/g, "_").slice(0, 160) || "evidence-file";
}

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
    id: "records-evidence-download",
    limit: 120,
    windowMs: 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context.error;
  const capability = await requireRecordsCapability(context, "evidence:download");
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
      type: "evidence_download_denied",
      severity: "high",
      request,
      userId: context.userId,
      caseId: storedEvidence.caseId,
      evidenceId: storedEvidence.id,
      status: 403,
    });
    return NextResponse.json({ error: access.error }, { status: 403 });
  }

  if (storedEvidence.malwareScanStatus !== "clean") {
    return NextResponse.json({ error: "Evidence file is not available until scan is clean." }, { status: 409 });
  }

  const storageBucket = getEvidenceBucket();
  const { data, error } = await context.supabase.storage.from(storageBucket).download(storedEvidence.storagePath);

  if (error || !data) {
    return NextResponse.json({ error: "Unable to download evidence file." }, { status: 404 });
  }

  const response = new NextResponse(data, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${safeDownloadName(
        evidenceFileName(storedEvidence) || storedEvidence.storedFileName || "evidence-file"
      )}"`,
      "Content-Type": storedEvidence.fileType || data.type || "application/octet-stream",
    },
  });

  return attachRefreshedRecordsSession(request, response, context);
}
