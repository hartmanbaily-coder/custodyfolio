import { NextRequest, NextResponse } from "next/server";
import { isNativeIosUserAgent } from "@/lib/billing/config";
import { recordGrowthEvent } from "@/lib/marketing/growthEvents";
import { getRecordsAuthContext, isSupabaseRecordsMode } from "@/lib/records/authServer";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const clientEventNames = new Set([
  "customer_first_timeline_viewed",
  "customer_feedback_prompt_viewed",
  "customer_refund_requested",
]);

export async function POST(request: NextRequest) {
  if (!isSupabaseRecordsMode()) {
    return NextResponse.json(
      { error: "Growth events are available for cloud accounts only." },
      { status: 501, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();

  const rateLimit = checkRateLimit(request, {
    id: "records-growth-events",
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context.error;

  const body = (await request.json().catch(() => ({}))) as {
    eventName?: unknown;
    requestId?: unknown;
  };
  const eventName = typeof body.eventName === "string" ? body.eventName : "";
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  if (!clientEventNames.has(eventName) || !/^[0-9a-f-]{36}$/i.test(requestId)) {
    return NextResponse.json(
      { error: "Growth event is invalid." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const result = await recordGrowthEvent({
    supabase: context.supabase,
    eventName: eventName as
      | "customer_first_timeline_viewed"
      | "customer_feedback_prompt_viewed"
      | "customer_refund_requested",
    request,
    userId: context.userId,
    platform: isNativeIosUserAgent(request.headers.get("user-agent")) ? "ios" : "web",
    attribution:
      eventName === "customer_feedback_prompt_viewed"
        ? { contentCode: "in_product_feedback" }
        : eventName === "customer_refund_requested"
          ? { contentCode: "subscription" }
          : undefined,
    dedupeSeed:
      eventName === "customer_refund_requested" ? requestId : undefined,
  });

  return NextResponse.json(
    { ok: true, recorded: result.recorded },
    { headers: { "Cache-Control": "no-store" } }
  );
}
