import { NextResponse } from "next/server";
import type { RecordsAuthContext } from "@/lib/records/authServer";
import { getBillingStatus } from "./repository";
import {
  type BillingStatus,
  type RecordsCapability,
} from "./types";

export function billingCapabilityDeniedResponse(
  capability: RecordsCapability,
  status: BillingStatus
) {
  return NextResponse.json(
    {
      error:
        "Your Custody Folio subscription is not active. You can still view, export, download, delete, manage billing, and revoke attorney access.",
      code: "billing_entitlement_required",
      capability,
      billing: status,
    },
    { status: 402, headers: { "Cache-Control": "no-store" } }
  );
}

export async function requireRecordsCapability(
  context: Pick<RecordsAuthContext, "supabase" | "userId">,
  capability: RecordsCapability,
  options: { nativeIos?: boolean } = {}
) {
  try {
    const status = await getBillingStatus({
      supabase: context.supabase,
      userId: context.userId,
      nativeIos: options.nativeIos === true,
    });
    if (!status.capabilities[capability]) {
      return { ok: false as const, error: billingCapabilityDeniedResponse(capability, status), status };
    }
    return { ok: true as const, status };
  } catch {
    return {
      ok: false as const,
      error: NextResponse.json(
        {
          error: "Subscription access could not be verified. Try again shortly.",
          code: "billing_verification_unavailable",
        },
        {
          status: 503,
          headers: { "Cache-Control": "no-store", "Retry-After": "60" },
        }
      ),
    };
  }
}
