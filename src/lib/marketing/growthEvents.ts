import { createHmac, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";

export const growthEventNames = [
  "marketing_page_viewed",
  "marketing_signup_selected",
  "account_signup_requested",
  "account_signup_confirmed",
  "customer_first_matter_created",
  "customer_first_record_saved",
  "customer_first_timeline_viewed",
  "customer_first_report_created",
  "customer_feedback_prompt_viewed",
  "customer_value_prompt_viewed",
  "customer_feedback_opted_in",
  "customer_subscription_started",
  "customer_subscription_cancelled",
  "customer_refund_requested",
] as const;

export type GrowthEventName = (typeof growthEventNames)[number];
export type GrowthPlatform = "web" | "ios";
export type GrowthPlanInterval = "month" | "year";

const growthSources = new Set([
  "direct",
  "app_store",
  "checklist",
  "community",
  "referral",
  "email",
  "apple_ads",
]);
const growthMediums = new Set(["direct", "organic", "referral", "email", "cpc"]);
const growthCampaigns = new Set([
  "launch",
  "checklist",
  "customer_referral",
  "apple_search",
  "founder_update",
  "customer_feedback",
]);
const growthContentCodes = new Set([
  "homepage",
  "header_desktop",
  "header_mobile",
  "hero",
  "quick_add_record",
  "quick_review_timeline",
  "quick_prepare_or_share",
  "pricing",
  "factual_checklist",
  "in_product_feedback",
  "subscription",
]);

const firstTimeEvents = new Set<GrowthEventName>([
  "account_signup_requested",
  "account_signup_confirmed",
  "customer_first_matter_created",
  "customer_first_record_saved",
  "customer_first_timeline_viewed",
  "customer_first_report_created",
  "customer_feedback_prompt_viewed",
  "customer_value_prompt_viewed",
  "customer_feedback_opted_in",
  "customer_subscription_started",
]);

const secureCookies = process.env.NODE_ENV === "production";
export const growthVisitorCookieName = secureCookies
  ? "__Host-custodyfolio-growth-visitor"
  : "custodyfolio-growth-visitor";
export const growthAttributionCookieName = secureCookies
  ? "__Host-custodyfolio-growth-attribution"
  : "custodyfolio-growth-attribution";

const growthCookieMaxAge = 60 * 60 * 24 * 30;

export interface GrowthAttribution {
  source?: string;
  medium?: string;
  campaign?: string;
  contentCode?: string;
}

type GrowthSupabase = Pick<SupabaseClient, "from">;

function analyticsSecret(
  env: Record<string, string | undefined> = process.env
) {
  const secret = String(env.MARKETING_ANALYTICS_SECRET || "");
  return secret.length >= 32 ? secret : "";
}

export function growthAnalyticsEnabled(
  env: Record<string, string | undefined> = process.env
) {
  return env.MARKETING_ANALYTICS_ENABLED === "true" && Boolean(analyticsSecret(env));
}

function hmacHex(
  value: string,
  env: Record<string, string | undefined> = process.env
) {
  const secret = analyticsSecret(env);
  if (!secret) return "";
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function growthCohortIdentifierForUser(
  userId: string,
  env: Record<string, string | undefined> = process.env
) {
  return hmacHex(`user:${userId}`, env).slice(0, 32);
}

export function growthCohortIdentifierForVisitor(
  visitorToken: string,
  env: Record<string, string | undefined> = process.env
) {
  return hmacHex(`visitor:${visitorToken}`, env).slice(0, 32);
}

export function newGrowthVisitorToken() {
  return randomBytes(24).toString("base64url");
}

export function validGrowthVisitorToken(value: string | null | undefined) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32}$/.test(value)
    ? value
    : "";
}

function allowedValue(value: unknown, allowed: Set<string>) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");
  return allowed.has(normalized) ? normalized : undefined;
}

export function sanitizeGrowthAttribution(
  input: Record<string, unknown> | null | undefined
): GrowthAttribution {
  return {
    source: allowedValue(input?.source, growthSources),
    medium: allowedValue(input?.medium, growthMediums),
    campaign: allowedValue(input?.campaign, growthCampaigns),
    contentCode: allowedValue(input?.contentCode, growthContentCodes),
  };
}

function attributionCookiePayload(attribution: GrowthAttribution) {
  const sanitized = sanitizeGrowthAttribution(attribution as Record<string, unknown>);
  if (!sanitized.source && !sanitized.medium && !sanitized.campaign) return "";
  const encoded = Buffer.from(JSON.stringify(sanitized)).toString("base64url");
  const signature = hmacHex(`attribution:${encoded}`);
  return signature ? `${encoded}.${signature}` : "";
}

export function readGrowthAttribution(request: NextRequest): GrowthAttribution {
  const value = request.cookies.get(growthAttributionCookieName)?.value || "";
  const [encoded, signature, extra] = value.split(".");
  if (!encoded || !signature || extra) return {};
  const expected = hmacHex(`attribution:${encoded}`);
  if (!expected || signature !== expected) return {};
  try {
    return sanitizeGrowthAttribution(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<
        string,
        unknown
      >
    );
  } catch {
    return {};
  }
}

