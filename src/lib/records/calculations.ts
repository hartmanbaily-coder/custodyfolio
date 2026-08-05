import type {
  CalendarEvent,
  ChildSupportOrder,
  ChildSupportPayment,
  CustodyDayAssignment,
  CustodyExchangeRule,
  DateNote,
  DateRange,
  EvidenceItem,
  ExchangeLateParty,
  ExchangeLog,
  ExchangeParty,
  ExchangeScheduledTimeSource,
  ExpenseItem,
  ExpectedExchangeEvent,
  PaymentStatus,
  RecordsDataset,
} from "./types";
import { evidenceFileName } from "./validation";

export const generatedReportForbiddenTerms = [
  "violation",
  "contempt",
  "proof",
  "abuse",
  "illegal",
  "noncompliance",
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function toUtcDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  const next = toUtcDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return toDateString(next);
}

export function combineDateTime(date: string, time: string) {
  return `${date}T${time}:00.000Z`;
}

export function timeOfDayPositionPercent(time?: string | null) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time || "");
  if (!match) return null;

  const minutesSinceMidnight = Number(match[1]) * 60 + Number(match[2]);
  return (minutesSinceMidnight / (24 * 60)) * 100;
}

export function minutesBetween(orderedAt: string, actualAt?: string | null) {
  if (!actualAt) return null;
  return Math.round((new Date(actualAt).getTime() - new Date(orderedAt).getTime()) / 60_000);
}

export function daysBetween(from: string, to?: string) {
  if (!to) return null;
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / MS_PER_DAY);
}

export function isWithinDateRange(date: string, range: DateRange) {
  return date >= range.from && date <= range.to;
}

export function getIsoDateFromDateTime(value: string) {
  return value.slice(0, 10);
}

export function getMonthKey(date: string) {
  return date.slice(0, 7);
}

