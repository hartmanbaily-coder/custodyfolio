"use client";

import { useCallback, useEffect, useState } from "react";
import type { BillingStatus } from "./types";

export function useBillingStatus(enabled: boolean) {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setStatus(null);
      setLoading(false);
      setError(null);
      return null;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/records/billing/status", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = (await response.json().catch(() => ({}))) as
        | BillingStatus
        | { error?: string };
      if (!response.ok || !("entitlement" in body)) {
        throw new Error(
          "error" in body && body.error
            ? body.error
            : "Subscription status is unavailable."
        );
      }
      setStatus(body);
      setError(null);
      return body;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Subscription status is unavailable."
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  return { status, loading, error, refresh };
}
