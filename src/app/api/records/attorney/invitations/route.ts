import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createAttorneyInvitationToken,
  hashAttorneyInvitationToken,
  isAttorneyPortalCryptoReady,
  normalizeAttorneyEmail,
  protectAttorneyEmail,
  revealAttorneyEmail,
  sealAttorneyHandle,
} from "@/lib/records/attorneyCrypto";
import { checkAttorneyGuestEntitlement } from "@/lib/records/attorneyEntitlement";
import { recordAttorneyAccessEvent } from "@/lib/records/attorneyAccess";
import {
  attorneyGrantExpiryFilter,
  attorneyGrantIsActive,
} from "@/lib/records/attorneyProfileServer";
import {
  attorneyInvitationDurationDays,
  attorneyInvitationDurationMs,
} from "@/lib/records/attorneyPolicy";
import {
  attorneyInvitationDeliveryMode,
  getAttorneyAuthContext,
  ownerAttorneySharingProfile,
} from "@/lib/records/attorneyServer";
import { recordsAppBaseUrl } from "@/lib/records/authServer";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import { consumerHealthSharingConsentVersion } from "@/lib/legal";
import { requireRecordsCapability } from "@/lib/billing/capabilities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createInvitationSchema = z.object({
  email: z.string().trim().email().max(254),
  caseId: z.string().trim().min(1).max(180),
  healthDataSharingAuthorized: z.literal(true),
});

type InvitationRow = {
  id: string;
  invited_email_ciphertext: string;
  invited_email_nonce: string;
  invited_email_tag: string;
  status: "pending" | "accepted" | "revoked" | "expired" | "replaced";
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  case_id: string;
};

function invitationStatus(row: InvitationRow) {
  if (row.status === "pending" && new Date(row.expires_at).getTime() <= Date.now()) return "expired";
  return row.status;
}

