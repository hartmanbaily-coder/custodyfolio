import assert from "node:assert/strict";
import test from "node:test";

import { assessAppStoreBillingReadiness } from "./audit-app-store-billing-readiness.mjs";

function fixture(overrides = {}) {
  return {
    mode: "submission",
    expectedBuildNumber: "15",
    targetVersion: { attributes: { appStoreState: "READY_FOR_REVIEW" } },
    attachedBuild: {
      attributes: { version: "15", processingState: "VALID", expired: false },
    },
    subscriptions: [
      { state: "READY_TO_SUBMIT" },
      { state: "READY_TO_SUBMIT" },
    ],
    sandboxTesterCount: null,
    ...overrides,
  };
}

test("submission mode accepts pre-review App Store states", () => {
  const result = assessAppStoreBillingReadiness(fixture());
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.warnings, ["sandbox_tester_api_unavailable"]);
});

test("submission mode requires the exact expected build", () => {
  const result = assessAppStoreBillingReadiness(fixture({
    attachedBuild: {
      attributes: { version: "14", processingState: "VALID", expired: false },
    },
  }));
  assert.deepEqual(result.blockers, ["app_store_build_does_not_match_expected"]);
});

test("post-release mode requires approved products and a live version", () => {
  const result = assessAppStoreBillingReadiness(fixture({ mode: "post-release" }));
  assert.deepEqual(result.blockers, [
    "subscriptions_not_approved",
    "ios_version_not_live",
  ]);
});
