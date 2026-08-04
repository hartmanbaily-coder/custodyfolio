import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseAuthClient } from "@/lib/supabaseClient";
import {
  isSupabaseRecordsMode,
  recordsAppBaseUrl,
} from "@/lib/records/authServer";
import { normalizeAttorneyEmail } from "@/lib/records/attorneyCrypto";
import { recordsAttorneyEmailHasActiveGrant } from "@/lib/records/attorneyProfileServer";
import { verifyRecordsTrustedJsonRequest, recordsCsrfError } from "@/lib/security/csrf";
import {
  checkRateLimit,
  rateLimitClientAddress,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";
import { recordSecurityEvent } from "@/lib/security/securityEvents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const genericMessage =
  "If that email has an active attorney matter, a secure sign-in link will arrive shortly. Check Inbox and Junk.";

export async function POST(request: NextRequest) {
  if (!isSupabaseRecordsMode()) {
    return NextResponse.json({ error: "Attorney account access is not enabled." }, { status: 501 });
  }
  if (!verifyRecordsTrustedJsonRequest(request).ok) return recordsCsrfError();
  const rateLimit = checkRateLimit(request, {
    id: "records-attorney-return-link",
    limit: 8,
    windowMs: 15 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    adultConfirmed?: unknown;
  };
  const email = typeof body.email === "string" ? normalizeAttorneyEmail(body.email) : "";
  if (!body.adultConfirmed || !email.includes("@") || email.length > 254) {
    return NextResponse.json(
      { error: "Enter your attorney account email and confirm adult use." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
  const emailLimit = checkRateLimit(request, {
    id: "records-attorney-return-link-email",
    key: `${rateLimitClientAddress(request.headers)}:${email}`,
    limit: 4,
    windowMs: 60 * 60 * 1000,
  });
  if (emailLimit.limited) return rateLimitExceededResponse(emailLimit);

  try {
    if (await recordsAttorneyEmailHasActiveGrant(email)) {
      const redirectUrl = new URL("/attorney/sign-in", recordsAppBaseUrl(request));
      redirectUrl.searchParams.set("auth", "attorney-return");
      const authClient = createServerSupabaseAuthClient();
      const sent = await authClient.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectUrl.toString(),
          shouldCreateUser: false,
        },
      });
      if (sent.error) throw sent.error;
    }
  } catch (error) {
    await recordSecurityEvent({
      type: "auth_login_failed",
      severity: "warning",
      request,
      status: 503,
      detail: error instanceof Error
        ? `Attorney return-link delivery failed: ${error.message.slice(0, 120)}`
        : "Attorney return-link delivery failed.",
    });
    // Keep the same response so this endpoint cannot enumerate attorney emails.
  }

  return NextResponse.json(
    { ok: true, message: genericMessage },
    { headers: { "Cache-Control": "no-store" } }
  );
}
