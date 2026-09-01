import test from "node:test";
import assert from "node:assert/strict";
import { summarizeGrowth } from "./growth-scorecard-lib.mjs";

const day = 86_400_000;
const start = Date.parse("2026-08-30T00:00:00.000Z");
const atDay = (number) => new Date(start + number * day).toISOString();

function event(eventName, cohortIdentifier, dayNumber, extra = {}) {
  return {
    event_name: eventName,
    cohort_identifier: cohortIdentifier,
    occurred_at: atDay(dayNumber),
    ...extra,
  };
}

test("summarizes private events, satisfaction, and authoritative paid conversion", () => {
  const report = summarizeGrowth({
    from: atDay(0),
    to: atDay(30),
    excludedUserIds: [],
    excludedCohortIdentifiers: [],
    accounts: [
      { id: "account1", user_id: "user1" },
      { id: "account2", user_id: "user2" },
    ],
    accountCohorts: [
      { billing_account_id: "account1", cohort_identifier: "cohort1" },
      { billing_account_id: "account2", cohort_identifier: "cohort2" },
    ],
    trials: [
      { billing_account_id: "account1", started_at: atDay(0), ends_at: atDay(30) },
      { billing_account_id: "account2", started_at: atDay(1), ends_at: atDay(30) },
    ],
    subscriptions: [
      {
        billing_account_id: "account1",
        environment: "live",
        status: "active",
        plan_interval: "year",
        created_at: atDay(30),
      },
    ],
    growthEvents: [
      event("marketing_page_viewed", "visitor1", 0, { source: "direct" }),
      event("marketing_signup_selected", "visitor1", 0, { source: "direct" }),
      event("account_signup_confirmed", "cohort1", 0),
      event("account_signup_confirmed", "cohort2", 1),
      event("customer_first_matter_created", "cohort1", 1),
      event("customer_first_record_saved", "cohort1", 1),
      event("customer_first_timeline_viewed", "cohort1", 2),
      event("customer_first_report_created", "cohort1", 4),
      event("customer_feedback_prompt_viewed", "cohort1", 5),
      event("customer_feedback_prompt_viewed", "cohort2", 5),
      event("customer_feedback_opted_in", "cohort1", 5),
    ],
    satisfactionResponses: [
      { responded_at: atDay(7), score: 5 },
      { responded_at: atDay(8), score: 3 },
    ],
  });

  assert.equal(report.acquisition.qualified_visits, 1);
  assert.equal(report.acquisition.completed_signups, 2);
  assert.equal(report.acquisition.qualified_trials, 2);
  assert.equal(report.activation.meaningfully_activated_accounts, 1);
  assert.equal(report.activation.meaningful_activation_rate_percent, 50);
  assert.equal(report.activation.first_report_accounts, 1);
  assert.equal(report.activation.median_minutes_to_first_record, 1440);
  assert.equal(report.engagement.feedback_opt_in_accounts, 1);
  assert.equal(report.satisfaction.customer_value_satisfaction_percent, 50);
  assert.equal(report.conversion.paid_subscribers, 1);
  assert.equal(report.conversion.annual_subscribers, 1);
});

test("excludes review cohorts, ignores test subscriptions, and suppresses small sources", () => {
  const report = summarizeGrowth({
    from: atDay(0),
    to: atDay(30),
    excludedUserIds: ["reviewUser"],
    excludedCohortIdentifiers: ["reviewCohort"],
    accounts: [
      { id: "reviewAccount", user_id: "reviewUser" },
      { id: "testAccount", user_id: "testUser" },
    ],
    accountCohorts: [
      { billing_account_id: "reviewAccount", cohort_identifier: "reviewCohort" },
      { billing_account_id: "testAccount", cohort_identifier: "testCohort" },
    ],
    trials: [
      { billing_account_id: "reviewAccount", started_at: atDay(1), ends_at: atDay(30) },
      { billing_account_id: "testAccount", started_at: atDay(1), ends_at: atDay(30) },
    ],
    subscriptions: [
      {
        billing_account_id: "testAccount",
        environment: "test",
        status: "active",
        plan_interval: "month",
        created_at: atDay(2),
      },
    ],
    growthEvents: [
      event("marketing_page_viewed", "reviewCohort", 1, { source: "direct" }),
      event("marketing_page_viewed", "communityVisitor", 1, { source: "community" }),
    ],
    satisfactionResponses: [],
  });

  assert.equal(report.acquisition.qualified_trials, 1);
  assert.equal(report.acquisition.qualified_visits, 1);
  assert.equal(report.acquisition.visits_by_source[0].count, null);
  assert.equal(report.acquisition.visits_by_source[0].suppressed, true);
  assert.equal(report.conversion.paid_subscribers, 0);
});

test("reports privacy safe content performance through paid conversion", () => {
  const cohortIdentifiers = ["cohort1", "cohort2", "cohort3", "cohort4", "cohort5"];
  const accounts = cohortIdentifiers.map((_, index) => ({
    id: `account${index + 1}`,
    user_id: `user${index + 1}`,
  }));
  const accountCohorts = cohortIdentifiers.map((cohortIdentifier, index) => ({
    billing_account_id: `account${index + 1}`,
    cohort_identifier: cohortIdentifier,
  }));
  const trials = cohortIdentifiers.map((_, index) => ({
    billing_account_id: `account${index + 1}`,
    started_at: atDay(1),
    ends_at: atDay(30),
  }));
  const subscriptions = cohortIdentifiers.map((_, index) => ({
    billing_account_id: `account${index + 1}`,
    environment: "live",
    status: "active",
    plan_interval: "month",
    created_at: atDay(20),
  }));
  const growthEvents = cohortIdentifiers.flatMap((cohortIdentifier) => [
    event("marketing_page_viewed", cohortIdentifier, 0, {
      source: "checklist",
      content_code: "factual_checklist",
    }),
    event("account_signup_confirmed", cohortIdentifier, 1, {
      source: "checklist",
      content_code: "factual_checklist",
    }),
    event("customer_first_matter_created", cohortIdentifier, 2, {
      source: "checklist",
      content_code: "factual_checklist",
    }),
    event("customer_first_record_saved", cohortIdentifier, 2, {
      source: "checklist",
      content_code: "factual_checklist",
    }),
    event("customer_first_timeline_viewed", cohortIdentifier, 3, {
      source: "checklist",
      content_code: "factual_checklist",
    }),
  ]);

  const report = summarizeGrowth({
    from: atDay(0),
    to: atDay(30),
    excludedUserIds: [],
    excludedCohortIdentifiers: [],
    accounts,
    accountCohorts,
    trials,
    subscriptions,
    growthEvents,
    satisfactionResponses: [],
  });

  const expected = [
    {
      content_code: "factual_checklist",
      count: 5,
      suppressed: false,
    },
  ];
  assert.deepEqual(report.acquisition.visits_by_content, expected);
  assert.deepEqual(report.acquisition.signups_by_content, expected);
  assert.deepEqual(report.acquisition.trials_by_content, expected);
  assert.deepEqual(report.activation.activated_by_content, expected);
  assert.deepEqual(report.conversion.paid_by_content, expected);
});
