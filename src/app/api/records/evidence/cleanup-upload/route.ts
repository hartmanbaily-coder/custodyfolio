import { NextRequest, NextResponse } from "next/server";
import {
  attachRefreshedRecordsSession,
  getRecordsAuthContext,
  isSupabaseRecordsMode,
} from "@/lib/records/authServer";
import {
  buildEvidenceStoragePath,
  getAuthoritativeEvidenceItem,
  getEvidenceBucket,
} from "@/lib/records/evidenceStorage";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import { requireRecordsCapability } from "@/lib/billing/capabilities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSupabaseRecordsMode()) {
    return NextResponse.json({ error: "Cloud records storage is not enabled." }, { status: 501 });
  }

  const rateLimit = checkRateLimit(request, {
    id: "records-evidence-cleanup-upload",
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();

  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context.error;
  const capability = await requireRecordsCapability(context, "evidence:delete");
  if (!capability.ok) return capability.error;

  const body = (await request.json().catch(() => ({}))) as {
    caseId?: unknown;
    evidenceId?: unknown;
    originalFileName?: unknown;
  };
  const caseId = typeof body.caseId === "string" ? body.caseId : "";
  const evidenceId = typeof body.evidenceId === "string" ? body.evidenceId : "";
  const originalFileName = typeof body.originalFileName === "string" ? body.originalFileName : "";

  if (!caseId || !evidenceId || !originalFileName) {
    return NextResponse.json({ error: "Incomplete temporary upload cleanup request." }, { status: 400 });
  }

  const authoritative = await getAuthoritativeEvidenceItem({
    supabase: context.supabase,
    userId: context.userId,
    evidenceId,
    caseId,
  });
  if (!("error" in authoritative)) {
    return NextResponse.json(
      { error: "Saved evidence must be deleted through the ordinary Files workflow." },
      { status: 409 }
    );
  }
  if (authoritative.reason !== "not_found") {
    return NextResponse.json(
      { error: "Unable to verify that this upload is temporary." },
      { status: 503 }
    );
  }

  const storagePath = buildEvidenceStoragePath({
    userId: context.userId,
    caseId,
    evidenceId,
    originalFileName,
  });
  const { error } = await context.supabase.storage
    .from(getEvidenceBucket())
    .remove([storagePath]);
  if (error) {
    return NextResponse.json({ error: "Unable to clean up the temporary evidence upload." }, { status: 500 });
  }

  return attachRefreshedRecordsSession(
    request,
    NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }),
    context
  );
}