export async function GET(request: NextRequest) {
  const rateLimit = checkRateLimit(request, {
    id: "records-attorney-owner-list",
    limit: 120,
    windowMs: 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);
  const context = await getAttorneyAuthContext(request);
  if ("error" in context) return context.error;
  const capability = await requireRecordsCapability(context, "attorney:read");
  if (!capability.ok) return capability.error;
  if (!isAttorneyPortalCryptoReady()) {
    return NextResponse.json({ error: "Attorney access encryption is not configured." }, { status: 503 });
  }

  const [invitationResult, grantResult, eventResult] = await Promise.all([
    context.supabase
      .from("records_attorney_invitations")
      .select("id,invited_email_ciphertext,invited_email_nonce,invited_email_tag,status,created_at,expires_at,accepted_at,revoked_at,case_id")
      .eq("owner_user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(25),
    context.supabase
      .from("records_attorney_grants")
      .select("id,invitation_id,case_id,granted_at,expires_at,revoked_at,left_at")
      .eq("owner_user_id", context.userId)
      .order("granted_at", { ascending: false })
      .limit(10),
    context.supabase
      .from("records_attorney_access_events")
      .select("event_type,created_at,metadata")
      .eq("owner_user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  if (invitationResult.error || grantResult.error || eventResult.error) {
    return NextResponse.json({ error: "Unable to load attorney access status." }, { status: 500 });
  }

  const handleExpiry = Date.now() + 60 * 60 * 1000;
  const entitlement = checkAttorneyGuestEntitlement(context.userId);
  const grantsByInvitation = new Map(
    (grantResult.data || []).map((grant) => [grant.invitation_id, grant])
  );
  const invitations = (invitationResult.data as InvitationRow[]).map((row) => {
    const grant = grantsByInvitation.get(row.id);
    let email = "Protected email";
    try {
      email = revealAttorneyEmail({
        ciphertext: row.invited_email_ciphertext,
        nonce: row.invited_email_nonce,
        tag: row.invited_email_tag,
      });
    } catch {
      // Keep a non-sensitive label if old encrypted data cannot be opened.
    }
    return {
      handle: sealAttorneyHandle({
        kind: "invitation",
        id: row.id,
        subject: context.userId,
        expiresAt: handleExpiry,
      }),
      email,
      caseId: row.case_id,
      status: invitationStatus(row),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      revokedAt: row.revoked_at,
      accessExpiresAt: grant?.expires_at || null,
      accessActive: Boolean(
        grant
        && !grant.revoked_at
        && !grant.left_at
        && attorneyGrantIsActive(grant)
      ),
    };
  });
  const grants = (grantResult.data || []).map((row) => ({
    handle: sealAttorneyHandle({
      kind: "grant",
      id: row.id,
      subject: context.userId,
      expiresAt: handleExpiry,
    }),
    caseId: row.case_id,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    leftAt: row.left_at,
    active: attorneyGrantIsActive(row),
  }));

  return NextResponse.json(
    {
      invitations,
      grants,
      events: (eventResult.data || []).map((event) => ({
        type: event.event_type,
        createdAt: event.created_at,
        metadata: event.metadata,
      })),
      delivery: attorneyInvitationDeliveryMode(),
      featureEnabled: entitlement.allowed,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(request, {
    id: "records-attorney-invitation-create",
    limit: 12,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();
  const context = await getAttorneyAuthContext(request);
  if ("error" in context) return context.error;
  const capability = await requireRecordsCapability(context, "attorney:invite");
  if (!capability.ok) return capability.error;
  const userLimit = checkRateLimit(request, {
    id: "records-attorney-invitation-create-user",
    key: context.userId,
    limit: 5,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (userLimit.limited) return rateLimitExceededResponse(userLimit);
  const entitlement = checkAttorneyGuestEntitlement(context.userId);
  if (!entitlement.allowed) return NextResponse.json({ error: entitlement.reason }, { status: 403 });
  const delivery = attorneyInvitationDeliveryMode();
  if (delivery === "not_configured") {
    return NextResponse.json(
      { error: "Attorney invitation sharing is not enabled for this deployment." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (!isAttorneyPortalCryptoReady()) {
    return NextResponse.json({ error: "Attorney access encryption is not configured." }, { status: 503 });
  }

  const parsed = createInvitationSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid attorney email and shared case, then authorize sharing this case with that attorney." },
      { status: 400 }
    );
  }
  const email = normalizeAttorneyEmail(parsed.data.email);
  if (email === normalizeAttorneyEmail(context.email)) {
    return NextResponse.json({ error: "Invite a different adult account." }, { status: 400 });
  }
  const caseKey = "default";
  const sharingProfile = await ownerAttorneySharingProfile({
    supabase: context.supabase,
    ownerUserId: context.userId,
    caseKey,
    caseId: parsed.data.caseId,
  });
  if (!sharingProfile) {
    return NextResponse.json({ error: "The selected case is unavailable." }, { status: 404 });
  }
  if (!sharingProfile.confirmed) {
    return NextResponse.json(
      { error: "Confirm the client name and case name shown to the attorney before creating an invitation." },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }

  const [activeGrant, pendingInvite] = await Promise.all([
    context.supabase
      .from("records_attorney_grants")
      .select("id")
      .eq("owner_user_id", context.userId)
      .is("revoked_at", null)
      .is("left_at", null)
      .or(attorneyGrantExpiryFilter())
      .maybeSingle(),
    context.supabase
      .from("records_attorney_invitations")
      .select("id")
      .eq("owner_user_id", context.userId)
      .eq("status", "pending")
      .maybeSingle(),
  ]);
  if (activeGrant.error || pendingInvite.error) {
    return NextResponse.json({ error: "Unable to verify current attorney access." }, { status: 500 });
  }
  if (activeGrant.data) {
    return NextResponse.json({ error: "This account already has an active attorney guest." }, { status: 409 });
  }
  if (pendingInvite.data) {
    return NextResponse.json({ error: "Resend or revoke the existing pending invitation first." }, { status: 409 });
  }

  const token = createAttorneyInvitationToken();
  const protectedEmail = protectAttorneyEmail(email);
  const expiresAt = new Date(Date.now() + attorneyInvitationDurationMs).toISOString();
  const { data, error } = await context.supabase
    .from("records_attorney_invitations")
    .insert({
      owner_user_id: context.userId,
      case_key: caseKey,
      case_id: parsed.data.caseId,
      invited_email_hash: protectedEmail.hash,
      invited_email_ciphertext: protectedEmail.ciphertext,
      invited_email_nonce: protectedEmail.nonce,
      invited_email_tag: protectedEmail.tag,
      token_hash: hashAttorneyInvitationToken(token),
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id,created_at")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Unable to create the attorney invitation." }, { status: 500 });
  }
  const consentEvent = await recordAttorneyAccessEvent({
    supabase: context.supabase,
    ownerUserId: context.userId,
    actorUserId: context.userId,
    caseId: parsed.data.caseId,
    invitationId: data.id,
    eventType: "invitation_created",
    metadata: {
      consumerHealthSharingConsent: true,
      consentVersion: consumerHealthSharingConsentVersion,
    },
  });
  if (!consentEvent.ok) {
    await context.supabase
      .from("records_attorney_invitations")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("owner_user_id", context.userId);
    return NextResponse.json(
      { error: "Unable to record your sharing authorization. No invitation was issued." },
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
          ? `Share this private link only with the intended attorney. The link expires in ${attorneyInvitationDurationDays} days and becomes unusable after acceptance.`
          : "Development delivery only. Do not send this link from a production environment.",
    },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}
