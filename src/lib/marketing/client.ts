"use client";

import { getRecordsCsrfToken } from "@/lib/records/attorneyClient";

export type AuthenticatedGrowthEventName =
  | "customer_first_timeline_viewed"
  | "customer_feedback_prompt_viewed"
  | "customer_value_prompt_viewed"
  | "customer_refund_requested";

export async function sendAuthenticatedGrowthEvent(
  eventName: AuthenticatedGrowthEventName
) {
  try {
    const csrf = await getRecordsCsrfToken();
    const response = await fetch("/api/records/growth-events", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-L2F-CSRF": csrf,
      },
      body: JSON.stringify({
        eventName,
        requestId: crypto.randomUUID(),
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
