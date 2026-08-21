#!/usr/bin/env node

import { createPrivateKey } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  AppStoreConnectClient,
  DEFAULTS,
} from "./distribute-testflight-external.mjs";

const EXPECTED_NOTIFICATION_URL =
  "https://custodyfolio.com/api/records/billing/apple/notifications";

function loadCredentials() {
  if (existsSync(".env.testflight")) process.loadEnvFile(".env.testflight");

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
    throw new Error(`Missing App Store Connect configuration: ${missing.join(", ")}`);
  }

  const privateKey = createPrivateKey(readFileSync(resolve(privateKeyPath), "utf8"));
  if (privateKey.asymmetricKeyType !== "ec") {
    throw new Error("ASC_PRIVATE_KEY_PATH must contain an EC App Store Connect key.");
  }
  return { issuerId, keyId, privateKey };
}

function apiPath(path, parameters = {}) {
  const url = new URL(path, "https://api.appstoreconnect.apple.com");
  for (const [name, value] of Object.entries(parameters)) {
    url.searchParams.set(name, value);
  }
  return `${url.pathname}${url.search}`;
}

async function getData(client, path, parameters = {}, { optional = false } = {}) {
  try {
    const { payload } = await client.request(apiPath(path, parameters));
    return payload?.data ?? [];
  } catch (error) {
    if (!optional) throw error;
    return { unavailable: true, reason: error.message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]") };
  }
}

function attributes(resource) {
  return resource?.attributes ?? {};
}

