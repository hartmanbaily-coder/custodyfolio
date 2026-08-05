import { NextRequest, NextResponse } from "next/server";
import { recordAttorneyAccessEvent, resolveActiveAttorneyGrant } from "@/lib/records/attorneyAccess";
import { getAttorneyGuestAuthContext } from "@/lib/records/attorneyServer";
import { attachRefreshedRecordsSession } from "@/lib/records/authServer";
import type { ReportType } from "@/lib/records/types";
import type { SectionExportId } from "@/lib/records/reports";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const reportTypes = new Set<ReportType>([
  "exchange_compliance",
  "facetime_cancellations",
  "incident_timeline",
  "filing_facetime_correlation",
  "child_support_payment",
  "expense_reimbursement",
  "combined_attorney_summary",
  "combined_court_packet",
  "full_profile_export",
]);
const sectionIds = new Set<SectionExportId>([
  "calendar",
  "timeline",
  "exchanges",
  "notes",
  "evidence",
  "child_support",
  "expenses",
]);

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(request, {
    id: "records-attorney-portal-action",
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();
  const context = await getAttorneyGuestAuthContext(request);
  if ("error" in context) return context.error;
  const body = (await request.json().catch(() => ({}))) as {
    accessHandle?: unknown;
    action?: unknown;
    reportType?: unknown;
    sectionId?: unknown;
  };
  const accessHandle = typeof body.accessHandle === "string" ? body.accessHandle : "";
  const action =
    body.action === "leave" || body.action === "report_generated" || body.action === "report_downloaded"
      ? body.action
      : "";
  const access = await resolveActiveAttorneyGrant({
    supabase: context.supabase,
    attorneyUserId: context.userId,
    accessHandle,
  });
  if ("error" in access || !action) {
    return NextResponse.json(
      { error: "Shared matter is unavailable or access has ended." },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (action === "leave") {
    const leftAt = new Date().toISOString();
    const { error } = await context.supabase
      .from("records_attorney_grants")
      .update({ left_at: leftAt, revocation_reason: "attorney_left" })
      .eq("id", access.grant.id)
      .eq("attorney_user_id", context.userId)
      .is("revoked_at", null)
      .is("left_at", null);
    if (error) return NextResponse.json({ error: "Unable to leave this matter." }, { status: 500 });
    await recordAttorneyAccessEvent({
      supabase: context.supabase,
      ownerUserId: access.grant.owner_user_id,
      actorUserId: context.userId,
      caseId: access.grant.case_id,
      grantId: access.grant.id,
      eventType: "attorney_left",
    });
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    return attachRefreshedRecordsSession(request, response, context);
  }

  const reportType = typeof body.reportType === "string" && reportTypes.has(body.reportType as ReportType)
    ? (body.reportType as ReportType)
    : null;
  const sectionId = typeof body.sectionId === "string" && sectionIds.has(body.sectionId as SectionExportId)
    ? (body.sectionId as SectionExportId)
    : null;
  if (!reportType && !sectionId) {
    return NextResponse.json({ error: "Report selection is invalid." }, { status: 400 });
  }
  const audit = await recordAttorneyAccessEvent({
    supabase: context.supabase,
    ownerUserId: access.grant.owner_user_id,
    actorUserId: context.userId,
    caseId: access.grant.case_id,
    grantId: access.grant.id,
    eventType: action,
    metadata: reportType ? { reportType } : { sectionId: sectionId! },
  });
  if (!audit.ok) {
    return NextResponse.json(
      { error: "Unable to record the required report access event." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  return attachRefreshedRecordsSession(request, response, context);
}
