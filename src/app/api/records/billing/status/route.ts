import { NextRequest, NextResponse } from "next/server";
import { isNativeIosUserAgent } from "@/lib/billing/config";
import { getBillingStatus } from "@/lib/billing/repository";
import {
  attachRefreshedRecordsSession,
  getRecordsAuthContext,
  isSupabaseRecordsMode,
} from "@/lib/records/authServer";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isSupabaseRecordsMode()) {
    return NextResponse.json(
      { error: "Billing status is available for cloud accounts only." },
      { status: 501, headers: { "Cache-Control": "no-store" } }
    );
  }

  const rateLimit = checkRateLimit(request, {
    id: "records-billing-status",
    limit: 120,
    windowMs: 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context.error;

  try {
    const status = await getBillingStatus({
      supabase: context.supabase,
      userId: context.userId,
      nativeIos: isNativeIosUserAgent(request.headers.get("user-agent")),
    });
    return attachRefreshedRecordsSession(
      request,
      NextResponse.json(status, { headers: { "Cache-Control": "no-store" } }),
      context
    );
  } catch {
    return NextResponse.json(
      { error: "Subscription status is temporarily unavailable." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "60" },
      }
    );
  }
}
