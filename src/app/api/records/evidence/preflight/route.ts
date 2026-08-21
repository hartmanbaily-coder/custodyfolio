import { NextRequest, NextResponse } from "next/server";
import {
  attachRefreshedRecordsSession,
  getRecordsAuthContext,
  isSupabaseRecordsMode,
} from "@/lib/records/authServer";
import {
  evaluateEvidenceIntakeReadiness,
  validateEvidencePreflight,
} from "@/lib/records/evidenceSecurity";
import { requireRecordsCapability } from "@/lib/billing/capabilities";

export const dynamic = "force-dynamic";

function disabledResponse() {
  return NextResponse.json(
    {
      error: "Cloud records storage is not enabled.",
      detail: "Enable authenticated cloud records storage before evidence intake.",
    },
    { status: 501 }
  );
}

export async function POST(request: NextRequest) {
  if (!isSupabaseRecordsMode()) return disabledResponse();

  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context.error;
  const capability = await requireRecordsCapability(context, "evidence:upload");
  if (!capability.ok) return capability.error;

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const body = parsed as {
    originalFileName?: unknown;
    fileType?: unknown;
    fileSize?: unknown;
  };
  const validation = validateEvidencePreflight({
    originalFileName: typeof body.originalFileName === "string" ? body.originalFileName : "",
    fileType: typeof body.fileType === "string" ? body.fileType : "",
    fileSize: typeof body.fileSize === "number" ? body.fileSize : 0,
  });

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const readiness = evaluateEvidenceIntakeReadiness();
  if (!readiness.ready) {
    return NextResponse.json(
      {
        error: "Evidence intake is temporarily unavailable.",
      },
      { status: 503 }
    );
  }

  const response = NextResponse.json(
    {
      ok: true,
      malwareScanStatus: "pending",
      storageBucket: process.env.RECORDS_EVIDENCE_BUCKET || "records-evidence",
      storagePrefix: context.userId,
    },
    { headers: { "Cache-Control": "no-store" } }
  );

  return attachRefreshedRecordsSession(request, response, context);
}
