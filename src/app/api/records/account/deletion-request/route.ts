import { NextRequest, NextResponse } from "next/server";
import {
  beginRecordsAccountDeletion,
  clearRecordsAccountDeletion,
  completeRecordsAccountDeletion,
  deleteRecordsEvidenceForUser,
} from "@/lib/records/accountDeletion";
import {
  clearRecordsSessionCookies,
  getRecordsAuthContext,
  isSupabaseRecordsMode,
  recordsAccessCookieName,
} from "@/lib/records/authServer";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import { recordSecurityEvent } from "@/lib/security/securityEvents";
import { requireRecordsCapability } from "@/lib/billing/capabilities";
import {
  prepareBillingForAccountDeletion,
  redactBillingIdentityForAccountDeletion,
} from "@/lib/billing/accountDeletion";
import { deleteGrowthEventsForUser } from "@/lib/marketing/growthEvents";

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
      deletionError("Sign in with a current email code before deleting your account.", 401)
    );
  }

  const capability = await requireRecordsCapability(context, "account:delete");
  if (!capability.ok) return capability.error;

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

  try {
    await beginRecordsAccountDeletion({
      supabase: context.supabase,
      userId: context.userId,
    });
  } catch {
    return deletionError("Account deletion could not be locked safely. Try again shortly.");
  }

  let billingPreparation;
  try {
    billingPreparation = await prepareBillingForAccountDeletion({
      supabase: context.supabase,
      userId: context.userId,
    });
  } catch {
    await clearRecordsAccountDeletion({
      supabase: context.supabase,
      userId: context.userId,
    }).catch(() => undefined);
    await recordSecurityEvent({
      type: "account_deletion_billing_cancellation_failed",
      severity: "critical",
      request,
      userId: context.userId,
      status: 503,
      detail: "Immediate account deletion stopped because Stripe cancellation or billing verification could not be confirmed.",
    });
    return deletionError(
      "Your account was not deleted because active web billing could not be safely stopped. Try again or contact support."
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

  try {
    await redactBillingIdentityForAccountDeletion({
      supabase: context.supabase,
      userId: context.userId,
    });
  } catch {
    await recordSecurityEvent({
      type: "account_deletion_billing_redaction_failed",
      severity: "critical",
      request,
      userId: context.userId,
      status: 503,
      detail: "Evidence and sessions were removed, but billing identity minimization failed before Auth deletion.",
    });
    const response = deletionError(
      "Your files and active sessions were removed, but the account could not be fully deleted. Contact support to complete deletion."
    );
    clearRecordsSessionCookies(response);
    return response;
  }

  const growthDeletion = await deleteGrowthEventsForUser({
    supabase: context.supabase,
    userId: context.userId,
  });
  if (!growthDeletion.ok) {
    await recordSecurityEvent({
      type: "account_deletion_growth_measurement_failed",
      severity: "critical",
      request,
      userId: context.userId,
      status: 503,
      detail: "Evidence and sessions were removed, but pseudonymous growth measurement deletion failed before Auth deletion.",
    });
    const response = deletionError(
      "Your files and active sessions were removed, but the account could not be fully deleted. Contact support to complete deletion."
    );
    clearRecordsSessionCookies(response);
    return response;
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


  try {
    await completeRecordsAccountDeletion({
      supabase: context.supabase,
      userId: context.userId,
    });
  } catch {
    await recordSecurityEvent({
      type: "account_deletion_failed",
      severity: "critical",
      request,
      userId: context.userId,
      status: 502,
      detail: "The account was deleted, but its deletion tombstone could not be finalized.",
    });
    const response = deletionError(
      "Your account and files were removed, but deletion confirmation could not be finalized. Contact support.",
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
      message: billingPreparation.appleBillingMayContinue
        ? "Your account and active Custody Folio records were permanently deleted. Apple may continue App Store billing until you cancel it in your Apple subscription settings."
        : "Your account and active Custody Folio records were permanently deleted.",
      billing: {
        stripeSubscriptionsCanceled:
          billingPreparation.canceledStripeSubscriptions,
        appleBillingMayContinue: billingPreparation.appleBillingMayContinue,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
  clearRecordsSessionCookies(response);
  return response;
}