function growthCookieOptions() {
  return {
    httpOnly: true,
    maxAge: growthCookieMaxAge,
    path: "/",
    sameSite: "lax" as const,
    secure: secureCookies,
  };
}

export function attachGrowthCookies(
  response: NextResponse,
  input: {
    visitorToken: string;
    attribution?: GrowthAttribution;
    preserveAttribution?: boolean;
  }
) {
  response.cookies.set(
    growthVisitorCookieName,
    input.visitorToken,
    growthCookieOptions()
  );
  if (!input.preserveAttribution && input.attribution) {
    const payload = attributionCookiePayload(input.attribution);
    if (payload) {
      response.cookies.set(
        growthAttributionCookieName,
        payload,
        growthCookieOptions()
      );
    }
  }
  return response;
}

function safeFailureCode(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9_]{1,64}$/.test(normalized) ? normalized : null;
}

function eventDedupeKey(input: {
  eventName: GrowthEventName;
  cohortIdentifier: string;
  dedupeSeed?: string;
}) {
  const seed = input.dedupeSeed
    ? `${input.eventName}:${input.cohortIdentifier}:${input.dedupeSeed}`
    : firstTimeEvents.has(input.eventName)
      ? `${input.eventName}:${input.cohortIdentifier}:first`
      : "";
  return seed ? hmacHex(`dedupe:${seed}`) : null;
}

export interface GrowthEventRecordInput {
  supabase: GrowthSupabase;
  eventName: GrowthEventName;
  request?: NextRequest;
  userId?: string;
  visitorToken?: string;
  platform?: GrowthPlatform;
  attribution?: GrowthAttribution;
  planInterval?: GrowthPlanInterval | null;
  success?: boolean;
  failureCode?: string | null;
  occurredAt?: Date;
  dedupeSeed?: string;
}

export function subscriptionGrowthEventNames(input: {
  status: string;
  cancelAtPeriodEnd?: boolean | null;
  providerEventType?: string | null;
}) {
  const events: GrowthEventName[] = [];
  const providerEventType = String(input.providerEventType || "").toLowerCase();
  if (input.status === "active") {
    events.push("customer_subscription_started");
  }
  if (input.status === "canceled" || input.cancelAtPeriodEnd === true) {
    events.push("customer_subscription_cancelled");
  }
  if (input.status === "refunded" || providerEventType.includes("refund")) {
    events.push("customer_refund_requested");
  }
  return [...new Set(events)];
}

export async function recordGrowthEvent(input: GrowthEventRecordInput) {
  if (!growthAnalyticsEnabled()) {
    return { recorded: false, reason: "disabled" as const };
  }

  const cohortIdentifier = input.userId
    ? growthCohortIdentifierForUser(input.userId)
    : growthCohortIdentifierForVisitor(input.visitorToken || "");
  if (!cohortIdentifier) {
    return { recorded: false, reason: "missing_cohort" as const };
  }

  const cookieAttribution = input.request ? readGrowthAttribution(input.request) : {};
  const attribution = sanitizeGrowthAttribution({
    source: input.attribution?.source ?? cookieAttribution.source,
    medium: input.attribution?.medium ?? cookieAttribution.medium,
    campaign: input.attribution?.campaign ?? cookieAttribution.campaign,
    contentCode: input.attribution?.contentCode ?? cookieAttribution.contentCode,
  });
  const occurredAt = input.occurredAt || new Date();
  const row = {
    event_name: input.eventName,
    occurred_at: occurredAt.toISOString(),
    platform: input.platform || "web",
    source: attribution.source || null,
    medium: attribution.medium || null,
    campaign: attribution.campaign || null,
    content_code: attribution.contentCode || null,
    plan_interval: input.planInterval || null,
    first_time: firstTimeEvents.has(input.eventName),
    success: input.success !== false,
    failure_code: safeFailureCode(input.failureCode),
    cohort_identifier: cohortIdentifier,
    dedupe_key: eventDedupeKey({
      eventName: input.eventName,
      cohortIdentifier,
      dedupeSeed: input.dedupeSeed,
    }),
    expires_at: new Date(occurredAt.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString(),
  };

  try {
    const { error } = await input.supabase
      .from("custody_folio_growth_events")
      .upsert(row, {
        onConflict: "dedupe_key",
        ignoreDuplicates: true,
      });
    if (error) throw error;
    return { recorded: true, reason: null };
  } catch {
    console.warn(
      JSON.stringify({
        event: "custody_folio_growth_event_failed",
        eventName: input.eventName,
        at: new Date().toISOString(),
      })
    );
    return { recorded: false, reason: "storage_failed" as const };
  }
}

export async function deleteGrowthEventsForUser(input: {
  supabase: GrowthSupabase;
  userId: string;
  env?: Record<string, string | undefined>;
}) {
  const cohortIdentifier = growthCohortIdentifierForUser(
    input.userId,
    input.env || process.env
  );
  if (!cohortIdentifier) {
    return { ok: true as const, deleted: false, reason: "not_configured" as const };
  }

  try {
    const { error } = await input.supabase
      .from("custody_folio_growth_events")
      .delete()
      .eq("cohort_identifier", cohortIdentifier);
    if (error) throw error;
    return { ok: true as const, deleted: true, reason: null };
  } catch {
    return { ok: false as const, error: "Growth measurement deletion failed." };
  }
}
