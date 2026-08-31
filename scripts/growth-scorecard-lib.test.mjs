import test from "node:test";
import assert from "node:assert/strict";
import { summarizeGrowth } from "./growth-scorecard-lib.mjs";

const day = 86_400_000;
const start = Date.parse("2026-08-30T00:00:00.000Z");
const atDay = (number) => new Date(start + number * day).toISOString();

test("summarizes activation, engagement, satisfaction, and paid conversion", () => {
  const report = summarizeGrowth({
    from: atDay(0),
    to: atDay(30),
    excludedUserIds: [],
    accounts: [
      { id: "account1", user_id: "user1" },
      { id: "account2", user_id: "user2" },
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
    snapshots: [
      {
        user_id: "user1",
        dataset: {
          dateNotes: [
            { id: "note1", createdAt: atDay(1), updatedAt: atDay(1) },
            { id: "note2", createdAt: atDay(2), updatedAt: atDay(10) },
            { id: "note3", createdAt: atDay(3), updatedAt: atDay(18) },
          ],
          auditLogs: [
            { action: "exported", timestamp: atDay(4) },
          ],
        },
      },
      {
        user_id: "user2",
        dataset: {
          dateNotes: [
            { id: "note4", createdAt: atDay(3), updatedAt: atDay(3) },
          ],
          auditLogs: [],
        },
      },
    ],
    satisfactionResponses: [
      { responded_at: atDay(7), score: 5 },
      { responded_at: atDay(8), score: 3 },
    ],
  });

  assert.equal(report.acquisition.qualified_trials, 2);
  assert.equal(report.activation.meaningfully_activated_accounts, 1);
  assert.equal(report.activation.meaningful_activation_rate_percent, 50);
  assert.equal(report.activation.first_report_accounts, 1);
  assert.equal(report.engagement.repeat_value_accounts, 1);
  assert.equal(report.satisfaction.customer_value_satisfaction_percent, 50);
  assert.equal(report.conversion.paid_subscribers, 1);
  assert.equal(report.conversion.annual_subscribers, 1);
});

test("excludes listed account owners and nonlive subscriptions", () => {
  const report = summarizeGrowth({
    from: atDay(0),
    to: atDay(30),
    excludedUserIds: ["reviewUser"],
    accounts: [
      { id: "reviewAccount", user_id: "reviewUser" },
      { id: "testAccount", user_id: "testUser" },
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
    snapshots: [],
    satisfactionResponses: [],
  });

  assert.equal(report.acquisition.qualified_trials, 1);
  assert.equal(report.conversion.paid_subscribers, 0);
});
