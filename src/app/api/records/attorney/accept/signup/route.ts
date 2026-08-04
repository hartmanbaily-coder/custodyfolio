import { isAuthApiError } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  isStrongRecordsPassword,
  isSupabaseRecordsMode,
  recordsPasswordMinimumLength,
} from "@/lib/records/authServer";
import {
  attorneyAcceptanceCookieName,
  findPendingAttorneyInvitationForEmail,
} from "@/lib/records/attorneyServer";
import { normalizeAttorneyEmail } from "@/lib/records/attorneyCrypto";
import { checkAttorneyGuestEntitlement } from "@/lib/records/attorneyEntitlement";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import {
  checkPwnedPassword,
  isPwnedPasswordCheckEnabled,
} from "@/lib/security/pwnedPasswords";
import { recordSecurityEvent } from "@/lib/security/securityEvents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unavailableInvitation() {
  return NextResponse.json(
    { error: "Invitation is invalid, expired, already used, or does not match that email." },
    { status: 404, headers: { "Cache-Control": "no-store" } }
  );
}

function existingIdentity(error: unknown) {
  return isAuthApiError(error) &&
    (error.code === "email_exists" || error.code === "user_already_exists");
}

async function findUnclaimedLegacyInvite(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  email: string
) {
  const perPage = 200;
  for (let page = 1; page <= 5; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage });
    if (result.error) throw result.error;
    const user = result.data.users.find(
      (candidate) => normalizeAttorneyEmail(candidate.email || "") === email
    );
    if (user) {
      return user.invited_at &&
        !user.last_sign_in_at &&
        !user.email_confirmed_at &&
        !user.confirmed_at
        ? user
        : null;
    }
    if (result.data.users.length < perPage) return null;
  }
  return null;
}

export async function POST(request: NextRequest) {
  if (!isSupabaseRecordsMode()) {
    return NextResponse.json(
      { error: "Records account access is not enabled." },
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
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();

  const rateLimit = checkRateLimit(request, {
    id: "records-attorney-invited-signup",
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    password?: unknown;
    adultConfirmed?: unknown;
  };
  const email = typeof body.email === "string" ? normalizeAttorneyEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const adultConfirmed = body.adultConfirmed === true;
  const minimumPasswordLength = recordsPasswordMinimumLength();
  if (!adultConfirmed || !email.includes("@") || !isStrongRecordsPassword(password)) {
    return NextResponse.json(
      {
        error: `Enter the invited email, confirm adult use, and use a password between ${minimumPasswordLength} and 128 characters.`,
      },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const token = request.cookies.get(attorneyAcceptanceCookieName)?.value || "";
  try {
    const invitation = await findPendingAttorneyInvitationForEmail({ token, email });
    if (!invitation) return unavailableInvitation();
  } catch {
    return NextResponse.json(
      { error: "Attorney invitation verification is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } }
    );
  }

  if (isPwnedPasswordCheckEnabled()) {
    const passwordSafety = await checkPwnedPassword(password);
    if (passwordSafety.status === "compromised") {
      await recordSecurityEvent({
        type: "auth_signup_compromised_password_blocked",
        severity: "warning",
        request,
        status: 400,
      });
      return NextResponse.json(
        { error: "Choose a different password that has not appeared in known data breaches." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (passwordSafety.status === "unavailable") {
      await recordSecurityEvent({
        type: "auth_password_safety_check_unavailable",
        severity: "high",
        request,
        status: 503,
        detail: "Invited attorney signup paused because password safety verification was unavailable.",
      });
      return NextResponse.json(
        { error: "Password safety verification is temporarily unavailable. Try again shortly." },
        { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } }
      );
    }
  }

  const admin = createSupabaseAdminClient();
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  let accountUser = created.data.user;
  let recoveredLegacyInvite = false;
  if (existingIdentity(created.error)) {
    try {
      const legacyInvite = await findUnclaimedLegacyInvite(admin, email);
      if (legacyInvite) {
        const recovered = await admin.auth.admin.updateUserById(legacyInvite.id, {
          password,
          email_confirm: true,
        });
        if (recovered.error || !recovered.data.user?.id) {
          throw recovered.error || new Error("Legacy invited identity recovery failed.");
        }
        accountUser = recovered.data.user;
        recoveredLegacyInvite = true;
      }
    } catch {
      await recordSecurityEvent({
        type: "auth_signup_failed",
        severity: "high",
        request,
        status: 503,
        detail: "Unable to safely inspect or recover an unclaimed legacy attorney invitation.",
      });
      return NextResponse.json(
        { error: "Attorney account verification is temporarily unavailable. Try again shortly." },
        { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } }
      );
    }
  }
  if ((created.error && !recoveredLegacyInvite) || !accountUser?.id) {
    await recordSecurityEvent({
      type: "auth_signup_failed",
      severity: "warning",
      request,
      status: existingIdentity(created.error) ? 409 : 400,
      detail: existingIdentity(created.error)
        ? "Invited attorney attempted account creation for an existing identity."
        : "Direct invited-attorney account creation failed.",
    });
    return NextResponse.json(
      {
        error: existingIdentity(created.error)
          ? "An account already uses that email. Choose Sign in to existing account instead."
          : "Unable to create the invited attorney account.",
      },
      {
        status: existingIdentity(created.error) ? 409 : 400,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  await recordSecurityEvent({
    type: "auth_signup_requested",
    severity: "info",
    request,
    userId: accountUser.id,
    status: 201,
    detail: recoveredLegacyInvite
      ? "Unclaimed legacy attorney invite converted to a password account from the original private link."
      : "Invitation-gated attorney account created directly from the single private link.",
  });

  return NextResponse.json(
    {
      ok: true,
      message: "Attorney account created. Continue with authenticator verification to open the shared matter.",
    },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}
