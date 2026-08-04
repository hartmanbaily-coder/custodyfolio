#!/usr/bin/env node

import {
  createPrivateKey,
  sign as signBytes,
} from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DEFAULTS = Object.freeze({
  appId: "6789433883",
  appName: "Custody Folio",
  betaGroupId: "9df64bcd-bf35-471f-b755-05cb498a4822",
  betaGroupName: "External Beta",
  publicTestFlightUrl: "https://testflight.apple.com/join/rVmv2VAF",
  testerBuddyUrl:
    "https://testerbuddy.app/join/684809d42ab353d76fc2ad69a7ea70b653a4c0acc38def27",
  locale: "en-US",
  pollSeconds: 30,
  timeoutMinutes: 120,
  whatsNew:
    "Please test sign-in, record creation and editing, evidence uploads, timeline and calendar views, report generation and exports, account deletion, and general stability. Use synthetic test data only.",
});

const API_BASE_URL = "https://api.appstoreconnect.apple.com";
const FAILED_PROCESSING_STATES = new Set(["FAILED", "INVALID"]);
const FAILED_EXTERNAL_STATES = new Set([
  "PROCESSING_EXCEPTION",
  "MISSING_EXPORT_COMPLIANCE",
  "EXPIRED",
  "BETA_REJECTED",
]);

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}

export function createAppStoreConnectToken({
  issuerId,
  keyId,
  privateKey,
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  const header = base64Url(
    JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }),
  );
  const payload = base64Url(
    JSON.stringify({
      iss: issuerId,
      iat: nowSeconds - 30,
      exp: nowSeconds + 19 * 60,
      aud: "appstoreconnect-v1",
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = signBytes("sha256", Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64Url(signature)}`;
}

export function selectUploadedBuild(builds, { buildNumber, uploadedAfter }) {
  const activeBuilds = builds.filter((build) => !build.attributes?.expired);

  if (buildNumber) {
    const matches = activeBuilds.filter(
      (build) => build.attributes?.version === String(buildNumber),
    );
    if (matches.length > 1) {
      throw new Error(`More than one active build matches build ${buildNumber}.`);
    }
    return matches[0] ?? null;
  }

  const threshold = Date.parse(uploadedAfter);
  if (!Number.isFinite(threshold)) {
    throw new Error(`Invalid --uploaded-after timestamp: ${uploadedAfter}`);
  }

  const matches = activeBuilds.filter(
    (build) => Date.parse(build.attributes?.uploadedDate) >= threshold,
  );
  if (matches.length > 1) {
    const versions = matches
      .map((build) => build.attributes?.version ?? build.id)
      .join(", ");
    throw new Error(
      `Multiple builds were uploaded after ${uploadedAfter} (${versions}); refusing to guess which build to release. Re-run with --build-number.`,
    );
  }
  return matches[0] ?? null;
}

export function extractTestFlightUrl(html) {
  return (
    html.match(/https:\/\/testflight\.apple\.com\/join\/[A-Za-z0-9]+/)?.[0] ??
    null
  );
}

export function selectSupersededGroupBuilds(builds, expectedBuildId) {
  return builds.filter((build) => build.id !== expectedBuildId);
}

function parseArguments(argv) {
  const options = {
    preflight: false,
    verifyOnly: false,
    buildNumber: null,
    uploadedAfter: null,
    whatsNew: process.env.TESTFLIGHT_WHAT_TO_TEST || DEFAULTS.whatsNew,
    pollSeconds: DEFAULTS.pollSeconds,
    timeoutMinutes: DEFAULTS.timeoutMinutes,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const takeValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value.`);
      }
      index += 1;
      return value;
    };

    switch (argument) {
      case "--preflight":
        options.preflight = true;
        break;
      case "--verify-only":
        options.verifyOnly = true;
        break;
      case "--build-number":
        options.buildNumber = takeValue();
        break;
      case "--uploaded-after":
        options.uploadedAfter = takeValue();
        break;
      case "--what-to-test":
        options.whatsNew = takeValue();
        break;
      case "--poll-seconds":
        options.pollSeconds = Number(takeValue());
        break;
      case "--timeout-minutes":
        options.timeoutMinutes = Number(takeValue());
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (options.help) return options;
  if (!Number.isFinite(options.pollSeconds) || options.pollSeconds < 1) {
    throw new Error("--poll-seconds must be at least 1.");
  }
  if (!Number.isFinite(options.timeoutMinutes) || options.timeoutMinutes < 1) {
    throw new Error("--timeout-minutes must be at least 1.");
  }
  if (options.buildNumber && options.uploadedAfter) {
    throw new Error("Use either --build-number or --uploaded-after, not both.");
  }
  if (!options.preflight && !options.buildNumber && !options.uploadedAfter) {
    throw new Error(
      "Provide --uploaded-after for a new upload or --build-number for an existing build.",
    );
  }
  if (options.verifyOnly && !options.buildNumber) {
    throw new Error("--verify-only requires --build-number.");
  }
  return options;
}

