import { createHash, createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RECORDS_APP_BASE_URL",
];

const missing = requiredEnv.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}
if (process.env.ALLOW_SYNTHETIC_ATTORNEY_TEST !== "true") {
  console.error("Set ALLOW_SYNTHETIC_ATTORNEY_TEST=true to permit temporary synthetic users and records.");
  process.exit(1);
}

const appBaseUrl = process.env.RECORDS_APP_BASE_URL.replace(/\/$/, "");
const trustedOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL || appBaseUrl).origin;
const syntheticEmailDomain = process.env.RECORDS_ATTORNEY_TEST_EMAIL_DOMAIN || "example.test";
if (
  !syntheticEmailDomain.endsWith(".test")
  && !syntheticEmailDomain.endsWith(".invalid")
  && process.env.ALLOW_EXTERNAL_SYNTHETIC_EMAIL_DOMAIN !== "true"
) {
  console.error("Synthetic attorney test email domains must end in .test or .invalid.");
  process.exit(1);
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const runId = randomUUID();
const password = `CF-${randomUUID()}-synthetic-access`;
const ownerEmail = `custodyfolio-owner-${runId}@${syntheticEmailDomain}`;
const attorneyEmail = `custodyfolio-attorney-${runId}@${syntheticEmailDomain}`;
const caseId = `synthetic-attorney-${runId}`;

let ownerUserId = "";
let attorneyUserId = "";
let invitationId = "";
let grantId = "";
let mailboxProviderHandoffVerified = false;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  absorb(response) {
    const values = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : response.headers.get("set-cookie")?.split(/,(?=[^;,]+=)/g) || [];
    for (const value of values) {
      const pair = value.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const name = pair.slice(0, separator);
      const cookieValue = pair.slice(separator + 1);
      if (!cookieValue || /(?:^|;)\s*Max-Age=0(?:;|$)/i.test(value)) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, cookieValue);
      }
    }
  }

  header() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

