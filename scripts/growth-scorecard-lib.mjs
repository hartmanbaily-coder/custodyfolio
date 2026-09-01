const paidStatuses = new Set(["active"]);
const minimumReportableSourceCount = 5;

function validDate(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : null;
}

function inWindow(value, fromTime, toTime) {
  const time = validDate(value);
  return time !== null && time >= fromTime && time <= toTime;
}

function percentage(numerator, denominator) {
  return denominator > 0
    ? Number(((numerator / denominator) * 100).toFixed(1))
    : 0;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(1))
    : Number(sorted[middle].toFixed(1));
}

function eventCohorts(events, eventName) {
  return new Set(
    events
      .filter((event) => event.event_name === eventName)
      .map((event) => event.cohort_identifier)
      .filter(Boolean)
  );
}

function intersection(...sets) {
  if (sets.length === 0) return new Set();
  return new Set([...sets[0]].filter((value) => sets.every((set) => set.has(value))));
}

function union(...sets) {
  return new Set(sets.flatMap((set) => [...set]));
}

function firstEventTimeByCohort(events, eventName) {
  const result = new Map();
  for (const event of events) {
    if (event.event_name !== eventName || !event.cohort_identifier) continue;
    const time = validDate(event.occurred_at);
    if (time === null) continue;
    const current = result.get(event.cohort_identifier);
    if (current === undefined || time < current) {
      result.set(event.cohort_identifier, time);
    }
  }
  return result;
}

function sourceForCohort(events) {
  const sorted = [...events].sort(
    (left, right) => (validDate(left.occurred_at) || 0) - (validDate(right.occurred_at) || 0)
  );
  const result = new Map();
  for (const event of sorted) {
    if (!event.cohort_identifier || result.has(event.cohort_identifier)) continue;
    if (event.source) result.set(event.cohort_identifier, event.source);
  }
  return result;
}

