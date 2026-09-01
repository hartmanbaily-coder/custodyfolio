import { NextRequest, NextResponse } from "next/server";
import { isNativeIosUserAgent } from "@/lib/billing/config";
import { recordGrowthEvent } from "@/lib/marketing/growthEvents";
import {
  attachRefreshedRecordsSession,
  getRecordsAuthContext,
  isSupabaseRecordsMode,
} from "@/lib/records/authServer";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const promptKey = "first_record_feedback_v1";

function customerFeedbackInvitationsEnabled(
  env: Record<string, string | undefined> = process.env
) {
  return env.CUSTOMER_FEEDBACK_INVITE_ENABLED === "true";
}

function disabledResponse() {
  return NextResponse.json(
    { error: "Customer feedback invitations are available for cloud accounts only." },
    { status: 501, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: NextRequest) {
  if (!isSupabaseRecordsMode() || !customerFeedbackInvitationsEnabled()) {
    return disabledResponse();
  }

  const rateLimit = checkRateLimit(request, {
    id: "records-customer-feedback-read",
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context.error;

  const [choiceResult, countResult] = await Promise.all([
    context.supabase
      .from("custody_folio_customer_feedback_consents")
      .select("status,contact_count")
      .eq("user_id", context.userId)
      .eq("prompt_key", promptKey)
      .maybeSingle(),
    context.supabase
      .from("custody_folio_customer_feedback_consents")
      .select("id", { count: "exact", head: true })
      .eq("prompt_key", promptKey)
      .eq("status", "opted_in"),
  ]);

  if (choiceResult.error || countResult.error) {
    return NextResponse.json(
      { error: "Customer feedback invitation is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } }
    );
  }

  const optedInCount = Number(countResult.count || 0);
  const choice = choiceResult.data?.status || null;
  return attachRefreshedRecordsSession(
    request,
    NextResponse.json(
      {
        eligible: !choice && optedInCount < 10,
        choice,
        cohortFull: !choice && optedInCount >= 10,
      },
      { headers: { "Cache-Control": "no-store" } }
    ),
    context
  );
}

export async function POST(request: NextRequest) {
  if (!isSupabaseRecordsMode() || !customerFeedbackInvitationsEnabled()) {
    return disabledResponse();
  }
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();

  const rateLimit = checkRateLimit(request, {
    id: "records-customer-feedback-write",
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context.error;

  const body = (await request.json().catch(() => ({}))) as { choice?: unknown };
  const choice = body.choice;
  if (choice !== "opted_in" && choice !== "declined") {
    return NextResponse.json(
      { error: "Choose whether Custody Folio may contact you once for feedback." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const now = new Date();
  const result = await context.supabase.rpc("custody_folio_record_feedback_choice", {
    p_user_id: context.userId,
    p_choice: choice,
    p_now: now.toISOString(),
  });
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (result.error || !row?.choice) {
    return NextResponse.json(
      { error: "Unable to save your feedback choice right now." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } }
    );
  }

  if (row.choice === "opted_in") {
    await recordGrowthEvent({
      supabase: context.supabase,
      eventName: "customer_feedback_opted_in",
      request,
      userId: context.userId,
      platform: isNativeIosUserAgent(request.headers.get("user-agent")) ? "ios" : "web",
      attribution: { contentCode: "in_product_feedback" },
    });
  }

  return attachRefreshedRecordsSession(
    request,
    NextResponse.json(
      {
        ok: true,
        choice: row.choice,
        cohortFull: Boolean(row.cohort_full),
      },
      { headers: { "Cache-Control": "no-store" } }
    ),
    context
  );
}
