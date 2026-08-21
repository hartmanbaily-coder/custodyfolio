#!/usr/bin/env node

import {
  APIException,
  AppStoreServerAPIClient,
  Environment,
} from "@apple/app-store-server-library";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const requestedEnvironment = required("APPLE_NOTIFICATION_TEST_ENVIRONMENT").toLowerCase();
const environment = requestedEnvironment === "production"
  ? Environment.PRODUCTION
  : requestedEnvironment === "sandbox"
    ? Environment.SANDBOX
    : null;
if (!environment) {
  throw new Error("APPLE_NOTIFICATION_TEST_ENVIRONMENT must be production or sandbox.");
}

const privateKey = Buffer.from(
  required("APPLE_APP_STORE_SERVER_PRIVATE_KEY_BASE64"),
  "base64"
).toString("utf8");
if (!privateKey.includes("BEGIN PRIVATE KEY")) {
  throw new Error("APPLE_APP_STORE_SERVER_PRIVATE_KEY_BASE64 is not a PKCS#8 private key.");
}

const client = new AppStoreServerAPIClient(
  privateKey,
  required("APPLE_APP_STORE_SERVER_KEY_ID"),
  required("APPLE_APP_STORE_SERVER_ISSUER_ID"),
  required("APPLE_BUNDLE_ID"),
  environment
);

const pollAttempts = Number(process.env.APPLE_NOTIFICATION_TEST_POLL_ATTEMPTS || 10);
const pollIntervalMs = Number(process.env.APPLE_NOTIFICATION_TEST_POLL_INTERVAL_MS || 2_000);
if (!Number.isInteger(pollAttempts) || pollAttempts < 1 || pollAttempts > 30) {
  throw new Error("APPLE_NOTIFICATION_TEST_POLL_ATTEMPTS must be an integer from 1 through 30.");
}
if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 250 || pollIntervalMs > 10_000) {
  throw new Error("APPLE_NOTIFICATION_TEST_POLL_INTERVAL_MS must be an integer from 250 through 10000.");
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function safeApiError(error) {
  if (error instanceof APIException) {
    return {
      name: "APIException",
      httpStatusCode: error.httpStatusCode,
      apiError: error.apiError,
      errorMessage: error.errorMessage,
    };
  }
  return {
    name: error instanceof Error ? error.name : "Error",
    errorMessage: error instanceof Error ? error.message : "Unknown Apple API error",
  };
}

function isPendingTestNotificationStatus(error) {
  return error instanceof APIException && error.apiError === 4040008;
}

const requestedAt = new Date().toISOString();
let requestAccepted = false;
try {
  const request = await client.requestTestNotification();
  if (!request.testNotificationToken) {
    throw new Error("Apple accepted the request without returning a test notification token.");
  }
  requestAccepted = true;

  let status = null;
  for (let attempt = 1; attempt <= pollAttempts; attempt += 1) {
    if (attempt > 1) await sleep(pollIntervalMs);
    try {
      status = await client.getTestNotificationStatus(request.testNotificationToken);
    } catch (error) {
      if (isPendingTestNotificationStatus(error) && attempt < pollAttempts) continue;
      throw error;
    }
    if ((status.sendAttempts?.length || 0) > 0) break;
  }

  const sendAttempts = (status?.sendAttempts || []).map((attempt) => ({
    attemptedAt:
      typeof attempt.attemptDate === "number"
        ? new Date(attempt.attemptDate).toISOString()
        : null,
    result: attempt.sendAttemptResult || null,
  }));
  const delivered = sendAttempts.some((attempt) => attempt.result === "SUCCESS");
  console.log(JSON.stringify({
    environment: requestedEnvironment,
    requestedAt,
    requestAccepted,
    signedPayloadReturned: Boolean(status?.signedPayload),
    delivered,
    sendAttempts,
  }, null, 2));
  if (!delivered) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    environment: requestedEnvironment,
    requestedAt,
    requestAccepted,
    error: safeApiError(error),
  }, null, 2));
  process.exitCode = 1;
}
