"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BillingStatus } from "@/lib/billing/types";
import { getRecordsCsrfToken } from "@/lib/records/attorneyClient";

interface StoreProduct {
  productId: string;
  displayName: string;
  displayPrice: string;
  periodDescription: string;
}

interface NativeBillingDetail {
  status?: "success" | "pending" | "cancelled" | "failed";
  message?: string;
  products?: StoreProduct[];
  signedTransactionInfo?: string;
  signedTransactions?: string[];
}

type NativeBillingHandler = {
  postMessage(payload: Record<string, unknown>): void;
};

function nativeBillingHandler(): NativeBillingHandler | null {
  if (typeof window === "undefined") return null;
  const candidate = (
    window as Window & {
      webkit?: { messageHandlers?: { custodyFolioBilling?: NativeBillingHandler } };
    }
  ).webkit?.messageHandlers?.custodyFolioBilling;
  return candidate || null;
}

function sourceLabel(status: BillingStatus) {
  switch (status.entitlement.source) {
    case "stripe": return "Web billing";
    case "apple": return "App Store";
    case "trial": return "30-day trial";
    case "disabled": return "Billing disabled";
    default: return "No active subscription";
  }
}

function readableDate(value: string | null) {
  if (!value) return "Not available";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Not available"
    : parsed.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}