function usage() {
  return `Usage:
  node scripts/ios/distribute-testflight-external.mjs --preflight
  node scripts/ios/distribute-testflight-external.mjs --uploaded-after ISO_TIMESTAMP [--what-to-test TEXT]
  node scripts/ios/distribute-testflight-external.mjs --build-number NUMBER [--what-to-test TEXT]
  node scripts/ios/distribute-testflight-external.mjs --verify-only --build-number NUMBER

The command finds the exact build, waits for processing, makes it the only build
in External Beta, enables automatic tester notification, submits it for Beta App
Review, waits for IN_BETA_TESTING, and verifies the TestFlight and TesterBuddy
links.
Credentials are loaded from the environment or .env.testflight.`;
}

function loadLocalEnvironment() {
  const repositoryRoot = resolve(
    fileURLToPath(new URL("../../", import.meta.url)),
  );
  const envPath = resolve(repositoryRoot, ".env.testflight");
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

function loadCredentials() {
  const issuerId = process.env.ASC_ISSUER_ID?.trim();
  const keyId = process.env.ASC_KEY_ID?.trim();
  const privateKeyPath = process.env.ASC_PRIVATE_KEY_PATH?.trim();
  const missing = [
    ["ASC_ISSUER_ID", issuerId],
    ["ASC_KEY_ID", keyId],
    ["ASC_PRIVATE_KEY_PATH", privateKeyPath],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Missing App Store Connect API configuration: ${missing.join(", ")}. Copy .env.testflight.example to .env.testflight and add the uncommitted values.`,
    );
  }

  const resolvedKeyPath = resolve(privateKeyPath);
  if (!existsSync(resolvedKeyPath)) {
    throw new Error(`ASC_PRIVATE_KEY_PATH does not exist: ${resolvedKeyPath}`);
  }
  const privateKey = createPrivateKey(readFileSync(resolvedKeyPath, "utf8"));
  if (privateKey.asymmetricKeyType !== "ec") {
    throw new Error("ASC_PRIVATE_KEY_PATH must contain an EC App Store Connect .p8 key.");
  }

  // Sign once during preflight so malformed keys fail before an archive starts.
  createAppStoreConnectToken({ issuerId, keyId, privateKey });
  return { issuerId, keyId, privateKey };
}

function errorSummary(payload) {
  if (!payload) return "No response body.";
  if (Array.isArray(payload.errors)) {
    return payload.errors
      .map((error) =>
        [error.status, error.code, error.title, error.detail]
          .filter(Boolean)
          .join(" "),
      )
      .join("; ");
  }
  return JSON.stringify(payload).slice(0, 1000);
}

export class AppStoreConnectClient {
  constructor({ credentials, fetchImpl = fetch }) {
    this.credentials = credentials;
    this.fetchImpl = fetchImpl;
  }

  async request(path, { method = "GET", body, allowStatuses = [] } = {}) {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const token = createAppStoreConnectToken(this.credentials);
      const response = await this.fetchImpl(new URL(path, API_BASE_URL), {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      const payload =
        response.status === 204
          ? null
          : await response.json().catch(() => null);
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < 5) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delaySeconds = Number.isFinite(retryAfter)
          ? Math.min(Math.max(retryAfter, 1), 30)
          : attempt * 2;
        console.log(
          `App Store Connect returned ${response.status}; retrying in ${delaySeconds}s…`,
        );
        await sleep(delaySeconds * 1000);
        continue;
      }
      if (!response.ok && !allowStatuses.includes(response.status)) {
        throw new Error(
          `App Store Connect ${method} ${path} failed (${response.status}): ${errorSummary(payload)}`,
        );
      }
      return { status: response.status, payload };
    }
    throw new Error(`App Store Connect ${method} ${path} exhausted retries.`);
  }
}

function query(path, parameters) {
  const url = new URL(path, API_BASE_URL);
  for (const [name, value] of Object.entries(parameters)) {
    url.searchParams.set(name, value);
  }
  return `${url.pathname}${url.search}`;
}

async function sleep(milliseconds) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function deadlineFrom(minutes) {
  return Date.now() + minutes * 60 * 1000;
}

function assertBeforeDeadline(deadline, message) {
  if (Date.now() >= deadline) throw new Error(message);
}

async function listBuilds(client) {
  const { payload } = await client.request(
    query(`/v1/apps/${DEFAULTS.appId}/builds`, {
      "fields[builds]": "version,uploadedDate,expired,processingState",
      sort: "-uploadedDate",
      limit: "50",
    }),
  );
  return payload.data;
}

async function waitForBuild(client, options, deadline) {
  while (true) {
    const build = selectUploadedBuild(await listBuilds(client), options);
    if (build) return build;
    assertBeforeDeadline(
      deadline,
      "Timed out waiting for the uploaded build to appear in App Store Connect.",
    );
    console.log("Waiting for the uploaded build to appear in App Store Connect…");
    await sleep(options.pollSeconds * 1000);
  }
}

async function waitForProcessing(client, build, options, deadline) {
  while (true) {
    const { payload } = await client.request(
      query(`/v1/builds/${build.id}`, {
        "fields[builds]": "version,uploadedDate,expired,processingState",
      }),
    );
    build = payload.data;
    const state = build.attributes.processingState;
    console.log(`Build ${build.attributes.version} processing state: ${state}`);
    if (state === "VALID") return build;
    if (FAILED_PROCESSING_STATES.has(state)) {
      throw new Error(`Build ${build.attributes.version} processing failed: ${state}`);
    }
    assertBeforeDeadline(
      deadline,
      `Timed out waiting for build ${build.attributes.version} processing.`,
    );
    await sleep(options.pollSeconds * 1000);
  }
}

async function getBetaDetail(client, buildId) {
  const { payload } = await client.request(
    query(`/v1/builds/${buildId}/buildBetaDetail`, {
      "fields[buildBetaDetails]":
        "autoNotifyEnabled,internalBuildState,externalBuildState",
    }),
  );
  return payload.data;
}

async function ensureAutomaticNotification(client, buildId) {
  const detail = await getBetaDetail(client, buildId);
  if (detail.attributes.autoNotifyEnabled) return detail;
  const { payload } = await client.request(`/v1/buildBetaDetails/${detail.id}`, {
    method: "PATCH",
    body: {
      data: {
        type: "buildBetaDetails",
        id: detail.id,
        attributes: { autoNotifyEnabled: true },
      },
    },
  });
  console.log("Enabled automatic tester notification.");
  return payload.data;
}

async function ensureWhatsNew(client, buildId, whatsNew) {
  const { payload } = await client.request(
    query(`/v1/builds/${buildId}/betaBuildLocalizations`, {
      "fields[betaBuildLocalizations]": "locale,whatsNew",
      limit: "50",
    }),
  );
  const localization = payload.data.find(
    (item) => item.attributes.locale === DEFAULTS.locale,
  );
  if (localization?.attributes.whatsNew === whatsNew) return;

  if (localization) {
    await client.request(`/v1/betaBuildLocalizations/${localization.id}`, {
      method: "PATCH",
      body: {
        data: {
          type: "betaBuildLocalizations",
          id: localization.id,
          attributes: { whatsNew },
        },
      },
    });
  } else {
    await client.request("/v1/betaBuildLocalizations", {
      method: "POST",
      body: {
        data: {
          type: "betaBuildLocalizations",
          attributes: { locale: DEFAULTS.locale, whatsNew },
          relationships: {
            build: { data: { type: "builds", id: buildId } },
          },
        },
      },
    });
  }
  console.log(`Updated What to Test (${DEFAULTS.locale}).`);
}

async function ensureOnlyBuildInGroup(client, buildId) {
  const { payload } = await client.request(
    query(`/v1/betaGroups/${DEFAULTS.betaGroupId}/builds`, {
      "fields[builds]": "version",
      limit: "200",
    }),
  );
  if (!payload.data.some((build) => build.id === buildId)) {
    await client.request(
      `/v1/betaGroups/${DEFAULTS.betaGroupId}/relationships/builds`,
      {
        method: "POST",
        body: { data: [{ type: "builds", id: buildId }] },
      },
    );
    console.log(`Added build to ${DEFAULTS.betaGroupName}.`);
  }

  const supersededBuilds = selectSupersededGroupBuilds(payload.data, buildId);
  if (supersededBuilds.length === 0) return;

  await client.request(
    `/v1/betaGroups/${DEFAULTS.betaGroupId}/relationships/builds`,
    {
      method: "DELETE",
      body: {
        data: supersededBuilds.map((build) => ({
          type: "builds",
          id: build.id,
        })),
      },
    },
  );
  console.log(
    `Removed ${supersededBuilds.length} superseded build${supersededBuilds.length === 1 ? "" : "s"} from ${DEFAULTS.betaGroupName}.`,
  );
}

async function getReviewSubmission(client, buildId) {
  const { status, payload } = await client.request(
    query(`/v1/builds/${buildId}/betaAppReviewSubmission`, {
      "fields[betaAppReviewSubmissions]": "betaReviewState,submittedDate",
    }),
    { allowStatuses: [404] },
  );
  return status === 404 ? null : payload.data;
}

async function ensureReviewSubmitted(client, buildId) {
  const current = await getReviewSubmission(client, buildId);
  if (current) {
    if (current.attributes.betaReviewState === "REJECTED") {
      throw new Error("Beta App Review rejected this build.");
    }
    console.log(`Beta App Review state: ${current.attributes.betaReviewState}`);
    return current;
  }

  const { payload } = await client.request("/v1/betaAppReviewSubmissions", {
    method: "POST",
    body: {
      data: {
        type: "betaAppReviewSubmissions",
        relationships: {
          build: { data: { type: "builds", id: buildId } },
        },
      },
    },
  });
  console.log("Submitted build for Beta App Review.");
  return payload.data;
}

async function waitForExternalTesting(client, build, options, deadline) {
  while (true) {
    const detail = await getBetaDetail(client, build.id);
    const state = detail.attributes.externalBuildState;
    console.log(`Build ${build.attributes.version} external state: ${state}`);
    if (state === "IN_BETA_TESTING") return detail;
    if (FAILED_EXTERNAL_STATES.has(state)) {
      throw new Error(
        `Build ${build.attributes.version} cannot enter external testing: ${state}`,
      );
    }
    assertBeforeDeadline(
      deadline,
      `Timed out waiting for build ${build.attributes.version} to enter external testing. Current state: ${state}`,
    );
    await sleep(options.pollSeconds * 1000);
  }
}

async function verifyGroup(client, { expectedBuildId } = {}) {
  const { payload } = await client.request(
    query(`/v1/betaGroups/${DEFAULTS.betaGroupId}`, {
      "fields[betaGroups]":
        "name,isInternalGroup,publicLinkEnabled,publicLinkLimitEnabled,publicLinkLimit,publicLink",
    }),
  );
  const group = payload.data;
  const attributes = group.attributes;
  if (attributes.name !== DEFAULTS.betaGroupName || attributes.isInternalGroup) {
    throw new Error("Configured TestFlight group is not the External Beta group.");
  }
  if (!attributes.publicLinkEnabled) {
    throw new Error("External Beta public link is disabled.");
  }
  if (attributes.publicLink !== DEFAULTS.publicTestFlightUrl) {
    throw new Error(
      `External Beta public link changed to ${attributes.publicLink ?? "none"}.`,
    );
  }

  const { payload: appLinkage } = await client.request(
    `/v1/betaGroups/${DEFAULTS.betaGroupId}/relationships/app`,
  );
  if (appLinkage.data?.id !== DEFAULTS.appId) {
    throw new Error("External Beta group belongs to a different app.");
  }

  const { payload: testerLinkages } = await client.request(
    query(`/v1/betaGroups/${DEFAULTS.betaGroupId}/relationships/betaTesters`, {
      limit: "200",
    }),
  );
  const testerCount =
    testerLinkages.meta?.paging?.total ?? testerLinkages.data.length;
  if (
    attributes.publicLinkLimitEnabled &&
    testerCount >= attributes.publicLinkLimit
  ) {
    throw new Error(
      `External Beta public link is at capacity (${testerCount}/${attributes.publicLinkLimit}).`,
    );
  }

  if (expectedBuildId) {
    const { payload: builds } = await client.request(
      query(`/v1/betaGroups/${DEFAULTS.betaGroupId}/builds`, {
        "fields[builds]": "version",
        limit: "200",
      }),
    );
    if (
      builds.data.length !== 1 ||
      builds.data[0]?.id !== expectedBuildId
    ) {
      const versions = builds.data
        .map((build) => build.attributes?.version ?? build.id)
        .join(", ");
      throw new Error(
        `External Beta must contain only the selected build; current builds: ${versions || "none"}.`,
      );
    }
  }

  const capacity = attributes.publicLinkLimitEnabled
    ? `${testerCount}/${attributes.publicLinkLimit}`
    : `${testerCount}/unlimited`;
  console.log(`External Beta public link enabled; tester capacity: ${capacity}.`);
}

async function verifyReviewMetadata(client) {
  const { payload: localizations } = await client.request(
    query(`/v1/apps/${DEFAULTS.appId}/betaAppLocalizations`, {
      "fields[betaAppLocalizations]": "locale,description",
      limit: "200",
    }),
  );
  if (localizations.data.length === 0) {
    throw new Error("No TestFlight beta app localization is configured.");
  }
  const missingDescriptions = localizations.data
    .filter((localization) => !localization.attributes.description?.trim())
    .map((localization) => localization.attributes.locale);
  if (missingDescriptions.length > 0) {
    throw new Error(
      `TestFlight app description is missing for: ${missingDescriptions.join(", ")}.`,
    );
  }

  const { payload: reviewDetail } = await client.request(
    query(`/v1/apps/${DEFAULTS.appId}/betaAppReviewDetail`, {
      "fields[betaAppReviewDetails]":
        "contactFirstName,contactLastName,contactPhone,contactEmail,demoAccountName,demoAccountPassword,demoAccountRequired",
    }),
  );
  const attributes = reviewDetail.data?.attributes ?? {};
  const missingContactFields = [
    ["first name", attributes.contactFirstName],
    ["last name", attributes.contactLastName],
    ["phone", attributes.contactPhone],
    ["email", attributes.contactEmail],
  ]
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);
  if (missingContactFields.length > 0) {
    throw new Error(
      `Beta App Review contact information is incomplete: ${missingContactFields.join(", ")}.`,
    );
  }
  if (
    attributes.demoAccountRequired &&
    (!attributes.demoAccountName?.trim() ||
      !attributes.demoAccountPassword?.trim())
  ) {
    throw new Error("Beta App Review requires demo-account credentials, but they are incomplete.");
  }
  console.log("Beta App Review metadata preflight passed.");
}

async function fetchText(fetchImpl, url, label) {
  const response = await fetchImpl(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: { "User-Agent": "Custody-Folio-TestFlight-Release/1.0" },
  });
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}.`);
  }
  return response.text();
}

