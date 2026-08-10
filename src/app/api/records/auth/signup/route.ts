import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseAuthClient } from "@/lib/supabaseClient";
import {
  isRecordsSignupEnabled,
  isStrongRecordsPassword,
  isSupabaseRecordsMode,
  recordsAppBaseUrl,
  recordsPasswordMinimumLength,
} from "@/lib/records/authServer";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import {
  checkPwnedPassword,
  isPwnedPasswordCheckEnabled,
} from "@/lib/security/pwnedPasswords";
import { recordSecurityEvent } from "@/lib/security/securityEvents";
import {
  legalAcceptanceMetadata,
  privacyVersion,
  termsVersion,
} from "@/lib/legal";

export const dynamic = "force-dynamic";

function disabledResponse() {
  return NextResponse.json(
    {
      error: "Account creation is not enabled.",
      detail: "Ask the site owner to enable RECORDS_SIGNUPS_ENABLED when public account creation is ready.",
    },
    { status: 403, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
  if (!isSupabaseRecordsMode()) {
    return NextResponse.json({ error: "Records account access is not enabled." }, { status: 501 });
  }

  if (!isRecordsSignupEnabled()) return disabledResponse();

  const rateLimit = checkRateLimit(request, {
    id: "records-auth-signup",
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const body = parsed as {
    email?: unknown;
    password?: unknown;
    adultConfirmed?: unknown;
    legalAccepted?: unknown;
  };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const adultConfirmed = body.adultConfirmed === true;
  const legalAccepted = body.legalAccepted === true;
  const minimumPasswordLength = recordsPasswordMinimumLength();

  if (!adultConfirmed || !legalAccepted || !email.includes("@") || !isStrongRecordsPassword(password)) {
    return NextResponse.json(
      {
        error: `Enter a valid email, confirm adult use, accept the Terms and Privacy Policy, and use a password between ${minimumPasswordLength} and 128 characters.`,
      },
      { status: 400 }
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
        detail: "Account signup paused because the password safety check was unavailable.",
      });
      return NextResponse.json(
        { error: "Password safety verification is temporarily unavailable. Try again shortly." },
        { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } }
      );
    }
  }

  const supabase = createServerSupabaseAuthClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${recordsAppBaseUrl(request)}/records?auth=confirmed`,
      data: legalAcceptanceMetadata("signup"),
    },
  });

  if (error) {
    await recordSecurityEvent({
      type: "auth_signup_failed",
      severity: "warning",
      request,
      status: 400,
      detail: "Account signup failed.",
    });
    return NextResponse.json({ error: "Unable to create that account." }, { status: 400 });
  }

  await recordSecurityEvent({
    type: "auth_signup_requested",
    severity: "info",
    request,
    status: 200,
  });

  if (data.user?.id) {
    await recordSecurityEvent({
      type: "policy_terms_accepted",
      severity: "info",
      request,
      userId: data.user.id,
      status: 200,
      detail: `Terms ${termsVersion}; Privacy ${privacyVersion}; source signup.`,
    });
  }

  return NextResponse.json(
    {
      ok: true,
      message:
        "Step 1 of 2: check your email to confirm that you own the address. After you sign in, you will separately set up an authenticator as the second security factor.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