async function jsonRequest(path, options = {}) {
  const headers = {
    Origin: trustedOrigin,
    "Sec-Fetch-Site": "same-origin",
    ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    ...(options.csrf ? { "x-l2f-csrf": options.csrf } : {}),
    ...(options.headers || {}),
  };
  const cookie = options.jar?.header();
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${appBaseUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  options.jar?.absorb(response);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function csrfToken(jar) {
  const result = await jsonRequest("/api/records/auth/csrf", { jar });
  assert(result.response.ok && typeof result.body.token === "string", "Unable to obtain a CSRF token.");
  return result.body.token;
}

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(input) {
  const normalized = String(input || "").replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = "";
  for (const character of normalized) {
    const value = base32Alphabet.indexOf(character);
    if (value !== -1) bits += value.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function totpCode(secret, timestamp = Date.now()) {
  const key = decodeBase32(secret);
  const counter = Math.floor(timestamp / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

async function enrollMfa(jar, enrollment) {
  const verified = await jsonRequest("/api/records/auth/mfa/enroll/verify", {
    method: "POST",
    jar,
    body: {
      factorId: enrollment.factorId,
      code: totpCode(enrollment.secret),
    },
  });
  assert(
    verified.response.ok,
    `MFA enrollment verification failed with ${verified.response.status}: ${verified.body.error || "unknown error"}`
  );
  return verified.body.session;
}

async function ownerLogin(jar) {
  const login = await jsonRequest("/api/records/auth/login", {
    method: "POST",
    jar,
    body: { email: ownerEmail, password, adultConfirmed: true },
  });
  assert(
    login.response.status === 403 && login.body.mfaEnrollmentRequired && login.body.enrollment,
    `Synthetic owner login did not require MFA enrollment; got ${login.response.status}: ${login.body.error || "unknown error"}`
  );
  return enrollMfa(jar, login.body.enrollment);
}

function syntheticDataset() {
  const now = new Date().toISOString();
  return {
    users: [{
      id: `profile-${ownerUserId}`,
      userId: ownerUserId,
      email: "synthetic-owner@example.invalid",
      displayName: "Synthetic Access Owner",
      timezone: "UTC",
      attorneySharingProfileConfirmedAt: now,
      createdAt: now,
      updatedAt: now,
    }],
    matters: [{
      id: caseId,
      userId: ownerUserId,
      caseName: "Synthetic attorney access check",
      childDisplayLabels: [],
      userRoleLabel: "Synthetic owner",
      otherParentLabel: "Synthetic other party",
      timezone: "UTC",
      createdAt: now,
      updatedAt: now,
    }],
    exchangeRules: [],
    scheduleExceptions: [],
    custodyDayAssignments: [],
    exchangeLogs: [],
    dateNotes: [],
    evidenceItems: [],
    childSupportOrders: [],
    childSupportPayments: [],
    expenseItems: [],
    timelineDesignations: [],
    auditLogs: [],
  };
}

async function saveSyntheticDataset(ownerJar) {
  const current = await jsonRequest("/api/records/dataset?caseId=default", {
    jar: ownerJar,
    headers: { "x-custody-folio-account": ownerUserId },
  });
  assert(
    current.response.ok
      && (current.body.updatedAt === null || typeof current.body.updatedAt === "string"),
    `Synthetic dataset load failed with ${current.response.status}: ${current.body.error || "unknown error"}`
  );

  const saved = await jsonRequest("/api/records/dataset?caseId=default", {
    method: "PUT",
    jar: ownerJar,
    headers: { "x-custody-folio-account": ownerUserId },
    body: {
      dataset: syntheticDataset(),
      expectedUpdatedAt: current.body.updatedAt,
    },
  });
  assert(
    saved.response.ok,
    `Synthetic dataset save failed with ${saved.response.status}: ${saved.body.error || "unknown error"}`
  );
}

async function createInvitation(ownerJar, ownerCsrf) {
  const created = await jsonRequest("/api/records/attorney/invitations", {
    method: "POST",
    jar: ownerJar,
    csrf: ownerCsrf,
    body: {
      email: attorneyEmail,
      caseId,
      healthDataSharingAuthorized: true,
    },
  });
  assert(
    created.response.status === 201 && typeof created.body.invitationUrl === "string",
    `Attorney invitation creation failed with ${created.response.status}: ${created.body.error || "unknown error"}`
  );
  const token = new URL(created.body.invitationUrl).hash.replace(/^#token=/, "");
  assert(token.length > 20, "Attorney invitation response did not include a usable private token.");
  return token;
}

async function requestMailboxAuthentication(attorneyJar, attorneyCsrf) {
  const requested = await jsonRequest("/api/records/attorney/accept/signup", {
    method: "POST",
    jar: attorneyJar,
    csrf: attorneyCsrf,
    body: {
      email: attorneyEmail,
      adultConfirmed: true,
      legalAccepted: true,
    },
  });
  if (requested.response.status === 202) return true;
  if (
    requested.response.status === 503 &&
    /\.(?:test|invalid)$/i.test(attorneyEmail.split("@").at(-1) || "")
  ) {
    return false;
  }
  throw new Error(
    `Mailbox authentication handoff failed with ${requested.response.status}: ${requested.body.error || "unknown error"}`
  );
}

async function syntheticMailboxSession(invitationToken) {
  const generated = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: attorneyEmail,
    options: {
      redirectTo: `${trustedOrigin}/records?auth=attorney-invite&attorney_token=${encodeURIComponent(invitationToken)}`,
    },
  });
  if (generated.error || !generated.data?.properties?.hashed_token || !generated.data.user?.id) {
    throw new Error(`Unable to generate the synthetic mailbox link: ${generated.error?.message || "missing token"}`);
  }
  attorneyUserId = generated.data.user.id;

  const mailboxClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const verified = await mailboxClient.auth.verifyOtp({
    token_hash: generated.data.properties.hashed_token,
    type: "magiclink",
  });
  if (verified.error || !verified.data.session?.access_token || !verified.data.session.refresh_token) {
    throw new Error(`Synthetic mailbox link verification failed: ${verified.error?.message || "missing session"}`);
  }
  return verified.data.session;
}

function jwtPayload(token) {
  const payload = String(token || "").split(".")[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

async function verifyAcceptancePreconditions(invitationToken, mailboxSession) {
  assert(
    mailboxSession.access_token.length > 20
      && mailboxSession.access_token.length < 8_000
      && mailboxSession.refresh_token.length >= 8
      && mailboxSession.refresh_token.length < 8_000
      && invitationToken.length > 20
      && invitationToken.length < 8_000,
    `Mailbox token lengths were route-incompatible (access ${mailboxSession.access_token.length}, refresh ${mailboxSession.refresh_token.length}, invitation ${invitationToken.length}).`
  );
  const claims = jwtPayload(mailboxSession.access_token);
  const amr = Array.isArray(claims?.amr) ? claims.amr : [];
  const methods = amr.map((entry) => String(entry?.method || "unknown"));
  const freshMailboxProof = amr.some((entry) => {
    const timestamp = typeof entry?.timestamp === "number" ? entry.timestamp : 0;
    return ["invite", "magiclink", "otp"].includes(entry?.method)
      && timestamp >= Math.floor(Date.now() / 1000) - 10 * 60;
  });
  assert(
    freshMailboxProof && typeof claims?.session_id === "string" && claims?.sub === attorneyUserId,
    `Synthetic mailbox token claims were not acceptance-compatible (methods: ${methods.join(",") || "none"}).`
  );

  const confirmed = await admin.auth.getUser(mailboxSession.access_token);
  assert(
    !confirmed.error
      && confirmed.data.user?.id === attorneyUserId
      && confirmed.data.user.email === attorneyEmail
      && Boolean(confirmed.data.user.email_confirmed_at),
    "Synthetic mailbox token did not resolve to the confirmed invited identity."
  );

  const routeEquivalentClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } }
  );
  const verifiedClaims = await routeEquivalentClient.auth.getClaims(mailboxSession.access_token);
  assert(
    !verifiedClaims.error && verifiedClaims.data?.claims?.sub === attorneyUserId,
    `Route-equivalent Supabase claim verification failed (${verifiedClaims.error?.code || "invalid claims"}).`
  );
  const setSession = await routeEquivalentClient.auth.setSession({
    access_token: mailboxSession.access_token,
    refresh_token: mailboxSession.refresh_token,
  });
  assert(
    !setSession.error && setSession.data.user?.id === attorneyUserId,
    `Route-equivalent Supabase session verification failed (${setSession.error?.code || "invalid session"}).`
  );

  const tokenHash = createHash("sha256").update(invitationToken).digest("hex");
  const portalSecret = process.env.ATTORNEY_PORTAL_SECRET || "";
  assert(portalSecret.length >= 32, "Attorney portal secret is unavailable to the isolated verifier.");
  const emailKey = createHash("sha256").update(`attorney-email-hmac:${portalSecret}`).digest();
  const emailHash = createHmac("sha256", emailKey).update(attorneyEmail).digest("hex");
  const invitation = await admin
    .from("records_attorney_invitations")
    .select("id,invited_email_hash,status,expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  assert(
    !invitation.error
      && invitation.data?.status === "pending"
      && invitation.data.invited_email_hash === emailHash
      && new Date(invitation.data.expires_at).getTime() > Date.now(),
    "Synthetic invitation database binding was not acceptance-compatible."
  );
  invitationId = invitation.data.id;
}

async function acceptWithMailboxSession(attorneyJar, attorneyCsrf, invitationToken, mailboxSession) {
  const accepted = await jsonRequest("/api/records/attorney/accept/session", {
    method: "POST",
    jar: attorneyJar,
    csrf: attorneyCsrf,
    body: {
      accessToken: mailboxSession.access_token,
      refreshToken: mailboxSession.refresh_token,
      expiresIn: mailboxSession.expires_in,
      onboardingToken: invitationToken,
    },
  });
  assert(
    accepted.response.status === 403 && accepted.body.mfaEnrollmentRequired && accepted.body.enrollment,
    `Mailbox-verified attorney session did not require MFA enrollment; got ${accepted.response.status}: ${accepted.body.error || "unknown error"}`
  );
  await enrollMfa(attorneyJar, accepted.body.enrollment);
}

async function verifyReadOnlyPortal(attorneyJar) {
  const listed = await jsonRequest("/api/records/attorney/portal", { jar: attorneyJar });
  assert(listed.response.ok, `Attorney portal list failed with ${listed.response.status}.`);
  assert(Array.isArray(listed.body.matters) && listed.body.matters.length === 1, "Attorney portal did not expose exactly one synthetic matter.");
  const matter = listed.body.matters[0];
  assert(matter.caseName === "Synthetic attorney access check", "Attorney portal returned the wrong synthetic matter.");
  assert(matter.expiresAt === null, "Accepted attorney access was not permanent as configured.");

  const attorneyCsrf = await csrfToken(attorneyJar);
  const opened = await jsonRequest("/api/records/attorney/portal", {
    method: "POST",
    jar: attorneyJar,
    csrf: attorneyCsrf,
    body: { accessHandle: matter.accessHandle },
  });
  assert(opened.response.ok && opened.body.readOnly === true, `Attorney portal open failed with ${opened.response.status}.`);
  assert(opened.body.projection?.dataset?.matters?.length === 1, "Attorney projection did not contain the synthetic matter.");

  const writeAttempt = await jsonRequest("/api/records/dataset?caseId=default", {
    method: "PUT",
    jar: attorneyJar,
    headers: { "x-custody-folio-account": ownerUserId },
    body: { dataset: syntheticDataset() },
  });
  assert(
    [401, 403].includes(writeAttempt.response.status),
    `Attorney guest unexpectedly reached the owner dataset write path (${writeAttempt.response.status}).`
  );
  return matter.accessHandle;
}

async function revokeAccess(ownerJar, ownerCsrf) {
  const listed = await jsonRequest("/api/records/attorney/invitations", { jar: ownerJar });
  assert(listed.response.ok, `Owner invitation list failed with ${listed.response.status}.`);
  const invitation = listed.body.invitations?.find((item) => item.email === attorneyEmail);
  assert(invitation?.handle, "Owner invitation list did not contain the synthetic attorney.");
  const revoked = await jsonRequest("/api/records/attorney/invitations/action", {
    method: "POST",
    jar: ownerJar,
    csrf: ownerCsrf,
    body: { handle: invitation.handle, action: "revoke" },
  });
  assert(
    revoked.response.ok,
    `Owner revoke failed with ${revoked.response.status}: ${revoked.body.error || "unknown error"}`
  );
}

async function verifyPostRevokeDenial(attorneyJar, accessHandle) {
  const listed = await jsonRequest("/api/records/attorney/portal", { jar: attorneyJar });
  const noListedAccess = !listed.response.ok
    || (Array.isArray(listed.body.matters) && listed.body.matters.length === 0);
  assert(noListedAccess, "Revoked attorney still had a listed shared matter.");

  const postRevokeCsrf = await csrfToken(attorneyJar);
  const opened = await jsonRequest("/api/records/attorney/portal", {
    method: "POST",
    jar: attorneyJar,
    csrf: postRevokeCsrf,
    body: { accessHandle },
  });
  assert(!opened.response.ok, `Revoked attorney reopened the shared matter (${opened.response.status}).`);
}

async function captureCreatedIds() {
  if (!ownerUserId) return;
  const invitations = await admin
    .from("records_attorney_invitations")
    .select("id")
    .eq("owner_user_id", ownerUserId);
  invitationId = invitations.data?.[0]?.id || invitationId;
  const grants = await admin
    .from("records_attorney_grants")
    .select("id")
    .eq("owner_user_id", ownerUserId);
  grantId = grants.data?.[0]?.id || grantId;
}

async function deleteMatching(table, column, value) {
  if (!value) return;
  const result = await admin.from(table).delete().eq(column, value);
  if (result.error) throw new Error(`Cleanup failed for ${table}: ${result.error.message}`);
}

async function cleanup() {
  await captureCreatedIds().catch(() => undefined);
  await deleteMatching("records_attorney_access_events", "owner_user_id", ownerUserId);
  await deleteMatching("records_attorney_grants", "owner_user_id", ownerUserId);
  await deleteMatching("records_attorney_invitations", "owner_user_id", ownerUserId);
  await deleteMatching("records_case_snapshots", "user_id", ownerUserId);
  await deleteMatching("records_attorney_profiles", "user_id", attorneyUserId);
  await deleteMatching("custody_folio_billing_accounts", "user_id", attorneyUserId);
  await deleteMatching("custody_folio_billing_accounts", "user_id", ownerUserId);
  await deleteMatching("records_profiles", "user_id", ownerUserId);
  if (attorneyUserId) {
    const removed = await admin.auth.admin.deleteUser(attorneyUserId);
    if (removed.error) throw new Error(`Synthetic attorney cleanup failed: ${removed.error.message}`);
  }
  if (ownerUserId) {
    const removed = await admin.auth.admin.deleteUser(ownerUserId);
    if (removed.error) throw new Error(`Synthetic owner cleanup failed: ${removed.error.message}`);
  }
}

try {
  const owner = await admin.auth.admin.createUser({
    email: ownerEmail,
    password,
    email_confirm: true,
    user_metadata: { purpose: "custody-folio-attorney-access-test", run_id: runId },
  });
  if (owner.error || !owner.data.user?.id) {
    throw new Error(`Unable to create the synthetic owner: ${owner.error?.message || "missing user id"}`);
  }
  ownerUserId = owner.data.user.id;

  const ownerProfile = await admin.from("records_profiles").insert({
    user_id: ownerUserId,
    email: ownerEmail,
    updated_at: new Date().toISOString(),
  });
  if (ownerProfile.error) {
    throw new Error(`Unable to approve the synthetic owner profile: ${ownerProfile.error.message}`);
  }

  const ownerJar = new CookieJar();
  await ownerLogin(ownerJar);
  const ownerCsrf = await csrfToken(ownerJar);
  await saveSyntheticDataset(ownerJar);
  const invitationToken = await createInvitation(ownerJar, ownerCsrf);

  const attorneyJar = new CookieJar();
  const attorneyCsrf = await csrfToken(attorneyJar);
  const prepared = await jsonRequest("/api/records/attorney/accept/prepare", {
    method: "POST",
    jar: attorneyJar,
    csrf: attorneyCsrf,
    body: { token: invitationToken },
  });
  assert(prepared.response.ok, `Attorney invitation preparation failed with ${prepared.response.status}.`);
  mailboxProviderHandoffVerified = await requestMailboxAuthentication(attorneyJar, attorneyCsrf);
  const mailboxSession = await syntheticMailboxSession(invitationToken);
  await verifyAcceptancePreconditions(invitationToken, mailboxSession);
  await acceptWithMailboxSession(attorneyJar, attorneyCsrf, invitationToken, mailboxSession);
  const accessHandle = await verifyReadOnlyPortal(attorneyJar);
  await revokeAccess(ownerJar, ownerCsrf);
  await verifyPostRevokeDenial(attorneyJar, accessHandle);

  const grant = await admin
    .from("records_attorney_grants")
    .select("id,revoked_at")
    .eq("owner_user_id", ownerUserId)
    .eq("attorney_user_id", attorneyUserId)
    .maybeSingle();
  assert(!grant.error && grant.data?.revoked_at, "Database grant was not marked revoked.");
  grantId = grant.data.id;

  console.log("Synthetic attorney access verification passed.");
  console.log("Verified: invitation, mailbox token, MFA, read-only portal, revoke, and post-revoke denial.");
  console.log(
    mailboxProviderHandoffVerified
      ? "Mailbox-provider handoff passed; inbox placement was not verified."
      : "Mailbox-provider handoff and inbox placement were not verified because the acceptance test uses a reserved synthetic email domain."
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
    console.log(`Synthetic cleanup passed (owner, attorney, invitation ${invitationId || "none"}, grant ${grantId || "none"}).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
