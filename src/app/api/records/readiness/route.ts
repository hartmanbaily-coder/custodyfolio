import { NextResponse } from "next/server";
import { billingMode } from "@/lib/billing/config";
import { evaluateLiveBillingReadiness } from "@/lib/billing/readiness";
import { evaluateProductionReadiness } from "@/lib/production/readiness";

export const dynamic = "force-dynamic";

export function GET() {
  const report = evaluateProductionReadiness();
  const billingRequired = billingMode() === "live";
  const billing = evaluateLiveBillingReadiness(
    process.env,
    report.generatedAt,
    report
  );
  const ready = report.ready && (!billingRequired || billing.ready);
  const blockers = [
    ...report.blockers.map(({ id, label, detail }) => ({ id, label, detail })),
    ...(billingRequired
      ? billing.blockers.map(({ id, label, detail }) => ({
          id: `billing:${id}`,
          label,
          detail,
        }))
      : []),
  ];
  const status = ready ? 200 : process.env.NODE_ENV === "production" ? 503 : 200;

  return NextResponse.json(
    {
      status: ready ? "ready" : "not_ready",
      generatedAt: report.generatedAt,
      blockers,
      warnings: report.warnings.map(({ id, label, detail }) => ({ id, label, detail })),
      checks: report.checks.map(({ id, label, ready, severity }) => ({
        id,
        label,
        ready,
        severity,
      })),
      billing: {
        required: billingRequired,
        ready: !billingRequired || billing.ready,
        blockers: billing.blockers.map(({ id, label, detail }) => ({
          id,
          label,
          detail,
        })),
        warnings: billing.warnings.map(({ id, label, detail }) => ({
          id,
          label,
          detail,
        })),
        checks: billing.checks.map(({ id, label, ready: checkReady, severity }) => ({
          id,
          label,
          ready: checkReady,
          severity,
        })),
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
