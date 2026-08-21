import type { BillingStatus } from "@/lib/billing/types";

type IndicatorTone = "teal" | "amber" | "slate";

export interface AccountSubscriptionIndicatorModel {
  label: string;
  detail: string;
  tone: IndicatorTone;
}

function readableDate(value: string | null) {
  if (!value) return "an unavailable date";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "an unavailable date"
    : parsed.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}

function providerLabel(status: BillingStatus) {
  if (status.entitlement.source === "stripe") return "Web billing";
  if (status.entitlement.source === "apple") return "App Store billing";
  return "Custody Folio";
}

export function accountSubscriptionIndicatorModel(
  status: BillingStatus | null,
  loading: boolean,
  error: string | null
): AccountSubscriptionIndicatorModel {
  if (loading && !status) {
    return {
      label: "Checking subscription",
      detail: "Confirming the current account access level.",
      tone: "slate",
    };
  }
  if (!status) {
    return {
      label: "Status unavailable",
      detail: error || "Subscription status could not be loaded.",
      tone: "slate",
    };
  }

  const renewalDate = readableDate(
    status.subscription?.currentPeriodEnd || status.entitlement.effectiveUntil
  );

  if (status.entitlement.mode === "active") {
    if (status.entitlement.source === "stripe" || status.entitlement.source === "apple") {
      return {
        label: "Subscribed",
        detail: status.subscription?.cancelAtPeriodEnd
          ? `Full access through ${renewalDate} · ${providerLabel(status)}`
          : `Full access · ${providerLabel(status)} · Renews ${renewalDate}`,
        tone: "teal",
      };
    }
    return {
      label: "Full access",
      detail: "This account currently has complete Custody Folio access.",
      tone: "teal",
    };
  }

  if (status.entitlement.mode === "trial") {
    return {
      label: "Trial active",
      detail: `${status.trial.daysRemaining} ${status.trial.daysRemaining === 1 ? "day" : "days"} of full access remaining.`,
      tone: "teal",
    };
  }

  if (status.entitlement.mode === "grace_period") {
    return {
      label: "Subscribed — payment needs attention",
      detail: `Full access continues through ${readableDate(status.entitlement.gracePeriodEndsAt)}.`,
      tone: "amber",
    };
  }

  return {
    label: "Not subscribed",
    detail: "Export-only access is active. Subscribe to add or edit records again.",
    tone: "amber",
  };
}

const toneClasses: Record<IndicatorTone, { panel: string; badge: string; text: string }> = {
  teal: {
    panel: "border-teal-200 bg-teal-50",
    badge: "bg-teal-700 text-white",
    text: "text-teal-950",
  },
  amber: {
    panel: "border-amber-200 bg-amber-50",
    badge: "bg-amber-100 text-amber-950 ring-1 ring-inset ring-amber-300",
    text: "text-amber-950",
  },
  slate: {
    panel: "border-slate-200 bg-slate-50",
    badge: "bg-slate-200 text-slate-800",
    text: "text-slate-800",
  },
};

export default function AccountSubscriptionIndicator({
  status,
  loading,
  error,
  onOpenSubscription,
}: {
  status: BillingStatus | null;
  loading: boolean;
  error: string | null;
  onOpenSubscription: () => void;
}) {
  const model = accountSubscriptionIndicatorModel(status, loading, error);
  const classes = toneClasses[model.tone];

  return (
    <section
      className={`rounded-xl border p-4 ${classes.panel}`}
      aria-label="Account subscription status"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Subscription status
          </p>
          <span
            className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${classes.badge}`}
          >
            {model.label}
          </span>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={onOpenSubscription}
        >
          Manage subscription
        </button>
      </div>
      <p className={`mt-3 text-sm leading-6 ${classes.text}`}>{model.detail}</p>
    </section>
  );
}
