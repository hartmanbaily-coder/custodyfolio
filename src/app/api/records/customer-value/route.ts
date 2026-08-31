import { NextRequest, NextResponse } from "next/server";
import {
  attachRefreshedRecordsSession,
  getRecordsAuthContext,
  isSupabaseRecordsMode,
} from "@/lib/records/authServer";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const promptKey = "organization_value_v1";

function disabledResponse() {
  return NextResponse.json(
    { error: "Customer value responses are available for cloud accounts only." },
    { status: 501, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: NextRequest) {
  if (!isSupabaseRecordsMode()) return disabledResponse();

  const rateLimit = checkRateLimit(request, {
    id: "records-customer-value-read",
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context.error;

  const { data, error } = await context.supabase
    .from("custody_folio_customer_value_responses")
    .select("score,responded_at")
    .eq("user_id", context.userId)
    .eq("prompt_key", promptKey)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Customer value response is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } }
    );
  }

  return attachRefreshedRecordsSession(
    request,
    NextResponse.json(
      {
        response: data
          ? { score: Number(data.score), respondedAt: data.responded_at }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } }
    ),
    context
  );
}

export async function POST(request: NextRequest) {
  if (!isSupabaseRecordsMode()) return disabledResponse();
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();

  const rateLimit = checkRateLimit(request, {
    id: "records-customer-value-write",
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context.error;

  let body: { score?: unknown };
  try {
    body = (await request.json()) as { score?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Number.isInteger(body.score) || Number(body.score) < 1 || Number(body.score) > 5) {
    return NextResponse.json(
      { error: "Choose a score from 1 through 5." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const respondedAt = new Date().toISOString();
  const { data, error } = await context.supabase
    .from("custody_folio_customer_value_responses")
    .upsert(
      {
        user_id: context.userId,
        prompt_key: promptKey,
        score: Number(body.score),
        responded_at: respondedAt,
        updated_at: respondedAt,
      },
      { onConflict: "user_id,prompt_key" }
    )
    .select("score,responded_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Unable to save your response right now." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } }
    );
  }

  return attachRefreshedRecordsSession(
    request,
    NextResponse.json(
      {
        ok: true,
        response: { score: Number(data.score), respondedAt: data.responded_at },
      },
      { headers: { "Cache-Control": "no-store" } }
    ),
    context
  );
}
