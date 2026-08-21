import { NextRequest, NextResponse } from "next/server";
import {
  createAttorneyInvitationToken,
  hashAttorneyInvitationToken,
  isAttorneyPortalCryptoReady,
  openAttorneyHandle,
} from "@/lib/records/attorneyCrypto";
import { recordAttorneyAccessEvent } from "@/lib/records/attorneyAccess";
import { attorneyInvitationDurationMs } from "@/lib/records/attorneyPolicy";
import {
  attorneyInvitationDeliveryMode,
  getAttorneyAuthContext,
} from "@/lib/records/attorneyServer";
import { recordsAppBaseUrl } from "@/lib/records/authServer";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import { consumerHealthSharingConsentVersion } from "@/lib/legal";
import { requireRecordsCapability } from "@/lib/billing/capabilities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();
  const context = await getAttorneyAuthContext(request);
  if ("error" in context) return context.error;

  const rateLimit = checkRateLimit(request, {
    id: "records-attorney-invitation-action",
    key: context.userId,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);
  if (!isAttorneyPortalCryptoReady()) {
    return NextResponse.json({ error: "Attorney access encryption is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    handle?: unknown;
    action?: unknown;
    healthDataSharingAuthorized?: unknown;
  };
  const handleValue = typeof body.handle === "string" ? body.handle : "";
  const action = body.action === "resend" || body.action === "revoke" ? body.action : "";
  if (action) {
    const capability = await requireRecordsCapability(
      context,
      action === "revoke" ? "attorney:revoke" : "attorney:invite"
    );
    if (!capability.ok) return capability.error;
  }
  const handle = openAttorneyHandle(handleValue, {
    kind: "invitation",
    subject: context.userId,
  });
  if (!handle || !action) {
    return NextResponse.json({ error: "Invitation is unavailable. Refresh and try again." }, { status: 404 });
  }

  const { data: invitation, error: invitationError } = await context.supabase
    .from("records_attorney_invitations")
    .select("id,case_id,status")
    .eq("id", handle.id)
    .eq("owner_user_id", context.userId)
    .maybeSingle();
  if (invitationError || !invitation) {
    return NextResponse.json({ error: "Invitation is unavailable. Refresh and try again." }, { status: 404 });
  }

  if (action === "revoke") {
    if (invitation.status !== "pending" && invitation.status !== "accepted") {
      return NextResponse.json({ error: "This invitation is no longer active." }, { status: 409 });
    }
    const { data: revoked, error } = await context.supabase.rpc(
      "revoke_records_attorney_invitation",
      {
        p_owner_user_id: context.userId,
        p_invitation_id: invitation.id,
      }
    );
    if (error || revoked !== true) {
      return NextResponse.json({ error: "Unable to revoke attorney access." }, { status: 500 });
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }

  if (body.healthDataSharingAuthorized !== true) {
    return NextResponse.json(
      { error: "Authorize sharing this case with the attorney before replacing the invitation link." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const delivery = attorneyInvitationDeliveryMode();
  if (delivery === "not_configured") {
    return NextResponse.json(
      { error: "Attorney invitation sharing is not enabled for this deployment." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (invitation.status !== "pending" && invitation.status !== "expired") {
    return NextResponse.json({ error: "Only pending or expired invitations can be resent." }, { status: 409 });
  }
  const token = createAttorneyInvitationToken();
  const expiresAt = new Date(Date.now() + attorneyInvitationDurationMs).toISOString();
  const { data: replacementId, error } = await context.supabase.rpc(
    "replace_records_attorney_invitation",
    {
      p_owner_user_id: context.userId,
      p_invitation_id: invitation.id,
      p_token_hash: hashAttorneyInvitationToken(token),
      p_expires_at: expiresAt,
    }
  );
  if (error || !replacementId) {
    return NextResponse.json({ error: "Unable to replace the invitation." }, { status: 500 });
  }
  const consentEvent = await recordAttorneyAccessEvent({
    supabase: context.supabase,
    ownerUserId: context.userId,
    actorUserId: context.userId,
    caseId: invitation.case_id,
    invitationId: replacementId as string,
    eventType: "invitation_resent",
    metadata: {
      consumerHealthSharingConsent: true,
      consentVersion: consumerHealthSharingConsentVersion,
    },
  });
  if (!consentEvent.ok) {
    await context.supabase
      .from("records_attorney_invitations")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", replacementId as string)
      .eq("owner_user_id", context.userId);
    return NextResponse.json(
      { error: "Unable to record your sharing authorization. No replacement link was issued." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(
    {
      ok: true,
      expiresAt,
      invitationUrl: `${recordsAppBaseUrl(request)}/attorney/accept#token=${token}`,
      delivery,
      warning:
        delivery === "owner_share"
          ? "Share the replacement link only with the intended attorney. The prior link is invalid."
          : "Development delivery only. The prior token is invalid.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
