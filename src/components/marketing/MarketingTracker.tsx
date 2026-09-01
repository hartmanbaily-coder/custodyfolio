"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect } from "react";

const approvedSources = new Set([
  "direct",
  "app_store",
  "checklist",
  "community",
  "referral",
  "email",
  "apple_ads",
]);
const approvedMediums = new Set(["direct", "organic", "referral", "email", "cpc"]);
const approvedCampaigns = new Set([
  "launch",
  "checklist",
  "customer_referral",
  "apple_search",
  "founder_update",
  "customer_feedback",
]);

function approvedQueryValue(
  searchParams: URLSearchParams,
  name: string,
  approved: Set<string>
) {
  const value = (searchParams.get(name) || "").trim().toLowerCase().replace(/-/g, "_");
  return approved.has(value) ? value : undefined;
}

function attribution(contentCode: string) {
  const searchParams = new URLSearchParams(window.location.search);
  return {
    source: approvedQueryValue(searchParams, "utm_source", approvedSources),
    medium: approvedQueryValue(searchParams, "utm_medium", approvedMediums),
    campaign: approvedQueryValue(searchParams, "utm_campaign", approvedCampaigns),
    contentCode,
  };
}

function eventBody(eventName: string, contentCode: string) {
  return JSON.stringify({ eventName, ...attribution(contentCode) });
}

function sendMarketingEvent(eventName: string, contentCode: string) {
  const body = eventBody(eventName, contentCode);
  if (typeof navigator.sendBeacon === "function") {
    const payload = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon("/api/marketing/events", payload)) return;
  }
  void fetch("/api/marketing/events", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => undefined);
}

export function MarketingPageView() {
  useEffect(() => {
    sendMarketingEvent("marketing_page_viewed", "homepage");
  }, []);
  return null;
}

export function TrackedSignupLink({
  className,
  contentCode,
  children,
}: {
  className: string;
  contentCode: string;
  children: ReactNode;
}) {
  function trackSelection() {
    sendMarketingEvent("marketing_signup_selected", contentCode);
  }

  return (
    <Link
      href="/records?mode=signup"
      className={className}
      onClick={trackSelection}
    >
      {children}
    </Link>
  );
}