export default function SubscriptionPanel({
  status,
  loading,
  error,
  refresh,
  cloudStorageEnabled,
}: {
  status: BillingStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<BillingStatus | null>;
  cloudStorageEnabled: boolean;
}) {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const postNative = useCallback((action: string, productId?: string) => {
    const handler = nativeBillingHandler();
    if (!handler || !status?.appleAppAccountToken) {
      setMessage("The native App Store purchase screen is unavailable. Reopen this page in the Custody Folio iOS app.");
      return false;
    }
    handler.postMessage({
      action,
      requestId: crypto.randomUUID(),
      ...(productId ? { productId } : {}),
      appAccountToken: status.appleAppAccountToken,
    });
    return true;
  }, [status?.appleAppAccountToken]);

  const verifyNativeTransactions = useCallback(async (transactions: string[]) => {
    for (const signedTransactionInfo of transactions) {
      const csrf = await getRecordsCsrfToken();
      const response = await fetch("/api/records/billing/apple/transaction", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-L2F-CSRF": csrf,
        },
        body: JSON.stringify({ signedTransactionInfo }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "The App Store transaction could not be verified.");
      }
    }
    await refresh();
  }, [refresh]);

  useEffect(() => {
    const handleNativeBilling = (event: Event) => {
      const detail = (event as CustomEvent<NativeBillingDetail>).detail || {};
      if (detail.products) setProducts(detail.products);
      const transactions = [
        ...(detail.signedTransactionInfo ? [detail.signedTransactionInfo] : []),
        ...(detail.signedTransactions || []),
      ];
      if (transactions.length > 0) {
        setBusy("verify");
        void verifyNativeTransactions(transactions)
          .then(() => setMessage("Your App Store subscription status is up to date."))
          .catch((caught: unknown) => setMessage(
            caught instanceof Error
              ? caught.message
              : "The App Store transaction could not be verified."
          ))
          .finally(() => setBusy(""));
        return;
      }
      if (detail.status === "pending") {
        setMessage("The App Store purchase is pending approval or payment completion. Full access begins after Apple confirms it.");
      } else if (detail.status === "cancelled") {
        setMessage("No purchase was made.");
      } else if (detail.message) {
        setMessage(detail.message);
      }
      setBusy("");
    };
    window.addEventListener("custodyfolio:billing", handleNativeBilling);
    return () => window.removeEventListener("custodyfolio:billing", handleNativeBilling);
  }, [verifyNativeTransactions]);

  useEffect(() => {
    if (!status?.nativeIos || status.billingMode === "disabled") return;
    postNative("loadProducts");
    postNative("currentEntitlements");
  }, [postNative, status?.billingMode, status?.nativeIos]);

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.productId, product])),
    [products]
  );

  async function callBillingEndpoint(endpoint: string, body?: unknown) {
    const csrf = await getRecordsCsrfToken();
    const response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-L2F-CSRF": csrf },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const parsed = (await response.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };
    if (!response.ok) throw new Error(parsed.error || "Billing request failed.");
    return parsed;
  }

  async function beginCheckout(plan: "monthly" | "annual") {
    setBusy(plan);
    setMessage("");
    try {
      const result = await callBillingEndpoint(
        "/api/records/billing/stripe/checkout",
        { plan, requestId: crypto.randomUUID() }
      );
      if (!result.url) throw new Error("Stripe did not return a secure checkout page.");
      window.location.assign(result.url);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Secure checkout is unavailable.");
      setBusy("");
    }
  }

  async function openStripePortal() {
    setBusy("portal");
    try {
      const result = await callBillingEndpoint("/api/records/billing/stripe/portal");
      if (!result.url) throw new Error("Stripe did not return a secure management page.");
      window.location.assign(result.url);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Billing management is unavailable.");
      setBusy("");
    }
  }

  async function reconcile(provider: "stripe" | "apple") {
    setBusy("reconcile");
    try {
      await callBillingEndpoint(`/api/records/billing/${provider}/reconcile`);
      await refresh();
      setMessage("Subscription status refreshed from the billing provider.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Subscription status could not be refreshed.");
    } finally {
      setBusy("");
    }
  }

  if (!cloudStorageEnabled) {
    return (
      <section className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-blue-950 shadow-sm">
        <h2 className="text-lg font-semibold">Subscription</h2>
        <p className="mt-2 text-sm leading-6">
          Billing is not used in this private local drafting workspace. Current features remain available and no charge can be created.
        </p>
      </section>
    );
  }
  if (loading && !status) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-busy="true">
        <h2 className="text-lg font-semibold text-slate-950">Subscription</h2>
        <p className="mt-2 text-sm text-slate-600">Checking subscription access…</p>
      </section>
    );
  }
  if (!status) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-5" role="alert">
        <h2 className="text-lg font-semibold text-rose-950">Subscription status unavailable</h2>
        <p className="mt-2 text-sm text-rose-800">{error || "Try again shortly."}</p>
        <button type="button" className="btn-secondary mt-4" onClick={() => void refresh()}>Try again</button>
      </section>
    );
  }

  const appleMonthly = productsById.get(status.pricing.ios.monthlyProductId);
  const appleAnnual = productsById.get(status.pricing.ios.annualProductId);
  const canPurchase =
    status.checkoutEnabled && status.entitlement.mode === "export_only";
  const renewalDate = readableDate(
    status.subscription?.currentPeriodEnd || status.entitlement.effectiveUntil
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">One complete tier</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Custody Folio subscription</h2>
          </div>
          <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800">{sourceLabel(status)}</span>
        </div>

        {status.billingMode === "disabled" ? (
          <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
            Billing is disabled for this build. Your current Custody Folio features remain available, and no charge can be created.
          </div>
        ) : status.entitlement.mode === "trial" ? (
          <div className="mt-5 rounded-lg border border-teal-200 bg-teal-50 p-4">
            <h3 className="font-semibold text-teal-950">Your no-card trial is active</h3>
            <p className="mt-1 text-sm leading-6 text-teal-900">
              {status.trial.daysRemaining} {status.trial.daysRemaining === 1 ? "day" : "days"} remaining. No payment method is needed during the 30-day trial. Billing choices open after {readableDate(status.trial.endsAt)}.
            </p>
          </div>
        ) : status.entitlement.mode === "grace_period" ? (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h3 className="font-semibold text-amber-950">Payment needs attention</h3>
            <p className="mt-1 text-sm leading-6 text-amber-900">Full access continues through {readableDate(status.entitlement.gracePeriodEndsAt)}. Update payment to avoid switching to export-only access.</p>
          </div>
        ) : status.entitlement.mode === "export_only" ? (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h3 className="font-semibold text-amber-950">Export-only access</h3>
            <p className="mt-1 text-sm leading-6 text-amber-900">You can still sign in, view records, download files, create every export, delete information, manage billing, and revoke attorney access. Adding or editing records, uploading files, and sending new attorney invitations are paused until access is reactivated.</p>
          </div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Access</p>
              <p className="mt-1 font-semibold text-slate-950">Full subscription access</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{status.subscription?.cancelAtPeriodEnd ? "Access through" : "Renews / reviewed"}</p>
              <p className="mt-1 font-semibold text-slate-950">{renewalDate}</p>
            </div>
          </div>
        )}
        {status.subscription?.cancelAtPeriodEnd && status.entitlement.mode === "active" ? (
          <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-950">Cancellation is scheduled for the end of the paid period. Full access continues until then, and exports remain available afterward.</p>
        ) : null}
        {!status.checkoutEnabled && status.billingMode !== "disabled" && status.entitlement.mode === "export_only" ? (
          <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-950">New subscription checkout is temporarily paused. Viewing, exporting, downloading, deleting, billing management, and attorney revocation remain available.</p>
        ) : null}
      </section>

      {status.nativeIos && !status.checkoutEnabled ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">In-app purchases are temporarily unavailable</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            No charge can be created in this build. Existing subscriptions remain available through the provider that manages them, and you can still restore or manage an App Store subscription below.
          </p>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2" aria-label="Subscription prices">
        <PlanCard
          title="Monthly"
          price={status.nativeIos ? appleMonthly?.displayPrice || "App Store price" : status.pricing.web.monthly}
          detail="Renews each month until cancelled. No provider trial is added because the account trial is managed by Custody Folio."
          action={canPurchase ? (status.nativeIos ? "Choose monthly in App Store" : "Choose monthly") : null}
          busy={busy === "monthly"}
          onAction={() => {
            if (status.nativeIos) { setBusy("monthly"); postNative("purchase", status.pricing.ios.monthlyProductId); }
            else void beginCheckout("monthly");
          }}
        />
        <PlanCard
          title="Annual"
          price={status.nativeIos ? appleAnnual?.displayPrice || "App Store price" : status.pricing.web.annual}
          detail={status.nativeIos
            ? `${appleAnnual?.periodDescription || "Renews yearly"}. The App Store shows the localized total before purchase.`
            : `${status.pricing.web.annualEffectiveMonthly} effective monthly; 16.5% less than paying monthly for 12 months.`}
          action={canPurchase ? (status.nativeIos ? "Choose annual in App Store" : "Choose annual") : null}
          busy={busy === "annual"}
          featured
          onAction={() => {
            if (status.nativeIos) { setBusy("annual"); postNative("purchase", status.pricing.ios.annualProductId); }
            else void beginCheckout("annual");
          }}
        />
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Manage or restore</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Cancellation never prevents record export. Web subscriptions are managed securely by Stripe. App Store subscriptions and refunds are managed by Apple.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {status.nativeIos ? (
            <>
              <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => { setBusy("restore"); postNative("restore"); }}>Restore purchases</button>
              <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => { setBusy("manage"); postNative("manageSubscriptions"); }}>Manage App Store subscription</button>
            </>
          ) : status.subscription?.provider === "stripe" ? (
            <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => void openStripePortal()}>Manage web subscription</button>
          ) : null}
          {status.subscription?.provider === "stripe" ? (
            <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => void reconcile("stripe")}>Refresh from Stripe</button>
          ) : null}
          {status.subscription?.provider === "apple" && status.nativeIos ? (
            <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => void reconcile("apple")}>Refresh from App Store</button>
          ) : null}
        </div>
      </section>

      <p className="text-xs leading-5 text-slate-500">Prices, renewal terms, cancellation details, and taxes are shown again before purchase. See the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>. Custody Folio is a recordkeeping tool, not legal advice.</p>
      {(message || error) && (
        <div role="status" aria-live="polite" className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">{message || error}</div>
      )}
    </div>
  );
}

function PlanCard({
  title,
  price,
  detail,
  action,
  busy,
  featured = false,
  onAction,
}: {
  title: string;
  price: string;
  detail: string;
  action: string | null;
  busy: boolean;
  featured?: boolean;
  onAction: () => void;
}) {
  return (
    <div className={`rounded-xl bg-white p-5 shadow-sm ${featured ? "border border-teal-300" : "border border-slate-200"}`}>
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{price}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
      {action ? (
        <button type="button" className="btn-primary mt-4 w-full" disabled={busy} onClick={onAction}>{busy ? "Opening…" : action}</button>
      ) : null}
    </div>
  );
}
