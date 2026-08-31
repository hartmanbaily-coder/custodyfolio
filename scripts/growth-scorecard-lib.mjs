const paidStatuses = new Set(["active"]);

const recordCollections = [
  "custodyDayAssignments",
  "exchangeLogs",
  "dateNotes",
  "evidenceItems",
  "childSupportOrders",
  "childSupportPayments",
  "expenseItems",
];

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

function userActivity(dataset) {
  const records = [];
  for (const collection of recordCollections) {
    const rows = Array.isArray(dataset?.[collection]) ? dataset[collection] : [];
    for (const row of rows) {
      records.push({
        id: String(row?.id || ""),
        createdAt: row?.createdAt,
        updatedAt: row?.updatedAt,
      });
    }
  }

  const exports = (Array.isArray(dataset?.auditLogs) ? dataset.auditLogs : [])
    .filter((row) => row?.action === "exported")
    .map((row) => row?.timestamp)
    .filter(Boolean);

  return { records, exports };
}

function activityBins(activity, startTime) {
  const bins = new Set();
  const activityTimes = [
    ...activity.records.flatMap((row) => [row.createdAt, row.updatedAt]),
    ...activity.exports,
  ];

  for (const value of activityTimes) {
    const time = validDate(value);
    if (time === null) continue;
    const day = Math.floor((time - startTime) / 86_400_000);
    if (day >= 8 && day <= 28) bins.add(Math.floor((day - 8) / 7));
  }
  return bins;
}

function earliestRecordTime(activity, startTime, endTime) {
  const times = activity.records
    .map((row) => validDate(row.createdAt))
    .filter((time) => time !== null && time >= startTime && time <= endTime)
    .sort((a, b) => a - b);
  return times[0] ?? null;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(1))
    : Number(sorted[middle].toFixed(1));
}

export function summarizeGrowth(input) {
  const fromTime = validDate(input.from);
  const toTime = validDate(input.to);
  if (fromTime === null || toTime === null || fromTime > toTime) {
    throw new Error("Growth window is invalid.");
  }

  const excluded = new Set(input.excludedUserIds || []);
  const accountUsers = new Map(
    input.accounts
      .filter((row) => row?.user_id && !excluded.has(row.user_id))
      .map((row) => [row.id, row.user_id])
  );
  const snapshotByUser = new Map(
    input.snapshots
      .filter((row) => row?.user_id && !excluded.has(row.user_id))
      .map((row) => [row.user_id, row.dataset || {}])
  );

  const windowTrials = input.trials.filter((trial) => {
    const userId = accountUsers.get(trial.billing_account_id);
    return userId && inWindow(trial.started_at, fromTime, toTime);
  });

  let activated = 0;
  let firstReport = 0;
  let repeatValue = 0;
  const timeToFirstRecordMinutes = [];

  for (const trial of windowTrials) {
    const userId = accountUsers.get(trial.billing_account_id);
    const startTime = validDate(trial.started_at);
    if (!userId || startTime === null) continue;
    const sevenDayEnd = startTime + 7 * 86_400_000;
    const activity = userActivity(snapshotByUser.get(userId) || {});
    const recordsInSevenDays = activity.records.filter((row) =>
      inWindow(row.createdAt, startTime, sevenDayEnd)
    ).length;
    const exportedInSevenDays = activity.exports.some((value) =>
      inWindow(value, startTime, sevenDayEnd)
    );
    const meaningfulActivation =
      recordsInSevenDays >= 3 ||
      (recordsInSevenDays >= 2 && exportedInSevenDays);

    if (meaningfulActivation) activated += 1;
    if (exportedInSevenDays) firstReport += 1;
    if (activityBins(activity, startTime).size >= 2) repeatValue += 1;

    const firstRecordTime = earliestRecordTime(activity, startTime, sevenDayEnd);
    if (firstRecordTime !== null) {
      timeToFirstRecordMinutes.push((firstRecordTime - startTime) / 60_000);
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
      qualified_trials: windowTrials.length,
      target_trials: 500,
      trial_target_progress_percent: percentage(windowTrials.length, 500),
    },
    activation: {
      meaningfully_activated_accounts: activated,
      meaningful_activation_rate_percent: percentage(activated, windowTrials.length),
      first_report_accounts: firstReport,
      first_report_rate_percent: percentage(firstReport, windowTrials.length),
      median_minutes_to_first_record: median(timeToFirstRecordMinutes),
    },
    engagement: {
      repeat_value_accounts: repeatValue,
      repeat_value_rate_percent: percentage(repeatValue, activated),
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
      paid_target: 100,
      paid_target_progress_percent: percentage(paidAccountIds.size, 100),
      eligible_trial_to_paid_percent: percentage(
        windowTrials.filter((trial) =>
          paidAccountIds.has(trial.billing_account_id)
        ).length,
        windowTrials.length
      ),
    },
  };
}