function suppressedSourceBreakdown(cohorts, sourceByCohort) {
  const counts = new Map();
  for (const cohort of cohorts) {
    const source = sourceByCohort.get(cohort) || "unattributed";
    counts.set(source, (counts.get(source) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([source, count]) => ({
      source,
      count: count >= minimumReportableSourceCount ? count : null,
      suppressed: count < minimumReportableSourceCount,
    }));
}

export function summarizeGrowth(input) {
  const fromTime = validDate(input.from);
  const toTime = validDate(input.to);
  if (fromTime === null || toTime === null || fromTime > toTime) {
    throw new Error("Growth window is invalid.");
  }

  const excludedUserIds = new Set(input.excludedUserIds || []);
  const excludedCohorts = new Set(input.excludedCohortIdentifiers || []);
  const accountUsers = new Map(
    input.accounts
      .filter((row) => row?.user_id && !excludedUserIds.has(row.user_id))
      .map((row) => [row.id, row.user_id])
  );
  const cohortByBillingAccount = new Map(
    (input.accountCohorts || [])
      .filter((row) => row?.billing_account_id && row?.cohort_identifier)
      .map((row) => [row.billing_account_id, row.cohort_identifier])
  );
  const events = (input.growthEvents || []).filter(
    (event) =>
      event?.cohort_identifier &&
      !excludedCohorts.has(event.cohort_identifier) &&
      inWindow(event.occurred_at, fromTime, toTime)
  );
  const sourceByCohort = sourceForCohort(events);

  const windowTrials = input.trials.filter((trial) => {
    const userId = accountUsers.get(trial.billing_account_id);
    return userId && inWindow(trial.started_at, fromTime, toTime);
  });
  const trialCohorts = new Set(
    windowTrials
      .map((trial) => cohortByBillingAccount.get(trial.billing_account_id))
      .filter(Boolean)
  );

  const pageViewCohorts = eventCohorts(events, "marketing_page_viewed");
  const signupSelectedCohorts = eventCohorts(events, "marketing_signup_selected");
  const signupConfirmedCohorts = eventCohorts(events, "account_signup_confirmed");
  const matterCohorts = eventCohorts(events, "customer_first_matter_created");
  const recordCohorts = eventCohorts(events, "customer_first_record_saved");
  const timelineCohorts = eventCohorts(events, "customer_first_timeline_viewed");
  const reportCohorts = eventCohorts(events, "customer_first_report_created");
  const feedbackPromptCohorts = eventCohorts(events, "customer_feedback_prompt_viewed");
  const feedbackOptInCohorts = eventCohorts(events, "customer_feedback_opted_in");
  const cancelledCohorts = eventCohorts(events, "customer_subscription_cancelled");
  const refundCohorts = eventCohorts(events, "customer_refund_requested");
  const activatedCohorts = intersection(
    matterCohorts,
    recordCohorts,
    union(timelineCohorts, reportCohorts)
  );
  const eligibleActivatedCohorts = trialCohorts.size
    ? intersection(activatedCohorts, trialCohorts)
    : activatedCohorts;

  const signupTimes = firstEventTimeByCohort(events, "account_signup_confirmed");
  const firstRecordTimes = firstEventTimeByCohort(events, "customer_first_record_saved");
  const timeToFirstRecordMinutes = [];
  for (const [cohort, signupTime] of signupTimes.entries()) {
    const recordTime = firstRecordTimes.get(cohort);
    if (recordTime !== undefined && recordTime >= signupTime) {
      timeToFirstRecordMinutes.push((recordTime - signupTime) / 60_000);
    }
  }

  const windowSubscriptions = input.subscriptions.filter((subscription) => {
    const userId = accountUsers.get(subscription.billing_account_id);
    return (
      userId &&
      subscription.environment === "live" &&
      paidStatuses.has(subscription.status) &&
      inWindow(subscription.created_at, fromTime, toTime)
    );
  });
  const paidAccountIds = new Set(
    windowSubscriptions.map((subscription) => subscription.billing_account_id)
  );
  const paidCohorts = new Set(
    [...paidAccountIds]
      .map((billingAccountId) => cohortByBillingAccount.get(billingAccountId))
      .filter(Boolean)
  );
  const monthlyPaid = new Set(
    windowSubscriptions
      .filter((subscription) => subscription.plan_interval === "month")
      .map((subscription) => subscription.billing_account_id)
  ).size;
  const annualPaid = new Set(
    windowSubscriptions
      .filter((subscription) => subscription.plan_interval === "year")
      .map((subscription) => subscription.billing_account_id)
  ).size;

  const satisfactionRows = (input.satisfactionResponses || []).filter((row) =>
    inWindow(row.responded_at, fromTime, toTime)
  );
  const positiveSatisfaction = satisfactionRows.filter(
    (row) => Number(row.score) >= 4
  ).length;

  return {
    window: {
      from: new Date(fromTime).toISOString(),
      to: new Date(toTime).toISOString(),
    },
    acquisition: {
      qualified_visits: pageViewCohorts.size,
      signup_selections: signupSelectedCohorts.size,
      completed_signups: signupConfirmedCohorts.size,
      qualified_trials: windowTrials.length,
      target_trials: 500,
      trial_target_progress_percent: percentage(windowTrials.length, 500),
      visit_to_signup_percent: percentage(signupConfirmedCohorts.size, pageViewCohorts.size),
      visits_by_source: suppressedSourceBreakdown(pageViewCohorts, sourceByCohort),
      signups_by_source: suppressedSourceBreakdown(signupConfirmedCohorts, sourceByCohort),
    },
    activation: {
      meaningfully_activated_accounts: eligibleActivatedCohorts.size,
      meaningful_activation_rate_percent: percentage(
        eligibleActivatedCohorts.size,
        windowTrials.length
      ),
      first_timeline_accounts: timelineCohorts.size,
      first_report_accounts: reportCohorts.size,
      first_report_rate_percent: percentage(reportCohorts.size, windowTrials.length),
      median_minutes_to_first_record: median(timeToFirstRecordMinutes),
    },
    engagement: {
      feedback_prompt_accounts: feedbackPromptCohorts.size,
      feedback_opt_in_accounts: feedbackOptInCohorts.size,
      feedback_opt_in_rate_percent: percentage(
        feedbackOptInCohorts.size,
        feedbackPromptCohorts.size
      ),
    },
    satisfaction: {
      responses: satisfactionRows.length,
      positive_responses: positiveSatisfaction,
      customer_value_satisfaction_percent: percentage(
        positiveSatisfaction,
        satisfactionRows.length
      ),
    },
    conversion: {
      paid_subscribers: paidAccountIds.size,
      monthly_subscribers: monthlyPaid,
      annual_subscribers: annualPaid,
      cancellations: cancelledCohorts.size,
      refund_requests: refundCohorts.size,
      paid_target: 100,
      paid_target_progress_percent: percentage(paidAccountIds.size, 100),
      eligible_trial_to_paid_percent: percentage(
        windowTrials.filter((trial) =>
          paidAccountIds.has(trial.billing_account_id)
        ).length,
        windowTrials.length
      ),
      paid_by_source: suppressedSourceBreakdown(paidCohorts, sourceByCohort),
    },
  };
}
