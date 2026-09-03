import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  attachGrowthCookies,
  growthAnalyticsEnabled,
  growthAttributionCookieName,
  growthVisitorCookieName,
  newGrowthVisitorToken,
  readGrowthAttribution,
  recordGrowthEvent,
  sanitizeGrowthAttribution,
  validGrowthVisitorToken,
} from "@/lib/marketing/growthEvents";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import {
  readTextBodyWithLimit,
  RequestBodyTooLargeError,
} from "@/lib/security/requestBody";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const publicEventNames = new Set([
  "marketing_page_viewed",
  "marketing_signup_selected",
]);

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === request.nextUrl.origin);
}

export async function POST(request: NextRequest) {
  if (!growthAnalyticsEnabled()) {
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json(
      { error: "Marketing event origin was not accepted." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const rateLimit = checkRateLimit(request, {
    id: "marketing-events-public",
    limit: 120,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  let rawBody: string;
  try {
    rawBody = await readTextBodyWithLimit(request, 4096);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: "Marketing event is too large." },
        { status: 413, headers: { "Cache-Control": "no-store" } }
      );
    }
    throw error;
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Marketing event is invalid." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const eventName = typeof body.eventName === "string" ? body.eventName : "";
  if (!publicEventNames.has(eventName)) {
    return NextResponse.json(
      { error: "Marketing event is not permitted." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const existingVisitorToken = validGrowthVisitorToken(
    request.cookies.get(growthVisitorCookieName)?.value
  );
  const visitorToken = existingVisitorToken || newGrowthVisitorToken();
  const existingAttribution = readGrowthAttribution(request);
  const suppliedAttribution = sanitizeGrowthAttribution({
    source: body.source,
    medium: body.medium,
    campaign: body.campaign,
    contentCode: body.contentCode,
  });
  const effectiveAttribution = {
    source: suppliedAttribution.source || existingAttribution.source || "direct",
    medium: suppliedAttribution.medium || existingAttribution.medium || "direct",
    campaign: suppliedAttribution.campaign || existingAttribution.campaign,
    contentCode: suppliedAttribution.contentCode || existingAttribution.contentCode,
  };
  const result = await recordGrowthEvent({
    supabase: createSupabaseAdminClient(),
    eventName: eventName as "marketing_page_viewed" | "marketing_signup_selected",
    request,
    visitorToken,
    platform: "web",
    attribution: effectiveAttribution,
  });

  if (!result.recorded && result.reason === "storage_failed") {
    return NextResponse.json(
      { error: "Marketing event could not be recorded." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } }
    );
  }

  const response = NextResponse.json(
    { ok: true },
    { status: 202, headers: { "Cache-Control": "no-store" } }
  );
  return attachGrowthCookies(response, {
    visitorToken,
    attribution: {
      source: existingAttribution.source || effectiveAttribution.source,
      medium: existingAttribution.medium || effectiveAttribution.medium,
      campaign: existingAttribution.campaign || effectiveAttribution.campaign,
      contentCode:
        existingAttribution.contentCode || effectiveAttribution.contentCode,
    },
    preserveAttribution: Boolean(
      request.cookies.get(growthAttributionCookieName)?.value
    ),
  });
}