async function verifyPublicLinks(fetchImpl = fetch) {
  const testerBuddyHtml = await fetchText(
    fetchImpl,
    DEFAULTS.testerBuddyUrl,
    "TesterBuddy enrollment page",
  );
  const mappedUrl = extractTestFlightUrl(testerBuddyHtml);
  if (mappedUrl !== DEFAULTS.publicTestFlightUrl) {
    throw new Error(
      `TesterBuddy maps to ${mappedUrl ?? "no TestFlight URL"}, not ${DEFAULTS.publicTestFlightUrl}.`,
    );
  }

  const testFlightHtml = await fetchText(
    fetchImpl,
    DEFAULTS.publicTestFlightUrl,
    "Public TestFlight link",
  );
  if (!testFlightHtml.includes(DEFAULTS.appName)) {
    throw new Error(
      `Public TestFlight page does not identify ${DEFAULTS.appName}.`,
    );
  }
  console.log("TesterBuddy and public TestFlight links both resolve to Custody Folio.");
}

async function runPreflight(client) {
  await verifyGroup(client);
  await verifyReviewMetadata(client);
  await verifyPublicLinks();
  console.log("App Store Connect API preflight passed.");
}

async function run(options) {
  const credentials = loadCredentials();
  const client = new AppStoreConnectClient({ credentials });

  await runPreflight(client);
  if (options.preflight) return;

  const deadline = deadlineFrom(options.timeoutMinutes);
  let build = await waitForBuild(client, options, deadline);
  console.log(
    `Selected build ${build.attributes.version}, uploaded ${build.attributes.uploadedDate}.`,
  );
  build = await waitForProcessing(client, build, options, deadline);

  if (!options.verifyOnly) {
    await ensureWhatsNew(client, build.id, options.whatsNew);
    await ensureAutomaticNotification(client, build.id);
    await ensureOnlyBuildInGroup(client, build.id);
    await ensureReviewSubmitted(client, build.id);
  }

  await waitForExternalTesting(client, build, options, deadline);
  await verifyGroup(client, { expectedBuildId: build.id });
  await verifyPublicLinks();
  console.log(
    `PUBLIC TESTFLIGHT RELEASE COMPLETE: build ${build.attributes.version} is Testing in ${DEFAULTS.betaGroupName}.`,
  );
}

async function main() {
  try {
    loadLocalEnvironment();
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    await run(options);
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
