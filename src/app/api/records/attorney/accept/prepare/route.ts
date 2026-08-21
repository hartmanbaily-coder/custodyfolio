import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  hashAttorneyInvitationToken,
  isAttorneyInvitationToken,
} from "@/lib/records/attorneyCrypto";
import { checkAttorneyGuestEntitlement } from "@/lib/records/attorneyEntitlement";
import {
  attorneyAcceptanceCookieName,
  setAttorneyAcceptanceCookie,
} from "@/lib/records/attorneyServer";
import { isSupabaseRecordsMode } from "@/lib/records/authServer";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unavailableInvitation() {
  return NextResponse.json(
    { error: "Invitation is invalid, expired, or already used." },
    { status: 404, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(request, {
    id: "records-attorney-invitation-prepare",
    limit: 12,
    windowMs: 10 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();
  if (!isSupabaseRecordsMode()) {
    return NextResponse.json(
      { error: "Attorney access is not enabled." },
      { status: 501, headers: { "Cache-Control": "no-store" } }
    );
  }
  const entitlement = checkAttorneyGuestEntitlement("");
  if (!entitlement.allowed) {
    return NextResponse.json(
      { error: entitlement.reason },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { token?: unknown };
  const suppliedToken = typeof body.token === "string" ? body.token : "";
  const token = suppliedToken || request.cookies.get(attorneyAcceptanceCookieName)?.value || "";
  if (!isAttorneyInvitationToken(token)) return unavailableInvitation();

  const admin = createSupabaseAdminClient();
  const { data: invitation, error } = await admin
    .from("records_attorney_invitations")
    .select("id")
    .eq("token_hash", hashAttorneyInvitationToken(token))
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !invitation?.id) return unavailableInvitation();

  const response = NextResponse.json(
    {
      ok: true,
      message:
        "Invitation verified. New accounts must open a secure link sent to the invited email; existing accounts may sign in below.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
  return setAttorneyAcceptanceCookie(response, token);
}
