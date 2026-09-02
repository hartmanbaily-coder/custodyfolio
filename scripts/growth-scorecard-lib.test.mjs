import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGrowthScorecardRpcParameters,
  parseGrowthExcludedUserIds,
  validateGrowthScorecard,
} from "./growth-scorecard-lib.mjs";

const validReport = {
  schema_version: 1,
  window: {
    from: "2026-08-31T08:00:00.000Z",
    to: "2026-09-07T08:00:00.000Z",
  },
  reporting_contract: {
    minimum_reportable_group_size: 5,
    billing_totals: "authoritative_live_billing",
    source_content_attribution: "privacy_preserving_growth_events",
    satisfaction_source: "persisted_production_responses",
    minimum_viable_segment_evidence:
      "not_established_by_article_attribution",
  },
  acquisition: {
    qualified_visits: 5,
    signup_selections: 5,
    completed_signups: 5,
    qualified_trials: 5,
    target_trials: 500,
    trial_target_progress_percent: 1,
    visit_to_signup_percent: 100,
    visits_by_source: [{ source: "checklist", count: 5, suppressed: false }],
    signups_by_source: [{ source: "checklist", count: 5, suppressed: false }],
    visits_by_content: [
      { content_code: "factual_checklist", count: 5, suppressed: false },
    ],
    signups_by_content: [
      { content_code: "factual_checklist", count: 5, suppressed: false },
    ],
    confirmed_trial_events_by_content: [
      { content_code: "factual_checklist", count: 5, suppressed: false },
    ],
  },
  activation: {
    meaningfully_activated_accounts: 5,
    meaningful_activation_rate_percent: 100,
    first_timeline_accounts: 5,
    first_report_accounts: 0,
    first_report_rate_percent: 0,
    median_minutes_to_first_record: 1440,
    activated_by_content: [
      { content_code: "factual_checklist", count: 5, suppressed: false },
    ],
  },
  engagement: {
    feedback_prompt_accounts: 5,
    feedback_opt_in_accounts: 1,
    feedback_opt_in_rate_percent: 20,
  },
  satisfaction: {
    responses: 5,
    positive_responses: 4,
    customer_value_satisfaction_percent: 80,
  },
  conversion: {
    paid_subscribers: 1,
    monthly_subscribers: 1,
    annual_subscribers: 0,
    subscription_start_accounts: 1,
    cancellations: 0,
    refund_requests: 0,
    paid_target: 100,
    paid_target_progress_percent: 1,
    eligible_trial_to_paid_percent: 20,
    subscription_starts_by_source: [
      { source: "checklist", count: null, suppressed: true },
    ],
    subscription_starts_by_content: [
      { content_code: "factual_checklist", count: null, suppressed: true },
    ],
  },
};

test("accepts the fixed aggregate result contract", () => {
  assert.deepEqual(validateGrowthScorecard(validReport), validReport);
});

test("rejects unknown fields and identifier shaped row output", () => {
  assert.throws(() =>
    validateGrowthScorecard({
      ...validReport,
      user_id: "00000000-0000-4000-8000-000000000001",
    })
  );
  assert.throws(() =>
    validateGrowthScorecard({
      ...validReport,
      acquisition: {
        ...validReport.acquisition,
        rows: [{ cohort_identifier: "a".repeat(32) }],
      },
    })
  );
});

test("enforces source and content suppression before output", () => {
  assert.throws(() =>
    validateGrowthScorecard({
      ...validReport,
      acquisition: {
        ...validReport.acquisition,
        visits_by_source: [
          { source: "checklist", count: 4, suppressed: false },
        ],
      },
    })
  );
  assert.throws(() =>
    validateGrowthScorecard({
      ...validReport,
      acquisition: {
        ...validReport.acquisition,
        visits_by_content: [
          { content_code: "factual_checklist", count: 4, suppressed: true },
        ],
      },
    })
  );
});

test("builds bounded RPC inputs without returning the analytics secret", () => {
  const userId = "00000000-0000-4000-8000-000000000001";
  const secret = "s".repeat(32);
  const parameters = buildGrowthScorecardRpcParameters({
    from: "2026-08-31T08:00:00.000Z",
    to: "2026-09-07T08:00:00.000Z",
    excludedUserIds: [userId],
    analyticsSecret: secret,
  });

  assert.deepEqual(parameters.p_excluded_user_ids, [userId]);
  assert.match(parameters.p_excluded_cohort_identifiers[0], /^[a-f0-9]{32}$/);
  assert.equal(JSON.stringify(parameters).includes(secret), false);
  assert.deepEqual(Object.keys(parameters).sort(), [
    "p_excluded_cohort_identifiers",
    "p_excluded_user_ids",
    "p_from",
    "p_to",
  ]);
});

test("rejects invalid dates, weak secrets, and invalid exclusion values", () => {
  assert.throws(() =>
    buildGrowthScorecardRpcParameters({
      from: "invalid",
      to: "2026-09-07T08:00:00.000Z",
      excludedUserIds: [],
      analyticsSecret: "s".repeat(32),
    })
  );
  assert.throws(() =>
    buildGrowthScorecardRpcParameters({
      from: "2026-08-31T08:00:00.000Z",
      to: "2026-09-07T08:00:00.000Z",
      excludedUserIds: [],
      analyticsSecret: "weak",
    })
  );
  assert.throws(() => parseGrowthExcludedUserIds("not-a-uuid"));
});

test("deduplicates valid internal exclusion values", () => {
  const userId = "00000000-0000-4000-8000-000000000001";
  assert.deepEqual(
    parseGrowthExcludedUserIds(userId + ", " + userId),
    [userId]
  );
});