export function formatMoney(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function assertOwnedRecord(
  record: { userId: string; caseId?: string },
  userId: string,
  caseId?: string
) {
  if (record.userId !== userId) {
    throw new Error("Record is not owned by the authenticated user.");
  }

  if (caseId && record.caseId && record.caseId !== caseId) {
    throw new Error("Record does not belong to the selected custody matter.");
  }

  return record;
}

export function filterOwnedCaseRecords<T extends { userId: string; caseId: string }>(
  records: T[],
  userId: string,
  caseId: string
) {
  return records.filter((record) => record.userId === userId && record.caseId === caseId);
}

export function buildCustodyDayMap(assignments: CustodyDayAssignment[], range: DateRange) {
  const map = new Map<string, CustodyDayAssignment>();
  for (const assignment of assignments) {
    if (isWithinDateRange(assignment.date, range)) {
      map.set(assignment.date, assignment);
    }
  }
  return map;
}

export function generateExpectedExchangeEvents(
  rules: CustodyExchangeRule[],
  range: DateRange
): ExpectedExchangeEvent[] {
  const events: ExpectedExchangeEvent[] = [];

  for (const rule of rules) {
    let cursor = range.from > rule.effectiveStartDate ? range.from : rule.effectiveStartDate;
    const ruleEnd = rule.effectiveEndDate && rule.effectiveEndDate < range.to ? rule.effectiveEndDate : range.to;

    while (cursor <= ruleEnd) {
      const day = toUtcDate(cursor).getUTCDay();
      if (day === rule.dayOfWeek) {
        events.push({
          id: `expected-${rule.id}-${cursor}`,
          caseId: rule.caseId,
          userId: rule.userId,
          custodyExchangeRuleId: rule.id,
          orderedExchangeAt: combineDateTime(cursor, rule.orderedExchangeTime),
          direction: rule.direction,
          location: rule.location,
          ruleName: rule.ruleName,
        });
      }
      cursor = addDays(cursor, 1);
    }
  }

  return events.sort((a, b) => a.orderedExchangeAt.localeCompare(b.orderedExchangeAt));
}

export function calculateExchangeTiming(log: ExchangeLog) {
  const minutesEarlyOrLate = minutesBetween(log.orderedExchangeAt, log.actualExchangeAt);
  return {
    minutesEarlyOrLate,
    isLate: log.status === "completed_late" || (minutesEarlyOrLate ?? 0) > 0,
    isMissed: log.status === "missed",
    isEarly: log.status === "completed_early" || (minutesEarlyOrLate ?? 0) < 0,
  };
}

export function getExchangeArrivingParty(log: ExchangeLog): ExchangeParty {
  return log.arrivingParty || (log.direction === "other_parent_to_me" ? "other_parent" : "me");
}

export function getExchangeLateParty(log: ExchangeLog): ExchangeLateParty {
  if (log.lateParty) return log.lateParty;
  return calculateExchangeTiming(log).isLate ? getExchangeArrivingParty(log) : "not_applicable";
}

export function labelExchangeParty(
  party: ExchangeLateParty,
  userRoleLabel = "Me",
  otherParentLabel = "Other parent"
) {
  if (party === "me") return userRoleLabel;
  if (party === "other_parent") return otherParentLabel;
  if (party === "third_party") return "Third party";
  if (party === "both") return `${userRoleLabel} and ${otherParentLabel}`;
  if (party === "not_applicable") return "Not applicable";
  return "Not recorded";
}

export function labelExchangeDirectionWithParties(
  direction: ExchangeLog["direction"],
  userRoleLabel = "Me",
  otherParentLabel = "Other parent"
) {
  return direction === "other_parent_to_me"
    ? `${otherParentLabel} to ${userRoleLabel}`
    : `${userRoleLabel} to ${otherParentLabel}`;
}

export function labelExchangeScheduledTimeSource(source: ExchangeScheduledTimeSource | undefined) {
  if (source === "court_order") return "Court order";
  if (source === "parenting_plan") return "Parenting plan";
  if (source === "written_agreement") return "Written agreement";
  if (source === "verbal_agreement") return "Verbal agreement";
  if (source === "other") return "Other recorded source";
  return "Not recorded";
}

export function calculateExchangeStats(
  exchangeLogs: ExchangeLog[],
  expectedEvents: ExpectedExchangeEvent[],
  range: DateRange
) {
  const logs = exchangeLogs.filter((log) =>
    isWithinDateRange(getIsoDateFromDateTime(log.orderedExchangeAt), range)
  );
  const scheduled = expectedEvents.filter((event) =>
    isWithinDateRange(getIsoDateFromDateTime(event.orderedExchangeAt), range)
  );
  const lateDurations = logs
    .map(calculateExchangeTiming)
    .filter((timing) => timing.isLate && timing.minutesEarlyOrLate !== null)
    .map((timing) => Math.max(0, timing.minutesEarlyOrLate || 0));

  const lateCount = logs.filter((log) => calculateExchangeTiming(log).isLate).length;
  const missedCount = logs.filter((log) => log.status === "missed").length;
  const refusedCount = logs.filter((log) => log.status === "refused").length;
  const completedOnTimeCount = logs.filter((log) => log.status === "completed_on_time").length;
  const completedEarlyCount = logs.filter((log) => log.status === "completed_early").length;
  const completedLateCount = logs.filter((log) => log.status === "completed_late").length;
  const completedCount = completedOnTimeCount + completedEarlyCount + completedLateCount;
  const scheduledCount = Math.max(scheduled.length, logs.length);

  return {
    scheduledCount,
    loggedCount: logs.length,
    completedCount,
    completedOnTimeCount,
    completedEarlyCount,
    lateCount,
    missedCount,
    refusedCount,
    averageLatenessMinutes:
      lateDurations.length > 0
        ? Math.round(lateDurations.reduce((sum, value) => sum + value, 0) / lateDurations.length)
        : 0,
    longestLatenessMinutes: lateDurations.length > 0 ? Math.max(...lateDurations) : 0,
    comparisonPercentage:
      scheduledCount > 0 ? Math.round((completedCount / scheduledCount) * 100) : 0,
  };
}

export function exchangeChartRows(logs: ExchangeLog[], range: DateRange) {
  return logs
    .filter((log) => isWithinDateRange(getIsoDateFromDateTime(log.orderedExchangeAt), range))
    .map((log) => {
      const timing = calculateExchangeTiming(log);
      return {
        date: getIsoDateFromDateTime(log.orderedExchangeAt),
        orderedMinute: new Date(log.orderedExchangeAt).getUTCHours() * 60 + new Date(log.orderedExchangeAt).getUTCMinutes(),
        actualMinute: log.actualExchangeAt
          ? new Date(log.actualExchangeAt).getUTCHours() * 60 + new Date(log.actualExchangeAt).getUTCMinutes()
          : null,
        minutesEarlyOrLate: timing.minutesEarlyOrLate,
        status: log.status,
      };
    });
}

export function calculateChildSupportStats(payments: ChildSupportPayment[], range: DateRange) {
  const rows = payments.filter((payment) => isWithinDateRange(payment.dueDate, range));
  const totalDue = rows.reduce((sum, payment) => sum + payment.amountDue, 0);
  const totalPaid = rows.reduce((sum, payment) => sum + payment.amountPaid, 0);
  const lateDays = rows
    .map((payment) => daysBetween(payment.dueDate, payment.paymentDate))
    .filter((value): value is number => value !== null && value > 0);

  return {
    paymentCount: rows.length,
    totalDue,
    totalPaid,
    unpaidBalance: rows.reduce(
      (sum, payment) => sum + Math.max(payment.amountDue - payment.amountPaid, 0),
      0
    ),
    unpaidCount: rows.filter((payment) => payment.paymentStatus === "unpaid").length,
    partialCount: rows.filter((payment) => payment.paymentStatus === "partial").length,
    lateCount: rows.filter(
      (payment) =>
        payment.paymentStatus === "late" ||
        ((daysBetween(payment.dueDate, payment.paymentDate) ?? 0) > 0 &&
          payment.paymentStatus === "paid")
    ).length,
    averageDaysLate:
      lateDays.length > 0
        ? Math.round(lateDays.reduce((sum, value) => sum + value, 0) / lateDays.length)
        : 0,
  };
}

export type ChildSupportObligationStatus =
  | PaymentStatus
  | "due"
  | "upcoming";

export interface ChildSupportObligation {
  id: string;
  childSupportOrderId: string;
  orderNickname: string;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  balance: number;
  currency: string;
  paymentDate?: string;
  status: ChildSupportObligationStatus;
  source: "order_schedule" | "manual_record";
  paymentRecordIds: string[];
}

function addMonthsFromAnchor(anchor: string, monthOffset: number) {
  const anchorDate = toUtcDate(anchor);
  const year = anchorDate.getUTCFullYear();
  const month = anchorDate.getUTCMonth() + monthOffset;
  const day = anchorDate.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return toDateString(new Date(Date.UTC(year, month, Math.min(day, lastDay))));
}

function scheduledSupportDueDates(order: ChildSupportOrder, range: DateRange) {
  if (order.paymentFrequency === "custom" || !order.firstPaymentDueDate) return [];

  const scheduleEnd = order.effectiveEndDate
    ? order.effectiveEndDate < range.to
      ? order.effectiveEndDate
      : range.to
    : range.to;
  if (scheduleEnd < order.effectiveStartDate) return [];

  const dates = new Set<string>();
  const addIfIncluded = (date: string) => {
    if (
      date >= order.effectiveStartDate &&
      date <= scheduleEnd &&
      isWithinDateRange(date, range)
    ) {
      dates.add(date);
    }
  };

  if (order.paymentFrequency === "weekly" || order.paymentFrequency === "biweekly") {
    const interval = order.paymentFrequency === "weekly" ? 7 : 14;
    let dueDate = order.firstPaymentDueDate;
    let iterations = 0;
    while (dueDate <= scheduleEnd && iterations < 10_000) {
      addIfIncluded(dueDate);
      dueDate = addDays(dueDate, interval);
      iterations += 1;
    }
  } else {
    const anchors = [
      order.firstPaymentDueDate,
      order.paymentFrequency === "semi_monthly" ? order.secondPaymentDueDate : undefined,
    ].filter((date): date is string => Boolean(date));
    for (const anchor of anchors) {
      let monthOffset = 0;
      let dueDate = anchor;
      while (dueDate <= scheduleEnd && monthOffset < 1_200) {
        addIfIncluded(dueDate);
        monthOffset += 1;
        dueDate = addMonthsFromAnchor(anchor, monthOffset);
      }
    }
  }

  return Array.from(dates).sort();
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function obligationFromPayments(input: {
  order: ChildSupportOrder;
  dueDate: string;
  payments: ChildSupportPayment[];
  asOfDate: string;
  source: ChildSupportObligation["source"];
}) {
  const amountDue =
    input.source === "order_schedule"
      ? input.order.orderedAmount
      : Math.max(...input.payments.map((payment) => payment.amountDue));
  const amountPaid = roundMoney(
    input.payments.reduce((sum, payment) => sum + payment.amountPaid, 0)
  );
  const paymentDates = input.payments
    .map((payment) => payment.paymentDate)
    .filter((date): date is string => Boolean(date))
    .sort();
  const paymentDate = paymentDates.at(-1);
  const recordedStatuses = new Set(input.payments.map((payment) => payment.paymentStatus));
  const waived = recordedStatuses.has("waived_by_agreement");

  let status: ChildSupportObligationStatus;
  if (waived) {
    status = "waived_by_agreement";
  } else if (recordedStatuses.has("disputed")) {
    status = "disputed";
  } else if (amountPaid >= amountDue) {
    status = paymentDate && paymentDate > input.dueDate ? "late" : "paid";
  } else if (amountPaid > 0) {
    status = "partial";
  } else if (input.dueDate > input.asOfDate) {
    status = "upcoming";
  } else if (input.dueDate === input.asOfDate) {
    status = "due";
  } else {
    status = "unpaid";
  }

  return {
    id: `support-obligation-${input.order.id}-${input.dueDate}`,
    childSupportOrderId: input.order.id,
    orderNickname: input.order.orderNickname,
    dueDate: input.dueDate,
    amountDue: roundMoney(amountDue),
    amountPaid,
    balance: waived ? 0 : roundMoney(Math.max(amountDue - amountPaid, 0)),
    currency: input.order.currency,
    paymentDate,
    status,
    source: input.source,
    paymentRecordIds: input.payments.map((payment) => payment.id),
  } satisfies ChildSupportObligation;
}

export function generateChildSupportObligations(
  orders: ChildSupportOrder[],
  payments: ChildSupportPayment[],
  range: DateRange,
  asOfDate = toDateString(new Date())
) {
  const obligations: ChildSupportObligation[] = [];
  const matchedPaymentIds = new Set<string>();

  for (const order of orders) {
    const orderPayments = payments.filter(
      (payment) => payment.childSupportOrderId === order.id
    );
    for (const dueDate of scheduledSupportDueDates(order, range)) {
      const matchingPayments = orderPayments.filter((payment) => payment.dueDate === dueDate);
      matchingPayments.forEach((payment) => matchedPaymentIds.add(payment.id));
      obligations.push(
        obligationFromPayments({
          order,
          dueDate,
          payments: matchingPayments,
          asOfDate,
          source: "order_schedule",
        })
      );
    }

    const unmatchedByDueDate = new Map<string, ChildSupportPayment[]>();
    for (const payment of orderPayments) {
      if (matchedPaymentIds.has(payment.id) || !isWithinDateRange(payment.dueDate, range)) {
        continue;
      }
      unmatchedByDueDate.set(payment.dueDate, [
        ...(unmatchedByDueDate.get(payment.dueDate) || []),
        payment,
      ]);
    }
    for (const [dueDate, matchingPayments] of unmatchedByDueDate) {
      obligations.push(
        obligationFromPayments({
          order,
          dueDate,
          payments: matchingPayments,
          asOfDate,
          source: "manual_record",
        })
      );
    }
  }

  return obligations.sort(
    (first, second) =>
      first.dueDate.localeCompare(second.dueDate) ||
      first.orderNickname.localeCompare(second.orderNickname)
  );
}

export function calculateChildSupportObligationStats(
  obligations: ChildSupportObligation[],
  asOfDate = toDateString(new Date())
) {
  const dueToDate = obligations.filter((obligation) => obligation.dueDate <= asOfDate);
  const pastDue = obligations.filter(
    (obligation) =>
      obligation.dueDate < asOfDate &&
      obligation.balance > 0 &&
      obligation.status !== "disputed"
  );
  const lateDays = dueToDate
    .map((obligation) => daysBetween(obligation.dueDate, obligation.paymentDate))
    .filter((value): value is number => value !== null && value > 0);

  return {
    paymentCount: dueToDate.length,
    totalDue: roundMoney(dueToDate.reduce((sum, obligation) => sum + obligation.amountDue, 0)),
    totalPaid: roundMoney(dueToDate.reduce((sum, obligation) => sum + obligation.amountPaid, 0)),
    unpaidBalance: roundMoney(
      dueToDate.reduce((sum, obligation) => sum + obligation.balance, 0)
    ),
    pastDueBalance: roundMoney(
      pastDue.reduce((sum, obligation) => sum + obligation.balance, 0)
    ),
    unpaidCount: pastDue.filter((obligation) => obligation.status === "unpaid").length,
    partialCount: dueToDate.filter((obligation) => obligation.status === "partial").length,
    lateCount: dueToDate.filter((obligation) => obligation.status === "late").length,
    pastDueCount: pastDue.length,
    upcomingCount: obligations.filter((obligation) => obligation.status === "upcoming").length,
    averageDaysLate:
      lateDays.length > 0
        ? Math.round(lateDays.reduce((sum, value) => sum + value, 0) / lateDays.length)
        : 0,
  };
}

export function childSupportHistoryRange(
  orders: ChildSupportOrder[],
  payments: ChildSupportPayment[],
  asOfDate = toDateString(new Date())
): DateRange {
  const dates = [
    asOfDate,
    ...orders.flatMap((order) =>
      [
        order.effectiveStartDate,
        order.firstPaymentDueDate,
        order.secondPaymentDueDate,
      ].filter((date): date is string => Boolean(date))
    ),
    ...payments.map((payment) => payment.dueDate),
  ].sort();

  return {
    from: dates[0] || asOfDate,
    to: dates.at(-1) || asOfDate,
  };
}

export function expenseHistoryRange(
  expenses: ExpenseItem[],
  asOfDate = toDateString(new Date())
): DateRange {
  const dates = [
    asOfDate,
    ...expenses
      .map((expense) => expense.expenseDate)
      .filter((date): date is string => Boolean(date)),
  ].sort();

  return {
    from: dates[0] || asOfDate,
    to: dates.at(-1) || asOfDate,
  };
}

export function childSupportObligationChartRows(
  obligations: ChildSupportObligation[],
  asOfDate = toDateString(new Date())
) {
  const monthly = new Map<
    string,
    { month: string; amountDue: number; amountPaid: number; unpaidBalance: number }
  >();
  for (const obligation of obligations.filter((item) => item.dueDate <= asOfDate)) {
    const month = getMonthKey(obligation.dueDate);
    const current = monthly.get(month) || {
      month,
      amountDue: 0,
      amountPaid: 0,
      unpaidBalance: 0,
    };
    current.amountDue = roundMoney(current.amountDue + obligation.amountDue);
    current.amountPaid = roundMoney(current.amountPaid + obligation.amountPaid);
    current.unpaidBalance = roundMoney(current.unpaidBalance + obligation.balance);
    monthly.set(month, current);
  }
  return Array.from(monthly.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export function childSupportChartRows(payments: ChildSupportPayment[], range: DateRange) {
  const monthly = new Map<string, { month: string; amountDue: number; amountPaid: number; unpaidBalance: number }>();
  for (const payment of payments.filter((item) => isWithinDateRange(item.dueDate, range))) {
    const month = getMonthKey(payment.dueDate);
    const current = monthly.get(month) || { month, amountDue: 0, amountPaid: 0, unpaidBalance: 0 };
    current.amountDue += payment.amountDue;
    current.amountPaid += payment.amountPaid;
    current.unpaidBalance += Math.max(payment.amountDue - payment.amountPaid, 0);
    monthly.set(month, current);
  }
  return Array.from(monthly.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export function calculateExpenseStats(expenses: ExpenseItem[], range: DateRange) {
  const rows = expenses.filter((expense) => isWithinDateRange(expense.expenseDate, range));
  const totalExpenses = rows.reduce((sum, expense) => sum + expense.amount, 0);
  const reimbursementRequested = rows
    .filter((expense) => expense.reimbursementRequested)
    .reduce((sum, expense) => sum + expense.amount, 0);
  const reimbursementReceived = rows.reduce((sum, expense) => sum + (expense.amountReimbursed || 0), 0);

  const byCategory = new Map<string, number>();
  for (const expense of rows) {
    byCategory.set(expense.category, (byCategory.get(expense.category) || 0) + expense.amount);
  }

  return {
    expenseCount: rows.length,
    totalExpenses,
    reimbursementRequested,
    reimbursementReceived,
    unpaidReimbursement: Math.max(reimbursementRequested - reimbursementReceived, 0),
    byCategory: Array.from(byCategory, ([category, amount]) => ({ category, amount })).sort((a, b) =>
      a.category.localeCompare(b.category)
    ),
  };
}

function timeFromIso(value?: string | null) {
  return value ? value.slice(11, 16) : undefined;
}

function buildSortAt(date: string, time?: string) {
  return `${date}T${time || "00:00"}:00.000Z`;
}

function joinParts(parts: Array<string | undefined | null | false>) {
  return parts.filter(Boolean).join(" | ");
}

function exchangeSeverity(status: ExchangeLog["status"]): CalendarEvent["severity"] {
  if (status === "missed" || status === "refused") return "critical";
  if (status === "completed_late" || status === "canceled" || status === "modified_by_agreement") {
    return "attention";
  }
  if (status === "completed_on_time" || status === "completed_early") return "positive";
  return "neutral";
}

function paymentSeverity(payment: ChildSupportPayment): CalendarEvent["severity"] {
  if (payment.paymentStatus === "unpaid" || payment.paymentStatus === "disputed") return "critical";
  if (payment.paymentStatus === "partial" || payment.paymentStatus === "late" || payment.paymentStatus === "unknown") {
    return "attention";
  }
  if (payment.paymentStatus === "paid") return "positive";
  return "neutral";
}

function obligationSeverity(
  obligation: ChildSupportObligation
): CalendarEvent["severity"] {
  if (obligation.status === "unpaid" || obligation.status === "disputed") return "critical";
  if (
    obligation.status === "partial" ||
    obligation.status === "late" ||
    obligation.status === "unknown"
  ) {
    return "attention";
  }
  if (obligation.status === "paid") return "positive";
  return "neutral";
}

function expenseSeverity(expense: ExpenseItem): CalendarEvent["severity"] {
  if (expense.reimbursementStatus === "disputed") return "critical";
  if (
    expense.reimbursementStatus === "requested" ||
    expense.reimbursementStatus === "partially_reimbursed" ||
    expense.reimbursementStatus === "unpaid"
  ) {
    return "attention";
  }
  if (expense.reimbursementStatus === "reimbursed") return "positive";
  return "neutral";
}

function noteSeverity(note: DateNote): CalendarEvent["severity"] {
  if (note.category === "safety") return "critical";
  const tags = new Set(note.tags.map((tag) => tag.toLowerCase()));
  if (
    tags.has("late_exchange") ||
    tags.has("refused_exchange") ||
    tags.has("missed_exchange") ||
    tags.has("no_facetime") ||
    tags.has("post_call_notice") ||
    tags.has("unanswered_call")
  ) {
    return "attention";
  }
  if (
    note.category === "exchange" ||
    note.category === "child_support" ||
    note.category === "schedule_change" ||
    note.category === "court"
  ) {
    return "attention";
  }
  return "neutral";
}

export function buildCalendarEvents(
  dataset: RecordsDataset,
  userId: string,
  caseId: string,
  range: DateRange
): CalendarEvent[] {
  const matter = dataset.matters.find((item) => item.userId === userId && item.id === caseId);
  const userRoleLabel = matter?.userRoleLabel || "Me";
  const otherParentLabel = matter?.otherParentLabel || "Other parent";
  const rules = filterOwnedCaseRecords(dataset.exchangeRules, userId, caseId);
  const expected = generateExpectedExchangeEvents(rules, range);
  const custodyAssignments = filterOwnedCaseRecords(dataset.custodyDayAssignments, userId, caseId);
  const exchangeLogs = filterOwnedCaseRecords(dataset.exchangeLogs, userId, caseId);
  const notes = filterOwnedCaseRecords(dataset.dateNotes, userId, caseId);
  const evidenceItems = filterOwnedCaseRecords(dataset.evidenceItems, userId, caseId);
  const supportOrders = filterOwnedCaseRecords(dataset.childSupportOrders, userId, caseId);
  const payments = filterOwnedCaseRecords(dataset.childSupportPayments, userId, caseId);
  const supportObligations = generateChildSupportObligations(
    supportOrders,
    payments,
    range
  );
  const expenses = filterOwnedCaseRecords(dataset.expenseItems, userId, caseId);
  const designationByEventId = new Map(
    (dataset.timelineDesignations || [])
      .filter((item) => item.userId === userId && item.caseId === caseId)
      .map((item) => [item.eventId, item] as const)
  );

  const events: CalendarEvent[] = [
    ...expected.map((event) => ({
      id: event.id,
      caseId,
      date: getIsoDateFromDateTime(event.orderedExchangeAt),
      time: timeFromIso(event.orderedExchangeAt),
      sortAt: event.orderedExchangeAt,
      type: "scheduled_exchange" as const,
      title: `Scheduled exchange: ${event.ruleName}`,
      detail: joinParts([
        timeFromIso(event.orderedExchangeAt) ? `Ordered time ${timeFromIso(event.orderedExchangeAt)}` : undefined,
        labelExchangeDirectionWithParties(event.direction, userRoleLabel, otherParentLabel),
        event.location,
      ]),
      summary: joinParts([`Rule: ${event.ruleName}`, event.location ? `Location: ${event.location}` : undefined]),
      tags: [
        "scheduled exchange",
        labelExchangeDirectionWithParties(event.direction, userRoleLabel, otherParentLabel),
      ],
      severity: "neutral" as const,
      sourceLabel: "Exchange schedule",
      relatedIds: [event.custodyExchangeRuleId],
    })),
    ...custodyAssignments
      .filter((assignment) => assignment.exchangeTime)
      .map((assignment) => ({
        id: `custody-scheduled-exchange-${assignment.id}`,
        caseId,
        date: assignment.date,
        time: assignment.exchangeTime,
        sortAt: buildSortAt(assignment.date, assignment.exchangeTime),
        type: "scheduled_exchange" as const,
        title: `Scheduled exchange: ${assignment.caregiverLabel}`,
        detail: joinParts([
          assignment.exchangeTime ? `Ordered time ${assignment.exchangeTime}` : undefined,
          assignment.exchangeDirection
            ? labelExchangeDirectionWithParties(
                assignment.exchangeDirection,
                userRoleLabel,
                otherParentLabel
              )
            : undefined,
          assignment.exchangeLocation,
        ]),
        summary: joinParts([
          `Calendar assignment: ${assignment.caregiverLabel}`,
          assignment.exchangeLocation ? `Location: ${assignment.exchangeLocation}` : undefined,
        ]),
        body: assignment.notes,
        tags: [
          "scheduled exchange",
          "custody calendar",
          assignment.exchangeDirection
            ? labelExchangeDirectionWithParties(
                assignment.exchangeDirection,
                userRoleLabel,
                otherParentLabel
              )
            : undefined,
        ].filter(Boolean) as string[],
        severity: "neutral" as const,
        sourceLabel: "Custody calendar",
        relatedIds: [assignment.id],
      })),
    ...exchangeLogs.map((log) => {
      const timing = calculateExchangeTiming(log);
      const orderedDate = getIsoDateFromDateTime(log.orderedExchangeAt);
      const actualDate = log.actualExchangeAt ? getIsoDateFromDateTime(log.actualExchangeAt) : orderedDate;
      const actualTime = timeFromIso(log.actualExchangeAt);
      const orderedTime = timeFromIso(log.orderedExchangeAt);
      const timingLabel =
        timing.minutesEarlyOrLate === null
          ? undefined
          : timing.minutesEarlyOrLate === 0
            ? "Recorded at ordered time"
            : timing.minutesEarlyOrLate > 0
              ? `${timing.minutesEarlyOrLate} minutes after ordered time`
              : `${Math.abs(timing.minutesEarlyOrLate)} minutes before ordered time`;

      return {
        id: `log-${log.id}`,
        caseId,
        date: actualDate,
        time: actualTime || orderedTime,
        sortAt: log.actualExchangeAt || log.orderedExchangeAt,
        type: "logged_exchange" as const,
        title: `Logged exchange: ${labelExchangeStatus(log.status)}`,
        detail: joinParts([
          orderedTime ? `Ordered ${orderedDate} ${orderedTime}` : undefined,
          actualTime ? `Actual ${actualDate} ${actualTime}` : "No actual time recorded",
          timingLabel,
          `Scheduled source: ${labelExchangeScheduledTimeSource(log.scheduledTimeSource)}`,
          log.location,
        ]),
        summary: joinParts([
          `Status: ${labelExchangeStatus(log.status)}`,
          `Direction: ${labelExchangeDirectionWithParties(
            log.direction,
            userRoleLabel,
            otherParentLabel
          )}`,
          `Arriving/drop-off: ${labelExchangeParty(
            getExchangeArrivingParty(log),
            userRoleLabel,
            otherParentLabel
          )}`,
          timing.isLate
            ? `Late party: ${labelExchangeParty(
                getExchangeLateParty(log),
                userRoleLabel,
                otherParentLabel
              )}`
            : undefined,
          log.reasonGiven ? `Reason given: ${log.reasonGiven}` : undefined,
        ]),
        body: joinParts([log.notes, log.witnesses ? `Witnesses: ${log.witnesses}` : undefined]),
        tags: log.tags,
        severity: exchangeSeverity(log.status),
        sourceLabel: "Exchange log",
        relatedIds: [log.id, log.custodyExchangeRuleId].filter(Boolean) as string[],
      };
    }),
    ...supportObligations.map((obligation) => ({
      id: obligation.id,
      caseId,
      date: obligation.dueDate,
      sortAt: buildSortAt(obligation.dueDate),
      type: "child_support_due" as const,
      title: `Child support due: ${formatMoney(obligation.amountDue, obligation.currency)}`,
      detail: joinParts([
        `Status: ${
          obligation.status === "due"
            ? "Due today"
            : obligation.status === "upcoming"
              ? "Upcoming"
              : labelPaymentStatus(obligation.status)
        }`,
        `Recorded paid: ${formatMoney(obligation.amountPaid, obligation.currency)}`,
        `Calculated balance: ${formatMoney(obligation.balance, obligation.currency)}`,
      ]),
      summary: joinParts([
        `Order: ${obligation.orderNickname}`,
        obligation.paymentDate ? `Payment date: ${obligation.paymentDate}` : undefined,
        obligation.source === "order_schedule"
          ? "Calculated from saved order schedule"
          : "Manual due date",
      ]),
      tags: [
        "child support",
        obligation.status === "due"
          ? "due today"
          : obligation.status === "upcoming"
            ? "upcoming"
            : labelPaymentStatus(obligation.status),
      ],
      severity: obligationSeverity(obligation),
      sourceLabel: "Child support",
      relatedIds: [obligation.childSupportOrderId, ...obligation.paymentRecordIds],
    })),
    ...payments
      .filter((payment) => payment.paymentDate)
      .map((payment) => ({
        id: `payment-paid-${payment.id}`,
        caseId,
        date: payment.paymentDate || payment.dueDate,
        sortAt: buildSortAt(payment.paymentDate || payment.dueDate),
        type: "child_support_paid" as const,
        title: `Payment record: ${formatMoney(payment.amountPaid)}`,
        detail: joinParts([
          `Status: ${labelPaymentStatus(payment.paymentStatus)}`,
          `Due ${payment.dueDate}`,
          `Method: ${payment.paymentMethod.replaceAll("_", " ")}`,
        ]),
        summary: `Based on records entered in this app. Amount marked paid: ${formatMoney(payment.amountPaid)}.`,
        body: payment.notes,
        tags: ["payment record", labelPaymentStatus(payment.paymentStatus)],
        severity: paymentSeverity(payment),
        sourceLabel: "Child support",
        relatedIds: [payment.id, payment.childSupportOrderId],
      })),
    ...notes.map((note) => ({
      id: `note-${note.id}`,
      caseId,
      date: note.noteDate,
      time: note.noteTime,
      sortAt: buildSortAt(note.noteDate, note.noteTime),
      type: "custody_note" as const,
      title: note.title,
      detail: labelNoteCategory(note.category),
      summary: note.includeInReports ? "Selected for reports" : "Not selected for reports",
      body: note.body,
      tags: note.tags,
      severity: noteSeverity(note),
      sourceLabel: "Date note",
      includeInReports: note.includeInReports,
      relatedIds: [
        note.id,
        note.relatedExchangeId,
        note.relatedChildSupportPaymentId,
        note.relatedExpenseId,
      ].filter(Boolean) as string[],
    })),
    ...evidenceItems
      .filter((item) => item.evidenceDate)
      .map((item) => ({
        id: `evidence-${item.id}`,
        caseId,
        date: item.evidenceDate || item.uploadedAt.slice(0, 10),
        time: timeFromIso(item.uploadedAt),
        sortAt: item.evidenceDate ? buildSortAt(item.evidenceDate, timeFromIso(item.uploadedAt)) : item.uploadedAt,
        type: "evidence_item" as const,
        title: `File attachment: ${evidenceFileName(item)}`,
        detail: item.description,
        summary: joinParts([
          `File type: ${item.fileType}`,
          `Scan: ${item.malwareScanStatus || "pending"}`,
          item.includeInReports ? "Selected for reports" : "Not selected for reports",
        ]),
        body: item.description,
        tags: item.tags,
        severity:
          item.malwareScanStatus === "blocked" || item.malwareScanStatus === "failed"
            ? ("attention" as const)
            : ("neutral" as const),
        sourceLabel: "File attachment",
        includeInReports: item.includeInReports,
        relatedIds: [
          item.id,
          item.relatedExchangeId,
          item.relatedNoteId,
          item.relatedChildSupportPaymentId,
          item.relatedExpenseId,
        ].filter(Boolean) as string[],
      })),
    ...expenses.map((expense) => ({
      id: `expense-${expense.id}`,
      caseId,
      date: expense.expenseDate,
      sortAt: buildSortAt(expense.expenseDate),
      type: "expense_item" as const,
      title: `Expense: ${expense.description}`,
      detail: joinParts([
        formatMoney(expense.amount, expense.currency),
        expense.category,
        `Reimbursement: ${expense.reimbursementStatus.replaceAll("_", " ")}`,
      ]),
      summary: joinParts([
        `Paid by: ${expense.paidByLabel}`,
        expense.reimbursementRequested ? "Reimbursement requested" : "No reimbursement requested",
        expense.reimbursementDueDate ? `Due date: ${expense.reimbursementDueDate}` : undefined,
        expense.amountReimbursed ? `Amount reimbursed: ${formatMoney(expense.amountReimbursed, expense.currency)}` : undefined,
      ]),
      body: expense.notes,
      tags: [expense.category, expense.reimbursementStatus.replaceAll("_", " ")],
      severity: expenseSeverity(expense),
      sourceLabel: "Expense",
      relatedIds: [expense.id],
    })),
  ];

  return events
    .filter((event) => isWithinDateRange(event.date, range))
    .map((event) => {
      const designation = designationByEventId.get(event.id);
      return {
        ...event,
        severity: designation?.severity || event.severity || "neutral",
        severitySource: designation ? ("user" as const) : ("automatic" as const),
      };
    })
    .sort(
      (a, b) =>
        (a.sortAt || buildSortAt(a.date, a.time)).localeCompare(b.sortAt || buildSortAt(b.date, b.time)) ||
        a.title.localeCompare(b.title)
    );
}

export function isTimelineVisibleEvent(event: CalendarEvent) {
  return event.type !== "custody_day";
}

export function isReportIncludedTimelineEvent(event: CalendarEvent) {
  return event.includeInReports !== false;
}

export function timelineSearchText(event: CalendarEvent) {
  return [
    event.title,
    event.detail,
    event.summary,
    event.body,
    event.sourceLabel,
    ...(event.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

export function isLateExchangeTimelineEvent(event: CalendarEvent) {
  const text = timelineSearchText(event);

  if (event.type === "logged_exchange") {
    return includesAny(text, [
      "completed late",
      "late exchange",
      "minutes after ordered time",
      "after ordered time",
    ]);
  }

  if (event.type !== "custody_note") return false;

  const exchangeLanguage = includesAny(text, [
    "late exchange",
    "late drop",
    "late transition",
    "drop off",
    "drop-off",
    "dropped off",
    "showed up",
    "arrived",
    "arrival",
    "exchange",
    "transition",
  ]);
  const lateLanguage = includesAny(text, [
    "late",
    "not on time",
    "after ordered time",
    "court order",
    "ordered time",
    "minutes after",
    "showed up at",
    "arrived at",
    "dropped off at",
  ]);

  return exchangeLanguage && lateLanguage;
}

export function isMissedExchangeTimelineEvent(event: CalendarEvent) {
  const text = timelineSearchText(event);

  if (event.type === "logged_exchange") {
    return includesAny(text, ["missed", "refused"]);
  }

  if (event.type !== "custody_note") return false;

  return includesAny(text, [
    "missed exchange",
    "refused exchange",
    "refused to bring",
    "would not bring",
    "did not bring",
    "unable to exchange",
    "refuses to bring",
  ]);
}

export function isNoFaceTimeTimelineEvent(event: CalendarEvent) {
  if (event.type !== "custody_note") return false;

  const text = timelineSearchText(event);
  const hasFaceTimeLanguage = /\bft\b/.test(text) || includesAny(text, ["facetime", "face time"]);
  if (!hasFaceTimeLanguage) return false;

  return includesAny(text, [
    "no_facetime",
    "no facetime conducted",
    "no facetime",
    "no face time",
    "no ft",
    "not tonight",
    "not today",
    "can't facetime",
    "cannot facetime",
    "could not facetime",
    "unable to facetime",
    "not able",
    "no service",
    "won't have much service",
  ]);
}

export function isPostCallFaceTimeNotice(event: CalendarEvent) {
  if (!isNoFaceTimeTimelineEvent(event)) return false;

  const text = timelineSearchText(event);
  return includesAny(text, [
    "post_call_notice",
    "call_attempt_first",
    "unanswered_call",
    "after attempted",
    "after an attempted",
    "after a call",
    "after i called",
    "after calling",
    "after request",
    "called a few minutes ago",
    "called about",
    "facetimed about",
    "facetimed a few minutes ago",
    "tried to facetime",
    "attempted to facetime",
    "went straight to voicemail",
    "sent to voicemail",
    "cancelled the call",
    "call was sent",
  ]);
}

export function buildDashboardTimelineStats(events: CalendarEvent[]) {
  const visibleEvents = events.filter(isTimelineVisibleEvent);
  const lateExchangeCount = visibleEvents.filter(isLateExchangeTimelineEvent).length;
  const missedExchangeCount = visibleEvents.filter(isMissedExchangeTimelineEvent).length;
  const noFaceTimeCount = visibleEvents.filter(isNoFaceTimeTimelineEvent).length;
  const postCallNoFaceTimeCount = visibleEvents.filter(isPostCallFaceTimeNotice).length;
  const attentionCount = visibleEvents.filter(
    (event) => event.severity === "attention" || event.severity === "critical"
  ).length;

  return {
    timelineCount: visibleEvents.length,
    attentionCount,
    lateExchangeCount,
    missedExchangeCount,
    noFaceTimeCount,
    postCallNoFaceTimeCount,
    exchangeCount: visibleEvents.filter(
      (event) => event.type === "scheduled_exchange" || event.type === "logged_exchange"
    ).length,
    noteCount: visibleEvents.filter((event) => event.type === "custody_note").length,
    evidenceCount: visibleEvents.filter((event) => event.type === "evidence_item").length,
  };
}

export function buildNeutralExchangeSummary(
  range: DateRange,
  scheduledCount: number,
  lateCount: number,
  averageLatenessMinutes: number,
  missedCount: number
) {
  return `From ${range.from} to ${range.to}, ${scheduledCount} exchanges were scheduled. ${lateCount} were completed late. Average delay was ${averageLatenessMinutes} minutes. ${missedCount} exchange${missedCount === 1 ? " was" : "s were"} marked missed.`;
}

export function buildNeutralChildSupportSummary(
  range: DateRange,
  stats: ReturnType<typeof calculateChildSupportObligationStats>
) {
  return `Based on the saved order schedule and user-entered payment records, ${stats.paymentCount} child support obligation${stats.paymentCount === 1 ? " was" : "s were"} due between ${range.from} and ${range.to}. ${stats.totalPaid === 0 ? "No payments were recorded" : `${formatMoney(stats.totalPaid)} was recorded as paid`}. ${stats.pastDueCount} past-due period${stats.pastDueCount === 1 ? " has" : "s have"} a calculated balance of ${formatMoney(stats.pastDueBalance)}.`;
}

export function buildEvidenceIndex(items: EvidenceItem[], range: DateRange) {
  return items
    .filter((item) => item.includeInReports)
    .filter((item) => !item.evidenceDate || isWithinDateRange(item.evidenceDate, range))
    .map((item, index) => ({
      index: index + 1,
      fileName: evidenceFileName(item),
      evidenceDate: item.evidenceDate || "",
      description: item.description || "",
      tags: item.tags.join(", "),
      scanStatus: item.malwareScanStatus || "pending",
      storageStatus: item.storagePath ? "private stored file" : "metadata only",
    }));
}

export function containsForbiddenGeneratedTerm(text: string) {
  const lower = text.toLowerCase();
  return generatedReportForbiddenTerms.some((term) => lower.includes(term));
}

export function labelExchangeStatus(status: ExchangeLog["status"]) {
  return status
    .replace("completed_", "completed ")
    .replaceAll("_", " ");
}

export function labelPaymentStatus(status: ChildSupportPayment["paymentStatus"]) {
  return status.replaceAll("_", " ");
}

export function labelNoteCategory(category: DateNote["category"]) {
  return category.replaceAll("_", " ");
}

export function labelEventType(type: CalendarEvent["type"]) {
  if (type === "evidence_item") return "file attachment";
  return type.replaceAll("_", " ");
}
