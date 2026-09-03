import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGrowthScorecardRpcParameters,
  parseGrowthExcludedUserIds,
  validateGrowthScorecard,
} from "./growth-scorecard-lib.mjs";

const validReport = {
  schema_version: 2,
  window: {
    from: "2026-08-31T08:00:00.000Z",
    to: "2026-09-07T08:00:00.000Z",
  },
  reporting_contract: {
    minimum_reportable_group_size: 5,
    billing_totals: "authoritative_live_billing",
    trial_attribution: "protected_billing_growth_cohort",
    source_conclusions_rule: "complete_trial_mapping_required",
    visitor_signup_measure: "aggregate_diagnostic_ratio_only",
    satisfaction_scope: "campaign_trial_respondents",
    minimum_viable_segment_evidence:
      "not_established_by_article_attribution",
  },
  acquisition: {
    tracked_visits: 5,
    signup_selections: 5,
    confirmed_signups: 5,
    qualified_trials: 5,
    mapped_qualified_trials: 5,
    unmapped_qualified_trials: 0,
    trial_mapping_coverage_percent: 100,
    source_conclusions_available: true,
    target_trials: 500,
    trial_target_progress_percent: 1,
    visit_to_confirmed_signup_diagnostic_ratio_percent: 100,
    visits_by_source: [{ source: "checklist", count: 5, suppressed: false }],
    confirmed_signups_by_source: [
      { source: "checklist", count: 5, suppressed: false },
    ],
    qualified_trials_by_source: [
      { source: "checklist", count: 5, suppressed: false },
    ],
    visits_by_content: [
      { content_code: "factual_checklist", count: 5, suppressed: false },
    ],
    confirmed_signups_by_content: [
      { content_code: "factual_checklist", count: 5, suppressed: false },
    ],
    qualified_trials_by_content: [
      { content_code: "factual_checklist", count: 5, suppressed: false },
    ],
  },
  activation: {
    mapped_meaningfully_activated_trial_accounts: 5,
    meaningful_activation_rate_percent: 100,
    mapped_first_timeline_trial_accounts: 5,
    mapped_first_report_trial_accounts: 0,
    first_report_rate_percent: 0,
    median_minutes_from_trial_start_to_first_record: 5,
    activated_trials_by_source: [
      { source: "checklist", count: 5, suppressed: false },
    ],
    activated_trials_by_content: [
      { content_code: "factual_checklist", count: 5, suppressed: false },
    ],
  },
  engagement: {
    mapped_feedback_prompt_trial_accounts: 5,
    mapped_feedback_opt_in_trial_accounts: 1,
    feedback_opt_in_rate_percent: 20,
    mapped_customer_value_prompt_trial_accounts: 5,
    customer_value_prompt_rate_percent: 100,
  },
  satisfaction: {
    campaign_trial_responses: 5,
    positive_campaign_trial_responses: 4,
    customer_value_satisfaction_among_respondents_percent: 80,
    responses_with_tracked_prompt: 5,
    response_coverage_percent: 100,
    response_measurement_ready: false,
  },
  conversion: {
    new_active_paid_subscribers: 1,
    monthly_subscribers: 1,
    annual_subscribers: 0,
    campaign_trial_active_paid_subscribers: 1,
    mapped_subscription_start_event_accounts: 1,
    mapped_cancellation_event_accounts: 0,
    mapped_refund_request_event_accounts: 0,
    paid_target: 100,
    paid_target_progress_percent: 1,
    campaign_trial_to_active_paid_percent: 20,
    active_paid_campaign_trials_by_source: [
      { source: "checklist", count: null, suppressed: true },
    ],
    active_paid_campaign_trials_by_content: [
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
        qualified_trials_by_source: [
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
        qualified_trials_by_content: [
          { content_code: "factual_checklist", count: 4, suppressed: true },
        ],
      },
    })
  );
});

test("rejects linked groups when mapping is incomplete", () => {
  assert.throws(() =>
    validateGrowthScorecard({
      ...validReport,
      acquisition: {
        ...validReport.acquisition,
        mapped_qualified_trials: 4,
        unmapped_qualified_trials: 1,
        trial_mapping_coverage_percent: 80,
        source_conclusions_available: false,
      },
    })
  );

  const unavailableReport = {
    ...validReport,
    acquisition: {
      ...validReport.acquisition,
      mapped_qualified_trials: 4,
      unmapped_qualified_trials: 1,
      trial_mapping_coverage_percent: 80,
      source_conclusions_available: false,
      qualified_trials_by_source: [],
      qualified_trials_by_content: [],
    },
    activation: {
      ...validReport.activation,
      meaningful_activation_rate_percent: null,
      first_report_rate_percent: null,
      median_minutes_from_trial_start_to_first_record: null,
      activated_trials_by_source: [],
      activated_trials_by_content: [],
    },
    engagement: {
      ...validReport.engagement,
      feedback_opt_in_rate_percent: null,
      customer_value_prompt_rate_percent: null,
    },
    satisfaction: {
      ...validReport.satisfaction,
      response_coverage_percent: null,
      response_measurement_ready: false,
    },
    conversion: {
      ...validReport.conversion,
      active_paid_campaign_trials_by_source: [],
      active_paid_campaign_trials_by_content: [],
    },
  };
  assert.deepEqual(validateGrowthScorecard(unavailableReport), unavailableReport);
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
