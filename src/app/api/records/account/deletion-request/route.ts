import { NextRequest, NextResponse } from "next/server";
import { deleteRecordsEvidenceForUser } from "@/lib/records/accountDeletion";
import {
  clearRecordsSessionCookies,
  getRecordsAuthContext,
  isSupabaseRecordsMode,
  recordsAccessCookieName,
} from "@/lib/records/authServer";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import { recordSecurityEvent } from "@/lib/security/securityEvents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function readRequestBody(request: NextRequest): Promise<{ confirmation?: unknown }> {
  try {
    return (await request.json()) as { confirmation?: unknown };
  } catch {
    return {};
  }
}

function deletionError(message: string, status = 503) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();

  if (!isSupabaseRecordsMode()) {
    return deletionError(
      "Cloud records account deletion is not enabled. Sign in to the production records workspace first.",
      501
    );
  }

  const initialRateLimit = checkRateLimit(request, {
    id: "records-account-delete",
    limit: 6,
    windowMs: 60 * 60 * 1000,
  });
  if (initialRateLimit.limited) return rateLimitExceededResponse(initialRateLimit);

  const context = await getRecordsAuthContext(request);
  if ("error" in context) {
    return (
      context.error ||
      deletionError("Sign in and complete authenticator verification before deleting your account.", 401)
    );
  }

  const userRateLimit = checkRateLimit(request, {
    id: "records-account-delete-user",
    key: context.userId,
    limit: 3,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (userRateLimit.limited) return rateLimitExceededResponse(userRateLimit);

  const body = await readRequestBody(request);
  if (body.confirmation !== "DELETE") {
    return deletionError(
      "Confirm permanent deletion before continuing.",
      400
    );
  }

  const storageDeletion = await deleteRecordsEvidenceForUser({
    supabase: context.supabase,
    userId: context.userId,
  });
  if (!storageDeletion.ok) {
    await recordSecurityEvent({
      type: "account_deletion_storage_cleanup_failed",
      severity: "critical",
      request,
      userId: context.userId,
      status: 503,
      detail: "Immediate account deletion stopped because evidence cleanup could not be confirmed.",
    });
    return deletionError(
      "Your account was not deleted because all private files could not be removed. Try again or contact support."
    );
  }

  const accessToken =
    context.refreshedSession?.access_token ||
    request.cookies.get(recordsAccessCookieName)?.value;
  if (!accessToken) {
    return deletionError("Your secure session could not be verified. Sign in again and retry.", 401);
  }

  const { error: signOutError } = await context.supabase.auth.admin.signOut(
    accessToken,
    "global"
  );
  if (signOutError) {
    await recordSecurityEvent({
      type: "account_deletion_session_revocation_failed",
      severity: "critical",
      request,
      userId: context.userId,
      status: 503,
      detail: "Immediate account deletion stopped because session revocation could not be confirmed.",
    });
    return deletionError(
      "Your account was not deleted because active sessions could not be closed. Try again or contact support."
    );
  }

  const { error: deleteUserError } = await context.supabase.auth.admin.deleteUser(
    context.userId,
    false
  );
  if (deleteUserError) {
    await recordSecurityEvent({
      type: "account_deletion_failed",
      severity: "critical",
      request,
      userId: context.userId,
      status: 502,
      detail: "Evidence and sessions were removed, but the Auth user deletion failed.",
    });
    const response = deletionError(
      "Your files and active sessions were removed, but the account could not be fully deleted. Sign in again to retry or contact support.",
      502
    );
    clearRecordsSessionCookies(response);
    return response;
  }

  const deletedAt = new Date().toISOString();
  await recordSecurityEvent({
    type: "account_deletion_completed",
    severity: "info",
    request,
    userId: context.userId,
    status: 200,
    detail: `Immediate deletion completed; ${storageDeletion.deletedObjects} evidence objects removed.`,
  });

  const response = NextResponse.json(
    {
      ok: true,
      deletedAt,
      clearLocalSession: true,
      message: "Your account and active Custody Folio records were permanently deleted.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
  clearRecordsSessionCookies(response);
  return response;
}