function parseArguments(argv) {
  const options = { mode: "submission", expectedBuildNumber: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--mode" && value) {
      if (!['submission', 'post-release'].includes(value)) {
        throw new Error("--mode must be submission or post-release.");
      }
      options.mode = value;
      index += 1;
    } else if (argument === "--expected-build-number" && value) {
      options.expectedBuildNumber = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete option: ${argument}`);
    }
  }
  return options;
}

export function assessAppStoreBillingReadiness(input) {
  const blockers = [];
  const warnings = [];
  const subscriptionStates = input.subscriptions.map((item) => item.state);
  const submissionSubscriptionStates = new Set(["READY_TO_SUBMIT", "APPROVED"]);
  if (
    input.mode === "post-release"
      ? subscriptionStates.some((state) => state !== "APPROVED")
      : subscriptionStates.some((state) => !submissionSubscriptionStates.has(state))
  ) {
    blockers.push(
      input.mode === "post-release"
        ? "subscriptions_not_approved"
        : "subscriptions_not_ready_to_submit"
    );
  }
  const targetVersionState = attributes(input.targetVersion).appStoreState;
  if (
    input.mode === "post-release"
      ? targetVersionState !== "READY_FOR_SALE"
      : targetVersionState !== "READY_FOR_REVIEW"
  ) {
    blockers.push(
      input.mode === "post-release"
        ? "ios_version_not_live"
        : "ios_version_not_ready_for_review"
    );
  }
  if (
    !input.attachedBuild ||
    input.attachedBuild.unavailable ||
    attributes(input.attachedBuild).processingState !== "VALID" ||
    attributes(input.attachedBuild).expired
  ) {
    blockers.push("app_store_build_missing_or_invalid");
  } else if (
    input.expectedBuildNumber &&
    attributes(input.attachedBuild).version !== String(input.expectedBuildNumber)
  ) {
    blockers.push("app_store_build_does_not_match_expected");
  }
  if (input.sandboxTesterCount === 0) warnings.push("sandbox_tester_missing");
  if (input.sandboxTesterCount === null) warnings.push("sandbox_tester_api_unavailable");
  return { blockers, warnings };
}

async function run(options = parseArguments(process.argv.slice(2))) {
  const client = new AppStoreConnectClient({ credentials: loadCredentials() });
  const app = await getData(
    client,
    `/v1/apps/${DEFAULTS.appId}`,
    {
      "fields[apps]":
        "name,bundleId,subscriptionStatusUrl,subscriptionStatusUrlVersion,subscriptionStatusUrlForSandbox,subscriptionStatusUrlVersionForSandbox",
    },
  );
  const versions = await getData(
    client,
    `/v1/apps/${DEFAULTS.appId}/appStoreVersions`,
    {
      "filter[platform]": "IOS",
      "fields[appStoreVersions]": "versionString,appStoreState,createdDate",
      limit: "50",
    },
  );
  const targetVersion = versions.find(
    (version) => attributes(version).versionString === "1.0.0",
  );
  const reviewDetail = targetVersion
    ? await getData(
        client,
        `/v1/appStoreVersions/${targetVersion.id}/appStoreReviewDetail`,
        {
          "fields[appStoreReviewDetails]":
            "contactFirstName,contactLastName,contactPhone,contactEmail,demoAccountName,demoAccountPassword,demoAccountRequired,notes",
        },
      )
    : null;
  const attachedBuild = targetVersion
    ? await getData(
        client,
        `/v1/appStoreVersions/${targetVersion.id}/build`,
        { "fields[builds]": "version,processingState,expired" },
        { optional: true },
      )
    : null;
  const reviewSubmissions = await getData(
    client,
    `/v1/apps/${DEFAULTS.appId}/reviewSubmissions`,
    {
      "fields[reviewSubmissions]": "platform,state,submittedDate",
      include: "items",
      limit: "50",
    },
  );
  const reviewSubmissionSummaries = [];
  for (const submission of reviewSubmissions) {
    const items = await getData(
      client,
      `/v1/reviewSubmissions/${submission.id}/items`,
      {
        "fields[reviewSubmissionItems]": "state",
        limit: "50",
      },
    );
    reviewSubmissionSummaries.push({
      id: submission.id,
      platform: attributes(submission).platform,
      state: attributes(submission).state,
      submittedDate: attributes(submission).submittedDate ?? null,
      itemCount: items.length,
      itemStates: items.map((item) => attributes(item).state),
    });
  }
  const groups = await getData(
    client,
    `/v1/apps/${DEFAULTS.appId}/subscriptionGroups`,
    { "fields[subscriptionGroups]": "referenceName", limit: "50" },
  );
  const subscriptions = [];
  for (const group of groups) {
    const products = await getData(
      client,
      `/v1/subscriptionGroups/${group.id}/subscriptions`,
      {
        "fields[subscriptions]": "name,productId,state,subscriptionPeriod",
        limit: "200",
      },
    );
    subscriptions.push(
      ...products.map((product) => ({
        group: attributes(group).referenceName,
        name: attributes(product).name,
        productId: attributes(product).productId,
        state: attributes(product).state,
        subscriptionPeriod: attributes(product).subscriptionPeriod,
      })),
    );
  }
  const sandboxTesters = await getData(
    client,
    "/v1/sandboxTesters",
    { limit: "200" },
    { optional: true },
  );

  const appAttributes = attributes(app);
  const notificationConfiguration = {
    productionUrl: appAttributes.subscriptionStatusUrl ?? null,
    productionVersion: appAttributes.subscriptionStatusUrlVersion ?? null,
    sandboxUrl: appAttributes.subscriptionStatusUrlForSandbox ?? null,
    sandboxVersion: appAttributes.subscriptionStatusUrlVersionForSandbox ?? null,
  };
  const testerCount = Array.isArray(sandboxTesters) ? sandboxTesters.length : null;
  const testerQueryReason = Array.isArray(sandboxTesters)
    ? null
    : sandboxTesters.reason;
  const blockers = [];
  const warnings = [];
  if (
    notificationConfiguration.productionUrl !== EXPECTED_NOTIFICATION_URL ||
    notificationConfiguration.sandboxUrl !== EXPECTED_NOTIFICATION_URL ||
    notificationConfiguration.productionVersion !== "V2" ||
    notificationConfiguration.sandboxVersion !== "V2"
  ) {
    blockers.push("notification_configuration");
  }
  const reviewAttributes = attributes(reviewDetail);
  const reviewContactComplete = [
    reviewAttributes.contactFirstName,
    reviewAttributes.contactLastName,
    reviewAttributes.contactPhone,
    reviewAttributes.contactEmail,
  ].every((value) => value?.trim());
  const reviewDemoComplete =
    !reviewAttributes.demoAccountRequired ||
    (reviewAttributes.demoAccountName?.trim() &&
      reviewAttributes.demoAccountPassword?.trim());
  if (!reviewContactComplete || !reviewDemoComplete || !reviewAttributes.notes?.trim()) {
    blockers.push("app_review_metadata_incomplete");
  }
  if (reviewSubmissions.length === 0) {
    blockers.push("review_submission_missing");
  } else if (
    !reviewSubmissionSummaries.some(
      (submission) =>
        submission.state === "READY_FOR_REVIEW" &&
        submission.itemCount === 4 &&
        submission.itemStates.every((state) => state === "READY_FOR_REVIEW"),
    )
  ) {
    blockers.push("review_submission_incomplete");
  }
  const assessed = assessAppStoreBillingReadiness({
    mode: options.mode,
    expectedBuildNumber: options.expectedBuildNumber,
    targetVersion,
    attachedBuild,
    subscriptions,
    sandboxTesterCount: testerCount,
  });
  blockers.push(...assessed.blockers);
  warnings.push(...assessed.warnings);

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        readinessMode: options.mode,
        expectedBuildNumber: options.expectedBuildNumber,
        app: { name: appAttributes.name, bundleId: appAttributes.bundleId },
        notificationConfiguration,
        versions: versions.map((version) => ({
          version: attributes(version).versionString,
          state: attributes(version).appStoreState,
          createdAt: attributes(version).createdDate,
        })),
        draftSubmissionPackage: {
          versionId: targetVersion?.id ?? null,
          build: attachedBuild?.unavailable
            ? { available: false, reason: attachedBuild.reason }
            : attachedBuild
              ? {
                  available: true,
                  version: attributes(attachedBuild).version,
                  processingState: attributes(attachedBuild).processingState,
                  expired: attributes(attachedBuild).expired,
                }
              : { available: false },
          reviewMetadata: {
            contactComplete: Boolean(reviewContactComplete),
            demoAccountRequired: Boolean(reviewAttributes.demoAccountRequired),
            demoAccountComplete: Boolean(reviewDemoComplete),
            notesComplete: Boolean(reviewAttributes.notes?.trim()),
          },
          reviewSubmissions: reviewSubmissionSummaries,
        },
        subscriptions,
        sandboxTesterCount: testerCount,
        sandboxTesterQueryAvailable: Array.isArray(sandboxTesters),
        sandboxTesterQueryReason: testerQueryReason,
        blockers,
        warnings,
      },
      null,
      2,
    ),
  );
  if (blockers.length > 0) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  }
}
