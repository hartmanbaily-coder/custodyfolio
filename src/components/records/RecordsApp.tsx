"use client";

import Image from "next/image";
import Link from "next/link";
import type {
  ComponentType,
  Dispatch,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  SetStateAction,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArchiveIcon,
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  Cross2Icon,
  FileTextIcon,
  GearIcon,
  HamburgerMenuIcon,
  HomeIcon,
  IdCardIcon,
  LockClosedIcon,
  Pencil2Icon,
  PlusIcon,
  ReaderIcon,
  ValueIcon,
} from "@radix-ui/react-icons";
import PolicyFooter from "@/components/PolicyFooter";
import ThemeSelector from "@/components/ThemeSelector";
import {
  addDays,
  buildDashboardTimelineStats,
  buildCalendarEvents,
  buildCustodyDayMap,
  calculateChildSupportObligationStats,
  calculateExpenseStats,
  childSupportHistoryRange,
  childSupportObligationChartRows,
  daysBetween,
  expenseHistoryRange,
  exchangeChartRows,
  formatMoney,
  generateChildSupportObligations,
  generateExpectedExchangeEvents,
  getExchangeArrivingParty,
  getExchangeLateParty,
  getIsoDateFromDateTime,
  isTimelineVisibleEvent,
  labelEventType,
  labelExchangeParty,
  labelExchangeScheduledTimeSource,
  labelExchangeStatus,
  labelNoteCategory,
  labelPaymentStatus,
  timeOfDayPositionPercent,
  type ChildSupportObligation,
} from "@/lib/records/calculations";
import {
  acceptAttorneyInviteSession,
  acceptRecordsRecoverySession,
  clearFailedLoginAttempts,
  clearSession,
  createId,
  downloadBlobFile,
  downloadTextFile,
  notifyNativeNavigationChanged,
  nowIso,
  parseTags,
  readRecordsSession,
  requestRecordsPasswordReset,
  resendRecordsSignupConfirmation,
  signInRecordsSession,
  signUpRecordsAccount,
  signOutRecordsSession,
  shareHtmlAsPdf,
  updateRecordsPassword,
  useRecordsStore,
  useSelectedRecords,
  verifyRecordsMfa,
  verifyRecordsMfaEnrollment,
  withAudit,
  writeSession,
  type RecordsMfaEnrollment,
  type RecordsSession,
} from "@/lib/records/clientStore";
import {
  isExplicitAttorneyInviteCallback,
  parseRecordsAuthFragment,
} from "@/lib/records/authClient";
import { buildEvidencePrintHtml } from "@/lib/records/evidencePrint";
import {
  buildReportPreview,
  buildSectionExportPacket,
  fullProfileDateRange,
  reportPreviewToCsv,
  reportsTabReportTypes,
  rowsToCsv,
  sectionExportToCsv,
  type SectionExportPacket,
} from "@/lib/records/reports";
import {
  generatePrintableReportPdf,
  printableReportPacket,
} from "@/lib/records/reportPdf";
import {
  buildDateRangePreset,
  buildMonthDays,
  currentMonthKey,
  defaultRecordsTimezone,
  formatLocalDate,
  formatMonthLabel,
  getMonthBounds,
  monthKeyFromDate,
  shiftMonthKey,
  type DateRangePreset,
} from "@/lib/records/dateRanges";
import { demoCaseId, demoUserId } from "@/lib/records/seed";
import {
  defaultCaseIdForUser,
  recordsAccountBindingHeaderName,
} from "@/lib/records/accountBoundary";
import type {
  CalendarEvent,
  CustodyDayAssignment,
  DateRange,
  EvidenceItem,
  ExchangeDirection,
  ExchangeStatus,
  NoteCategory,
  PaymentStatus,
  RecordsDataset,
  ReportType,
  TimelineSeverity,
  CaseTerminology,
} from "@/lib/records/types";
import {
  buildStoredEvidenceName,
  childSupportOrderSchema,
  childSupportPaymentSchema,
  custodyMatterSchema,
  custodyDayAssignmentSchema,
  custodyDayColors,
  dateNoteSchema,
  exchangeLogSchema,
  exchangeRuleSchema,
  evidenceFileName,
  expenseItemSchema,
  normalizeEvidenceFileType,
  timezoneSchema,
  validateEvidenceDisplayFileName,
  validateEvidenceFile,
} from "@/lib/records/validation";
import {
  accountDeletionPath,
  recordsTagline,
  siteName,
  supportEmail,
  supportMailto,
} from "@/lib/site";
import {
  ExchangeTimingChart,
  ExpenseCategoryChart,
  ReportPreviewChartCard,
  SupportTrendLine,
} from "./RecordsCharts";
import ExhibitBuilder from "./ExhibitBuilder";
import AttorneyAccessPanel from "./AttorneyAccessPanel";
import {
  saveScreenshotExhibitToFiles,
  type ExhibitSaveRequest,
} from "@/lib/records/exhibitEvidence";
import { uploadEvidenceFileToPrivateStorage } from "@/lib/records/evidenceClient";
import { getRecordsCsrfToken } from "@/lib/records/attorneyClient";
import {
  caseTerminologyFields,
  defaultCaseTerminology,
  resolveCaseTerminology,
} from "@/lib/records/terminology";
import SubscriptionPanel from "@/components/billing/SubscriptionPanel";
import AccountSubscriptionIndicator from "@/components/billing/AccountSubscriptionIndicator";
import { useBillingStatus } from "@/lib/billing/client";
import type { BillingStatus } from "@/lib/billing/types";
import { planExportOnlyDatasetMutation } from "@/lib/records/datasetMutation";

const recordsPrivacyNote =
  "Records are private by default. Use labels such as Child 1 and Parent B instead of real names.";

const navItems = [
  "Dashboard",
  "Calendar",
  "Import",
  "Timeline",
  "Exchanges",
  "Notes",
  "Files",
  "Screenshot PDFs",
  "Child Support",
  "Expenses",
  "Reports",
  "Attorney Access",
  "Subscription",
  "Settings",
] as const;

type ActiveView = (typeof navItems)[number];

const navGroups: Array<{ label: string; items: ActiveView[] }> = [
  { label: "Home", items: ["Dashboard"] },
  { label: "Add", items: ["Import"] },
  { label: "Review", items: ["Timeline", "Calendar", "Exchanges", "Notes", "Files"] },
  { label: "Financial", items: ["Expenses", "Child Support"] },
  { label: "Prepare & Share", items: ["Reports", "Screenshot PDFs", "Attorney Access"] },
  { label: "Settings", items: ["Subscription", "Settings"] },
];

const activeViewIcons: Record<ActiveView, ComponentType<{ className?: string }>> = {
  Dashboard: HomeIcon,
  Calendar: CalendarIcon,
  Import: PlusIcon,
  Timeline: ClockIcon,
  Exchanges: CalendarIcon,
  Notes: Pencil2Icon,
  Files: ArchiveIcon,
  "Screenshot PDFs": FileTextIcon,
  "Child Support": ValueIcon,
  Expenses: ValueIcon,
  Reports: ReaderIcon,
  "Attorney Access": IdCardIcon,
  Subscription: ReaderIcon,
  Settings: GearIcon,
};

function activeViewLabel(view: ActiveView, terminology: CaseTerminology) {
  const labels: Record<ActiveView, string> = {
    Dashboard: "Home",
    Calendar: "Calendar",
    Import: "Add records",
    Timeline: "Timeline",
    Exchanges: terminology.parentingTime,
    Notes: terminology.notesEvents,
    Files: terminology.filesEvidence,
    "Screenshot PDFs": "Build a PDF",
    "Child Support": "Child support",
    Expenses: "Expenses",
    Reports: "Reports",
    "Attorney Access": "Attorney access",
    Subscription: "Subscription",
    Settings: "Settings",
  };
  return labels[view];
}

function activeViewFromHistoryState(state: unknown): ActiveView | null {
  if (!state || typeof state !== "object" || !("recordsView" in state)) return null;
  const candidate = (state as { recordsView?: unknown }).recordsView;
  return typeof candidate === "string" && navItems.some((item) => item === candidate)
    ? (candidate as ActiveView)
    : null;
}

function historyIndexFromState(state: unknown) {
  if (!state || typeof state !== "object" || !("recordsHistoryIndex" in state)) return null;
  const candidate = (state as { recordsHistoryIndex?: unknown }).recordsHistoryIndex;
  return typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 0
    ? candidate
    : null;
}

function recordsHistoryState(view: ActiveView, index: number) {
  const current = window.history.state;
  return {
    ...(current && typeof current === "object" ? current : {}),
    recordsHistoryIndex: index,
    recordsView: view,
  };
}

const recordsTimezoneOptions = [
  { value: "America/Adak", label: "Aleutian Time — Adak, Alaska" },
  { value: "America/Anchorage", label: "Alaska Time — most of Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii Time — Hawaii" },
  { value: "America/Los_Angeles", label: "Pacific Time — Los Angeles" },
  { value: "America/Phoenix", label: "Mountain Time without daylight saving — Arizona" },
  { value: "America/Denver", label: "Mountain Time — Denver" },
  { value: "America/Boise", label: "Mountain Time — southern Idaho" },
  { value: "America/Chicago", label: "Central Time — Chicago" },
  { value: "America/North_Dakota/Center", label: "Central Time — North Dakota" },
  { value: "America/New_York", label: "Eastern Time — New York" },
  { value: "America/Detroit", label: "Eastern Time — Michigan" },
  { value: "America/Indiana/Indianapolis", label: "Eastern Time — Indiana" },
  { value: "America/Kentucky/Louisville", label: "Eastern Time — Kentucky" },
  { value: "America/Puerto_Rico", label: "Atlantic Time — Puerto Rico and U.S. Virgin Islands" },
  { value: "Pacific/Pago_Pago", label: "Samoa Time — American Samoa" },
  { value: "Pacific/Guam", label: "Chamorro Time — Guam" },
  { value: "Pacific/Saipan", label: "Chamorro Time — Northern Mariana Islands" },
  { value: "UTC", label: "UTC — Coordinated Universal Time" },
];
type Session = RecordsSession;
type SectionExportFormat = "pdf" | "csv";
type LoginFlowResult =
  | { status: "complete" }
  | { status: "mfa_required" }
  | { status: "mfa_enrollment_required"; enrollment: RecordsMfaEnrollment };
type LoginScreenMode =
  | "login"
  | "signup"
  | "resend_confirmation"
  | "reset"
  | "update_password";

function pendingAttorneyNextPath() {
  if (typeof window === "undefined") return null;
  const next = new URLSearchParams(window.location.search).get("next");
  return next === "/attorney" || next === "/attorney/accept" ? next : null;
}

function hasExplicitAttorneyInviteCallback() {
  if (typeof window === "undefined") return false;
  return isExplicitAttorneyInviteCallback(
    window.location.search,
    window.location.hash
  );
}

const defaultRangePreset: DateRangePreset = "currentMonth";

const exchangeStatuses: ExchangeStatus[] = [
  "completed_on_time",
  "completed_late",
  "completed_early",
  "missed",
  "refused",
  "modified_by_agreement",
  "canceled",
  "other",
];

const paymentStatuses: PaymentStatus[] = [
  "paid",
  "partial",
  "unpaid",
  "late",
  "disputed",
  "waived_by_agreement",
  "unknown",
];

type TimelineFilter = "all" | "attention" | CalendarEvent["type"];
type EvidenceReviewStatus = NonNullable<EvidenceItem["reviewStatus"]>;
type ParentingSchedulePresetId =
  | "three_four_four_three_flip"
  | "week_on_week_off"
  | "two_two_three"
  | "two_two_five_five"
  | "three_three_four_four"
  | "weekday_alternating_weekend";
type ScheduleParentKey = "you" | "other";

const parentingSchedulePresets: Array<{
  id: ParentingSchedulePresetId;
  label: string;
  description: string;
}> = [
  {
    id: "three_four_four_three_flip",
    label: "3 4 4 3 with eight week flip",
    description:
      "Alternates four day and three day blocks for eight weeks, then swaps which parent starts the four day block.",
  },
  {
    id: "week_on_week_off",
    label: "Week on / week off",
    description:
      "Seven days with one parent, then seven days with the other parent.",
  },
  {
    id: "two_two_three",
    label: "Two two three",
    description:
      "Two days, two days, then a three day weekend, flipping the long weekend each week.",
  },
  {
    id: "two_two_five_five",
    label: "Two two five five",
    description:
      "Two fixed weekdays with each parent, then alternating five day stretches.",
  },
  {
    id: "three_three_four_four",
    label: "Three three four four",
    description:
      "Three days with each parent, then four days with each parent.",
  },
  {
    id: "weekday_alternating_weekend",
    label: "Weekdays + alternating weekend",
    description:
      "Primary weekday pattern with the other parent receiving every other weekend.",
  },
];

const timelineFilterOptions: Array<{ value: TimelineFilter; label: string }> = [
  { value: "all", label: "All records" },
  { value: "attention", label: "Recorded issues" },
  { value: "scheduled_exchange", label: "Scheduled exchanges" },
  { value: "logged_exchange", label: "Logged exchanges" },
  { value: "custody_note", label: "Notes" },
  { value: "evidence_item", label: "Files" },
  { value: "child_support_due", label: "Support due" },
  { value: "child_support_paid", label: "Support paid" },
  { value: "expense_item", label: "Expenses" },
];

type TimelineDesignationChoice = TimelineSeverity | "automatic";

const timelineDesignationOptions: Array<{ value: TimelineSeverity; label: string }> = [
  { value: "neutral", label: "Neutral" },
  { value: "positive", label: "Recorded" },
  { value: "attention", label: "Recorded issue" },
  { value: "critical", label: "Critical" },
];

const custodyDayColorOptions = custodyDayColors.map((value, index) => ({
  value,
  label: ["Teal", "Blue", "Purple", "Amber", "Slate", "Rose"][index],
}));

const directTimelineDeleteTypes = new Set<CalendarEvent["type"]>([
  "logged_exchange",
  "custody_note",
  "child_support_due",
  "child_support_paid",
  "expense_item",
]);

const exportReviewItems = [
  {
    key: "neutralLabels",
    label: "Names, file titles, and labels use privacy minded wording.",
  },
  {
    key: "paymentRefs",
    label: "Payment references do not include full bank, card, or account numbers.",
  },
  {
    key: "notes",
    label: "Notes are factual and do not include unnecessary third party details.",
  },
] as const;

type ExportReviewKey = (typeof exportReviewItems)[number]["key"];

const evidenceReviewStatusLabels: Record<EvidenceReviewStatus, string> = {
  needs_review: "Needs review",
  reviewed: "Reviewed",
  submitted: "Submitted",
  rejected: "Rejected",
};

export default function RecordsApp() {
  const {
    dataset,
    hydrated,
    updateDataset,
    resetDemoData,
    reloadDataset,
    storageStatus,
    storageError,
    recordsStorageMode,
    prepareForAccountBoundary,
  } = useRecordsStore();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [mfaResumeRequired, setMfaResumeRequired] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>("Dashboard");
  const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const activeViewRef = useRef<ActiveView>("Dashboard");
  const historyIndexRef = useRef(0);
  const historyMaxIndexRef = useRef(0);
  const [selectedCaseId, setSelectedCaseId] = useState(demoCaseId);
  const [range, setRange] = useState<DateRange>(() =>
    buildDateRangePreset(defaultRangePreset, new Date(), defaultRecordsTimezone)
  );
  const [calendarMonthKey, setCalendarMonthKey] = useState(() =>
    currentMonthKey(new Date(), defaultRecordsTimezone)
  );
  const [calendarMode, setCalendarMode] = useState<"month" | "list" | "timeline">("month");
  const [calendarTask, setCalendarTask] = useState<"view" | "edit">("view");
  const [selectedDay, setSelectedDay] = useState(() => formatLocalDate(new Date(), defaultRecordsTimezone));
  const [reportType, setReportType] = useState<ReportType>("full_profile");
  const [toast, setToast] = useState("");
  const toastTimeoutRef = useRef<number | null>(null);
  const billing = useBillingStatus(
    Boolean(session && recordsStorageMode === "supabase")
  );

  const userId = session?.userId || demoUserId;
  const selectedCase =
    dataset.matters.find((matter) => matter.userId === userId && matter.id === selectedCaseId) ||
    dataset.matters.find((matter) => matter.userId === userId);
  const effectiveCaseId = selectedCase?.id || selectedCaseId;
  const selected = useSelectedRecords(dataset, userId, effectiveCaseId);
  const selectedProfile = dataset.users.find((user) => user.userId === userId);
  const caseTimezone = selectedCase?.timezone || selectedProfile?.timezone || defaultRecordsTimezone;
  const terminology = resolveCaseTerminology(selectedCase?.terminology);

  const getCaseTimezone = useCallback((caseId: string, ownerId = userId) => {
    const matter = dataset.matters.find((item) => item.userId === ownerId && item.id === caseId);
    const profile = dataset.users.find((item) => item.userId === ownerId);
    return matter?.timezone || profile?.timezone || defaultRecordsTimezone;
  }, [dataset.matters, dataset.users, userId]);

  const selectCase = useCallback((caseId: string) => {
    const nextTimezone = getCaseTimezone(caseId);
    setSelectedCaseId(caseId);
    setCalendarMonthKey(currentMonthKey(new Date(), nextTimezone));
    setSelectedDay(formatLocalDate(new Date(), nextTimezone));
  }, [getCaseTimezone]);

  useEffect(() => {
    if (selectedCase && selectedCaseId !== selectedCase.id) {
      setSelectedCaseId(selectedCase.id);
    }
  }, [selectedCase, selectedCaseId]);

  const openView = useCallback((view: ActiveView) => {
    setMobileOptionsOpen(false);
    setMobileNavOpen(false);
    if (activeViewRef.current !== view) {
      const nextIndex = historyIndexRef.current + 1;
      window.history.pushState(recordsHistoryState(view, nextIndex), "");
      historyIndexRef.current = nextIndex;
      historyMaxIndexRef.current = nextIndex;
      activeViewRef.current = view;
      setActiveView(view);
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      notifyNativeNavigationChanged({
        canGoBack: true,
        canGoForward: false,
      });
    }
    if (view === "Calendar") {
      setCalendarMonthKey(currentMonthKey(new Date(), caseTimezone));
      setSelectedDay(formatLocalDate(new Date(), caseTimezone));
    }
  }, [caseTimezone]);

  const openRecurringExchangeSchedule = useCallback(() => {
    setCalendarTask("edit");
    openView("Calendar");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const schedule = document.getElementById("recurring-exchange-schedule");
        if (schedule instanceof HTMLDetailsElement) {
          schedule.open = true;
          schedule.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }, [openView]);

  useEffect(() => {
    const restoredView = activeViewFromHistoryState(window.history.state) || "Dashboard";
    const restoredIndex = historyIndexFromState(window.history.state) || 0;
    activeViewRef.current = restoredView;
    historyIndexRef.current = restoredIndex;
    historyMaxIndexRef.current = restoredIndex;
    setActiveView(restoredView);
    window.history.replaceState(recordsHistoryState(restoredView, restoredIndex), "");
    notifyNativeNavigationChanged({
      canGoBack: restoredIndex > 0,
      canGoForward: false,
    });

    const handlePopState = (event: PopStateEvent) => {
      const view = activeViewFromHistoryState(event.state) || "Dashboard";
      const index = historyIndexFromState(event.state) || 0;
      activeViewRef.current = view;
      historyIndexRef.current = index;
      setActiveView(view);
      setMobileOptionsOpen(false);
      setMobileNavOpen(false);
      notifyNativeNavigationChanged({
        canGoBack: index > 0,
        canGoForward: index < historyMaxIndexRef.current,
      });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      async function loadSession() {
        try {
          if (hasExplicitAttorneyInviteCallback()) {
            setSession(null);
            setMfaResumeRequired(false);
            return;
          }
          const state = await readRecordsSession().catch(() => ({ status: "signed_out" as const }));
          if (state.status === "mfa_required") {
            setMfaResumeRequired(true);
            return;
          }
          if (state.status === "signed_in") {
            setMfaResumeRequired(false);
            const next = pendingAttorneyNextPath();
            if (next) {
              window.location.replace(next);
              return;
            }
            setSession(state.session);
            setSelectedCaseId(state.session.caseId);
            setSelectedDay(formatLocalDate(new Date(), defaultRecordsTimezone));
          }
        } finally {
          setSessionChecked(true);
        }
      }

      void loadSession();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [recordsStorageMode]);

  useEffect(
    () => () => {
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    },
    []
  );

  const expectedExchanges = useMemo(
    () => generateExpectedExchangeEvents(selected.exchangeRules, range),
    [selected.exchangeRules, range]
  );
  const supportAsOfDate = formatLocalDate(new Date(), caseTimezone);
  const supportObligations = useMemo(
    () =>
      generateChildSupportObligations(
        selected.childSupportOrders,
        selected.childSupportPayments,
        range,
        supportAsOfDate
      ),
    [
      selected.childSupportOrders,
      selected.childSupportPayments,
      range,
      supportAsOfDate,
    ]
  );
  const supportStats = useMemo(
    () => calculateChildSupportObligationStats(supportObligations, supportAsOfDate),
    [supportObligations, supportAsOfDate]
  );
  const supportHistoryRange = useMemo(
    () =>
      childSupportHistoryRange(
        selected.childSupportOrders,
        selected.childSupportPayments,
        supportAsOfDate
      ),
    [
      selected.childSupportOrders,
      selected.childSupportPayments,
      supportAsOfDate,
    ]
  );
  const supportHistoryObligations = useMemo(
    () =>
      generateChildSupportObligations(
        selected.childSupportOrders,
        selected.childSupportPayments,
        supportHistoryRange,
        supportAsOfDate
      ),
    [
      selected.childSupportOrders,
      selected.childSupportPayments,
      supportHistoryRange,
      supportAsOfDate,
    ]
  );
  const expensesRange = useMemo(
    () => expenseHistoryRange(selected.expenseItems, supportAsOfDate),
    [selected.expenseItems, supportAsOfDate]
  );
  const expenseStats = useMemo(
    () => calculateExpenseStats(selected.expenseItems, expensesRange),
    [selected.expenseItems, expensesRange]
  );
  const calendarEvents = useMemo(
    () => buildCalendarEvents(dataset, userId, effectiveCaseId, range),
    [dataset, userId, effectiveCaseId, range]
  );
  const calendarViewRange = useMemo(
    () => getMonthBounds(calendarMonthKey, caseTimezone),
    [calendarMonthKey, caseTimezone]
  );
  const calendarViewEvents = useMemo(
    () => buildCalendarEvents(dataset, userId, effectiveCaseId, calendarViewRange).filter(isTimelineVisibleEvent),
    [dataset, userId, effectiveCaseId, calendarViewRange]
  );
  const timelineEvents = useMemo(
    () => calendarEvents.filter(isTimelineVisibleEvent),
    [calendarEvents]
  );
  const supportRows = useMemo(
    () =>
      childSupportObligationChartRows(
        supportHistoryObligations,
        supportHistoryRange.to
      ),
    [supportHistoryObligations, supportHistoryRange.to]
  );
  const reportPreview = useMemo(
    () => buildReportPreview(dataset, userId, effectiveCaseId, range, reportType),
    [dataset, userId, effectiveCaseId, range, reportType]
  );
  const sectionExportPackets = useMemo(
    () => ({
      calendar: buildSectionExportPacket(dataset, userId, effectiveCaseId, calendarViewRange, "calendar"),
      timeline: buildSectionExportPacket(dataset, userId, effectiveCaseId, range, "timeline"),
      exchanges: buildSectionExportPacket(dataset, userId, effectiveCaseId, range, "exchanges"),
      notes: buildSectionExportPacket(dataset, userId, effectiveCaseId, range, "notes"),
      evidence: buildSectionExportPacket(dataset, userId, effectiveCaseId, range, "evidence"),
      childSupport: buildSectionExportPacket(dataset, userId, effectiveCaseId, range, "child_support"),
      expenses: buildSectionExportPacket(dataset, userId, effectiveCaseId, expensesRange, "expenses"),
    }),
    [dataset, userId, effectiveCaseId, range, calendarViewRange, expensesRange]
  );

  function flash(message: string) {
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    setToast(message);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast("");
      toastTimeoutRef.current = null;
    }, 2800);
  }

  function workspaceUpdateDataset(
    updater: Parameters<typeof updateDataset>[0]
  ) {
    if (billing.status?.entitlement.mode === "export_only") {
      const proposed = updater(structuredClone(dataset));
      if (!planExportOnlyDatasetMutation(dataset, proposed)) {
        flash(
          "This account is in export-only mode. Viewing, exporting, downloading, deleting, billing management, and attorney revocation remain available."
        );
        return Promise.reject(
          new Error("Reactivate full access before adding or editing records.")
        );
      }
      return updateDataset(() => proposed);
    }
    return updateDataset(updater);
  }

  async function exportSectionPacket(
    packet: SectionExportPacket,
    format: SectionExportFormat
  ) {
    if (!packet.tables.some((table) => table.rows.length > 0)) {
      flash("No records match the selected date range. Adjust the range before exporting.");
      return;
    }

    const slug = `${packet.id}-${packet.range.from}-${packet.range.to}`;

    if (format === "csv") {
      downloadTextFile(`custody_folio_${slug}.csv`, sectionExportToCsv(packet), "text/csv");
    } else {
      try {
        const generated = generatePrintableReportPdf(packet);
        await downloadBlobFile(`custody_folio_${slug}.pdf`, generated.blob);
      } catch (error) {
        flash(error instanceof Error ? error.message : "PDF export failed.");
        return;
      }
    }

    workspaceUpdateDataset((current) =>
      withAudit(current, {
        userId,
        caseId: effectiveCaseId,
        action: "exported",
        entityType: "sectionExport",
        entityId: `${packet.id}-${format}`,
        metadataSummary: `${packet.title} ${format.toUpperCase()} exported without raw row contents in audit metadata.`,
      })
    ).catch(() => undefined);
    flash(`${packet.title} ${format.toUpperCase()} export ready.`);
  }

  async function finishAuthenticatedSession(nextSession: Session) {
    clearFailedLoginAttempts();
    setMfaResumeRequired(false);
    setSelectedCaseId(nextSession.caseId);

    if (recordsStorageMode === "supabase") {
      prepareForAccountBoundary();
      await reloadDataset();
    } else {
      updateDataset((current) =>
        withAudit(current, {
          userId: nextSession.userId,
          caseId: nextSession.caseId,
          action: "login",
          entityType: "session",
          entityId: "local-demo-session",
          metadataSummary: "Demo login recorded without custody details.",
        })
      );
    }

    setSession(nextSession);
    if (typeof window !== "undefined") {
      const next = pendingAttorneyNextPath();
      if (next) {
        window.location.replace(next);
      }
    }
    return { status: "complete" as const };
  }

  async function login(email: string, password: string, adultConfirmed: boolean): Promise<LoginFlowResult> {
    if (recordsStorageMode === "supabase") {
      const result = await signInRecordsSession(email, password, adultConfirmed);
      if (result.status === "mfa_required") {
        setMfaResumeRequired(true);
        return { status: "mfa_required" };
      }
      if (result.status === "mfa_enrollment_required") {
        return { status: "mfa_enrollment_required", enrollment: result.enrollment };
      }
      return finishAuthenticatedSession(result.session);
    }

    return finishAuthenticatedSession(writeSession(email));
  }

  function logout() {
    if (recordsStorageMode === "supabase") {
      prepareForAccountBoundary();
    }
    void signOutRecordsSession().catch(() => {
      if (typeof window !== "undefined") {
        window.location.replace("/records?auth=logout-warning");
      }
    });
    clearSession();
    setMfaResumeRequired(false);
    setSession(null);
  }

  if (!sessionChecked || (session && !hydrated)) {
    return <RecordsSessionLoadingScreen />;
  }

  if (!session) {
    return (
      <LoginScreen
        appReady={hydrated}
        mfaResumeRequired={mfaResumeRequired}
        onCancelMfa={logout}
        onLogin={login}
        onMfaVerified={finishAuthenticatedSession}
        recordsStorageMode={recordsStorageMode}
      />
    );
  }

  if (recordsStorageMode === "supabase" && storageError) {
    return (
      <RecordsLoadFailureScreen
        message={storageError}
        onRetry={() => void reloadDataset()}
        onLogout={logout}
      />
    );
  }

  return (
    <div className="records-app-shell min-h-screen bg-[#fffdf9] text-slate-950">
      <div className="records-app-grid grid min-h-screen lg:grid-cols-[288px_minmax(0,1fr)]">
        <aside className="overflow-hidden border-b border-slate-200 bg-[#fffdf9]/95 lg:border-b-0 lg:border-r lg:border-slate-200">
          <div className="flex flex-col p-4 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
              <Image
                src="/app-icons/icon-192.png"
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 rounded-md bg-slate-950 shadow-sm"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold tracking-tight text-slate-950">
                  {siteName}
                </p>
                <p className="mt-0.5 text-xs leading-4 text-slate-500">{recordsTagline}</p>
              </div>
            </div>

            <nav className="mt-5 hidden max-w-full rounded-xl border border-slate-200 bg-slate-50/80 p-2 lg:block lg:space-y-4 lg:overflow-visible lg:pb-4" aria-label="Records workspace">
              {navGroups.map((group) => (
                <div key={group.label} className="shrink-0">
                  <p className="mb-1 hidden border-b border-teal-200 px-2 pb-1 text-xs font-bold uppercase tracking-[0.14em] text-teal-700 lg:block">
                    {group.label}
                  </p>
                  <div className="flex gap-1 lg:grid">
                    {group.items.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => openView(item)}
                        className={`flex shrink-0 items-center justify-between gap-3 rounded-lg py-2.5 pl-5 pr-3 text-left text-sm font-medium transition lg:w-full ${
                          activeView === item
                            ? "bg-white text-teal-900 shadow-sm ring-1 ring-slate-200"
                            : "text-slate-600 hover:bg-white hover:text-slate-950"
                        }`}
                      >
                        <span>{activeViewLabel(item, terminology)}</span>
                        {item === "Files" && (
                          <span className={`rounded px-1.5 text-[11px] ${activeView === item ? "bg-teal-50 text-teal-900" : "bg-white text-slate-500"}`}>
                            {selected.evidenceItems.length}
                          </span>
                        )}
                        {item === "Timeline" && (
                          <span className={`rounded px-1.5 text-[11px] ${activeView === item ? "bg-teal-50 text-teal-900" : "bg-white text-slate-500"}`}>
                            {timelineEvents.length}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        <main className="records-workspace min-w-0 pb-[calc(env(safe-area-inset-bottom)+4.75rem)] lg:pb-0">
          <WorkspaceHeader
            activeViewTitle={activeViewLabel(activeView, terminology)}
            mobileOptionsOpen={mobileOptionsOpen}
            setMobileOptionsOpen={setMobileOptionsOpen}
            matters={selected.matters}
            selectedCaseId={effectiveCaseId}
            onSelectCase={selectCase}
            range={range}
            setRange={setRange}
            timezone={caseTimezone}
            onExport={() => openView("Reports")}
            onOpenSettings={() => openView("Settings")}
            onLogout={logout}
          />

          <div className="records-workspace-content space-y-5 px-4 py-5 lg:px-6">
            {billing.status?.entitlement.mode === "export_only" &&
            activeView !== "Subscription" ? (
              <div
                className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
                role="status"
              >
                Export-only access is active. You can view, export, download,
                delete, manage billing, and revoke attorney access.{" "}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => openView("Subscription")}
                >
                  Reactivate full access
                </button>{" "}
                to add or edit records.
              </div>
            ) : null}
            {toast && (
              <div
                role="status"
                aria-live="polite"
                className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-4 right-4 z-[60] rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-900 shadow-lg sm:bottom-4 sm:left-auto sm:max-w-md"
              >
                {toast}
              </div>
            )}
            {activeView === "Dashboard" && (
              <DashboardView
                range={range}
                calendarEvents={timelineEvents}
                evidenceCount={selected.evidenceItems.length}
                financialCount={selected.expenseItems.length + selected.childSupportPayments.length}
                onOpen={openView}
                terminology={terminology}
                timezone={caseTimezone}
              />
            )}
            {activeView === "Calendar" && (
              <CalendarView
                events={calendarViewEvents}
                custodyDayAssignments={selected.custodyDayAssignments}
                exchangeRules={selected.exchangeRules}
                updateDataset={workspaceUpdateDataset}
                userId={userId}
                caseId={effectiveCaseId}
                mode={calendarMode}
                setMode={setCalendarMode}
                calendarTask={calendarTask}
                setCalendarTask={setCalendarTask}
                selectedDay={selectedDay}
                setSelectedDay={setSelectedDay}
                calendarMonthKey={calendarMonthKey}
                setCalendarMonthKey={setCalendarMonthKey}
                timezone={caseTimezone}
                userRoleLabel={selected.matter?.userRoleLabel || "Parent A"}
                otherParentLabel={selected.matter?.otherParentLabel || "Parent B"}
                flash={flash}
              />
            )}
            {activeView === "Import" && (
              <ImportView
                updateDataset={workspaceUpdateDataset}
                userId={userId}
                caseId={effectiveCaseId}
                timezone={caseTimezone}
                recordsStorageMode={recordsStorageMode}
                flash={flash}
                onOpen={openView}
              />
            )}
            {activeView === "Timeline" && (
              <TimelineView
                events={timelineEvents}
                range={range}
                updateDataset={workspaceUpdateDataset}
                userId={userId}
                caseId={effectiveCaseId}
                flash={flash}
              />
            )}
            {activeView === "Exchanges" && (
              <ExchangesView
                updateDataset={workspaceUpdateDataset}
                userId={userId}
                caseId={effectiveCaseId}
                selected={selected}
                range={range}
                expectedExchanges={expectedExchanges}
                timezone={caseTimezone}
                sectionExport={sectionExportPackets.exchanges}
                onExportSection={exportSectionPacket}
                onOpenCalendar={openRecurringExchangeSchedule}
                flash={flash}
              />
            )}
            {activeView === "Notes" && (
              <NotesView
                updateDataset={workspaceUpdateDataset}
                userId={userId}
                caseId={effectiveCaseId}
                timezone={caseTimezone}
                notes={selected.dateNotes}
                communicationLabel={terminology.communication}
                flash={flash}
              />
            )}
            {(activeView === "Files" || activeView === "Screenshot PDFs") && (
              <EvidenceView
                mode={activeView === "Screenshot PDFs" ? "screenshots" : "files"}
                updateDataset={workspaceUpdateDataset}
                reloadDataset={reloadDataset}
                userId={userId}
                caseId={effectiveCaseId}
                timezone={caseTimezone}
                evidence={selected.evidenceItems}
                recordsStorageMode={recordsStorageMode}
                sectionExport={sectionExportPackets.evidence}
                onExportSection={exportSectionPacket}
                onOpenFiles={() => openView("Files")}
                flash={flash}
              />
            )}
            {activeView === "Child Support" && (
              <ChildSupportView
                updateDataset={workspaceUpdateDataset}
                userId={userId}
                caseId={effectiveCaseId}
                timezone={caseTimezone}
                orders={selected.childSupportOrders}
                payments={selected.childSupportPayments}
                obligations={supportObligations}
                historyObligations={supportHistoryObligations}
                supportRows={supportRows}
                supportStats={supportStats}
                flash={flash}
              />
            )}
            {activeView === "Expenses" && (
              <ExpensesView
                updateDataset={workspaceUpdateDataset}
                userId={userId}
                caseId={effectiveCaseId}
                expenses={selected.expenseItems}
                expenseStats={expenseStats}
                flash={flash}
              />
            )}
            {activeView === "Reports" && (
              <ReportsView
                reportType={reportType}
                setReportType={(nextReportType) => {
                  setReportType(nextReportType);
                  if (nextReportType === "full_profile_export") {
                    setRange(fullProfileDateRange(dataset, userId, effectiveCaseId));
                  }
                }}
                preview={reportPreview}
                userId={userId}
                caseId={effectiveCaseId}
                range={range}
                terminology={terminology}
                flash={flash}
                updateDataset={workspaceUpdateDataset}
              />
            )}
            {activeView === "Attorney Access" && (
              <AttorneyAccessPanel
                caseId={effectiveCaseId}
                cloudStorageEnabled={recordsStorageMode === "supabase"}
                clientName={selectedProfile?.displayName || ""}
                caseName={selectedCase?.caseName || ""}
                profileConfirmed={Boolean(selectedProfile?.attorneySharingProfileConfirmedAt)}
                onOpenProfileSetup={() => openView("Settings")}
              />
            )}
            {activeView === "Subscription" && (
              <SubscriptionPanel
                status={billing.status}
                loading={billing.loading}
                error={billing.error}
                refresh={billing.refresh}
                cloudStorageEnabled={recordsStorageMode === "supabase"}
              />
            )}
            {activeView === "Settings" && (
              <SettingsView
                dataset={dataset}
                updateDataset={workspaceUpdateDataset}
                resetDemoData={resetDemoData}
                selected={selected}
                userId={userId}
                caseId={effectiveCaseId}
                setSelectedCaseId={selectCase}
                logout={logout}
                flash={flash}
                storageStatus={storageStatus}
                recordsStorageMode={recordsStorageMode}
                onOpenAttorneyAccess={() => openView("Attorney Access")}
                billingStatus={billing.status}
                billingLoading={billing.loading}
                billingError={billing.error}
                onOpenSubscription={() => openView("Subscription")}
              />
            )}
          </div>
          <PolicyFooter compact className="no-print" recordsNote={recordsPrivacyNote} />
        </main>
        <MobileWorkspaceNav
          activeView={activeView}
          terminology={terminology}
          moreOpen={mobileNavOpen}
          setMoreOpen={setMobileNavOpen}
          onOpen={openView}
        />
      </div>
    </div>
  );
}

function MobileWorkspaceNav({
  activeView,
  terminology,
  moreOpen,
  setMoreOpen,
  onOpen,
}: {
  activeView: ActiveView;
  terminology: CaseTerminology;
  moreOpen: boolean;
  setMoreOpen: Dispatch<SetStateAction<boolean>>;
  onOpen: (view: ActiveView) => void;
}) {
  const directViews: ActiveView[] = ["Dashboard", "Import", "Timeline"];
  const moreIsActive = !directViews.includes(activeView);
  const mobileTabs: Array<{ view: ActiveView; label: string }> = [
    { view: "Dashboard", label: "Home" },
    { view: "Import", label: "Add" },
    { view: "Timeline", label: "Timeline" },
  ];

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close all workspace sections"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px]"
          />
          <section
            id="mobile-workspace-navigation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-workspace-navigation-title"
            className="absolute bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] left-3 right-3 max-h-[min(68vh,620px)] overflow-y-auto rounded-2xl border border-slate-200 bg-[#fffdf9] p-4 shadow-[0_22px_70px_rgba(15,23,42,0.24)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <h2 id="mobile-workspace-navigation-title" className="text-lg font-semibold tracking-tight text-slate-950">
                  All workspace sections
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Every existing record, financial, sharing, and account tool remains available.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600"
              >
                <span className="sr-only">Close navigation</span>
                <Cross2Icon className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {navGroups.map((group) => {
                const items = group.items.filter((item) => !directViews.includes(item));
                if (!items.length) return null;
                return (
                  <section key={group.label}>
                    <h3 className="px-1 text-xs font-bold uppercase tracking-[0.14em] text-teal-700">
                      {group.label}
                    </h3>
                    <div className="mt-1 grid gap-1">
                      {items.map((item) => {
                        const ItemIcon = activeViewIcons[item];
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => onOpen(item)}
                            className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition ${
                              activeView === item
                                ? "bg-teal-50 text-teal-950 ring-1 ring-teal-200"
                                : "bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-[#fffdf9] text-teal-700" aria-hidden="true">
                              <ItemIcon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">{activeViewLabel(item, terminology)}</span>
                            <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-400" />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

      <nav
        aria-label="Mobile workspace"
        className="fixed inset-x-0 bottom-0 z-50 grid h-[calc(env(safe-area-inset-bottom)+4.5rem)] grid-cols-4 border-t border-slate-200 bg-[#fffdf9]/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-8px_28px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden"
      >
        {mobileTabs.map(({ view, label }) => {
          const ItemIcon = activeViewIcons[view];
          const active = activeView === view && !moreOpen;
          return (
            <button
              key={view}
              type="button"
              aria-label={view === "Import" ? "Add records" : undefined}
              aria-current={active ? "page" : undefined}
              onClick={() => onOpen(view)}
              className={`flex min-h-11 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                active ? "text-teal-800" : "text-slate-500"
              }`}
            >
              {view === "Import" ? (
                <span className="-mt-4 grid h-12 w-12 place-items-center rounded-full bg-teal-700 text-white shadow-[0_5px_14px_rgba(15,118,110,0.25)]" aria-hidden="true">
                  <ItemIcon className="h-6 w-6" />
                </span>
              ) : (
                <ItemIcon className="h-5 w-5" />
              )}
              <span>{label}</span>
            </button>
          );
        })}
        <button
          type="button"
          aria-controls="mobile-workspace-navigation"
          aria-expanded={moreOpen}
          aria-current={moreIsActive && !moreOpen ? "page" : undefined}
          onClick={() => setMoreOpen((current) => !current)}
          className={`flex min-h-11 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            moreOpen || moreIsActive ? "text-teal-800" : "text-slate-500"
          }`}
        >
          <HamburgerMenuIcon className="h-5 w-5" />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}

function RecordsSessionLoadingScreen() {
  return (
    <main
      data-testid="records-session-loading"
      className="grid min-h-screen place-items-center bg-[#fffdf9] px-6 text-slate-950"
    >
      <div className="grid justify-items-center gap-4 text-center">
        <Image
          src="/app-icons/icon-192.png"
          alt=""
          width={64}
          height={64}
          className="h-16 w-16 rounded-xl bg-slate-950 shadow-sm"
          priority
        />
        <div>
          <p className="text-lg font-semibold">Opening your records</p>
          <p className="mt-1 text-sm text-slate-500">Restoring your secure session…</p>
        </div>
        <span
          aria-label="Loading records workspace"
          className="h-7 w-7 animate-spin rounded-full border-2 border-slate-300 border-t-teal-700"
        />
      </div>
    </main>
  );
}

function RecordsLoadFailureScreen({
  message,
  onRetry,
  onLogout,
}: {
  message: string;
  onRetry: () => void;
  onLogout: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col bg-[#fffdf9] text-slate-950">
      <section className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-10 sm:px-6">
        <div role="alert" className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Records workspace
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Unable to load records</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onRetry}
              className="min-h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-teal-500"
            >
              Sign out
            </button>
          </div>
        </div>
      </section>
      <PolicyFooter />
    </main>
  );
}

function LoginScreen({
  appReady,
  mfaResumeRequired,
  onCancelMfa,
  onLogin,
  onMfaVerified,
  recordsStorageMode,
}: {
  appReady: boolean;
  mfaResumeRequired: boolean;
  onCancelMfa: () => void;
  onLogin: (email: string, password: string, adultConfirmed: boolean) => Promise<LoginFlowResult>;
  onMfaVerified: (session: Session) => Promise<LoginFlowResult>;
  recordsStorageMode: "local" | "supabase";
}) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<LoginScreenMode>("login");
  const [submitting, setSubmitting] = useState(false);
  const [mfaMode, setMfaMode] = useState<"verify" | "enroll" | null>(null);
  const [mfaEnrollment, setMfaEnrollment] = useState<RecordsMfaEnrollment | null>(null);
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  const [recoveryHydrating, setRecoveryHydrating] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [invitedAttorneySignup, setInvitedAttorneySignup] = useState(false);
  const recoveryHandledRef = useRef(false);
  const minimumPasswordLength = 12;
  const publicSignupsEnabled =
    recordsStorageMode === "supabase" && process.env.NEXT_PUBLIC_RECORDS_SIGNUPS_ENABLED === "true";
  const signupsEnabled = publicSignupsEnabled || invitedAttorneySignup;

  useEffect(() => {
    if (recordsStorageMode !== "supabase" || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const isInvitedAttorney =
      params.get("next") === "/attorney/accept" && params.get("invite") === "1";
    setInvitedAttorneySignup(isInvitedAttorney);
    if (isInvitedAttorney && params.get("mode") === "signup") {
      setMode("signup");
    }
  }, [recordsStorageMode]);

  useEffect(() => {
    if (!mfaResumeRequired || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (params.has("auth") || hash.has("access_token")) return;

    setMode("login");
    setMfaMode("verify");
    setMfaEnrollment(null);
    setError("");
    setMessage("Your password was accepted. Enter the current code from your authenticator app.");
  }, [mfaResumeRequired]);

  useEffect(() => {
    if (recordsStorageMode !== "supabase" || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const authState = params.get("auth");
    const fragment = parseRecordsAuthFragment(window.location.hash, authState);
    const preserveAttorneyInvite =
      params.get("next") === "/attorney/accept" && params.get("invite") === "1";
    const confirmationPath = preserveAttorneyInvite
      ? "/records?auth=confirmed&next=%2Fattorney%2Faccept&invite=1"
      : "/records?auth=confirmed";
    const confirmationErrorPath = preserveAttorneyInvite
      ? "/records?auth=confirm-error&next=%2Fattorney%2Faccept&invite=1"
      : "/records?auth=confirm-error";

    if (fragment.kind === "attorney_invite") {
      if (recoveryHandledRef.current) return;
      recoveryHandledRef.current = true;
      window.history.replaceState(
        null,
        "",
        "/records?next=%2Fattorney&invite=1"
      );
      setRecoveryHydrating(true);
      setError("");
      setMessage("Verifying control of the invited email…");

      void acceptAttorneyInviteSession({
        accessToken: fragment.accessToken,
        refreshToken: fragment.refreshToken,
        expiresIn: fragment.expiresIn,
      })
        .then((result) => {
          if (result.status === "mfa_required") {
            setMfaEnrollment(null);
            setMode("login");
            setMfaMode("verify");
            setMessage("Invited email verified. Enter the current code from your authenticator app.");
            return;
          }
          if (result.status === "mfa_enrollment_required") {
            setMfaEnrollment(result.enrollment);
            setMode("login");
            setMfaMode("enroll");
            setMessage("Invited email verified. Protect the attorney account with an authenticator app.");
            return;
          }
          window.sessionStorage.setItem("l2f.attorney.access", result.accessHandle);
          setMessage("Invited email verified. Opening the shared read only case…");
          window.location.replace("/attorney");
        })
        .catch((inviteError: unknown) => {
          setMode("login");
          setError(
            inviteError instanceof Error
              ? inviteError.message
              : "Attorney account link is invalid or expired."
          );
        })
        .finally(() => setRecoveryHydrating(false));
      return;
    }

    if (fragment.kind === "confirmation") {
      window.history.replaceState(null, "", confirmationPath);
      setMode("login");
      setMessage("Email ownership confirmed. Sign in to complete the separate authenticator security step.");
      return;
    }

    if (fragment.kind === "error") {
      window.history.replaceState(null, "", confirmationErrorPath);
      setMode("login");
      setError("Confirmation link is invalid or expired.");
      return;
    }

    if (fragment.kind !== "recovery") {
      if (authState === "recovery") {
        setMode("update_password");
        setMessage("Choose a new password to finish account recovery.");
      } else if (authState === "confirmed") {
        setMessage("Email ownership confirmed. Sign in to complete the separate authenticator security step.");
      } else if (authState === "confirm-error") {
        setError("Confirmation link is invalid or expired.");
      } else if (authState === "logout-warning") {
        setError(
          "You were signed out on this device, but server sign-out could not be confirmed. Check your connection before signing in again."
        );
      }
      return;
    }

    if (recoveryHandledRef.current) return;
    recoveryHandledRef.current = true;
    window.history.replaceState(null, "", "/records?auth=recovery");
    setMode("update_password");
    setRecoveryHydrating(true);
    setError("");
    setMessage("Preparing password recovery.");

    void acceptRecordsRecoverySession({
      accessToken: fragment.accessToken,
      refreshToken: fragment.refreshToken,
      expiresIn: fragment.expiresIn,
    })
      .then(() => {
        setMessage("Choose a new password to finish account recovery.");
      })
      .catch((recoveryError: unknown) => {
        window.history.replaceState(null, "", "/records?auth=confirm-error");
        setError(recoveryError instanceof Error ? recoveryError.message : "Recovery link is invalid or expired.");
      })
      .finally(() => setRecoveryHydrating(false));
  }, [recordsStorageMode]);

  function qrCodeSrc(qrCode: string) {
    if (qrCode.startsWith("data:image/")) return qrCode;
    return `data:image/svg+xml;utf-8,${encodeURIComponent(qrCode)}`;
  }

  function switchMode(nextMode: LoginScreenMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
    setMfaMode(null);
    setMfaEnrollment(null);
    setShowLoginPassword(false);
  }

  async function onLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!appReady) return;

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const adultConfirmed = formData.get("adult") === "on";

    if (!adultConfirmed || !email.includes("@") || !password) {
      setError("Enter your email, password, and confirm adult use.");
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const result = await onLogin(email, password, adultConfirmed);
      if (result.status === "mfa_required") {
        setMfaMode("verify");
        setMfaEnrollment(null);
      }
      if (result.status === "mfa_enrollment_required") {
        setMfaMode("enroll");
        setMfaEnrollment(result.enrollment);
      }
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSignupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");
    const adultConfirmed = formData.get("adult") === "on";
    const legalAccepted = formData.get("legal") === "on";

    if (
      !adultConfirmed ||
      !legalAccepted ||
      !email.includes("@") ||
      password.length < minimumPasswordLength
    ) {
      setError(
        invitedAttorneySignup
          ? `Enter the invited email, confirm adult use, accept the Terms and Privacy Policy, and use at least ${minimumPasswordLength} characters.`
          : `Enter an email, confirm adult use, accept the Terms and Privacy Policy, and use at least ${minimumPasswordLength} characters.`
      );
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const result = await signUpRecordsAccount(
        email,
        password,
        adultConfirmed,
        legalAccepted,
        invitedAttorneySignup
      );
      setMessage(result.message);
      setMode("login");
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : "Account creation failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onResetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const adultConfirmed = formData.get("adult") === "on";

    if (!adultConfirmed || !email.includes("@")) {
      setError("Enter your email and confirm adult use.");
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const result = await requestRecordsPasswordReset(email, adultConfirmed);
      setMessage(result.message);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Password reset failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onResendConfirmationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const adultConfirmed = formData.get("adult") === "on";

    if (!adultConfirmed || !email.includes("@")) {
      setError("Enter your email and confirm adult use.");
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const result = await resendRecordsSignupConfirmation(email, adultConfirmed);
      setMessage(result.message);
    } catch (resendError) {
      setError(
        resendError instanceof Error ? resendError.message : "Confirmation email could not be resent."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onPasswordUpdateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    if (password.length < minimumPasswordLength) {
      setError(`Use at least ${minimumPasswordLength} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const result = await updateRecordsPassword(password);
      window.history.replaceState(
        null,
        "",
        invitedAttorneySignup
          ? "/records?next=%2Fattorney%2Faccept&invite=1"
          : "/records"
      );
      clearSession();
      setMessage(result.message);
      setMode("login");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Password update failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onMfaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const code = String(formData.get("code") || "").trim();
    setMfaSubmitting(true);
    setError("");

    try {
      const session =
        mfaMode === "enroll"
          ? await verifyRecordsMfaEnrollment({
              factorId: mfaEnrollment?.factorId || "",
              code,
            })
          : await verifyRecordsMfa(code);
      await onMfaVerified(session);
    } catch (mfaError) {
      setError(mfaError instanceof Error ? mfaError.message : "Authenticator code was not accepted.");
    } finally {
      setMfaSubmitting(false);
    }
  }

  const heading = mfaMode
    ? mfaMode === "enroll"
      ? "Set up authenticator"
      : "Verify authenticator"
    : mode === "signup"
      ? invitedAttorneySignup ? "Create invited attorney account" : "Create account"
      : mode === "resend_confirmation"
        ? "Resend confirmation"
      : mode === "reset"
        ? "Reset password"
        : mode === "update_password"
          ? "Choose new password"
          : "Sign in";

  return (
    <main className="min-h-screen overflow-hidden bg-[#fffdf9] text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <Image
              src="/app-icons/icon-192.png"
              alt=""
              width={40}
              height={40}
              priority
              className="h-10 w-10 shrink-0 rounded-md bg-slate-950 shadow-sm"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold tracking-tight text-slate-950">
                {siteName}
              </span>
              <span className="block text-xs leading-4 text-slate-500">
                {recordsTagline}
              </span>
            </span>
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-12 lg:py-8">
          <section className="order-2 flex max-w-3xl flex-col justify-center lg:order-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
              Private records workspace
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
              {siteName}
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-7 text-slate-600 sm:text-xl sm:leading-8">
              Turn custody notes, exchanges, files, and reports into a clear record you can actually use.
            </p>

            <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-500">
              Built for adult recordkeeping. Records stay private in your account, and you choose what to export.
            </p>
          </section>

          <section className="order-1 self-center rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)] sm:p-8 lg:order-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
              Account access
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{heading}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Organize your custody data into clear records so you can understand patterns, work toward your desired outcomes, and protect yourself with better documentation.
            </p>

            {invitedAttorneySignup ? (
              <p className="mt-4 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm leading-6 text-teal-950">
                Use the exact email address named in the private attorney invitation. Create the account here, then sign in and complete authenticator verification. Custody Folio will not send another invitation email.
              </p>
            ) : null}

            {mfaMode ? (
              <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                {invitedAttorneySignup
                  ? "The private invitation and account password establish this attorney account. This authenticator code is a separate second factor that protects shared records if the password is compromised."
                  : "Email confirmation proves you control the account address. This authenticator code is a separate second factor that protects custody records if the password or email account is compromised."}
              </p>
            ) : null}

            {message && (
              <div className="mt-4 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-900">
                {message}
              </div>
            )}

            {mfaMode ? (
              <form method="post" onSubmit={onMfaSubmit} className="mt-5 space-y-4">
                {mfaMode === "enroll" && mfaEnrollment && (
                  <div className="rounded-md border border-slate-200 bg-white p-4">
                    {/* The authenticator provider returns this as a data URL; a plain img avoids Next image SVG/data URL rewriting. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt="Authenticator QR code"
                      className="mx-auto size-44"
                      height={176}
                      src={qrCodeSrc(mfaEnrollment.qrCode)}
                      width={176}
                    />
                    <Field label="Setup key">
                      <input className="input font-mono text-xs" value={mfaEnrollment.secret} readOnly />
                    </Field>
                  </div>
                )}
                <Field label="Authenticator code">
                  <input
                    name="code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="input"
                    autoComplete="one-time-code"
                  />
                </Field>
                {error && <p className="text-sm font-medium text-red-700">{error}</p>}
                <button
                  type="submit"
                  disabled={mfaSubmitting}
                  className="min-h-11 w-full rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  {mfaSubmitting ? "Verifying..." : "Verify authenticator"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCancelMfa();
                    switchMode("login");
                  }}
                  className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-teal-500"
                >
                  Use a different account
                </button>
                <p className="text-xs leading-5 text-slate-500">
                  Lost authenticator access? Email{" "}
                  <a href={supportMailto} className="font-semibold text-teal-700 hover:text-teal-900">
                    {supportEmail}
                  </a>{" "}
                  for manual account recovery.
                </p>
              </form>
            ) : mode === "reset" ? (
              <form method="post" onSubmit={onResetSubmit} className="mt-5 space-y-4">
                <Field label="Email">
                  <input
                    name="email"
                    type="email"
                    className="input"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </Field>
                <label className="flex items-start gap-2 text-sm leading-5 text-slate-700">
                  <input name="adult" type="checkbox" className="mt-1" />
                  <span>I am an adult user requesting access to my own records account.</span>
                </label>
                {error && <p className="text-sm font-medium text-red-700">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-10 w-full rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  {submitting ? "Sending..." : "Send reset link"}
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-teal-500"
                >
                  Back to sign in
                </button>
              </form>
            ) : mode === "resend_confirmation" ? (
              <form method="post" onSubmit={onResendConfirmationSubmit} className="mt-5 space-y-4">
                <Field label="Email">
                  <input
                    name="email"
                    type="email"
                    className="input"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </Field>
                <label className="flex items-start gap-2 text-sm leading-5 text-slate-700">
                  <input name="adult" type="checkbox" className="mt-1" />
                  <span>I am an adult user requesting access to my own records account.</span>
                </label>
                {error && <p className="text-sm font-medium text-red-700">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-11 w-full rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  {submitting ? "Sending..." : "Send new confirmation link"}
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-teal-500"
                >
                  Back to sign in
                </button>
              </form>
            ) : mode === "signup" ? (
              <form method="post" onSubmit={onSignupSubmit} className="mt-5 space-y-4">
                <Field label="Email">
                  <input
                    name="email"
                    type="email"
                    className="input"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </Field>
                <Field label="Password">
                  <input name="password" type="password" className="input" autoComplete="new-password" />
                </Field>
                <Field label="Confirm password">
                  <input
                    name="confirmPassword"
                    type="password"
                    className="input"
                    autoComplete="new-password"
                  />
                </Field>
                <label className="flex items-start gap-2 text-sm leading-5 text-slate-700">
                  <input name="adult" type="checkbox" className="mt-1" />
                  <span>
                    {invitedAttorneySignup
                      ? "I am the adult attorney invited to this read-only case."
                      : "I am an adult user and will use privacy minded labels for sensitive records."}
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm leading-5 text-slate-700">
                  <input name="legal" type="checkbox" className="mt-1" />
                  <span>
                    I agree to the{" "}
                    <Link href="/terms" className="font-semibold text-teal-700 underline underline-offset-2">
                      Terms of Use
                    </Link>{" "}
                    and acknowledge the{" "}
                    <Link href="/privacy" className="font-semibold text-teal-700 underline underline-offset-2">
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>
                {error && <p className="text-sm font-medium text-red-700">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-11 w-full rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  {submitting
                    ? "Creating..."
                    : invitedAttorneySignup ? "Create attorney account" : "Create account"}
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-teal-500"
                >
                  Back to sign in
                </button>
              </form>
            ) : mode === "update_password" ? (
              <form method="post" onSubmit={onPasswordUpdateSubmit} className="mt-5 space-y-4">
                <Field label="New password">
                  <input
                    name="password"
                    type="password"
                    className="input"
                    autoComplete="new-password"
                    disabled={recoveryHydrating}
                  />
                </Field>
                <Field label="Confirm new password">
                  <input
                    name="confirmPassword"
                    type="password"
                    className="input"
                    autoComplete="new-password"
                    disabled={recoveryHydrating}
                  />
                </Field>
                {error && <p className="text-sm font-medium text-red-700">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting || recoveryHydrating}
                  className="min-h-11 w-full rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  {recoveryHydrating ? "Preparing..." : submitting ? "Saving..." : "Update password"}
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-teal-500"
                >
                  Back to sign in
                </button>
              </form>
            ) : (
              <form method="post" onSubmit={onLoginSubmit} className="mt-5 space-y-4">
                <Field label="Email">
                  <input
                    name="email"
                    type="email"
                    defaultValue={recordsStorageMode === "local" ? "parent-a@example.test" : ""}
                    className="input"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </Field>
                <div className="grid gap-1.5 text-sm font-medium text-slate-700">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="records-login-password">Password</label>
                    <button
                      type="button"
                      aria-controls="records-login-password"
                      aria-pressed={showLoginPassword}
                      onClick={() => setShowLoginPassword((current) => !current)}
                      className="text-xs font-semibold text-teal-700 hover:text-teal-900"
                    >
                      {showLoginPassword ? "Hide password" : "Show password"}
                    </button>
                  </div>
                  <input
                    id="records-login-password"
                    name="password"
                    type={showLoginPassword ? "text" : "password"}
                    defaultValue={recordsStorageMode === "local" ? "demo-password" : ""}
                    className="input"
                    autoCapitalize="none"
                    autoComplete="current-password"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
                <label className="flex items-start gap-2 text-sm leading-5 text-slate-700">
                  <input name="adult" type="checkbox" className="mt-1" />
                  <span>
                    I am an adult user and, by signing in, agree to the current{" "}
                    <Link href="/terms" className="font-semibold text-teal-700 underline underline-offset-2">
                      Terms of Use
                    </Link>{" "}
                    and acknowledge the{" "}
                    <Link href="/privacy" className="font-semibold text-teal-700 underline underline-offset-2">
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>
                {error && (
                  <div role="alert" className="space-y-1 text-sm text-red-700">
                    <p className="font-medium">{error}</p>
                    {error === "Invalid email or password." && (
                      <p className="text-xs leading-5 text-slate-600">
                        Password AutoFill may have saved an older value. Verify it with Show password or use Forgot password.
                      </p>
                    )}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={!appReady || submitting}
                  className="min-h-11 w-full rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  {!appReady ? "Loading workspace..." : submitting ? "Signing in..." : "Enter records workspace"}
                </button>
                {recordsStorageMode === "supabase" && (
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm">
                    <button
                      type="button"
                      onClick={() => switchMode("reset")}
                      className="font-semibold text-teal-700 hover:text-teal-900"
                    >
                      Forgot password?
                    </button>
                    {signupsEnabled && (
                      <>
                        {publicSignupsEnabled ? (
                          <button
                            type="button"
                            onClick={() => switchMode("resend_confirmation")}
                            className="font-semibold text-teal-700 hover:text-teal-900"
                          >
                            Resend confirmation
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => switchMode("signup")}
                          className="font-semibold text-teal-700 hover:text-teal-900"
                        >
                          Create account
                        </button>
                      </>
                    )}
                  </div>
                )}
              </form>
            )}
          </section>
        </section>

        <PolicyFooter className="-mx-4 mt-auto sm:-mx-6 lg:-mx-8" />
      </div>
    </main>
  );
}

function DashboardView({
  range,
  calendarEvents,
  evidenceCount,
  financialCount,
  onOpen,
  terminology,
  timezone,
}: {
  range: DateRange;
  calendarEvents: CalendarEvent[];
  evidenceCount: number;
  financialCount: number;
  onOpen: (view: ActiveView) => void;
  terminology: CaseTerminology;
  timezone: string;
}) {
  const visibleEvents = calendarEvents.filter(isTimelineVisibleEvent);
  const dashboardEvents = visibleEvents.filter(
    (event) =>
      event.type !== "child_support_due" &&
      event.type !== "child_support_paid" &&
      event.type !== "expense_item"
  );
  const stats = buildDashboardTimelineStats(dashboardEvents);
  const parentingTimeCount = dashboardEvents.filter(
    (event) => event.type === "scheduled_exchange" || event.type === "logged_exchange"
  ).length;
  const communicationCount = stats.noFaceTimeCount + stats.postCallNoFaceTimeCount;
  const todayLabel = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: timezone,
    year: "numeric",
  }).format(new Date());
  return (
    <div className="space-y-5">
      <section aria-label="Quick tools">
        <div className="flex items-start justify-between gap-4">
          <h2 className="max-w-2xl text-[1.7rem] font-semibold leading-[1.12] tracking-[-0.035em] text-slate-950 sm:text-3xl">
            Organize your custody records with clarity and confidence.
          </h2>
          <time className="shrink-0 pt-1 text-xs text-slate-500" suppressHydrationWarning>
            {todayLabel}
          </time>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr]">
          <button
            type="button"
            onClick={() => onOpen("Import")}
            className="flex min-h-24 items-center gap-4 rounded-xl bg-[#247f79] p-5 text-left text-white shadow-[0_9px_24px_rgba(36,127,121,0.18)] transition hover:bg-[#176b67] focus:outline-none focus:ring-2 focus:ring-teal-200"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-white" aria-hidden="true">
              <PlusIcon className="h-7 w-7" />
            </span>
            <span className="min-w-0">
              <span className="block text-xl font-semibold leading-6">Add a record</span>
              <span className="mt-1 block text-sm leading-5 text-teal-50">
                Start with the basics. You can add more detail later.
              </span>
            </span>
          </button>

          <div className="space-y-2 lg:contents">
            <h3 className="pt-3 text-sm font-semibold text-slate-950 lg:hidden">Other actions</h3>
            <button
              type="button"
              onClick={() => onOpen("Screenshot PDFs")}
              className="flex min-h-20 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-slate-200 bg-[#fffdf9] text-teal-700" aria-hidden="true">
                <ArchiveIcon className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-950">Build a PDF</span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">
                  Arrange screenshots into a clean, printable PDF.
                </span>
              </span>
              <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
            </button>
            <button
              type="button"
              onClick={() => onOpen("Attorney Access")}
              className="flex min-h-20 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-slate-200 bg-[#fffdf9] text-teal-700" aria-hidden="true">
                <IdCardIcon className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-950">Share with an attorney</span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">
                  Create or revoke read-only access whenever you choose.
                </span>
              </span>
              <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-400" />
            </button>
          </div>
        </div>
      </section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Your overview</h2>
          <p className="mt-1 text-sm text-slate-600">A quick view of what you recorded in this date range.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => onOpen("Settings")}>Customize labels</button>
      </div>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Recent records" value={stats.timelineCount} detail={`${range.from} to ${range.to}`} />
        <StatCard label={terminology.parentingTime} value={parentingTimeCount} detail="Schedule and exchange records" tone="amber" />
        <StatCard label={terminology.communication} value={communicationCount} detail="Calls, messages, and follow-ups" tone="slate" />
        <StatCard label={terminology.filesEvidence} value={evidenceCount} detail="Files saved to this case" />
        <StatCard label={terminology.financialRecords} value={financialCount} detail="Expenses and support payments" tone="slate" />
      </section>

      <section>
        <Panel title="Recent activity" action={`${dashboardEvents.length} records`}>
          <Timeline events={dashboardEvents} emptyLabel="No timeline records in this date range." />
        </Panel>
      </section>
      <p className="flex min-h-11 items-center justify-center gap-2 text-xs text-slate-500">
        <LockClosedIcon className="h-4 w-4 text-teal-700" aria-hidden="true" />
        Your records are private by default.
      </p>
    </div>
  );
}

function CalendarView({
  events,
  custodyDayAssignments,
  exchangeRules,
  updateDataset,
  userId,
  caseId,
  mode,
  setMode,
  calendarTask,
  setCalendarTask,
  selectedDay,
  setSelectedDay,
  calendarMonthKey,
  setCalendarMonthKey,
  timezone,
  userRoleLabel,
  otherParentLabel,
  flash,
}: {
  events: CalendarEvent[];
  custodyDayAssignments: CustodyDayAssignment[];
  exchangeRules: ReturnType<typeof useSelectedRecords>["exchangeRules"];
  updateDataset: ReturnType<typeof useRecordsStore>["updateDataset"];
  userId: string;
  caseId: string;
  mode: "month" | "list" | "timeline";
  setMode: (mode: "month" | "list" | "timeline") => void;
  calendarTask: "view" | "edit";
  setCalendarTask: (task: "view" | "edit") => void;
  selectedDay: string;
  setSelectedDay: (day: string) => void;
  calendarMonthKey: string;
  setCalendarMonthKey: (monthKey: string) => void;
  timezone: string;
  userRoleLabel: string;
  otherParentLabel: string;
  flash: (message: string) => void;
}) {
  const monthKey = monthKeyFromDate(`${calendarMonthKey}-01`, timezone);
  const monthRange = getMonthBounds(monthKey, timezone);
  const monthDays = buildMonthDays(monthKey);
  const today = formatLocalDate(new Date(), timezone);
  const [paintCaregiverLabel, setPaintCaregiverLabel] = useState(userRoleLabel);
  const [paintColor, setPaintColor] = useState<(typeof custodyDayColors)[number] | string>(
    custodyDayColors[0]
  );
  const [rangeDraftState, setRangeDraftState] = useState<{
    sourceDay: string;
    startDate: string;
    endDate: string;
    caregiverLabel: string;
    color: string;
    exchangeBoundary: "none" | "start" | "end" | "both";
  }>(() => ({
    sourceDay: "",
    startDate: selectedDay,
    endDate: selectedDay,
    caregiverLabel: userRoleLabel,
    color: custodyDayColors[0],
    exchangeBoundary: "none",
  }));
  const [multiDayPaintEnabled, setMultiDayPaintEnabled] = useState(false);
  const [isPainting, setIsPainting] = useState(false);
  const [paintDraftDates, setPaintDraftDates] = useState<Set<string>>(() => new Set());
  const [paintSelectionDates, setPaintSelectionDates] = useState<Set<string>>(() => new Set());
  const [optimisticPaintAssignments, setOptimisticPaintAssignments] = useState<CustodyDayAssignment[]>([]);
  const paintingRef = useRef(false);
  const paintAnchorDateRef = useRef<string | null>(null);
  const activePaintPointerIdRef = useRef<number | null>(null);
  const paintDraftDatesRef = useRef<Set<string>>(new Set());
  const paintSelectionDatesRef = useRef<Set<string>>(new Set());
  const paintMovedRef = useRef(false);
  const suppressNextCalendarClickRef = useRef(false);
  const visibleEvents = useMemo(() => events.filter(isTimelineVisibleEvent), [events]);
  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const event of visibleEvents) {
    eventsByDate.set(event.date, [...(eventsByDate.get(event.date) || []), event]);
  }
  const custodyDayMap = buildCustodyDayMap(custodyDayAssignments, monthRange);
  const optimisticCustodyDayMap = buildCustodyDayMap(optimisticPaintAssignments, monthRange);
  const selectedAssignment = optimisticCustodyDayMap.get(selectedDay) || custodyDayMap.get(selectedDay);
  const dayEvents = eventsByDate.get(selectedDay) || [];
  const caregiverOptions = Array.from(
    new Set([
      userRoleLabel,
      otherParentLabel,
      "Alternate caregiver",
      ...custodyDayAssignments.map((item) => item.caregiverLabel),
    ])
  ).filter(Boolean);
  const rangeDraft =
    rangeDraftState.sourceDay === selectedDay
      ? rangeDraftState
      : {
          sourceDay: selectedDay,
          startDate: selectedDay,
          endDate: selectedDay,
          caregiverLabel: selectedAssignment?.caregiverLabel || userRoleLabel,
          color:
            selectedAssignment?.color ||
            calendarColorForCaregiver(
              selectedAssignment?.caregiverLabel || userRoleLabel,
              userRoleLabel,
              otherParentLabel,
              custodyDayAssignments
            ),
          exchangeBoundary:
            selectedAssignment?.exchangeTime || selectedAssignment?.exchangeDirection
              ? ("start" as const)
              : ("none" as const),
        };
  const {
    startDate: rangeStartDate,
    endDate: rangeEndDate,
    caregiverLabel: rangeCaregiverLabel,
    color: rangeColor,
    exchangeBoundary,
  } = rangeDraft;

  function showCalendarMonth(nextMonthKey: string) {
    const nextRange = getMonthBounds(nextMonthKey, timezone);
    setCalendarMonthKey(nextMonthKey);
    setSelectedDay(nextRange.from);
  }

  function showCurrentMonth() {
    const nextMonthKey = currentMonthKey(new Date(), timezone);
    setCalendarMonthKey(nextMonthKey);
    setSelectedDay(formatLocalDate(new Date(), timezone));
  }

  const setPaintDraft = useCallback((dates: Set<string>) => {
    paintDraftDatesRef.current = dates;
    setPaintDraftDates(dates);
  }, []);

  const setPaintSelection = useCallback((dates: Set<string>) => {
    paintSelectionDatesRef.current = dates;
    setPaintSelectionDates(dates);
  }, []);

  const buildPaintDateRange = useCallback((from: string, to: string) => {
    const delta = daysBetween(from, to);
    if (delta === null) return [to];
    const direction = delta >= 0 ? 1 : -1;
    return Array.from({ length: Math.abs(delta) + 1 }, (_, index) =>
      addDays(from, index * direction)
    );
  }, []);

  const applyCustodyDayPaint = useCallback(
    (dates: string[]) => {
      const uniqueDates = Array.from(new Set(dates)).sort();
      if (uniqueDates.length === 0) return;

      const caregiverLabel = paintCaregiverLabel.trim() || userRoleLabel;
      const parsedPaint = custodyDayAssignmentSchema.safeParse({
        date: uniqueDates[0],
        caregiverLabel,
        color: paintColor,
        startsAt: "00:00",
        endsAt: "23:59",
        exchangeTime: "",
        exchangeDirection: "",
        exchangeLocation: "",
        notes: "",
      });

      if (!parsedPaint.success) {
        flash(parsedPaint.error.issues[0]?.message || "Check the calendar color.");
        return;
      }

      const now = nowIso();
      const targetDates = new Set(uniqueDates);
      const optimisticAssignments = uniqueDates.map((date) => ({
        id: createId("custody-day-optimistic"),
        caseId,
        userId,
        date,
        caregiverLabel,
        color: parsedPaint.data.color,
        startsAt: "00:00",
        endsAt: "23:59",
        createdAt: now,
        updatedAt: now,
      })) satisfies CustodyDayAssignment[];

      setOptimisticPaintAssignments((current) => [
        ...optimisticAssignments,
        ...current.filter(
          (item) =>
            item.userId !== userId ||
            item.caseId !== caseId ||
            !targetDates.has(item.date)
        ),
      ]);

      void updateDataset((current) => {
        const existingByDate = new Map(
          current.custodyDayAssignments
            .filter((item) => item.userId === userId && item.caseId === caseId)
            .map((item) => [item.date, item])
        );
        const paintedAssignments = uniqueDates.map((date) => {
          const existing = existingByDate.get(date);
          return {
            ...existing,
            id: existing?.id || createId("custody-day"),
            caseId,
            userId,
            date,
            caregiverLabel,
            color: parsedPaint.data.color,
            startsAt: existing?.startsAt || "00:00",
            endsAt: existing?.endsAt || "23:59",
            exchangeTime: existing?.exchangeTime,
            exchangeDirection: existing?.exchangeDirection,
            exchangeLocation: existing?.exchangeLocation,
            notes: existing?.notes,
            createdAt: existing?.createdAt || now,
            updatedAt: now,
          } satisfies CustodyDayAssignment;
        });

        const retainedAssignments = current.custodyDayAssignments.filter(
          (item) =>
            item.userId !== userId ||
            item.caseId !== caseId ||
            !targetDates.has(item.date)
        );

        return withAudit(
          {
            ...current,
            custodyDayAssignments: [...paintedAssignments, ...retainedAssignments],
          },
          {
            userId,
            caseId,
            action: "updated",
            entityType: "custodyDayAssignment",
            entityId: uniqueDates.length === 1 ? paintedAssignments[0].id : "calendar-drag-paint",
            metadataSummary:
              uniqueDates.length === 1
                ? "Custody day color assignment painted without child names."
                : `${uniqueDates.length} custody day color assignments painted without child names.`,
          }
        );
      }).catch((error: unknown) => {
        setOptimisticPaintAssignments((current) =>
          current.filter(
            (item) =>
              item.userId !== userId ||
              item.caseId !== caseId ||
              !targetDates.has(item.date)
          )
        );
        flash(error instanceof Error ? error.message : "Calendar color save failed.");
      });

      setSelectedDay(uniqueDates[uniqueDates.length - 1]);
      flash(uniqueDates.length === 1 ? "Custody day color saved." : `${uniqueDates.length} custody days colored.`);
    },
    [caseId, flash, paintCaregiverLabel, paintColor, setSelectedDay, updateDataset, userId, userRoleLabel]
  );

  const extendPaint = useCallback(
    (day: string) => {
      if (!paintingRef.current) return;
      const anchorDay = paintAnchorDateRef.current || day;
      const nextDates = new Set(buildPaintDateRange(anchorDay, day));
      if (day !== anchorDay) paintMovedRef.current = true;
      const currentDates = paintDraftDatesRef.current;
      if (
        currentDates.size === nextDates.size &&
        Array.from(nextDates).every((date) => currentDates.has(date))
      ) {
        return;
      }
      setSelectedDay(day);
      setPaintDraft(nextDates);
      setPaintSelection(nextDates);
    },
    [buildPaintDateRange, setPaintDraft, setPaintSelection, setSelectedDay]
  );

  const finishPaint = useCallback(
    (event?: globalThis.PointerEvent) => {
      if (!paintingRef.current) return;
      if (
        event &&
        activePaintPointerIdRef.current !== null &&
        event.pointerId !== activePaintPointerIdRef.current
      ) {
        return;
      }

      paintingRef.current = false;
      paintAnchorDateRef.current = null;
      activePaintPointerIdRef.current = null;
      setIsPainting(false);
      const dates = Array.from(paintDraftDatesRef.current);
      suppressNextCalendarClickRef.current = dates.length > 0;
      setPaintDraft(new Set());
      setPaintSelection(new Set(dates));
      if (paintMovedRef.current || dates.length > 1) {
        applyCustodyDayPaint(dates);
      }
      paintMovedRef.current = false;
    },
    [applyCustodyDayPaint, setPaintDraft, setPaintSelection]
  );

  useEffect(() => {
    function handlePointerMove(event: globalThis.PointerEvent) {
      if (!paintingRef.current) return;
      if (
        activePaintPointerIdRef.current !== null &&
        event.pointerId !== activePaintPointerIdRef.current
      ) {
        return;
      }
      event.preventDefault();
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const day = target instanceof Element
        ? target.closest<HTMLElement>("[data-calendar-day]")?.dataset.calendarDay
        : undefined;
      if (day) extendPaint(day);
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishPaint);
    window.addEventListener("pointercancel", finishPaint);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishPaint);
      window.removeEventListener("pointercancel", finishPaint);
    };
  }, [extendPaint, finishPaint]);

  function beginPaint(day: string, event: ReactPointerEvent<HTMLButtonElement>) {
    if (!multiDayPaintEnabled) return;
    event.preventDefault();
    suppressNextCalendarClickRef.current = false;
    paintingRef.current = true;
    paintAnchorDateRef.current = day;
    activePaintPointerIdRef.current = event.pointerId;
    paintMovedRef.current = false;
    setIsPainting(true);
    setSelectedDay(day);
    setPaintDraft(new Set([day]));
    setPaintSelection(new Set([day]));
  }

  function toggleMultiDayPaint() {
    setMultiDayPaintEnabled((enabled) => {
      if (enabled) clearPaintSelection();
      return !enabled;
    });
  }

  function handleCalendarDayClick(day: string) {
    if (suppressNextCalendarClickRef.current) {
      suppressNextCalendarClickRef.current = false;
      return;
    }
    setSelectedDay(day);
  }

  function applySelectedPaintDates() {
    const dates = Array.from(paintSelectionDatesRef.current);
    if (dates.length === 0) {
      flash("Select one or more calendar days first.");
      return;
    }
    applyCustodyDayPaint(dates);
  }

  function clearPaintSelection() {
    setPaintDraft(new Set());
    setPaintSelection(new Set());
    paintingRef.current = false;
    paintAnchorDateRef.current = null;
    activePaintPointerIdRef.current = null;
    paintMovedRef.current = false;
    setIsPainting(false);
  }

  async function saveCustodyDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const startDate = text(formData, "startDate");
    const endDate = text(formData, "endDate");
    const selectedExchangeBoundary = text(formData, "exchangeBoundary") as
      | "none"
      | "start"
      | "end"
      | "both";
    const hasExchange = selectedExchangeBoundary !== "none";
    const exchangeTime = hasExchange ? text(formData, "exchangeTime") : "";
    const exchangeDirection = hasExchange ? text(formData, "exchangeDirection") : "";
    const exchangeLocation = hasExchange ? text(formData, "exchangeLocation") : "";
    const caregiverLabel = text(formData, "caregiverLabel");
    const color = rangeColor;
    const parsed = custodyDayAssignmentSchema.safeParse({
      date: startDate,
      caregiverLabel,
      color,
      startsAt: "00:00",
      endsAt: "23:59",
      exchangeTime,
      exchangeDirection,
      exchangeLocation,
      notes: text(formData, "notes"),
    });
    if (!parsed.success) return flash(parsed.error.issues[0]?.message || "Check the custody day form.");
    const parsedEndDate = custodyDayAssignmentSchema.safeParse({
      ...parsed.data,
      date: endDate,
    });
    if (!parsedEndDate.success) {
      return flash(parsedEndDate.error.issues[0]?.message || "Choose a valid end date.");
    }
    if (endDate < startDate) {
      return flash("End date must be the same as or after the start date.");
    }
    if (hasExchange && !exchangeTime) {
      return flash("Choose an exchange time.");
    }
    if (hasExchange && !exchangeDirection) {
      return flash("Choose an exchange direction.");
    }

    const dates = buildPaintDateRange(startDate, endDate);
    const targetDates = new Set(dates);
    const exchangeDates = new Set<string>();
    if (selectedExchangeBoundary === "start" || selectedExchangeBoundary === "both") {
      exchangeDates.add(startDate);
    }
    if (selectedExchangeBoundary === "end" || selectedExchangeBoundary === "both") {
      exchangeDates.add(endDate);
    }
    try {
      await updateDataset((current) => {
        const existingByDate = new Map(
          current.custodyDayAssignments
            .filter((item) => item.userId === userId && item.caseId === caseId)
            .map((item) => [item.date, item])
        );
        const nextData = emptyToUndefined(parsed.data);
        const updatedAt = nowIso();
        const nextAssignments = dates.map((date) => {
          const existing = existingByDate.get(date);
          const isExchangeDay = exchangeDates.has(date);
          return {
            id: existing?.id || createId("custody-day"),
            caseId,
            userId,
            createdAt: existing?.createdAt || updatedAt,
            updatedAt,
            date,
            caregiverLabel: nextData.caregiverLabel,
            color: nextData.color,
            startsAt: "00:00",
            endsAt: "23:59",
            exchangeTime: isExchangeDay ? nextData.exchangeTime : undefined,
            exchangeDirection: isExchangeDay
              ? nextData.exchangeDirection || undefined
              : undefined,
            exchangeLocation: isExchangeDay ? nextData.exchangeLocation : undefined,
            notes: nextData.notes,
          } satisfies CustodyDayAssignment;
        });
        const retainedAssignments = current.custodyDayAssignments.filter(
          (item) =>
            item.userId !== userId ||
            item.caseId !== caseId ||
            !targetDates.has(item.date)
        );
        const existingCount = dates.filter((date) => existingByDate.has(date)).length;

        return withAudit(
          {
            ...current,
            custodyDayAssignments: [...nextAssignments, ...retainedAssignments],
          },
          {
            userId,
            caseId,
            action: existingCount === dates.length ? "updated" : "created",
            entityType: "custodyDayAssignment",
            entityId: dates.length === 1 ? nextAssignments[0].id : "custody-date-range",
            metadataSummary:
              dates.length === 1
                ? "Custody schedule day saved without child names."
                : `${dates.length}-day custody schedule range saved without child names.`,
          }
        );
      });
      setOptimisticPaintAssignments((current) =>
        current.filter(
          (item) =>
            item.userId !== userId ||
            item.caseId !== caseId ||
            !targetDates.has(item.date)
        )
      );
      setCalendarMonthKey(monthKeyFromDate(startDate, timezone));
      setSelectedDay(startDate);
      flash(`Custody schedule saved for ${dates.length} day${dates.length === 1 ? "" : "s"}.`);
    } catch (error) {
      flash(error instanceof Error ? error.message : "Calendar date range save failed.");
    }
  }

  function clearCustodyDay() {
    if (!selectedAssignment) return;
    setOptimisticPaintAssignments((current) =>
      current.filter(
        (item) => item.userId !== userId || item.caseId !== caseId || item.date !== selectedAssignment.date
      )
    );
    updateDataset((current) =>
      withAudit(
        {
          ...current,
          custodyDayAssignments: current.custodyDayAssignments.filter(
            (item) => item.id !== selectedAssignment.id
          ),
        },
        {
          userId,
          caseId,
          action: "deleted",
          entityType: "custodyDayAssignment",
          entityId: selectedAssignment.id,
          metadataSummary: "Custody day color assignment removed.",
        }
      )
    );
    flash("Custody day color cleared.");
  }

  function clearCustodyLabel(caregiverLabel: string) {
    const normalizedLabel = caregiverLabel.trim();
    if (!normalizedLabel) return;

    setOptimisticPaintAssignments((current) =>
      current.filter(
        (item) =>
          item.userId !== userId ||
          item.caseId !== caseId ||
          item.caregiverLabel !== normalizedLabel
      )
    );

    updateDataset((current) =>
      withAudit(
        {
          ...current,
          custodyDayAssignments: current.custodyDayAssignments.filter(
            (item) =>
              item.userId !== userId ||
              item.caseId !== caseId ||
              item.caregiverLabel !== normalizedLabel
          ),
        },
        {
          userId,
          caseId,
          action: "deleted",
          entityType: "custodyDayAssignment",
          entityId: `calendar-label-${normalizedLabel}`,
          metadataSummary: "Calendar custody label and color assignments removed.",
        }
      )
    );

    flash(`Calendar label "${normalizedLabel}" removed.`);
  }

  function deleteTimelineEvent(event: CalendarEvent) {
    if (!canDeleteTimelineEvent(event)) {
      flash("Delete this generated item from its source tab.");
      return;
    }

    updateDataset((current) => deleteTimelineEventFromDataset(current, event, userId, caseId));
    flash(`${labelEventType(event.type)} deleted from timeline.`);
  }

  return (
    <div className="min-w-0 max-w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={mode}
          options={[
            { value: "month", label: "Month" },
            { value: "list", label: "Weekly/List" },
            { value: "timeline", label: "Timeline" },
          ]}
          onChange={(value) => setMode(value as "month" | "list" | "timeline")}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={calendarTask === "view" ? "btn-primary" : "btn-secondary"} onClick={() => setCalendarTask("view")}>View schedule</button>
          <button type="button" className={calendarTask === "edit" ? "btn-primary" : "btn-secondary"} onClick={() => setCalendarTask("edit")}>Add or edit dates</button>
        </div>
      </div>

      {mode === "month" && (
        <section className="grid gap-4 xl:grid-cols-[1fr_400px]">
          <Panel title={`Monthly custody calendar: ${formatMonthLabel(monthKey, timezone)}`} action={`Case timezone: ${timezone}`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white p-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary h-9 px-3"
                  onClick={() => showCalendarMonth(shiftMonthKey(monthKey, -1, timezone))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn-secondary h-9 px-3"
                  onClick={showCurrentMonth}
                >
                  Today
                </button>
                <button
                  type="button"
                  className="btn-secondary h-9 px-3"
                  onClick={() => showCalendarMonth(shiftMonthKey(monthKey, 1, timezone))}
                >
                  Next
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="calendar-month">
                  Month
                </label>
                <input
                  id="calendar-month"
                  aria-label="Calendar month"
                  type="month"
                  className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900"
                  value={monthKey}
                  onChange={(event) => showCalendarMonth(event.target.value || currentMonthKey(new Date(), timezone))}
                />
              </div>
            </div>
            {calendarTask === "edit" ? (
            <details
              data-testid="calendar-color-tools"
              className="group mb-4 overflow-hidden rounded-md border border-slate-200 bg-slate-50"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold text-slate-700 marker:content-none">
                <span>Custody color tools</span>
                <span className="text-xs font-medium text-slate-500 group-open:hidden">Optional</span>
                <span className="hidden text-xs font-medium text-slate-500 group-open:inline">Hide tools</span>
              </summary>
              <div className="grid gap-3 border-t border-slate-200 p-3 2xl:grid-cols-[minmax(360px,1fr)_auto] 2xl:items-end">
                <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Caregiver">
                  <select
                    aria-label="Caregiver for color tools"
                    className="input"
                    value={paintCaregiverLabel}
                    onChange={(event) => {
                      const caregiverLabel = event.target.value;
                      setPaintCaregiverLabel(caregiverLabel);
                      setPaintColor(
                        calendarColorForCaregiver(
                          caregiverLabel,
                          userRoleLabel,
                          otherParentLabel,
                          custodyDayAssignments
                        )
                      );
                    }}
                  >
                    {caregiverOptions.map((caregiverLabel) => (
                      <option key={caregiverLabel} value={caregiverLabel}>
                        {caregiverLabel}
                      </option>
                    ))}
                  </select>
                </Field>
                <CalendarColorPicker
                  label="Calendar color"
                  ariaLabelPrefix="Paint calendar color"
                  value={paintColor}
                  onChange={setPaintColor}
                />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={multiDayPaintEnabled}
                  onClick={toggleMultiDayPaint}
                  className={multiDayPaintEnabled ? "btn-primary h-9 px-3 text-xs" : "btn-secondary h-9 px-3 text-xs"}
                >
                  Multi-day paint: {multiDayPaintEnabled ? "On" : "Off"}
                </button>
                {paintSelectionDates.size > 0 && (
                  <>
                    <button
                      type="button"
                      className="btn-primary h-9 px-3 text-xs"
                      onClick={applySelectedPaintDates}
                    >
                      Apply {paintSelectionDates.size} day{paintSelectionDates.size === 1 ? "" : "s"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary h-9 px-3 text-xs"
                      onClick={clearPaintSelection}
                    >
                      Clear selection
                    </button>
                  </>
                )}
                {isPainting && (
                  <span className="rounded-md border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800">
                    {paintDraftDates.size} day{paintDraftDates.size === 1 ? "" : "s"}
                  </span>
                )}
                </div>
                <p className="text-xs leading-5 text-slate-500 2xl:col-span-2">
                  Tap a day to view or edit it. Turn on multi-day paint only when you want to drag across several days.
                </p>
              </div>
            </details>
            ) : null}
            <div className="mb-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
              {Array.from(
                new Map(custodyDayAssignments.map((item) => [item.caregiverLabel, item]))
                  .values()
              ).map((assignment) => (
                <span key={assignment.caregiverLabel} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: assignment.color }}
                  />
                  {assignment.caregiverLabel}
                  <button
                    type="button"
                    aria-label={`Delete calendar label ${assignment.caregiverLabel}`}
                    onClick={() => clearCustodyLabel(assignment.caregiverLabel)}
                    className="ml-1 rounded border border-red-200 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </span>
              ))}
              <span className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">
                <span className="relative h-4 w-4 overflow-hidden rounded-sm border border-amber-200 bg-white">
                  <span className="absolute inset-y-0 left-[70.833%] w-0.5 -translate-x-1/2 bg-amber-600" />
                </span>
                Scheduled exchange time
              </span>
              <span className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-slate-700">
                <span className="h-4 w-4 rounded-sm border border-slate-300 bg-slate-200" />
                Weekend
              </span>
            </div>
            <div
              data-testid="calendar-scroll"
              role="region"
              aria-label="Monthly calendar grid"
              className="w-full min-w-0 overflow-hidden"
            >
              <div className="w-full min-w-0">
                <div className="grid grid-cols-7 gap-px text-center text-[10px] font-semibold text-slate-500 sm:gap-2 sm:text-left sm:text-xs">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => (
                    <div
                      key={day}
                      data-calendar-weekend-header={index === 0 || index === 6 ? "true" : undefined}
                      className={`min-w-0 rounded-sm px-0.5 py-1 sm:px-2 ${
                        index === 0 || index === 6 ? "bg-slate-200/80 text-slate-700" : ""
                      }`}
                    >
                      <span className="sm:hidden">{day.slice(0, 1)}</span>
                      <span className="hidden sm:inline">{day}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1 grid w-full min-w-0 grid-cols-7 gap-px sm:mt-2 sm:gap-2">
                  {monthDays.map((day, index) => {
                    const dayEventsForCell = day ? eventsByDate.get(day) || [] : [];
                    const recordEventsForCell = dayEventsForCell.filter(
                      (event) => event.type !== "custody_day"
                    );
                    const exchangeTimeMarkers = Array.from(
                      new Set(
                        dayEventsForCell.flatMap((event) =>
                          event.type === "scheduled_exchange" && event.time ? [event.time] : []
                        )
                      )
                    ).flatMap((time) => {
                      const position = timeOfDayPositionPercent(time);
                      return position === null ? [] : [{ position, time }];
                    });
                    const assignment = day
                      ? optimisticCustodyDayMap.get(day) || custodyDayMap.get(day)
                      : undefined;
                    const isPaintDraft = day ? paintDraftDates.has(day) : false;
                    const isToday = day === today;
                    const isWeekend = index % 7 === 0 || index % 7 === 6;
                    const visibleColor = isPaintDraft ? paintColor : assignment?.color;
                    const visibleLabel = isPaintDraft
                      ? paintCaregiverLabel.trim() || userRoleLabel
                      : assignment?.caregiverLabel;
                    return (
                      <button
                        key={day || `blank-${index}`}
                        type="button"
                        disabled={!day}
                        data-calendar-day={day || undefined}
                        data-calendar-selected={day === selectedDay ? "true" : undefined}
                        data-calendar-weekend={day && isWeekend ? "true" : undefined}
                        aria-hidden={!day ? true : undefined}
                        aria-label={day ? `Edit calendar day ${day}` : undefined}
                        onPointerDown={(event) => day && beginPaint(day, event)}
                        onPointerEnter={() => day && extendPaint(day)}
                        onPointerMove={() => day && extendPaint(day)}
                        onMouseEnter={() => day && extendPaint(day)}
                        onPointerUp={() => finishPaint()}
                        onClick={() => day && handleCalendarDayClick(day)}
                        style={
                          visibleColor
                            ? {
                                backgroundColor: withAlpha(visibleColor, isPaintDraft ? 0.16 : 0.1),
                              }
                            : undefined
                        }
                        className={`relative min-h-16 min-w-0 overflow-hidden select-none rounded-sm border p-1 text-left transition sm:min-h-28 sm:rounded-md sm:p-2 ${multiDayPaintEnabled ? "touch-none" : "touch-pan-y"} ${
                          day === selectedDay
                            ? "border-teal-700 ring-2 ring-inset ring-teal-600"
                            : isWeekend
                              ? "border-slate-300 bg-slate-100 hover:border-teal-300"
                              : "border-slate-200 bg-white hover:border-teal-300"
                        } ${isPaintDraft ? "ring-2 ring-inset ring-amber-500" : ""} ${
                          day ? (multiDayPaintEnabled ? "cursor-crosshair" : "cursor-pointer") : ""
                        } ${!day ? "bg-transparent hover:border-slate-200" : ""}`}
                      >
                        {day && (
                          <>
                            {isWeekend && (
                              <span
                                aria-hidden="true"
                                data-testid="calendar-weekend-shading"
                                className="pointer-events-none absolute inset-0 z-0 bg-slate-200/45"
                              />
                            )}
                            {exchangeTimeMarkers.map(({ position, time }) => (
                              <span
                                key={time}
                                aria-hidden="true"
                                data-exchange-time-marker={time}
                                title={`Scheduled exchange at ${time}`}
                                className="pointer-events-none absolute inset-y-0 z-0 w-0.5 -translate-x-1/2 bg-amber-600/70"
                                style={{ left: `${position}%` }}
                              />
                            ))}
                            <div className="relative z-10">
                              <div className="flex items-start justify-between gap-1">
                                <p className="text-xs font-semibold text-slate-900 sm:text-sm">
                                  {Number(day.slice(-2))}
                                </p>
                                <div className="flex flex-wrap justify-end gap-1">
                                  {isToday && (
                                    <span className="rounded bg-teal-700 px-1 py-0.5 text-[8px] font-semibold text-white sm:px-1.5 sm:text-[10px]">
                                      <span className="sm:hidden">T</span>
                                      <span className="hidden sm:inline">Today</span>
                                    </span>
                                  )}
                                  {assignment?.exchangeTime && (
                                    <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                      {assignment.exchangeTime}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {visibleColor && visibleLabel && (
                                <div
                                  className="mt-1 truncate rounded px-1 py-0.5 text-[8px] font-semibold text-white sm:mt-2 sm:px-2 sm:py-1 sm:text-xs"
                                  style={{ backgroundColor: visibleColor }}
                                >
                                  {visibleLabel}
                                </div>
                              )}
                              <div className="mt-1 hidden space-y-1 sm:mt-2 sm:block">
                                {recordEventsForCell.slice(0, 2).map((event) => (
                                  <span
                                    key={event.id}
                                    className="block truncate rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700"
                                  >
                                    {event.title}
                                  </span>
                                ))}
                                {recordEventsForCell.length > 2 && (
                                  <span className="text-[11px] text-slate-500">
                                    +{recordEventsForCell.length - 2} more
                                  </span>
                                )}
                              </div>
                              {recordEventsForCell.length > 0 && (
                                <span className="mt-1 inline-flex min-w-4 items-center justify-center rounded-full bg-slate-700 px-1 text-[8px] font-semibold text-white sm:hidden">
                                  {recordEventsForCell.length}
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Panel>

          <div className="space-y-4">
            <Panel title={`Day detail: ${selectedDay}`} action={`${dayEvents.length} records`}>
              {selectedAssignment && (
                <div className="mb-4 rounded-md border border-slate-200 p-3" style={{ backgroundColor: withAlpha(selectedAssignment.color, 0.08) }}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {selectedAssignment.caregiverLabel}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Scheduled parenting time color for this date
                      </p>
                    </div>
                    <span className="h-6 w-6 rounded-full" style={{ backgroundColor: selectedAssignment.color }} />
                  </div>
                  {selectedAssignment.exchangeTime && (
                    <p className="mt-3 text-sm text-slate-700">
                      Exchange at {selectedAssignment.exchangeTime}
                      {selectedAssignment.exchangeLocation ? ` - ${selectedAssignment.exchangeLocation}` : ""}
                    </p>
                  )}
                </div>
              )}
              <Timeline
                events={dayEvents}
                emptyLabel="No records on this day."
                compact
                onDeleteEvent={deleteTimelineEvent}
              />
            </Panel>

            {calendarTask === "edit" ? (
            <Panel title="Add or edit dates" action="Step 1 of 1">
              <form onSubmit={saveCustodyDay} className="grid gap-3">
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <Field label="Start date">
                    <input
                      name="startDate"
                      type="date"
                      className="input min-w-0 max-w-full"
                      value={rangeStartDate}
                      onChange={(event) => {
                        const nextDate = event.target.value;
                        setRangeDraftState({
                          ...rangeDraft,
                          startDate: nextDate,
                          endDate: rangeEndDate < nextDate ? nextDate : rangeEndDate,
                        });
                      }}
                    />
                  </Field>
                  <Field label="End date">
                    <input
                      name="endDate"
                      type="date"
                      className="input min-w-0 max-w-full"
                      value={rangeEndDate}
                      min={rangeStartDate}
                      onChange={(event) =>
                        setRangeDraftState({ ...rangeDraft, endDate: event.target.value })
                      }
                    />
                  </Field>
                </div>
                <Field label="Child will be with">
                  <select
                    name="caregiverLabel"
                    className="input"
                    value={rangeCaregiverLabel}
                    onChange={(event) =>
                      setRangeDraftState({
                        ...rangeDraft,
                        caregiverLabel: event.target.value,
                        color: calendarColorForCaregiver(
                          event.target.value,
                          userRoleLabel,
                          otherParentLabel,
                          custodyDayAssignments
                        ),
                      })
                    }
                  >
                    {caregiverOptions.map((caregiverLabel) => (
                      <option key={caregiverLabel} value={caregiverLabel}>
                        {caregiverLabel}
                      </option>
                    ))}
                  </select>
                </Field>
                <CalendarColorPicker
                  label="Calendar color"
                  ariaLabelPrefix="Date range calendar color"
                  name="color"
                  value={rangeColor}
                  onChange={(color) =>
                    setRangeDraftState({
                      ...rangeDraft,
                      color,
                    })
                  }
                />
                <Field label="Exchange day">
                  <select
                    name="exchangeBoundary"
                    className="input"
                    value={exchangeBoundary}
                    onChange={(event) =>
                      setRangeDraftState({
                        ...rangeDraft,
                        exchangeBoundary: event.target.value as
                          | "none"
                          | "start"
                          | "end"
                          | "both",
                      })
                    }
                  >
                    <option value="none">No exchange in this date range</option>
                    <option value="start">Start date</option>
                    <option value="end">End date</option>
                    <option value="both">Start and end dates</option>
                  </select>
                </Field>
                {exchangeBoundary !== "none" && (
                  <div className="grid gap-3 rounded-md border border-amber-200 bg-amber-50/60 p-3">
                    <p className="text-xs leading-5 text-amber-900">
                      Exchange details will be added only to the selected boundary day
                      {exchangeBoundary === "both" ? "s" : ""}.
                    </p>
                    <Field label="Exchange time">
                      <input
                        name="exchangeTime"
                        type="time"
                        className="input min-w-0 max-w-full"
                        defaultValue={selectedAssignment?.exchangeTime || ""}
                      />
                    </Field>
                    <Field label="Exchange direction">
                      <select
                        name="exchangeDirection"
                        className="input"
                        defaultValue={selectedAssignment?.exchangeDirection || ""}
                      >
                        <option value="">Choose direction</option>
                        <option value="other_parent_to_me">
                          {otherParentLabel} to {userRoleLabel}
                        </option>
                        <option value="me_to_other_parent">
                          {userRoleLabel} to {otherParentLabel}
                        </option>
                      </select>
                    </Field>
                    <Field label="Exchange location">
                      <input
                        name="exchangeLocation"
                        className="input"
                        defaultValue={selectedAssignment?.exchangeLocation || ""}
                      />
                    </Field>
                  </div>
                )}
                <Field label="Notes">
                  <textarea name="notes" className="input min-h-20" defaultValue={selectedAssignment?.notes || ""} />
                </Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button className="btn-primary" type="submit">
                    Save date range
                  </button>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={clearCustodyDay}
                    disabled={!selectedAssignment}
                  >
                    Clear selected day
                  </button>
                </div>
              </form>
            </Panel>
            ) : null}
          </div>
        </section>
      )}

      {mode === "list" && (
        <Panel title="Weekly/list view" action={`${visibleEvents.length} records`}>
          <Timeline
            events={visibleEvents}
            emptyLabel="No calendar records in this date range."
            onDeleteEvent={deleteTimelineEvent}
          />
        </Panel>
      )}

      {mode === "timeline" && (
        <Panel title="Chronological timeline" action="Order, recorded events, notes, files, expenses">
          <Timeline
            events={visibleEvents}
            emptyLabel="No timeline records in this date range."
            onDeleteEvent={deleteTimelineEvent}
          />
        </Panel>
      )}

      {calendarTask === "edit" ? (
      <details
        id="recurring-exchange-schedule"
        className="group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_5px_18px_rgba(15,23,42,0.07)]"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-sm font-semibold text-slate-900 marker:content-none sm:px-5">
          <span>Recurring exchange schedule (optional)</span>
          <span className="text-xs font-medium text-slate-500 group-open:hidden">
            {exchangeRules.length} saved
          </span>
          <span className="hidden text-xs font-medium text-slate-500 group-open:inline">
            Hide setup
          </span>
        </summary>
        <div className="border-t border-slate-200 p-4 sm:p-5">
          <p className="mb-4 text-sm leading-6 text-slate-600">
            Add a recurring schedule only when you want Custody Folio to generate expected
            exchanges for the calendar and scheduled-versus-logged reports.
          </p>
          <ExchangeScheduleManager
            exchangeRules={exchangeRules}
            updateDataset={updateDataset}
            userId={userId}
            caseId={caseId}
            userRoleLabel={userRoleLabel}
            otherParentLabel={otherParentLabel}
            flash={flash}
          />
        </div>
      </details>
      ) : null}
    </div>
  );
}

function ExchangeScheduleManager({
  exchangeRules,
  updateDataset,
  userId,
  caseId,
  userRoleLabel,
  otherParentLabel,
  flash,
}: {
  exchangeRules: ReturnType<typeof useSelectedRecords>["exchangeRules"];
  updateDataset: ReturnType<typeof useRecordsStore>["updateDataset"];
  userId: string;
  caseId: string;
  userRoleLabel: string;
  otherParentLabel: string;
  flash: (message: string) => void;
}) {
  const [editingRuleId, setEditingRuleId] = useState("");
  const editingRule = exchangeRules.find((rule) => rule.id === editingRuleId) || null;

  async function saveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = exchangeRuleSchema.safeParse({
      ruleName: text(formData, "ruleName"),
      dayOfWeek: text(formData, "dayOfWeek"),
      orderedExchangeTime: text(formData, "orderedExchangeTime"),
      direction: text(formData, "direction"),
      location: text(formData, "location"),
      effectiveStartDate: text(formData, "effectiveStartDate"),
      effectiveEndDate: text(formData, "effectiveEndDate"),
      orderProvisionNotes: text(formData, "orderProvisionNotes"),
    });
    if (!parsed.success) {
      return flash(parsed.error.issues[0]?.message || "Check the recurring exchange schedule.");
    }

    const now = nowIso();
    const ruleId = editingRule?.id || createId("rule");
    try {
      await updateDataset((current) =>
        withAudit(
          {
            ...current,
            exchangeRules: editingRule
              ? current.exchangeRules.map((rule) =>
                  rule.id === editingRule.id && rule.userId === userId && rule.caseId === caseId
                    ? { ...rule, ...emptyToUndefined(parsed.data), updatedAt: now }
                    : rule
                )
              : [
                  {
                    id: ruleId,
                    caseId,
                    userId,
                    createdAt: now,
                    updatedAt: now,
                    ...emptyToUndefined(parsed.data),
                  },
                  ...current.exchangeRules,
                ],
          },
          {
            userId,
            caseId,
            action: editingRule ? "updated" : "created",
            entityType: "custodyExchangeRule",
            entityId: ruleId,
            metadataSummary: editingRule
              ? "Recurring exchange schedule updated without court detail in audit metadata."
              : "Recurring exchange schedule created without court detail in audit metadata.",
          }
        )
      );
      setEditingRuleId("");
      form.reset();
      flash(
        editingRule
          ? "Recurring exchange updated and saved."
          : "Recurring exchange saved for calendar and report comparisons."
      );
    } catch (error) {
      flash(error instanceof Error ? error.message : "Recurring exchange save failed.");
    }
  }

  function deleteRule(ruleId: string) {
    if (editingRuleId === ruleId) setEditingRuleId("");
    updateDataset((current) =>
      withAudit(
        {
          ...current,
          exchangeRules: current.exchangeRules.filter(
            (item) => !(item.id === ruleId && item.userId === userId && item.caseId === caseId)
          ),
          scheduleExceptions: current.scheduleExceptions.filter(
            (item) =>
              !(
                item.custodyExchangeRuleId === ruleId &&
                item.userId === userId &&
                item.caseId === caseId
              )
          ),
        },
        {
          userId,
          caseId,
          action: "deleted",
          entityType: "custodyExchangeRule",
          entityId: ruleId,
          metadataSummary: "Recurring exchange deleted with matching schedule exceptions.",
        }
      )
    );
    flash("Recurring exchange deleted.");
  }

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[420px_1fr]">
      <Panel
        title={editingRule ? "Edit recurring exchange" : "Add recurring exchange"}
        action="Schedule setup"
      >
        <form
          id="exchange-rule-form"
          key={editingRule?.id || "new-exchange-rule"}
          onSubmit={saveRule}
          className="grid min-w-0 gap-3"
        >
          <Field label="Schedule name">
            <input
              name="ruleName"
              className="input"
              required
              defaultValue={editingRule?.ruleName || ""}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Day">
              <select
                name="dayOfWeek"
                className="input"
                defaultValue={String(editingRule?.dayOfWeek ?? 5)}
              >
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
              </select>
            </Field>
            <Field label="Scheduled time">
              <input
                name="orderedExchangeTime"
                type="time"
                className="input"
                required
                defaultValue={editingRule?.orderedExchangeTime || ""}
              />
            </Field>
          </div>
          <Field label="Direction">
            <select
              name="direction"
              className="input"
              defaultValue={editingRule?.direction || "other_parent_to_me"}
            >
              <option value="other_parent_to_me">
                {otherParentLabel} to {userRoleLabel}
              </option>
              <option value="me_to_other_parent">
                {userRoleLabel} to {otherParentLabel}
              </option>
            </select>
          </Field>
          <Field label="Location">
            <input
              name="location"
              className="input"
              defaultValue={editingRule?.location || ""}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Starts">
              <input
                name="effectiveStartDate"
                type="date"
                className="input"
                required
                defaultValue={editingRule?.effectiveStartDate || ""}
              />
            </Field>
            <Field label="Ends (optional)">
              <input
                name="effectiveEndDate"
                type="date"
                className="input"
                defaultValue={editingRule?.effectiveEndDate || ""}
              />
            </Field>
          </div>
          <Field label="Schedule notes">
            <textarea
              name="orderProvisionNotes"
              className="input min-h-20"
              defaultValue={editingRule?.orderProvisionNotes || ""}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" type="submit">
              {editingRule ? "Update recurring exchange" : "Save recurring exchange"}
            </button>
            {editingRule && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditingRuleId("")}
              >
                Cancel editing
              </button>
            )}
          </div>
        </form>
      </Panel>

      <Panel title="Saved recurring exchanges" action={`${exchangeRules.length} saved`}>
        {exchangeRules.length === 0 ? (
          <p className="text-sm leading-6 text-slate-600">
            No recurring exchanges are configured. You can still log every exchange manually.
          </p>
        ) : (
          <Table
            headers={["Schedule", "Day", "Time", "Direction", "Action"]}
            rows={exchangeRules.map((rule) => [
              rule.ruleName,
              ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][rule.dayOfWeek],
              rule.orderedExchangeTime,
              rule.direction === "other_parent_to_me"
                ? `${otherParentLabel} to ${userRoleLabel}`
                : `${userRoleLabel} to ${otherParentLabel}`,
              <div key={rule.id} className="flex flex-wrap gap-2">
                <EditButton
                  ariaLabel={`Edit recurring exchange ${rule.ruleName}`}
                  onClick={() => {
                    setEditingRuleId(rule.id);
                    window.requestAnimationFrame(() =>
                      document
                        .getElementById("exchange-rule-form")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    );
                  }}
                />
                <DeleteButton
                  label="Delete"
                  ariaLabel={`Delete recurring exchange ${rule.ruleName}`}
                  onClick={() => deleteRule(rule.id)}
                />
              </div>,
            ])}
          />
        )}
      </Panel>
    </div>
  );
}

function TimelineView({
  events,
  range,
  updateDataset,
  userId,
  caseId,
  flash,
}: {
  events: CalendarEvent[];
  range: DateRange;
  updateDataset: ReturnType<typeof useRecordsStore>["updateDataset"];
  userId: string;
  caseId: string;
  flash: (message: string) => void;
}) {
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const [designationSavingId, setDesignationSavingId] = useState("");
  const visibleEvents = events.filter(isTimelineVisibleEvent);
  const filteredEvents = visibleEvents.filter((event) => matchesTimelineFilter(event, filter));

  function deleteTimelineEvent(event: CalendarEvent) {
    if (!canDeleteTimelineEvent(event)) {
      flash("Delete this generated item from its source tab.");
      return;
    }

    updateDataset((current) => deleteTimelineEventFromDataset(current, event, userId, caseId));
    flash(`${labelEventType(event.type)} deleted from timeline.`);
  }

  async function changeTimelineDesignation(
    event: CalendarEvent,
    choice: TimelineDesignationChoice
  ) {
    setDesignationSavingId(event.id);
    try {
      await updateDataset((current) =>
        setTimelineEventDesignation(current, event, choice, userId, caseId)
      );
      flash(
        choice === "automatic"
          ? "Timeline designation returned to the automatic suggestion."
          : `Timeline designation changed to ${timelineSeverityLabel(choice)}.`
      );
    } catch (error) {
      flash(error instanceof Error ? error.message : "Timeline designation could not be saved.");
    } finally {
      setDesignationSavingId("");
    }
  }

  function downloadTimelineCsv() {
    if (filteredEvents.length === 0) {
      flash("No timeline records match this filter and date range.");
      return;
    }

    const rows = filteredEvents.map((event) => ({
      date: event.date,
      time: event.time || "",
      type: labelEventType(event.type),
      source: event.sourceLabel || "",
      title: event.title,
      detail: event.detail || "",
      summary: event.summary || "",
      notes: event.body || "",
      tags: event.tags?.join("; ") || "",
      attention_level: event.severity || "neutral",
    }));
    downloadTextFile(
      `custody_folio_timeline_${range.from}_${range.to}.csv`,
      rowsToCsv(rows),
      "text/csv"
    );
    updateDataset((current) =>
      withAudit(current, {
        userId,
        caseId,
        action: "exported",
        entityType: "timeline",
        entityId: `${range.from}-${range.to}`,
        metadataSummary: "Timeline CSV exported without raw row contents in audit metadata.",
      })
    );
    flash("Timeline CSV downloaded.");
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Case timeline"
        action={`${filteredEvents.length} shown`}
        headerContent={(
          <div
            className="grid w-full gap-2 sm:grid-cols-[minmax(13rem,1fr)_auto] lg:w-auto"
            data-testid="timeline-header-controls"
          >
            <label className="block">
              <span className="sr-only">Type or status</span>
              <select
                aria-label="Type or status"
                value={filter}
                onChange={(event) => setFilter(event.target.value as TimelineFilter)}
                className="input h-10 min-w-52"
              >
                {timelineFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={downloadTimelineCsv} disabled={filteredEvents.length === 0} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
              Export timeline
            </button>
          </div>
        )}
      >
        <Timeline
          events={filteredEvents}
          emptyLabel="No timeline records match this filter."
          onDeleteEvent={deleteTimelineEvent}
          onChangeDesignation={changeTimelineDesignation}
          designationSavingId={designationSavingId}
        />
      </Panel>
      <details className="rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-700">How timeline status works</summary>
        <p className="border-t border-slate-100 px-4 py-3 text-sm leading-6 text-slate-600">Custody Folio suggests a neutral status from each record. Open an item to change its status or return it to Automatic.</p>
      </details>
    </div>
  );
}

type ExchangeLogDraft = {
  orderedDate: string;
  orderedTime: string;
  actualDate: string;
  actualTime: string;
  direction: "other_parent_to_me" | "me_to_other_parent";
  location: string;
};

function createDefaultExchangeLogDraft(timezone: string): ExchangeLogDraft {
  const today = formatLocalDate(new Date(), timezone);
  return {
    orderedDate: today,
    orderedTime: "18:00",
    actualDate: today,
    actualTime: "",
    direction: "other_parent_to_me",
    location: "",
  };
}

function ExchangesView({
  updateDataset,
  userId,
  caseId,
  selected,
  range,
  expectedExchanges,
  timezone,
  sectionExport,
  onExportSection,
  onOpenCalendar,
  flash,
}: {
  updateDataset: ReturnType<typeof useRecordsStore>["updateDataset"];
  userId: string;
  caseId: string;
  selected: ReturnType<typeof useSelectedRecords>;
  range: DateRange;
  expectedExchanges: ReturnType<typeof generateExpectedExchangeEvents>;
  timezone: string;
  sectionExport: SectionExportPacket;
  onExportSection: (packet: SectionExportPacket, format: SectionExportFormat) => void;
  onOpenCalendar: () => void;
  flash: (message: string) => void;
}) {
  const [editingExchangeId, setEditingExchangeId] = useState("");
  const [selectedExpectedExchangeId, setSelectedExpectedExchangeId] = useState("");
  const [exchangeLogDraft, setExchangeLogDraft] = useState(() =>
    createDefaultExchangeLogDraft(timezone)
  );
  const editingExchange = selected.exchangeLogs.find((log) => log.id === editingExchangeId) || null;
  const userRoleLabel = selected.matter?.userRoleLabel || "Me";
  const otherParentLabel = selected.matter?.otherParentLabel || "Other parent";

  function selectExpectedExchange(expectedExchangeId: string) {
    setSelectedExpectedExchangeId(expectedExchangeId);
    const expectedExchange = expectedExchanges.find(
      (event) => event.id === expectedExchangeId
    );
    if (!expectedExchange) return;

    const orderedDate = getIsoDateFromDateTime(expectedExchange.orderedExchangeAt);
    setExchangeLogDraft((current) => ({
      ...current,
      orderedDate,
      orderedTime: expectedExchange.orderedExchangeAt.slice(11, 16),
      actualDate: orderedDate,
      direction: expectedExchange.direction,
      location: expectedExchange.location || "",
    }));
  }

  async function addExchangeLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const actualDate = text(formData, "actualDate");
    const actualTime = text(formData, "actualTime");
    const parsed = exchangeLogSchema.safeParse({
      orderedExchangeAt: `${text(formData, "orderedDate")}T${text(formData, "orderedTime")}:00.000Z`,
      actualExchangeAt: actualDate && actualTime ? `${actualDate}T${actualTime}:00.000Z` : null,
      direction: text(formData, "direction"),
      arrivingParty: text(formData, "arrivingParty"),
      lateParty: text(formData, "lateParty"),
      scheduledTimeSource: text(formData, "scheduledTimeSource"),
      status: text(formData, "status"),
      location: text(formData, "location"),
      reasonGiven: text(formData, "reasonGiven"),
      notes: text(formData, "notes"),
      tags: parseTags(text(formData, "tags")),
      witnesses: text(formData, "witnesses"),
    });
    if (!parsed.success) return flash(parsed.error.issues[0]?.message || "Check the exchange log form.");

    const selectedExpectedExchange = expectedExchanges.find(
      (expectedExchange) => expectedExchange.id === selectedExpectedExchangeId
    );
    try {
      await updateDataset((current) =>
        withAudit(
        {
          ...current,
          exchangeLogs: [
            {
              id: createId("exchange"),
              caseId,
              userId,
              custodyExchangeRuleId: selectedExpectedExchange?.custodyExchangeRuleId,
              createdAt: nowIso(),
              updatedAt: nowIso(),
              ...emptyToUndefined(parsed.data),
            },
            ...current.exchangeLogs,
          ],
        },
        {
          userId,
          caseId,
          action: "created",
          entityType: "exchangeLog",
          entityId: "new-exchange",
          metadataSummary: "Exchange log created without note body in audit metadata.",
        }
        )
      );
      form.reset();
      setSelectedExpectedExchangeId("");
      setExchangeLogDraft(createDefaultExchangeLogDraft(timezone));
      flash("Exchange outcome saved. It appears below.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Exchange outcome save failed.");
    }
  }

  async function updateExchangeLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingExchange) return flash("Choose an exchange record to edit.");

    const formData = new FormData(event.currentTarget);
    const actualDate = text(formData, "actualDate");
    const actualTime = text(formData, "actualTime");
    const parsed = exchangeLogSchema.safeParse({
      orderedExchangeAt: `${text(formData, "orderedDate")}T${text(formData, "orderedTime")}:00.000Z`,
      actualExchangeAt: actualDate && actualTime ? `${actualDate}T${actualTime}:00.000Z` : null,
      direction: text(formData, "direction"),
      arrivingParty: text(formData, "arrivingParty"),
      lateParty: text(formData, "lateParty"),
      scheduledTimeSource: text(formData, "scheduledTimeSource"),
      status: text(formData, "status"),
      location: text(formData, "location"),
      reasonGiven: text(formData, "reasonGiven"),
      notes: text(formData, "notes"),
      tags: parseTags(text(formData, "tags")),
      witnesses: text(formData, "witnesses"),
    });
    if (!parsed.success) return flash(parsed.error.issues[0]?.message || "Check the exchange log form.");

    try {
      await updateDataset((current) =>
        withAudit(
        {
          ...current,
          exchangeLogs: current.exchangeLogs.map((log) =>
            log.id === editingExchange.id && log.userId === userId && log.caseId === caseId
              ? {
                  ...log,
                  ...emptyToUndefined(parsed.data),
                  updatedAt: nowIso(),
                }
              : log
          ),
        },
        {
          userId,
          caseId,
          action: "updated",
          entityType: "exchangeLog",
          entityId: editingExchange.id,
          metadataSummary: "Exchange timing and responsibility details updated without note body in audit metadata.",
        }
        )
      );
      flash("Exchange details updated and saved.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Exchange update failed.");
    }
  }

  function deleteExchangeLog(logId: string) {
    if (editingExchangeId === logId) setEditingExchangeId("");
    updateDataset((current) =>
      withAudit(
        {
          ...current,
          exchangeLogs: current.exchangeLogs.filter(
            (item) => !(item.id === logId && item.userId === userId && item.caseId === caseId)
          ),
        },
        {
          userId,
          caseId,
          action: "deleted",
          entityType: "exchangeLog",
          entityId: logId,
          metadataSummary: "Exchange log deleted.",
        }
      )
    );
    flash("Exchange log deleted.");
  }

  const exchangeTimingRows = exchangeChartRows(selected.exchangeLogs, range);

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[420px_1fr]">
      <div className="min-w-0 space-y-4">
        <Panel title="Log exchange outcome" action="Primary action">
          <form onSubmit={addExchangeLog} className="grid min-w-0 gap-3">
            <div className="rounded-md border border-teal-200 bg-teal-50 p-3 text-sm leading-6 text-teal-950">
              <p>
                Record what happened at an exchange. Choose a scheduled exchange to fill its
                expected details, or enter them manually.
              </p>
              <button
                type="button"
                className="mt-2 font-semibold text-teal-800 underline underline-offset-4"
                onClick={onOpenCalendar}
              >
                Manage recurring exchange schedule
              </button>
            </div>
            <Field label="Scheduled exchange (optional)">
              <select
                className="input"
                value={selectedExpectedExchangeId}
                onChange={(event) => selectExpectedExchange(event.target.value)}
              >
                <option value="">Enter scheduled details manually</option>
                {expectedExchanges.map((expectedExchange) => (
                  <option key={expectedExchange.id} value={expectedExchange.id}>
                    {getIsoDateFromDateTime(expectedExchange.orderedExchangeAt)} ·{" "}
                    {expectedExchange.orderedExchangeAt.slice(11, 16)} ·{" "}
                    {expectedExchange.ruleName}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Scheduled exchange date">
                <input
                  name="orderedDate"
                  type="date"
                  className="input"
                  value={exchangeLogDraft.orderedDate}
                  onChange={(event) =>
                    setExchangeLogDraft((current) => ({
                      ...current,
                      orderedDate: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Scheduled exchange time">
                <input
                  name="orderedTime"
                  type="time"
                  className="input"
                  value={exchangeLogDraft.orderedTime}
                  onChange={(event) =>
                    setExchangeLogDraft((current) => ({
                      ...current,
                      orderedTime: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Actual date">
                <input
                  name="actualDate"
                  type="date"
                  className="input"
                  value={exchangeLogDraft.actualDate}
                  onChange={(event) =>
                    setExchangeLogDraft((current) => ({
                      ...current,
                      actualDate: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Actual time">
                <input
                  name="actualTime"
                  type="time"
                  className="input"
                  value={exchangeLogDraft.actualTime}
                  onChange={(event) =>
                    setExchangeLogDraft((current) => ({
                      ...current,
                      actualTime: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>
            <Field label="Status">
              <select name="status" className="input" defaultValue="completed_on_time">
                {exchangeStatuses.map((status) => (
                  <option key={status} value={status}>
                    {labelExchangeStatus(status)}
                  </option>
                ))}
              </select>
            </Field>
            <details className="rounded-lg border border-slate-200 bg-slate-50/60">
              <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-slate-700">
                More details
              </summary>
              <div className="grid gap-3 border-t border-slate-200 p-3">
            <Field label="Direction">
              <select
                name="direction"
                className="input"
                value={exchangeLogDraft.direction}
                onChange={(event) =>
                  setExchangeLogDraft((current) => ({
                    ...current,
                    direction: event.target.value as ExchangeLogDraft["direction"],
                  }))
                }
              >
                <option value="other_parent_to_me">{otherParentLabel} to {userRoleLabel}</option>
                <option value="me_to_other_parent">{userRoleLabel} to {otherParentLabel}</option>
              </select>
            </Field>
            <Field label="Scheduled time source">
              <select name="scheduledTimeSource" className="input" defaultValue="court_order">
                <option value="court_order">Court order</option>
                <option value="parenting_plan">Parenting plan</option>
                <option value="written_agreement">Written agreement</option>
                <option value="verbal_agreement">Verbal agreement</option>
                <option value="other">Other recorded source</option>
                <option value="unknown">Not recorded</option>
              </select>
            </Field>
            <Field label="Arriving / drop-off party">
              <select name="arrivingParty" className="input" defaultValue="other_parent">
                <option value="other_parent">{otherParentLabel}</option>
                <option value="me">{userRoleLabel}</option>
                <option value="third_party">Third party</option>
                <option value="unknown">Not recorded</option>
              </select>
            </Field>
            <Field label="Who was late?">
              <select name="lateParty" className="input" defaultValue="not_applicable">
                <option value="other_parent">{otherParentLabel}</option>
                <option value="me">{userRoleLabel}</option>
                <option value="third_party">Third party</option>
                <option value="both">Both parties</option>
                <option value="unknown">Not recorded</option>
                <option value="not_applicable">No one / not applicable</option>
              </select>
            </Field>
            <Field label="Location">
              <input
                name="location"
                className="input"
                value={exchangeLogDraft.location}
                onChange={(event) =>
                  setExchangeLogDraft((current) => ({
                    ...current,
                    location: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Reason given">
              <input name="reasonGiven" className="input" />
            </Field>
            <Field label="Notes">
              <textarea
                name="notes"
                className="input min-h-20"
              />
            </Field>
            <Field label="Tags">
              <input name="tags" className="input" />
            </Field>
            <Field label="Witnesses">
              <input name="witnesses" className="input" />
            </Field>
              </div>
            </details>
            <button className="btn-primary" type="submit">
              Save exchange outcome
            </button>
          </form>
        </Panel>

        <Panel title="Edit saved exchange" action="Timing + responsibility">
          <div className="grid gap-3">
            <Field label="Exchange record">
              <select
                value={editingExchangeId}
                onChange={(event) => setEditingExchangeId(event.target.value)}
                className="input"
              >
                <option value="">Choose a saved exchange</option>
                {selected.exchangeLogs.map((log) => (
                  <option key={log.id} value={log.id}>
                    {getIsoDateFromDateTime(log.orderedExchangeAt)} · {log.orderedExchangeAt.slice(11, 16)} · {labelExchangeStatus(log.status)}
                  </option>
                ))}
              </select>
            </Field>

            {editingExchange && (
              <form
                key={`${editingExchange.id}-${editingExchange.updatedAt}`}
                onSubmit={updateExchangeLog}
                className="grid min-w-0 gap-3"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Scheduled exchange date">
                    <input
                      name="orderedDate"
                      type="date"
                      className="input"
                      defaultValue={editingExchange.orderedExchangeAt.slice(0, 10)}
                    />
                  </Field>
                  <Field label="Scheduled exchange time">
                    <input
                      name="orderedTime"
                      type="time"
                      className="input"
                      defaultValue={editingExchange.orderedExchangeAt.slice(11, 16)}
                    />
                  </Field>
                  <Field label="Actual date">
                    <input
                      name="actualDate"
                      type="date"
                      className="input"
                      defaultValue={editingExchange.actualExchangeAt?.slice(0, 10) || ""}
                    />
                  </Field>
                  <Field label="Actual time">
                    <input
                      name="actualTime"
                      type="time"
                      className="input"
                      defaultValue={editingExchange.actualExchangeAt?.slice(11, 16) || ""}
                    />
                  </Field>
                </div>
                <Field label="Status">
                  <select name="status" className="input" defaultValue={editingExchange.status}>
                    {exchangeStatuses.map((status) => (
                      <option key={status} value={status}>
                        {labelExchangeStatus(status)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Direction">
                  <select name="direction" className="input" defaultValue={editingExchange.direction}>
                    <option value="other_parent_to_me">{otherParentLabel} to {userRoleLabel}</option>
                    <option value="me_to_other_parent">{userRoleLabel} to {otherParentLabel}</option>
                  </select>
                </Field>
                <Field label="Scheduled time source">
                  <select
                    name="scheduledTimeSource"
                    className="input"
                    defaultValue={editingExchange.scheduledTimeSource || "unknown"}
                  >
                    <option value="court_order">Court order</option>
                    <option value="parenting_plan">Parenting plan</option>
                    <option value="written_agreement">Written agreement</option>
                    <option value="verbal_agreement">Verbal agreement</option>
                    <option value="other">Other recorded source</option>
                    <option value="unknown">Not recorded</option>
                  </select>
                </Field>
                <Field label="Arriving / drop-off party">
                  <select
                    name="arrivingParty"
                    className="input"
                    defaultValue={getExchangeArrivingParty(editingExchange)}
                  >
                    <option value="other_parent">{otherParentLabel}</option>
                    <option value="me">{userRoleLabel}</option>
                    <option value="third_party">Third party</option>
                    <option value="unknown">Not recorded</option>
                  </select>
                </Field>
                <Field label="Who was late?">
                  <select
                    name="lateParty"
                    className="input"
                    defaultValue={getExchangeLateParty(editingExchange)}
                  >
                    <option value="other_parent">{otherParentLabel}</option>
                    <option value="me">{userRoleLabel}</option>
                    <option value="third_party">Third party</option>
                    <option value="both">Both parties</option>
                    <option value="unknown">Not recorded</option>
                    <option value="not_applicable">No one / not applicable</option>
                  </select>
                </Field>
                <Field label="Location">
                  <input name="location" className="input" defaultValue={editingExchange.location || ""} />
                </Field>
                <Field label="Reason given">
                  <input name="reasonGiven" className="input" defaultValue={editingExchange.reasonGiven || ""} />
                </Field>
                <Field label="Notes">
                  <textarea
                    name="notes"
                    className="input min-h-20"
                    defaultValue={editingExchange.notes || ""}
                  />
                </Field>
                <Field label="Tags">
                  <input name="tags" className="input" defaultValue={editingExchange.tags.join(", ")} />
                </Field>
                <Field label="Witnesses">
                  <input name="witnesses" className="input" defaultValue={editingExchange.witnesses || ""} />
                </Field>
                <button className="btn-primary" type="submit">
                  Update exchange details
                </button>
              </form>
            )}
          </div>
        </Panel>
      </div>

      <div className="min-w-0 space-y-4">
        <SectionExportPanel packet={sectionExport} onExport={onExportSection} />

        <Panel title="Exchange outcomes and timing" action={`${exchangeTimingRows.length} in range`}>
          <ExchangeTimingChart rows={exchangeTimingRows} />
        </Panel>

        <Panel title="Scheduled exchanges" action={`${expectedExchanges.length} expected in range`}>
          <Table
            headers={["Date", "Ordered time", "Direction", "Location"]}
            rows={expectedExchanges.slice(0, 12).map((event) => [
              getIsoDateFromDateTime(event.orderedExchangeAt),
              event.orderedExchangeAt.slice(11, 16),
              event.direction === "other_parent_to_me"
                ? `${otherParentLabel} to ${userRoleLabel}`
                : `${userRoleLabel} to ${otherParentLabel}`,
              event.location || "",
            ])}
          />
        </Panel>
        <Panel title="Logged exchanges" action={`${selected.exchangeLogs.length} total records`}>
          <Table
            headers={[
              "Date",
              "Scheduled",
              "Actual",
              "Arriving / drop-off",
              "Late party",
              "Time source",
              "Status",
              "Actions",
            ]}
            rows={selected.exchangeLogs
              .slice(0, 12)
              .map((log) => [
                getIsoDateFromDateTime(log.orderedExchangeAt),
                log.orderedExchangeAt.slice(11, 16),
                log.actualExchangeAt?.slice(11, 16) || "",
                labelExchangeParty(getExchangeArrivingParty(log), userRoleLabel, otherParentLabel),
                labelExchangeParty(getExchangeLateParty(log), userRoleLabel, otherParentLabel),
                labelExchangeScheduledTimeSource(log.scheduledTimeSource),
                <StatusPill key={log.id} label={labelExchangeStatus(log.status)} />,
                <div key={log.id} className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-label={`Edit exchange log ${getIsoDateFromDateTime(log.orderedExchangeAt)}`}
                    onClick={() => setEditingExchangeId(log.id)}
                    className="inline-flex min-h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-teal-500"
                  >
                    Edit
                  </button>
                  <DeleteButton
                    label="Delete"
                    ariaLabel={`Delete exchange log ${getIsoDateFromDateTime(log.orderedExchangeAt)}`}
                    onClick={() => deleteExchangeLog(log.id)}
                  />
                </div>,
              ])}
          />
        </Panel>
      </div>
    </div>
  );
}

type FaceTimeOutcome =
  | "completed"
  | "not_conducted"
  | "attempted_unanswered"
  | "declined_or_canceled";

const faceTimeOutcomeOptions: Array<{ value: FaceTimeOutcome; label: string }> = [
  { value: "completed", label: "Completed" },
  { value: "not_conducted", label: "Not conducted" },
  { value: "attempted_unanswered", label: "Attempted, no answer" },
  { value: "declined_or_canceled", label: "Canceled or declined" },
];

const faceTimeOutcomeTitles: Record<FaceTimeOutcome, string> = {
  completed: "Virtual contact completed",
  not_conducted: "Virtual contact not conducted",
  attempted_unanswered: "Virtual contact attempt unanswered",
  declined_or_canceled: "Virtual contact canceled or declined",
};

const faceTimeOutcomeStatements: Record<FaceTimeOutcome, string> = {
  completed: "Virtual contact was completed.",
  not_conducted: "Virtual contact was not completed.",
  attempted_unanswered: "A virtual contact attempt was not answered.",
  declined_or_canceled: "Virtual contact was canceled or declined.",
};

function NotesView({
  updateDataset,
  userId,
  caseId,
  timezone,
  notes,
  communicationLabel,
  flash,
}: {
  updateDataset: ReturnType<typeof useRecordsStore>["updateDataset"];
  userId: string;
  caseId: string;
  timezone: string;
  notes: ReturnType<typeof useSelectedRecords>["dateNotes"];
  communicationLabel: string;
  flash: (message: string) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [editingNoteId, setEditingNoteId] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [faceTimeSaving, setFaceTimeSaving] = useState(false);
  const [faceTimeOutcome, setFaceTimeOutcome] =
    useState<FaceTimeOutcome>("not_conducted");
  const [deletingNoteId, setDeletingNoteId] = useState("");
  const editingNote = notes.find((note) => note.id === editingNoteId) || null;

  async function saveFaceTimeOutcome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const outcome = text(formData, "faceTimeOutcome") as FaceTimeOutcome;
    const details = text(formData, "details");
    const postCallNotice =
      outcome !== "completed" && formData.get("postCallNotice") === "on";
    const tags = [
      "facetime",
      outcome === "completed" ? "facetime_completed" : "no_facetime",
      outcome === "attempted_unanswered" ? "unanswered_call" : "",
      postCallNotice ? "post_call_notice" : "",
    ].filter(Boolean);
    const parsed = dateNoteSchema.safeParse({
      noteDate: text(formData, "noteDate"),
      noteTime: text(formData, "noteTime"),
      category: "communication",
      title: faceTimeOutcomeTitles[outcome],
      body: [
        faceTimeOutcomeStatements[outcome],
        postCallNotice ? "A message or notice was received after the call attempt." : "",
        details,
      ]
        .filter(Boolean)
        .join(" "),
      tags,
      includeInReports: formData.get("includeInReports") === "on",
    });
    if (!parsed.success) {
      return flash(parsed.error.issues[0]?.message || "Check the virtual contact outcome form.");
    }

    const noteId = createId("note");
    const now = nowIso();
    setFaceTimeSaving(true);
    try {
      await updateDataset((current) =>
        withAudit(
          {
            ...current,
            dateNotes: [
              {
                id: noteId,
                userId,
                caseId,
                createdAt: now,
                updatedAt: now,
                ...emptyToUndefined(parsed.data),
              },
              ...current.dateNotes,
            ],
          },
          {
            userId,
            caseId,
            action: "created",
            entityType: "dateNote",
            entityId: noteId,
            metadataSummary: "Structured virtual contact outcome saved without communication details in audit metadata.",
          }
        )
      );
      form.reset();
      setFaceTimeOutcome("not_conducted");
      flash("Virtual contact outcome saved and reflected in the dashboard date range.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Virtual contact outcome save failed.");
    } finally {
      setFaceTimeSaving(false);
    }
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = dateNoteSchema.safeParse({
      noteDate: text(formData, "noteDate"),
      noteTime: text(formData, "noteTime"),
      category: text(formData, "category"),
      title: text(formData, "title"),
      body: text(formData, "body"),
      tags: parseTags(text(formData, "tags")),
      includeInReports: formData.get("includeInReports") === "on",
    });
    if (!parsed.success) return flash(parsed.error.issues[0]?.message || "Check the note form.");

    const now = nowIso();
    const noteId = editingNote?.id || createId("note");
    setNoteSaving(true);
    try {
      await updateDataset((current) =>
        withAudit(
          {
            ...current,
            dateNotes: editingNote
              ? current.dateNotes.map((note) =>
                  note.id === editingNote.id && note.userId === userId && note.caseId === caseId
                    ? { ...note, ...emptyToUndefined(parsed.data), updatedAt: now }
                    : note
                )
              : [
                  {
                    id: noteId,
                    userId,
                    caseId,
                    createdAt: now,
                    updatedAt: now,
                    ...emptyToUndefined(parsed.data),
                  },
                  ...current.dateNotes,
                ],
          },
          {
            userId,
            caseId,
            action: editingNote ? "updated" : "created",
            entityType: "dateNote",
            entityId: noteId,
            metadataSummary: editingNote
              ? "Date note updated without note body in audit metadata."
              : "Date note created without note body in audit metadata.",
          }
        )
      );
      setEditingNoteId("");
      form.reset();
      flash(editingNote ? "Date based note updated and saved." : "Date based note saved successfully.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Note save failed.");
    } finally {
      setNoteSaving(false);
    }
  }

  async function deleteNote(noteId: string) {
    setDeletingNoteId(noteId);
    try {
      await updateDataset((current) =>
        withAudit(
          {
            ...current,
            dateNotes: current.dateNotes.filter(
              (item) => !(item.id === noteId && item.userId === userId && item.caseId === caseId)
            ),
          },
          {
            userId,
            caseId,
            action: "deleted",
            entityType: "dateNote",
            entityId: noteId,
            metadataSummary: "Date note deleted.",
          }
        )
      );
      if (editingNoteId === noteId) setEditingNoteId("");
      flash("Date based note deleted successfully.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Note deletion failed.");
    } finally {
      setDeletingNoteId("");
    }
  }

  const filteredNotes = filter === "all" ? notes : notes.filter((note) => note.category === filter);

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[420px_1fr]">
      <div className="min-w-0 space-y-4">
        <Panel title={`Log ${communicationLabel.toLowerCase()} outcome`} action="Dashboard source">
          <p className="mb-3 text-xs leading-5 text-slate-600">
            Use this for a scheduled phone call, video call, or similar contact. It updates the
            communication counters when its date is inside the selected range.
          </p>
          <form data-testid="facetime-outcome-form" onSubmit={saveFaceTimeOutcome} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date">
                <input
                  name="noteDate"
                  type="date"
                  className="input"
                  defaultValue={formatLocalDate(new Date(), timezone)}
                />
              </Field>
              <Field label="Time (optional)">
                <input name="noteTime" type="time" className="input" />
              </Field>
            </div>
            <Field label={`${communicationLabel} outcome`}>
              <select
                name="faceTimeOutcome"
                className="input"
                value={faceTimeOutcome}
                onChange={(event) =>
                  setFaceTimeOutcome(event.target.value as FaceTimeOutcome)
                }
              >
                {faceTimeOutcomeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            {faceTimeOutcome !== "completed" && (
              <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
                <input name="postCallNotice" type="checkbox" />
                <span>A message or notice came after the call attempt.</span>
              </label>
            )}
            <Field label="Details (optional)">
              <textarea name="details" className="input min-h-20" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input name="includeInReports" type="checkbox" defaultChecked />
              Include this outcome in selected reports
            </label>
            <button className="btn-primary" type="submit" disabled={faceTimeSaving}>
              {faceTimeSaving ? "Saving outcome…" : "Save virtual contact outcome"}
            </button>
          </form>
        </Panel>

        <Panel title={editingNote ? "Edit note" : "Add a note"} action="Keep it clear and factual">
          <form
            id="date-note-form"
            key={editingNote?.id || "new-date-note"}
            onSubmit={saveNote}
            className="grid gap-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date">
                <input
                  name="noteDate"
                  type="date"
                  className="input"
                  defaultValue={
                    editingNote?.noteDate || formatLocalDate(new Date(), timezone)
                  }
                />
              </Field>
              <Field label="Time">
                <input name="noteTime" type="time" className="input" defaultValue={editingNote?.noteTime || ""} />
              </Field>
            </div>
            <Field label="Category">
              <select name="category" className="input" defaultValue={editingNote?.category || "other"}>
                {[
                  "exchange",
                  "communication",
                  "school",
                  "medical",
                  "expense",
                  "child_support",
                  "safety",
                  "schedule_change",
                  "child_item",
                  "attorney",
                  "court",
                  "other",
                ].map((category) => (
                  <option key={category} value={category}>
                    {labelNoteCategory(category as NoteCategory)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title">
              <input name="title" className="input" defaultValue={editingNote?.title || ""} />
            </Field>
            <Field label="What happened?">
              <textarea name="body" className="input min-h-28" defaultValue={editingNote?.body || ""} />
            </Field>
            <Field label="Tags">
              <input name="tags" className="input" defaultValue={editingNote?.tags.join(", ") || ""} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input name="includeInReports" type="checkbox" defaultChecked={editingNote?.includeInReports ?? true} />
              Include this note in selected reports
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" type="submit" disabled={noteSaving}>
                {noteSaving ? "Saving…" : editingNote ? "Update note" : "Save note"}
              </button>
              {editingNote && (
                <button type="button" className="btn-secondary" onClick={() => setEditingNoteId("")}>
                  Cancel editing
                </button>
              )}
            </div>
          </form>
        </Panel>

      </div>

      <Panel
        title="Notes & events"
        action={
          filter === "all"
            ? `${notes.length} total records`
            : `${filteredNotes.length} shown · ${notes.length} total`
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {["all", "exchange", "child_support", "school", "expense", "court"].map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setFilter(category)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                filter === category ? "bg-teal-700 text-white" : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              {category.replaceAll("_", " ")}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {filteredNotes.map((note) => (
            <div key={note.id} className="min-w-0 rounded-md border border-slate-200 bg-white p-4">
              <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-950 [overflow-wrap:anywhere]">{note.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {note.noteDate} {note.noteTime || ""} - {labelNoteCategory(note.category)}
                  </p>
                </div>
                <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 sm:justify-end">
                  <StatusPill label={note.includeInReports ? "report included" : "not selected"} />
                  <EditButton
                    ariaLabel={`Edit note ${note.title}`}
                    onClick={() => {
                      setEditingNoteId(note.id);
                      window.requestAnimationFrame(() =>
                        document.getElementById("date-note-form")?.scrollIntoView({ behavior: "smooth", block: "start" })
                      );
                    }}
                  />
                  <DeleteButton
                    label={deletingNoteId === note.id ? "Deleting…" : "Delete"}
                    ariaLabel={`Delete note ${note.title}`}
                    onClick={() => void deleteNote(note.id)}
                  />
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{note.body}</p>
              <TagList tags={note.tags} />
            </div>
          ))}
          {filteredNotes.length === 0 && <Empty label="No notes match this filter." />}
        </div>
      </Panel>
    </div>
  );
}

function oppositeScheduleParent(parent: ScheduleParentKey): ScheduleParentKey {
  return parent === "you" ? "other" : "you";
}

function ownerFromBlocks(
  offset: number,
  blocks: Array<{ owner: ScheduleParentKey; days: number }>
) {
  const cycleLength = blocks.reduce((sum, block) => sum + block.days, 0);
  let cursor = offset % cycleLength;
  for (const block of blocks) {
    if (cursor < block.days) return block.owner;
    cursor -= block.days;
  }
  return blocks[0].owner;
}

function scheduleOwnerForOffset(
  presetId: ParentingSchedulePresetId,
  startOwner: ScheduleParentKey,
  offset: number
) {
  const otherOwner = oppositeScheduleParent(startOwner);

  if (presetId === "three_four_four_three_flip") {
    const activeStartOwner = Math.floor(offset / 56) % 2 === 0 ? startOwner : otherOwner;
    const activeOtherOwner = oppositeScheduleParent(activeStartOwner);
    return ownerFromBlocks(offset % 56, [
      { owner: activeStartOwner, days: 4 },
      { owner: activeOtherOwner, days: 3 },
      { owner: activeStartOwner, days: 3 },
      { owner: activeOtherOwner, days: 4 },
    ]);
  }

  if (presetId === "week_on_week_off") {
    return ownerFromBlocks(offset, [
      { owner: startOwner, days: 7 },
      { owner: otherOwner, days: 7 },
    ]);
  }

  if (presetId === "two_two_three") {
    return ownerFromBlocks(offset, [
      { owner: startOwner, days: 2 },
      { owner: otherOwner, days: 2 },
      { owner: startOwner, days: 3 },
      { owner: otherOwner, days: 2 },
      { owner: startOwner, days: 2 },
      { owner: otherOwner, days: 3 },
    ]);
  }

  if (presetId === "two_two_five_five") {
    return ownerFromBlocks(offset, [
      { owner: startOwner, days: 2 },
      { owner: otherOwner, days: 2 },
      { owner: startOwner, days: 5 },
      { owner: otherOwner, days: 5 },
    ]);
  }

  if (presetId === "three_three_four_four") {
    return ownerFromBlocks(offset, [
      { owner: startOwner, days: 3 },
      { owner: otherOwner, days: 3 },
      { owner: startOwner, days: 4 },
      { owner: otherOwner, days: 4 },
    ]);
  }

  return ownerFromBlocks(offset, [
    { owner: startOwner, days: 5 },
    { owner: otherOwner, days: 2 },
    { owner: startOwner, days: 7 },
  ]);
}

function directionForIncomingParent(owner: ScheduleParentKey): ExchangeDirection {
  return owner === "you" ? "other_parent_to_me" : "me_to_other_parent";
}

function buildScheduleSetupAssignments({
  presetId,
  presetLabel,
  startDate,
  endDate,
  startOwner,
  yourLabel,
  otherParentLabel,
  yourColor,
  otherParentColor,
  exchangeTime,
  exchangeLocation,
  sourceLabel,
  orderNotes,
  markStartAsExchange,
  userId,
  caseId,
}: {
  presetId: ParentingSchedulePresetId;
  presetLabel: string;
  startDate: string;
  endDate: string;
  startOwner: ScheduleParentKey;
  yourLabel: string;
  otherParentLabel: string;
  yourColor: string;
  otherParentColor: string;
  exchangeTime: string;
  exchangeLocation?: string;
  sourceLabel: string;
  orderNotes?: string;
  markStartAsExchange: boolean;
  userId: string;
  caseId: string;
}) {
  const dayCount = (daysBetween(startDate, endDate) ?? -1) + 1;
  const now = nowIso();
  const assignments: CustodyDayAssignment[] = [];
  let previousOwner: ScheduleParentKey | undefined;

  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = addDays(startDate, offset);
    const owner = scheduleOwnerForOffset(presetId, startOwner, offset);
    const isExchangeDate = offset === 0 ? markStartAsExchange : owner !== previousOwner;
    const caregiverLabel = owner === "you" ? yourLabel : otherParentLabel;
    const setupNotes = [
      `Generated from ${sourceLabel || "calendar schedule setup"}.`,
      `Pattern: ${presetLabel}.`,
      isExchangeDate ? `Transition marked at ${exchangeTime}${exchangeLocation ? ` at ${exchangeLocation}` : ""}.` : "",
      isExchangeDate && orderNotes ? orderNotes : "",
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 1000);

    assignments.push({
      id: createId("custody-day"),
      caseId,
      userId,
      date,
      caregiverLabel,
      color: owner === "you" ? yourColor : otherParentColor,
      startsAt: isExchangeDate ? exchangeTime : "00:00",
      endsAt: "23:59",
      exchangeTime: isExchangeDate ? exchangeTime : undefined,
      exchangeDirection: isExchangeDate ? directionForIncomingParent(owner) : undefined,
      exchangeLocation: isExchangeDate ? exchangeLocation : undefined,
      notes: setupNotes,
      createdAt: now,
      updatedAt: now,
    });
    previousOwner = owner;
  }

  return assignments;
}

function ImportView({
  updateDataset,
  userId,
  caseId,
  timezone,
  recordsStorageMode,
  flash,
  onOpen,
}: {
  updateDataset: ReturnType<typeof useRecordsStore>["updateDataset"];
  userId: string;
  caseId: string;
  timezone: string;
  recordsStorageMode: "local" | "supabase";
  flash: (message: string) => void;
  onOpen: (view: ActiveView) => void;
}) {
  const [addMode, setAddMode] = useState<"event" | "file">("event");
  const [quickIssueSaving, setQuickIssueSaving] = useState(false);
  const [fileSaving, setFileSaving] = useState(false);
  const [fileCategory, setFileCategory] = useState<"document" | "message_archive">("document");
  const [setupSchedulePreset, setSetupSchedulePreset] =
    useState<ParentingSchedulePresetId>("three_four_four_three_flip");
  const selectedSetupPreset =
    parentingSchedulePresets.find((preset) => preset.id === setupSchedulePreset) ||
    parentingSchedulePresets[0];
  const setupToday = formatLocalDate(new Date(), timezone);
  const setupDefaultEndDate = addDays(setupToday, 90);

  async function saveQuickIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = text(formData, "body");
    const requestedTitle = text(formData, "title");
    const derivedTitle = body.trim().split(/\s+/).slice(0, 12).join(" ").slice(0, 120);
    const parsed = dateNoteSchema.safeParse({
      noteDate: text(formData, "noteDate"),
      noteTime: text(formData, "noteTime"),
      category: text(formData, "category"),
      title: requestedTitle || (derivedTitle.length >= 2 ? derivedTitle : "Event noted"),
      body,
      tags: Array.from(new Set(["quick event", ...parseTags(text(formData, "tags"))])).slice(0, 12),
      includeInReports: formData.get("includeInReports") === "on",
    });
    if (!parsed.success) {
      flash(parsed.error.issues[0]?.message || "Add at least a short description of the event.");
      return;
    }

    const now = nowIso();
    const noteId = createId("note");
    setQuickIssueSaving(true);
    try {
      await updateDataset((current) =>
        withAudit(
          {
            ...current,
            dateNotes: [
              {
                id: noteId,
                userId,
                caseId,
                createdAt: now,
                updatedAt: now,
                ...emptyToUndefined(parsed.data),
              },
              ...current.dateNotes,
            ],
          },
          {
            userId,
            caseId,
            action: "created",
            entityType: "dateNote",
            entityId: noteId,
            metadataSummary: "Quick event saved without event details in audit metadata.",
          }
        )
      );
      form.reset();
      flash(
        parsed.data.includeInReports
          ? "Saved. This event is included in reports."
          : "Saved to Notes & events."
      );
    } catch (error) {
      flash(error instanceof Error ? error.message : "Event save failed.");
    } finally {
      setQuickIssueSaving(false);
    }
  }

  async function verifyCloudEvidenceRecords(records: RecordsDataset["evidenceItems"]) {
    if (recordsStorageMode !== "supabase") return;

    const response = await fetch("/api/records/dataset?caseId=default", {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        [recordsAccountBindingHeaderName]: userId,
      },
    });
    const parsed = (await response.json().catch(() => ({}))) as {
      dataset?: Partial<RecordsDataset> | null;
      error?: string;
    };
    const storedItems = parsed.dataset?.evidenceItems || [];
    const allConfirmed = records.every((record) =>
      storedItems.some(
        (stored) =>
          stored.id === record.id &&
          stored.userId === userId &&
          stored.caseId === caseId &&
          stored.storagePath === record.storagePath
      )
    );

    if (!response.ok || !allConfirmed) {
      throw new Error(parsed.error || "The file uploaded, but its private storage record could not be confirmed.");
    }
  }

  async function saveImportedEvidenceFiles(input: {
    files: File[];
    evidenceDate: string;
    description: string;
    tags: string[];
    includeInReports: boolean;
    auditSummary: string;
  }) {
    const evidenceRecords: RecordsDataset["evidenceItems"] = [];
    const temporaryUploads: Array<{ file: File; evidenceId: string }> = [];
    const now = nowIso();
    let metadataConfirmed = false;

    try {
      for (const file of input.files) {
        const normalizedFileType = normalizeEvidenceFileType({
          originalFileName: file.name,
          fileType: file.type,
        });
        const validation = validateEvidenceFile({
          originalFileName: file.name,
          fileType: normalizedFileType,
          fileSize: file.size,
        });
        if (!validation.ok) throw new Error(`${file.name}: ${validation.error}`);

        const id = createId("evidence");
        const uploaded =
          recordsStorageMode === "supabase" ? await uploadImportEvidenceFile(file, id) : undefined;
        if (uploaded) temporaryUploads.push({ file, evidenceId: id });

        evidenceRecords.push({
          id,
          userId,
          caseId,
          originalFileName: file.name,
          storedFileName:
            uploaded?.storedFileName || buildStoredEvidenceName({ id, originalFileName: file.name }),
          fileType: uploaded?.fileType || normalizedFileType,
          fileSize: file.size,
          storageBucket: uploaded?.storageBucket,
          storagePath: uploaded?.storagePath,
          storageUploadedAt: uploaded?.storageUploadedAt,
          storageSha256: uploaded?.storageSha256,
          uploadedAt: now,
          evidenceDate: input.evidenceDate || now.slice(0, 10),
          description: input.description || `Imported file: ${file.name}`,
          tags: input.tags,
          includeInReports: input.includeInReports,
          reviewStatus: "reviewed",
          reviewedAt: now,
          malwareScanStatus: uploaded?.malwareScanStatus || "pending",
          createdAt: now,
          updatedAt: now,
        });
      }

      await updateDataset((current) =>
        withAudit(
          {
            ...current,
            evidenceItems: [...evidenceRecords, ...current.evidenceItems],
          },
          {
            userId,
            caseId,
            action: "uploaded",
            entityType: "evidenceItem",
            entityId: evidenceRecords.length === 1 ? evidenceRecords[0].id : createId("evidence-batch"),
            metadataSummary: input.auditSummary,
          }
        )
      );
      await verifyCloudEvidenceRecords(evidenceRecords);
      metadataConfirmed = true;
      return evidenceRecords.length;
    } finally {
      if (!metadataConfirmed && temporaryUploads.length > 0) {
        const csrf = await getRecordsCsrfToken().catch(() => "");
        if (csrf) {
          await Promise.all(
            temporaryUploads.map(({ file, evidenceId }) =>
              fetch("/api/records/evidence/cleanup-upload", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json", "X-L2F-CSRF": csrf },
                body: JSON.stringify({ caseId, evidenceId, originalFileName: file.name }),
              }).catch(() => undefined)
            )
          );
        }
      }
    }
  }

  async function saveFiles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length === 0) {
      flash("Choose one or more files.");
      return;
    }

    const categoryLabel = fileCategory === "message_archive" ? "message archive" : "document or photo";
    const categoryTag = fileCategory === "message_archive" ? "message archive" : "document";
    setFileSaving(true);
    try {
      const saved = await saveImportedEvidenceFiles({
        files,
        evidenceDate: text(formData, "evidenceDate") || setupToday,
        description:
          text(formData, "description") ||
          (fileCategory === "message_archive" && files.length === 1
            ? `Imported message archive: ${files[0].name}`
            : ""),
        tags: Array.from(
          new Set([categoryTag, ...parseTags(text(formData, "tags"))])
        ),
        includeInReports: formData.get("includeInReports") === "on",
        auditSummary:
          files.length === 1
            ? `${categoryLabel} uploaded directly into the private file index.`
            : `${files.length} ${categoryLabel} files uploaded directly into the private file index.`,
      });
      form.reset();
      setFileCategory("document");
      flash(
        recordsStorageMode === "supabase"
          ? `${saved} file${saved === 1 ? "" : "s"} uploaded to Files and confirmed.`
          : `${saved} file record${saved === 1 ? "" : "s"} saved to Files.`
      );
    } catch (error) {
      flash(error instanceof Error ? error.message : "File upload failed.");
    } finally {
      setFileSaving(false);
    }
  }

  async function saveCustodyScheduleSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const presetId = text(formData, "schedulePreset") as ParentingSchedulePresetId;
    const preset = parentingSchedulePresets.find((item) => item.id === presetId);
    if (!preset) return flash("Choose a custody schedule pattern.");

    const startDate = text(formData, "startDate");
    const endDate = text(formData, "endDate");
    const exchangeTime = text(formData, "exchangeTime") || "17:00";
    const dayCount = (daysBetween(startDate, endDate) ?? -1) + 1;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return flash("Enter a valid schedule start and end date.");
    }
    if (endDate < startDate) return flash("Schedule end date must be after the start date.");
    if (dayCount < 1 || dayCount > 731) return flash("Generate between 1 day and 2 years at a time.");
    if (!/^\d{2}:\d{2}$/.test(exchangeTime)) return flash("Enter a valid exchange time.");

    const yourLabel = text(formData, "yourLabel") || "You";
    const otherParentLabel = text(formData, "otherParentLabel") || "Other Parent";
    const yourColor = text(formData, "yourColor") || custodyDayColors[0];
    const otherParentColor = text(formData, "otherParentColor") || custodyDayColors[1];
    const startOwner = text(formData, "startOwner") === "other" ? "other" : "you";
    const sourceLabel = text(formData, "sourceLabel") || "Calendar schedule setup";
    const exchangeLocation = text(formData, "exchangeLocation");
    const orderNotes = text(formData, "orderNotes");
    const replaceExisting = formData.get("replaceExisting") === "on";
    const markStartAsExchange = formData.get("markStartAsExchange") === "on";

    const firstAssignment = custodyDayAssignmentSchema.safeParse({
      date: startDate,
      caregiverLabel: startOwner === "you" ? yourLabel : otherParentLabel,
      color: startOwner === "you" ? yourColor : otherParentColor,
      startsAt: markStartAsExchange ? exchangeTime : "00:00",
      endsAt: "23:59",
      exchangeTime: markStartAsExchange ? exchangeTime : "",
      exchangeDirection: markStartAsExchange ? directionForIncomingParent(startOwner) : "",
      exchangeLocation,
      notes: orderNotes,
    });
    if (!firstAssignment.success) {
      return flash(firstAssignment.error.issues[0]?.message || "Check the custody setup fields.");
    }

    const generatedAssignments = buildScheduleSetupAssignments({
      presetId,
      presetLabel: preset.label,
      startDate,
      endDate,
      startOwner,
      yourLabel,
      otherParentLabel,
      yourColor,
      otherParentColor,
      exchangeTime,
      exchangeLocation,
      sourceLabel,
      orderNotes,
      markStartAsExchange,
      userId,
      caseId,
    });

    try {
      await updateDataset((current) => {
        const existingDates = new Set(
          current.custodyDayAssignments
            .filter((item) => item.userId === userId && item.caseId === caseId)
            .map((item) => item.date)
        );
        const assignmentsToSave = replaceExisting
          ? generatedAssignments
          : generatedAssignments.filter((item) => !existingDates.has(item.date));
        const generatedDateSet = new Set(generatedAssignments.map((item) => item.date));
        const retainedAssignments = current.custodyDayAssignments.filter((item) => {
          if (item.userId !== userId || item.caseId !== caseId) return true;
          if (!replaceExisting) return true;
          return !generatedDateSet.has(item.date);
        });

        return withAudit(
          {
            ...current,
            custodyDayAssignments: [...assignmentsToSave, ...retainedAssignments],
          },
          {
            userId,
            caseId,
            action: "created",
            entityType: "custodyScheduleSetup",
            entityId: createId("schedule-setup"),
            metadataSummary: `${assignmentsToSave.length} custody calendar day assignments generated from ${preset.label}.`,
          }
        );
      });

      flash(`${generatedAssignments.length} custody calendar day${generatedAssignments.length === 1 ? "" : "s"} saved to Calendar.`);
    } catch (error) {
      flash(error instanceof Error ? error.message : "Custody schedule save failed.");
    }
  }

  async function uploadImportEvidenceFile(file: File, evidenceId: string) {
    return uploadEvidenceFileToPrivateStorage({
      file,
      evidenceId,
      caseId,
      userId,
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold text-slate-950">What would you like to add?</h2>
        <p className="mt-1 text-sm text-slate-600">Start with the basics. You can add more detail later.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Event", action: () => setAddMode("event"), active: addMode === "event" },
            { label: "Parenting time", action: () => onOpen("Exchanges"), active: false },
            { label: "Communication", action: () => onOpen("Notes"), active: false },
            { label: "Note", action: () => onOpen("Notes"), active: false },
            { label: "Expense", action: () => onOpen("Expenses"), active: false },
            { label: "Support payment", action: () => onOpen("Child Support"), active: false },
            { label: "File", action: () => setAddMode("file"), active: addMode === "file" },
          ].map((choice) => (
            <button
              key={choice.label}
              type="button"
              onClick={choice.action}
              className={`min-h-11 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition ${
                choice.active
                  ? "border-teal-700 bg-teal-50 text-teal-950"
                  : "border-slate-200 bg-white text-slate-700 hover:border-teal-400 hover:bg-teal-50/40"
              }`}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </section>

      <div className="max-w-2xl">
        {addMode === "event" ? (
        <Panel title="Add an event" action="A few details are enough">
          <div className="mb-3 rounded-md border border-teal-200 bg-teal-50 p-3 text-xs leading-5 text-teal-950">
            Add what happened while it is fresh. You can edit or add supporting details later.
          </div>
          <form data-testid="quick-issue-form" onSubmit={saveQuickIssue} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date">
                <input name="noteDate" type="date" className="input" defaultValue={setupToday} />
              </Field>
              <Field label="Time (optional)">
                <input name="noteTime" type="time" className="input" />
              </Field>
            </div>
            <Field label="Event type">
              <select name="category" className="input" defaultValue="other">
                {[
                  "exchange",
                  "communication",
                  "school",
                  "medical",
                  "expense",
                  "child_support",
                  "safety",
                  "schedule_change",
                  "child_item",
                  "attorney",
                  "court",
                  "other",
                ].map((category) => (
                  <option key={category} value={category}>
                    {labelNoteCategory(category as NoteCategory)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Short title (optional)">
              <input name="title" className="input" />
            </Field>
            <Field label="What happened?">
              <textarea
                name="body"
                className="input min-h-28"
              />
            </Field>
            <Field label="Tags (optional)">
              <input name="tags" className="input" />
            </Field>
            <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
              <input name="includeInReports" type="checkbox" defaultChecked />
              <span>Include this event in reports.</span>
            </label>
            <button className="btn-primary" type="submit" disabled={quickIssueSaving}>
              {quickIssueSaving ? "Saving..." : "Save event"}
            </button>
          </form>
        </Panel>
        ) : null}

        {addMode === "file" ? (
        <Panel title="Add a file" action={recordsStorageMode === "supabase" ? "Private storage" : "Metadata only"}>
          <p className="mb-3 text-xs leading-5 text-slate-500">
            Before uploading, remove sensitive numbers or details you do not need.
          </p>
          <form data-testid="file-upload-form" onSubmit={saveFiles} className="grid gap-3">
            <Field label="File category">
              <select
                name="fileCategory"
                className="input"
                value={fileCategory}
                onChange={(event) =>
                  setFileCategory(event.target.value as "document" | "message_archive")
                }
              >
                <option value="document">Document or photo</option>
                <option value="message_archive">Message archive</option>
              </select>
            </Field>
            <Field label="Files">
              <input
                name="files"
                type="file"
                multiple
                className="input"
                accept={
                  fileCategory === "message_archive"
                    ? ".csv,.txt,.html,text/csv,text/plain,text/html"
                    : ".docx,.pdf,.png,.jpg,.jpeg,.heic,.heif,.txt,.csv"
                }
              />
            </Field>
            <p className="-mt-1 text-xs leading-5 text-slate-500">
              {fileCategory === "message_archive"
                ? "Supported message archives: CSV, TXT, and HTML."
                : "Supported documents and photos: DOCX, PDF, PNG, JPEG, HEIC/HEIF, TXT, and CSV."}
            </p>
            <Field label="Record date">
              <input name="evidenceDate" type="date" className="input" defaultValue={formatLocalDate(new Date(), timezone)} />
            </Field>
            <Field label="Description (optional)">
              <textarea name="description" className="input min-h-20" />
            </Field>
            <Field label="Additional tags (optional)">
              <input name="tags" className="input" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input name="includeInReports" type="checkbox" defaultChecked />
              Include in report file index
            </label>
            <button className="btn-primary" type="submit" disabled={fileSaving}>
              {fileSaving
                ? "Uploading files..."
                : recordsStorageMode === "supabase"
                  ? "Upload files"
                  : "Save files to Files"}
            </button>
          </form>
        </Panel>
        ) : null}

        <details className="group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_5px_18px_rgba(15,23,42,0.07)] xl:col-span-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-sm font-semibold text-slate-900 marker:content-none sm:px-5">
            <span>Optional calendar schedule setup</span>
            <span
              data-testid="calendar-schedule-setup-chevron"
              className="shrink-0 text-slate-500 transition-transform group-open:rotate-180"
              aria-hidden="true"
            >
              <ChevronDownIcon />
            </span>
          </summary>
          <div className="space-y-5 border-t border-slate-200 p-4 sm:p-5">
            <p className="text-xs leading-5 text-slate-500">
              This starts blank and creates calendar colors only from information you enter here. No order language or account data is prefilled.
            </p>
            <form onSubmit={saveCustodyScheduleSetup} className="grid gap-3">
              <Field label="Source label (optional)">
                <input name="sourceLabel" className="input" />
              </Field>
              <Field label="Schedule pattern">
                <select
                  name="schedulePreset"
                  className="input"
                  value={setupSchedulePreset}
                  onChange={(event) => setSetupSchedulePreset(event.target.value as ParentingSchedulePresetId)}
                >
                  {parentingSchedulePresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                {selectedSetupPreset.description}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Pattern start date">
                  <input name="startDate" type="date" className="input" defaultValue={setupToday} />
                </Field>
                <Field label="Generate through">
                  <input name="endDate" type="date" className="input" defaultValue={setupDefaultEndDate} />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Your calendar label">
                  <input name="yourLabel" className="input" defaultValue="You" />
                </Field>
                <Field label="Other parent label">
                  <input name="otherParentLabel" className="input" defaultValue="Other Parent" />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Your color">
                  <input name="yourColor" type="color" className="h-10 w-full cursor-pointer rounded-md border border-slate-300 bg-white p-1" defaultValue={custodyDayColors[0]} />
                </Field>
                <Field label="Other parent color">
                  <input name="otherParentColor" type="color" className="h-10 w-full cursor-pointer rounded-md border border-slate-300 bg-white p-1" defaultValue={custodyDayColors[1]} />
                </Field>
              </div>
              <Field label="Pattern starts with">
                <select name="startOwner" className="input" defaultValue="other">
                  <option value="you">Your label</option>
                  <option value="other">Other parent label</option>
                </select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Exchange time">
                  <input name="exchangeTime" type="time" className="input" defaultValue="17:00" />
                </Field>
                <Field label="Exchange location">
                  <input name="exchangeLocation" className="input" />
                </Field>
              </div>
              <Field label="Schedule notes (optional)">
                <textarea
                  name="orderNotes"
                  className="input min-h-20"
                />
              </Field>
              <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-3">
                  <input name="markStartAsExchange" type="checkbox" defaultChecked />
                  <span>Mark the start date as an exchange.</span>
                </label>
                <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-3">
                  <input name="replaceExisting" type="checkbox" defaultChecked />
                  <span>Replace existing calendar colors in this range.</span>
                </label>
              </div>
              <button className="btn-primary" type="submit">
                Generate custody calendar
              </button>
            </form>

          </div>
        </details>
      </div>

    </div>
  );
}

function EvidenceView({
  mode,
  updateDataset,
  reloadDataset,
  userId,
  caseId,
  timezone,
  evidence,
  recordsStorageMode,
  sectionExport,
  onExportSection,
  onOpenFiles,
  flash,
}: {
  mode: "files" | "screenshots";
  updateDataset: ReturnType<typeof useRecordsStore>["updateDataset"];
  reloadDataset: ReturnType<typeof useRecordsStore>["reloadDataset"];
  userId: string;
  caseId: string;
  timezone: string;
  evidence: ReturnType<typeof useSelectedRecords>["evidenceItems"];
  recordsStorageMode: "local" | "supabase";
  sectionExport: SectionExportPacket;
  onExportSection: (packet: SectionExportPacket, format: SectionExportFormat) => void;
  onOpenFiles: () => void;
  flash: (message: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [busyEvidenceId, setBusyEvidenceId] = useState("");
  const [editingEvidenceId, setEditingEvidenceId] = useState("");

  async function uploadEvidenceFile(file: File, evidenceId: string) {
    return uploadEvidenceFileToPrivateStorage({
      file,
      evidenceId,
      caseId,
      userId,
    });
  }

  async function saveScreenshotExhibit(request: ExhibitSaveRequest) {
    return saveScreenshotExhibitToFiles({
      request,
      caseId,
      userId,
      uploadFile: uploadEvidenceFile,
      updateDataset,
      reloadDataset,
    });
  }

  async function addEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    if (!(file instanceof File)) return flash("Choose a file to attach.");

    const normalizedFileType = normalizeEvidenceFileType({
      originalFileName: file.name,
      fileType: file.type,
    });
    const validation = validateEvidenceFile({
      originalFileName: file.name,
      fileType: normalizedFileType,
      fileSize: file.size,
    });
    if (!validation.ok) return flash(validation.error);

    const id = createId("evidence");
    let uploaded: Partial<EvidenceItem> | undefined;

    try {
      setUploading(true);
      uploaded =
        recordsStorageMode === "supabase" ? await uploadEvidenceFile(file, id) : undefined;

      const now = nowIso();
      await updateDataset((current) =>
        withAudit(
          {
            ...current,
            evidenceItems: [
              {
                id,
                caseId,
                userId,
                originalFileName: file.name,
                storedFileName:
                  uploaded?.storedFileName || buildStoredEvidenceName({ id, originalFileName: file.name }),
                fileType: uploaded?.fileType || normalizedFileType,
                fileSize: file.size,
                storageBucket: uploaded?.storageBucket,
                storagePath: uploaded?.storagePath,
                storageUploadedAt: uploaded?.storageUploadedAt,
                storageSha256: uploaded?.storageSha256,
                uploadedAt: now,
                evidenceDate: text(formData, "evidenceDate") || undefined,
                description: text(formData, "description") || undefined,
                tags: parseTags(text(formData, "tags")),
                includeInReports: formData.get("includeInReports") === "on",
                reviewStatus: "needs_review",
                malwareScanStatus: uploaded?.malwareScanStatus || "pending",
                createdAt: now,
                updatedAt: now,
              },
              ...current.evidenceItems,
            ],
          },
          {
            userId,
            caseId,
            action: "uploaded",
            entityType: "evidenceItem",
            entityId: id,
            metadataSummary:
              recordsStorageMode === "supabase"
                ? "Attached file stored in private storage after malware scanning."
                : "Attached file metadata stored without raw file path or contents.",
          }
        )
      );
      form.reset();
      flash(
        recordsStorageMode === "supabase"
          ? "File uploaded, scanned clean, and metadata saved."
          : "File metadata saved with allow list validation."
      );
    } catch (error) {
      flash(error instanceof Error ? error.message : "File upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function downloadEvidence(item: EvidenceItem) {
    if (recordsStorageMode !== "supabase" || !item.storagePath) {
      flash("This file record does not have a stored file to download.");
      return;
    }

    setBusyEvidenceId(item.id);
    try {
      const response = await fetch("/api/records/evidence/download", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidence: { id: item.id, caseId: item.caseId } }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "File download failed.");
      }

      const blob = await response.blob();
      await downloadBlobFile(evidenceFileName(item), blob);
      flash("File downloaded.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "File download failed.");
    } finally {
      setBusyEvidenceId("");
    }
  }

  function downloadEvidenceMetadata() {
    const rows = evidence.map((item) => ({
      file_name: evidenceFileName(item),
      original_upload_name: item.originalFileName,
      evidence_date: item.evidenceDate || "",
      uploaded_at: item.uploadedAt,
      file_type: item.fileType,
      file_size_bytes: item.fileSize,
      storage_status: item.storagePath ? "private file" : "metadata only",
      scan_status: item.malwareScanStatus || "pending",
      review_status: evidenceReviewStatusLabels[item.reviewStatus || "needs_review"],
      include_in_reports: item.includeInReports ? "yes" : "no",
      tags: item.tags.join("; "),
      description: item.description || "",
    }));
    downloadTextFile(
      `file-index-${formatLocalDate(new Date(), timezone)}.csv`,
      rowsToCsv(rows),
      "text/csv"
    );
    updateDataset((current) =>
      withAudit(current, {
        userId,
        caseId,
        action: "exported",
        entityType: "evidenceIndex",
        entityId: "file-index",
        metadataSummary: "File attachment metadata index exported.",
      })
    );
    flash("File index downloaded.");
  }

  function printEvidenceSheet(item: EvidenceItem) {
    const printHtml = buildEvidencePrintHtml(item);
    if (!shareHtmlAsPdf(`custody_folio_file_sheet_${item.id}.pdf`, printHtml)) {
      const printUrl = URL.createObjectURL(new Blob([printHtml], { type: "text/html" }));
      const printWindow = window.open(printUrl, "_blank", "width=900,height=700");
      if (!printWindow) {
        URL.revokeObjectURL(printUrl);
        flash("Popup blocked. Allow popups to print the file sheet.");
        return;
      }

      printWindow.opener = null;
      printWindow.addEventListener(
        "load",
        () => {
          printWindow.focus();
          printWindow.print();
        },
        { once: true }
      );
      window.setTimeout(() => URL.revokeObjectURL(printUrl), 60_000);
    }

    updateDataset((current) =>
      withAudit(current, {
        userId,
        caseId,
        action: "exported",
        entityType: "evidenceItem",
        entityId: item.id,
        metadataSummary: "File attachment metadata print sheet opened.",
      })
    );
    flash("File sheet opened.");
  }

  function updateEvidenceReviewStatus(item: EvidenceItem, reviewStatus: EvidenceReviewStatus) {
    const now = nowIso();
    updateDataset((current) =>
      withAudit(
        {
          ...current,
          evidenceItems: current.evidenceItems.map((record) => {
            if (record.id !== item.id || record.userId !== userId || record.caseId !== caseId) {
              return record;
            }

            return {
              ...record,
              reviewStatus,
              reviewedAt: reviewStatus === "reviewed" ? now : record.reviewedAt,
              submittedAt: reviewStatus === "submitted" ? now : record.submittedAt,
              updatedAt: now,
            };
          }),
        },
        {
          userId,
          caseId,
          action: "updated",
          entityType: "evidenceItem",
          entityId: item.id,
          metadataSummary: `File review status changed to ${evidenceReviewStatusLabels[reviewStatus]}.`,
        }
      )
    );
    flash(`File marked ${evidenceReviewStatusLabels[reviewStatus].toLowerCase()}.`);
  }

  function updateEvidenceMetadata(event: FormEvent<HTMLFormElement>, item: EvidenceItem) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const renamedFile = validateEvidenceDisplayFileName({
      displayFileName: text(formData, "displayFileName"),
      originalFileName: item.originalFileName,
    });
    if (!renamedFile.ok) return flash(renamedFile.error);

    const now = nowIso();
    updateDataset((current) =>
      withAudit(
        {
          ...current,
          evidenceItems: current.evidenceItems.map((record) =>
            record.id === item.id && record.userId === userId && record.caseId === caseId
              ? {
                  ...record,
                  displayFileName:
                    renamedFile.fileName === record.originalFileName
                      ? undefined
                      : renamedFile.fileName,
                  evidenceDate: text(formData, "evidenceDate") || undefined,
                  description: text(formData, "description") || undefined,
                  tags: parseTags(text(formData, "tags")),
                  includeInReports: formData.get("includeInReports") === "on",
                  updatedAt: now,
                }
              : record
          ),
        },
        {
          userId,
          caseId,
          action: "updated",
          entityType: "evidenceItem",
          entityId: item.id,
          metadataSummary:
            "User-facing file name and metadata updated. Original upload name, stored file, and contents unchanged.",
        }
      )
    );
    setEditingEvidenceId("");
    flash("File information updated.");
  }

  async function deleteEvidence(item: EvidenceItem) {
    if (editingEvidenceId === item.id) setEditingEvidenceId("");
    if (recordsStorageMode === "supabase" && item.storagePath) {
      setBusyEvidenceId(item.id);
      try {
        const response = await fetch("/api/records/evidence/delete", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ evidence: { id: item.id, caseId: item.caseId } }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || "File delete failed.");
        }
        await reloadDataset();
        flash("File and metadata deleted.");
        return;
      } catch (error) {
        flash(error instanceof Error ? error.message : "File delete failed.");
        setBusyEvidenceId("");
        return;
      } finally {
        setBusyEvidenceId("");
      }
    }

    updateDataset((current) =>
      withAudit(
        {
          ...current,
          evidenceItems: current.evidenceItems.filter(
            (record) => !(record.id === item.id && record.userId === userId && record.caseId === caseId)
          ),
        },
        {
          userId,
          caseId,
          action: "deleted",
          entityType: "evidenceItem",
          entityId: item.id,
          metadataSummary:
            recordsStorageMode === "supabase"
              ? "Attached file and metadata record deleted."
              : "Attached file metadata record deleted.",
        }
      )
    );
    flash(recordsStorageMode === "supabase" ? "File and metadata deleted." : "File metadata deleted.");
  }

  if (mode === "screenshots") {
    return (
      <div className="min-w-0 max-w-full space-y-4">
        <ExhibitBuilder
          cloudStorageEnabled={recordsStorageMode === "supabase"}
          onSave={saveScreenshotExhibit}
          onOpenFiles={onOpenFiles}
        />
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-950">
          Generated screenshot PDFs are saved in Files, where they can be reviewed, downloaded, or
          included in reports.
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-4">
      <div className="grid min-w-0 max-w-full gap-4 xl:grid-cols-[420px_1fr]">
      <Panel
        title="Private file attachment"
        action={recordsStorageMode === "supabase" ? "Private storage" : "Private drafting"}
      >
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
          Avoid uploading unnecessary Social Security numbers, full bank account numbers, card
          numbers, or unrelated third party private information. When cloud storage is active,
          files are saved only after validation and malware scanning. Private drafting mode saves
          file metadata only.
        </div>
        <form onSubmit={addEvidence} className="grid gap-3">
          <Field label="File">
            <input
              name="file"
              type="file"
              className="input"
              accept=".docx,.pdf,.png,.jpg,.jpeg,.heic,.heif,.txt,.csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,image/png,image/jpeg,image/heic,image/heif,text/plain,text/csv"
            />
          </Field>
          <Field label="Record date">
            <input
              name="evidenceDate"
              type="date"
              className="input"
              defaultValue={formatLocalDate(new Date(), timezone)}
            />
          </Field>
          <Field label="Description">
            <textarea name="description" className="input min-h-20" />
          </Field>
          <Field label="Tags">
            <input name="tags" className="input" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input name="includeInReports" type="checkbox" defaultChecked />
            Include in file index for selected reports
          </label>
          <button className="btn-primary" type="submit" disabled={uploading}>
            {uploading
              ? "Scanning and uploading..."
              : recordsStorageMode === "supabase"
                ? "Upload file"
                : "Save file record"}
          </button>
        </form>
      </Panel>

      <div className="space-y-4">
        <SectionExportPanel packet={sectionExport} onExport={onExportSection} />

        <Panel title="File index" action={`${evidence.length} records`}>
          {evidence.length === 0 ? (
            <Empty label="No files attached yet." />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-700">
                  {evidence.filter((item) => (item.reviewStatus || "needs_review") === "needs_review").length} need review
                </p>
                <button type="button" className="btn-secondary" onClick={downloadEvidenceMetadata}>
                  Download index
                </button>
              </div>
              <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
                {evidence.map((item) => (
                <div key={item.id} className="grid gap-3 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-sm font-semibold text-slate-950 [overflow-wrap:anywhere]">
                        {evidenceFileName(item)}
                      </h3>
                      {item.displayFileName ? (
                        <p className="mt-1 break-words text-xs leading-5 text-slate-500 [overflow-wrap:anywhere]">
                          Original upload: {item.originalFileName}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {item.evidenceDate || item.uploadedAt.slice(0, 10)} -{" "}
                        {Math.round(item.fileSize / 1024)} KB - {item.fileType}
                      </p>
                    </div>
                    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                      <select
                        aria-label={`Review status for ${evidenceFileName(item)}`}
                        value={item.reviewStatus || "needs_review"}
                        onChange={(event) =>
                          updateEvidenceReviewStatus(item, event.target.value as EvidenceReviewStatus)
                        }
                        className="h-9 max-w-full rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700"
                      >
                        {Object.entries(evidenceReviewStatusLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      {recordsStorageMode === "supabase" && item.storagePath ? (
                        <button
                          type="button"
                          className="btn-secondary px-3 py-1.5 text-xs"
                          disabled={busyEvidenceId === item.id || item.malwareScanStatus !== "clean"}
                          onClick={() => void downloadEvidence(item)}
                        >
                          {busyEvidenceId === item.id ? "Working" : "Download"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn-secondary px-3 py-1.5 text-xs"
                        aria-label={`Print file sheet ${evidenceFileName(item)}`}
                        onClick={() => printEvidenceSheet(item)}
                      >
                        Print sheet
                      </button>
                      <EditButton
                        ariaLabel={`Edit file information ${evidenceFileName(item)}`}
                        onClick={() => setEditingEvidenceId(item.id)}
                      />
                      <DeleteButton
                        label="Delete"
                        ariaLabel={`Delete file ${evidenceFileName(item)}`}
                        disabled={busyEvidenceId === item.id}
                        onClick={() => void deleteEvidence(item)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill label={`scan: ${item.malwareScanStatus || "pending"}`} />
                    <StatusPill label={evidenceReviewStatusLabels[item.reviewStatus || "needs_review"]} />
                    <StatusPill label={item.storagePath ? "private file" : "metadata only"} />
                    <StatusPill label={item.includeInReports ? "report included" : "not selected"} />
                  </div>
                  {item.description && editingEvidenceId !== item.id ? (
                    <p className="text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{item.description}</p>
                  ) : null}
                  {editingEvidenceId === item.id ? (
                    <form
                      key={`${item.id}-${item.updatedAt}`}
                      onSubmit={(event) => updateEvidenceMetadata(event, item)}
                      className="grid gap-3 rounded-md border border-teal-200 bg-teal-50/40 p-3"
                    >
                      <Field label="File name">
                        <input
                          name="displayFileName"
                          className="input"
                          defaultValue={evidenceFileName(item)}
                          maxLength={180}
                          required
                        />
                      </Field>
                      <p className="text-xs leading-5 text-slate-600">
                        Keep the existing file extension. Renaming changes the displayed and
                        downloaded name; the original upload name and stored file stay preserved.
                      </p>
                      <Field label="Record date">
                        <input name="evidenceDate" type="date" className="input" defaultValue={item.evidenceDate || ""} />
                      </Field>
                      <Field label="Description">
                        <textarea name="description" className="input min-h-20" defaultValue={item.description || ""} />
                      </Field>
                      <Field label="Tags">
                        <input name="tags" className="input" defaultValue={item.tags.join(", ")} />
                      </Field>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input name="includeInReports" type="checkbox" defaultChecked={item.includeInReports} />
                        Include in file index for selected reports
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" className="btn-primary">Update file information</button>
                        <button type="button" className="btn-secondary" onClick={() => setEditingEvidenceId("")}>
                          Cancel editing
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {item.reviewedAt || item.submittedAt ? (
                    <p className="text-xs text-slate-500">
                      {item.reviewedAt ? `Reviewed ${item.reviewedAt.slice(0, 10)}. ` : ""}
                      {item.submittedAt ? `Submitted ${item.submittedAt.slice(0, 10)}.` : ""}
                    </p>
                  ) : null}
                </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>
      </div>
    </div>
  );
}

function ChildSupportView({
  updateDataset,
  userId,
  caseId,
  timezone,
  orders,
  payments,
  obligations,
  historyObligations,
  supportRows,
  supportStats,
  flash,
}: {
  updateDataset: ReturnType<typeof useRecordsStore>["updateDataset"];
  userId: string;
  caseId: string;
  timezone: string;
  orders: ReturnType<typeof useSelectedRecords>["childSupportOrders"];
  payments: ReturnType<typeof useSelectedRecords>["childSupportPayments"];
  obligations: ChildSupportObligation[];
  historyObligations: ChildSupportObligation[];
  supportRows: Array<{ month: string; amountDue: number; amountPaid: number; unpaidBalance: number }>;
  supportStats: ReturnType<typeof calculateChildSupportObligationStats>;
  flash: (message: string) => void;
}) {
  const [supportTab, setSupportTab] = useState<"overview" | "order" | "payment" | "history">(
    orders.length > 0 ? "overview" : "order"
  );
  const [editingOrderId, setEditingOrderId] = useState("");
  const [editingPaymentId, setEditingPaymentId] = useState("");
  const [paymentOrderId, setPaymentOrderId] = useState("");
  const firstOrder = orders[0];
  const editingOrder = orders.find((order) => order.id === editingOrderId) || null;
  const editingPayment = payments.find((payment) => payment.id === editingPaymentId) || null;
  const today = formatLocalDate(new Date(), timezone);
  const activePaymentOrderId =
    editingPayment?.childSupportOrderId || paymentOrderId || firstOrder?.id || "";
  const activePaymentOrder =
    orders.find((order) => order.id === activePaymentOrderId) || firstOrder;
  const activeOrderObligations = historyObligations.filter(
    (obligation) => obligation.childSupportOrderId === activePaymentOrderId
  );
  const defaultPaymentDueDate = editingPayment?.dueDate || "";

  async function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = childSupportOrderSchema.safeParse({
      orderNickname: text(formData, "orderNickname"),
      orderedAmount: text(formData, "orderedAmount"),
      currency: text(formData, "currency"),
      paymentFrequency: text(formData, "paymentFrequency"),
      dueDayOrSchedule: text(formData, "dueDayOrSchedule"),
      effectiveStartDate: text(formData, "effectiveStartDate"),
      effectiveEndDate: text(formData, "effectiveEndDate"),
      firstPaymentDueDate: text(formData, "firstPaymentDueDate"),
      secondPaymentDueDate: text(formData, "secondPaymentDueDate"),
      payerLabel: text(formData, "payerLabel"),
      recipientLabel: text(formData, "recipientLabel"),
      paymentMethodExpected: text(formData, "paymentMethodExpected"),
      agencyOrCaseNumber: text(formData, "agencyOrCaseNumber"),
      notes: text(formData, "notes"),
    });
    if (!parsed.success) return flash(parsed.error.issues[0]?.message || "Check the support order form.");

    const now = nowIso();
    const orderId = editingOrder?.id || createId("support-order");
    try {
      await updateDataset((current) =>
        withAudit(
        {
          ...current,
          childSupportOrders: editingOrder
            ? current.childSupportOrders.map((order) =>
                order.id === editingOrder.id && order.userId === userId && order.caseId === caseId
                  ? { ...order, ...emptyToUndefined(parsed.data), updatedAt: now }
                  : order
              )
            : [
                {
                  id: orderId,
                  caseId,
                  userId,
                  createdAt: now,
                  updatedAt: now,
                  ...emptyToUndefined(parsed.data),
                },
                ...current.childSupportOrders,
              ],
        },
        {
          userId,
          caseId,
          action: editingOrder ? "updated" : "created",
          entityType: "childSupportOrder",
          entityId: orderId,
          metadataSummary: editingOrder
            ? "Child support order updated without agency details in audit metadata."
            : "Child support order created without agency details in audit metadata.",
        }
        )
      );
      setEditingOrderId("");
      form.reset();
      flash(editingOrder ? "Child support order updated and saved." : "Child support order saved. It appears below.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Child support order save failed.");
    }
  }

  async function savePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = childSupportPaymentSchema.safeParse({
      childSupportOrderId: text(formData, "childSupportOrderId"),
      dueDate: text(formData, "dueDate"),
      amountDue: text(formData, "amountDue"),
      amountPaid: text(formData, "amountPaid"),
      paymentDate: text(formData, "paymentDate"),
      paymentStatus: text(formData, "paymentStatus"),
      paymentMethod: text(formData, "paymentMethod"),
      referenceNumber: text(formData, "referenceNumber"),
      notes: text(formData, "notes"),
    });
    if (!parsed.success) return flash(parsed.error.issues[0]?.message || "Check the payment form.");

    const now = nowIso();
    const paymentId = editingPayment?.id || createId("support-payment");
    try {
      await updateDataset((current) =>
        withAudit(
        {
          ...current,
          childSupportPayments: editingPayment
            ? current.childSupportPayments.map((payment) =>
                payment.id === editingPayment.id && payment.userId === userId && payment.caseId === caseId
                  ? { ...payment, ...emptyToUndefined(parsed.data), updatedAt: now }
                  : payment
              )
            : [
                {
                  id: paymentId,
                  caseId,
                  userId,
                  createdAt: now,
                  updatedAt: now,
                  ...emptyToUndefined(parsed.data),
                },
                ...current.childSupportPayments,
              ],
        },
        {
          userId,
          caseId,
          action: editingPayment ? "updated" : "created",
          entityType: "childSupportPayment",
          entityId: paymentId,
          metadataSummary: editingPayment
            ? "Payment record updated without reference number in audit metadata."
            : "Payment record created without reference number in audit metadata.",
        }
        )
      );
      setEditingPaymentId("");
      form.reset();
      flash(editingPayment ? "Payment record updated and saved." : "Payment record saved. It appears below.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Payment record save failed.");
    }
  }

  function deleteSupportOrder(orderId: string) {
    if (payments.some((payment) => payment.childSupportOrderId === orderId)) {
      flash("Delete related payment records before deleting this support order.");
      return;
    }

    if (editingOrderId === orderId) setEditingOrderId("");
    if (paymentOrderId === orderId) setPaymentOrderId("");
    updateDataset((current) =>
      withAudit(
        {
          ...current,
          childSupportOrders: current.childSupportOrders.filter(
            (item) => !(item.id === orderId && item.userId === userId && item.caseId === caseId)
          ),
        },
        {
          userId,
          caseId,
          action: "deleted",
          entityType: "childSupportOrder",
          entityId: orderId,
          metadataSummary: "Child support order deleted after dependency check.",
        }
      )
    );
    flash("Child support order deleted.");
  }

  function deleteSupportPayment(paymentId: string) {
    if (editingPaymentId === paymentId) setEditingPaymentId("");
    updateDataset((current) =>
      withAudit(
        {
          ...current,
          childSupportPayments: current.childSupportPayments.filter(
            (item) => !(item.id === paymentId && item.userId === userId && item.caseId === caseId)
          ),
        },
        {
          userId,
          caseId,
          action: "deleted",
          entityType: "childSupportPayment",
          entityId: paymentId,
          metadataSummary: "Child support payment record deleted.",
        }
      )
    );
    flash("Payment record deleted.");
  }

  const supportEntryTab = supportTab === "order" || supportTab === "payment";

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="Child support sections">
        <div className="grid gap-2 sm:grid-cols-4">
          {([
            ["overview", "Overview"],
            ["order", orders.length ? "Order details" : "Set up an order"],
            ["payment", "Record a payment"],
            ["history", "History"],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setSupportTab(value)} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${supportTab === value ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}>{label}</button>
          ))}
        </div>
      </section>

      {supportTab === "overview" ? (
      <>
      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Due" value={formatMoney(supportStats.totalDue)} detail="From saved order terms" />
        <StatCard label="Paid" value={formatMoney(supportStats.totalPaid)} detail="Recorded payments" />
        <StatCard label="Remaining" value={formatMoney(supportStats.unpaidBalance)} detail="Due through today" tone="amber" />
        <StatCard label="Past due" value={formatMoney(supportStats.pastDueBalance)} detail={`${supportStats.pastDueCount} periods`} tone="amber" />
      </section>

      <details className="rounded-lg border border-blue-200 bg-blue-50">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-blue-950">How calculations work</summary>
        <p className="border-t border-blue-200 px-4 py-3 text-sm leading-6 text-blue-950">Custody Folio calculates scheduled obligations from the terms you enter and matches payments to the obligation due date. Check the results against the signed order or agency history before sharing.</p>
      </details>
      {orders.some(
        (order) => order.paymentFrequency !== "custom" && !order.firstPaymentDueDate
      ) ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          At least one saved order predates automatic schedule tracking. Edit that order and confirm
          its first payment due date before relying on the calculated obligation ledger.
        </div>
      ) : null}
      </>
      ) : null}

      <section
        className={`grid min-w-0 gap-4 ${supportEntryTab ? "xl:grid-cols-2" : "xl:grid-cols-[420px_1fr]"}`}
        data-testid="child-support-content-grid"
      >
        <div className={`min-w-0 space-y-4 ${supportEntryTab ? "xl:contents xl:space-y-0" : ""}`}>
          {supportEntryTab ? (
            <div className={supportTab === "payment" ? "hidden xl:block" : ""}>
              <Panel
                title={editingOrder ? "Edit child support order" : "Child support order"}
                action={editingOrder ? "Editing saved record" : "Documentation only"}
              >
                <form
                  id="child-support-order-form"
                  key={editingOrder?.id || "new-support-order"}
                  onSubmit={saveOrder}
                  className="grid gap-3"
            >
              <Field label="Order nickname">
                <input name="orderNickname" className="input" defaultValue={editingOrder?.orderNickname || "Current support order"} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Amount due each payment">
                  <input name="orderedAmount" type="number" step="0.01" className="input" defaultValue={editingOrder?.orderedAmount ?? 450} />
                </Field>
                <Field label="Currency">
                  <input name="currency" className="input" defaultValue={editingOrder?.currency || "USD"} />
                </Field>
              </div>
              <Field label="Payment frequency">
                <select name="paymentFrequency" className="input" defaultValue={editingOrder?.paymentFrequency || "monthly"}>
                  <option value="weekly">weekly</option>
                  <option value="biweekly">biweekly</option>
                  <option value="monthly">monthly</option>
                  <option value="semi_monthly">semi monthly</option>
                  <option value="custom">custom</option>
                </select>
              </Field>
              <Field label="Due day or schedule">
                <input name="dueDayOrSchedule" className="input" defaultValue={editingOrder?.dueDayOrSchedule || "1st day of each month"} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Order start date">
                  <input name="effectiveStartDate" type="date" className="input" defaultValue={editingOrder?.effectiveStartDate || today} required />
                </Field>
                <Field label="Order end date (optional)">
                  <input name="effectiveEndDate" type="date" className="input" defaultValue={editingOrder?.effectiveEndDate || ""} />
                </Field>
                <Field label="First payment due">
                  <input
                    name="firstPaymentDueDate"
                    type="date"
                    className="input"
                    defaultValue={editingOrder?.firstPaymentDueDate || editingOrder?.effectiveStartDate || today}
                  />
                </Field>
                <Field label="Second monthly due (semi monthly only)">
                  <input
                    name="secondPaymentDueDate"
                    type="date"
                    className="input"
                    defaultValue={editingOrder?.secondPaymentDueDate || ""}
                  />
                </Field>
              </div>
              <p className="text-xs leading-5 text-slate-500">
                Weekly and biweekly schedules repeat from the first payment due date. Monthly
                schedules repeat on that day of the month. Semi monthly schedules repeat both due
                dates each month. Custom schedules remain manually tracked.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Payer label">
                  <input name="payerLabel" className="input" defaultValue={editingOrder?.payerLabel || "Other Parent"} />
                </Field>
                <Field label="Recipient label">
                  <input name="recipientLabel" className="input" defaultValue={editingOrder?.recipientLabel || "Me"} />
                </Field>
              </div>
              <Field label="Expected method">
                <input name="paymentMethodExpected" className="input" defaultValue={editingOrder?.paymentMethodExpected || ""} />
              </Field>
              <Field label="Agency or case number">
                <input name="agencyOrCaseNumber" className="input" defaultValue={editingOrder?.agencyOrCaseNumber || ""} />
              </Field>
              <Field label="Notes">
                <textarea name="notes" className="input min-h-20" defaultValue={editingOrder?.notes || ""} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" type="submit">
                  {editingOrder ? "Update support order" : "Save support order"}
                </button>
                {editingOrder && (
                  <button type="button" className="btn-secondary" onClick={() => setEditingOrderId("")}>
                    Cancel editing
                  </button>
                )}
              </div>
                </form>
              </Panel>
            </div>
          ) : null}

          {supportTab === "history" ? <SupportOrdersPanel
            className="xl:hidden"
            testId="mobile-support-orders"
            orders={orders}
            onEdit={(orderId) => { setEditingOrderId(orderId); setSupportTab("order"); }}
            onDelete={deleteSupportOrder}
          /> : null}

          {supportEntryTab ? (
            <div className={supportTab === "order" ? "hidden xl:block" : ""}>
              <Panel
                title={editingPayment ? "Edit payment record" : "Log payment record"}
                action={editingPayment ? "Editing saved record" : "No payment processing"}
              >
                <form
                  id="child-support-payment-form"
                  key={editingPayment?.id || `new-support-payment-${activePaymentOrderId || "none"}`}
                  onSubmit={savePayment}
                  className="grid gap-3"
            >
              <Field label="Order">
                <select
                  name="childSupportOrderId"
                  className="input"
                  value={activePaymentOrderId}
                  onChange={(event) => setPaymentOrderId(event.target.value)}
                >
                  {orders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.orderNickname}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Applies to obligation due date">
                  <input
                    name="dueDate"
                    type="date"
                    className="input"
                    list="child-support-obligation-dates"
                    defaultValue={defaultPaymentDueDate}
                    required
                  />
                  <datalist id="child-support-obligation-dates">
                    {activeOrderObligations.map((obligation) => (
                      <option key={obligation.id} value={obligation.dueDate}>
                        {labelChildSupportObligationStatus(obligation.status)} · balance{" "}
                        {formatMoney(obligation.balance, obligation.currency)}
                      </option>
                    ))}
                  </datalist>
                </Field>
                <Field label="Payment date">
                  <input name="paymentDate" type="date" className="input" defaultValue={editingPayment?.paymentDate || ""} />
                </Field>
                <Field label="Amount due">
                  <input name="amountDue" type="number" step="0.01" className="input" defaultValue={editingPayment?.amountDue ?? activePaymentOrder?.orderedAmount ?? 0} />
                </Field>
                <Field label="Amount paid">
                  <input name="amountPaid" type="number" step="0.01" className="input" defaultValue={editingPayment?.amountPaid ?? 0} />
                </Field>
              </div>
              <p className="text-xs leading-5 text-slate-500">
                Select the obligation this payment applies to; Custody Folio will not infer that
                allocation. An August payment for July should use July&apos;s due date and the
                actual August payment date. Split a payment into separate records if it covers more
                than one obligation.
              </p>
              <Field label="Status">
                <select name="paymentStatus" className="input" defaultValue={editingPayment?.paymentStatus || "unpaid"}>
                  {paymentStatuses.map((status) => (
                    <option key={status} value={status}>
                      {labelPaymentStatus(status)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Payment method">
                <select name="paymentMethod" className="input" defaultValue={editingPayment?.paymentMethod || "unknown"}>
                  {[
                    "state_agency",
                    "wage_withholding",
                    "bank_transfer",
                    "check",
                    "cash",
                    "money_order",
                    "payment_app",
                    "other",
                    "unknown",
                  ].map((method) => (
                    <option key={method} value={method}>
                      {method.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Reference number">
                <input name="referenceNumber" className="input" defaultValue={editingPayment?.referenceNumber || ""} />
              </Field>
              <Field label="Notes">
                <textarea name="notes" className="input min-h-20" defaultValue={editingPayment?.notes || ""} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" type="submit" disabled={orders.length === 0}>
                  {editingPayment ? "Update payment record" : "Save payment record"}
                </button>
                {editingPayment && (
                  <button type="button" className="btn-secondary" onClick={() => setEditingPaymentId("")}>
                    Cancel editing
                  </button>
                )}
              </div>
                </form>
              </Panel>
            </div>
          ) : null}

          {supportTab === "history" ? <SupportPaymentsPanel
            className="xl:hidden"
            testId="mobile-support-payments"
            payments={payments}
            onEdit={(paymentId) => { setEditingPaymentId(paymentId); setSupportTab("payment"); }}
            onDelete={deleteSupportPayment}
          /> : null}
        </div>

        {!supportEntryTab ? (
          <div className="min-w-0 space-y-4">
            {supportTab === "history" ? <SupportOrdersPanel
              className="hidden xl:block"
              orders={orders}
              onEdit={(orderId) => { setEditingOrderId(orderId); setSupportTab("order"); }}
              onDelete={deleteSupportOrder}
            /> : null}

            {supportTab === "overview" && supportRows.length > 0 ? (
              <Panel title="Payment history by month" action="Due vs paid">
                <p className="mb-3 text-xs leading-5 text-slate-500">
                  Full order history through today or the latest saved payment month. Scheduled months
                  without a recorded payment remain visible.
                </p>
                <SupportTrendLine rows={supportRows} />
              </Panel>
            ) : null}
            {supportTab === "overview" || supportTab === "history" ? (
              <SupportObligationsPanel
                obligations={supportTab === "history" ? historyObligations : obligations}
              />
            ) : null}
            {supportTab === "history" ? <SupportPaymentsPanel
              className="hidden xl:block"
              payments={payments}
              onEdit={(paymentId) => { setEditingPaymentId(paymentId); setSupportTab("payment"); }}
              onDelete={deleteSupportPayment}
            /> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function SupportOrdersPanel({
  orders,
  onEdit,
  onDelete,
  className = "",
  testId,
}: {
  orders: RecordsDataset["childSupportOrders"];
  onEdit: (orderId: string) => void;
  onDelete: (orderId: string) => void;
  className?: string;
  testId?: string;
}) {
  function editOrder(orderId: string) {
    onEdit(orderId);
    window.requestAnimationFrame(() =>
      document.getElementById("child-support-order-form")?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }

  return (
    <div className={className} data-testid={testId}>
    <Panel title="Support orders" action={`${orders.length} saved`}>
      <Table
        headers={["Order", "Amount", "Frequency", "Starts", "First due", "Payer", "Recipient", "Actions"]}
        rows={orders.map((order) => [
          order.orderNickname,
          formatMoney(order.orderedAmount, order.currency),
          order.paymentFrequency.replaceAll("_", " "),
          order.effectiveStartDate,
          order.firstPaymentDueDate || "Manual tracking",
          order.payerLabel,
          order.recipientLabel,
          <div key={order.id} className="flex flex-wrap gap-2">
            <EditButton
              ariaLabel={`Edit support order ${order.orderNickname}`}
              onClick={() => editOrder(order.id)}
            />
            <DeleteButton
              label="Delete"
              ariaLabel={`Delete support order ${order.orderNickname}`}
              onClick={() => onDelete(order.id)}
            />
          </div>,
        ])}
      />
    </Panel>
    </div>
  );
}

function labelChildSupportObligationStatus(status: ChildSupportObligation["status"]) {
  if (status === "upcoming") return "Upcoming";
  if (status === "due") return "Due today";
  return labelPaymentStatus(status);
}

function SupportObligationsPanel({
  obligations,
}: {
  obligations: ChildSupportObligation[];
}) {
  return (
    <Panel title="Calculated obligation ledger" action={`${obligations.length} scheduled periods`}>
      <p className="mb-3 text-xs leading-5 text-slate-500">
        Scheduled rows are calculated from saved order terms. Payment amounts and dates come from
        user-entered payment records matched to each due date.
      </p>
      <Table
        headers={["Order", "Due date", "Scheduled due", "Recorded paid", "Balance", "Payment date", "Status", "Source"]}
        rows={obligations.map((obligation) => [
          obligation.orderNickname,
          obligation.dueDate,
          formatMoney(obligation.amountDue, obligation.currency),
          formatMoney(obligation.amountPaid, obligation.currency),
          formatMoney(obligation.balance, obligation.currency),
          obligation.paymentDate || "",
          <StatusPill
            key={`${obligation.id}-status`}
            label={labelChildSupportObligationStatus(obligation.status)}
          />,
          obligation.source === "order_schedule" ? "Calculated schedule" : "Manual due date",
        ])}
      />
    </Panel>
  );
}

function SupportPaymentsPanel({
  payments,
  onEdit,
  onDelete,
  className = "",
  testId,
}: {
  payments: RecordsDataset["childSupportPayments"];
  onEdit: (paymentId: string) => void;
  onDelete: (paymentId: string) => void;
  className?: string;
  testId?: string;
}) {
  function editPayment(paymentId: string) {
    onEdit(paymentId);
    window.requestAnimationFrame(() =>
      document.getElementById("child-support-payment-form")?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }

  return (
    <div className={className} data-testid={testId}>
    <Panel title="Payment records" action={`${payments.length} records`}>
      <Table
        headers={["Due date", "Due", "Paid", "Payment date", "Status", "Actions"]}
        rows={payments.map((payment) => [
          payment.dueDate,
          formatMoney(payment.amountDue),
          formatMoney(payment.amountPaid),
          payment.paymentDate || "",
          <StatusPill key={payment.id} label={labelPaymentStatus(payment.paymentStatus)} />,
          <div key={payment.id} className="flex flex-wrap gap-2">
            <EditButton
              ariaLabel={`Edit payment record ${payment.dueDate} for ${formatMoney(payment.amountDue)}`}
              onClick={() => editPayment(payment.id)}
            />
            <DeleteButton
              label="Delete"
              ariaLabel={`Delete payment record ${payment.dueDate} for ${formatMoney(payment.amountDue)}`}
              onClick={() => onDelete(payment.id)}
            />
          </div>,
        ])}
      />
    </Panel>
    </div>
  );
}

function ExpensesView({
  updateDataset,
  userId,
  caseId,
  expenses,
  expenseStats,
  flash,
}: {
  updateDataset: ReturnType<typeof useRecordsStore>["updateDataset"];
  userId: string;
  caseId: string;
  expenses: ReturnType<typeof useSelectedRecords>["expenseItems"];
  expenseStats: ReturnType<typeof calculateExpenseStats>;
  flash: (message: string) => void;
}) {
  const [expenseTab, setExpenseTab] = useState<"overview" | "add" | "history">("overview");
  const [reimbursementRequested, setReimbursementRequested] = useState(true);
  const [editingExpenseId, setEditingExpenseId] = useState("");
  const editingExpense = expenses.find((expense) => expense.id === editingExpenseId) || null;

  async function saveExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = expenseItemSchema.safeParse({
      expenseDate: text(formData, "expenseDate"),
      category: text(formData, "category"),
      description: text(formData, "description"),
      amount: text(formData, "amount"),
      currency: text(formData, "currency"),
      paidByLabel: text(formData, "paidByLabel"),
      reimbursementRequested: formData.get("reimbursementRequested") === "on",
      reimbursementDueDate: text(formData, "reimbursementDueDate"),
      amountReimbursed: Number(text(formData, "amountReimbursed") || 0),
      reimbursementDate: text(formData, "reimbursementDate"),
      reimbursementStatus: text(formData, "reimbursementStatus"),
      notes: text(formData, "notes"),
    });
    if (!parsed.success) return flash(parsed.error.issues[0]?.message || "Check the expense form.");

    const now = nowIso();
    const expenseId = editingExpense?.id || createId("expense");
    try {
      await updateDataset((current) =>
        withAudit(
        {
          ...current,
          expenseItems: editingExpense
            ? current.expenseItems.map((expense) =>
                expense.id === editingExpense.id && expense.userId === userId && expense.caseId === caseId
                  ? { ...expense, ...emptyToUndefined(parsed.data), updatedAt: now }
                  : expense
              )
            : [
                {
                  id: expenseId,
                  userId,
                  caseId,
                  createdAt: now,
                  updatedAt: now,
                  ...emptyToUndefined(parsed.data),
                },
                ...current.expenseItems,
              ],
        },
        {
          userId,
          caseId,
          action: editingExpense ? "updated" : "created",
          entityType: "expenseItem",
          entityId: expenseId,
          metadataSummary: editingExpense
            ? "Expense item updated without receipt contents in audit metadata."
            : "Expense item created without receipt contents in audit metadata.",
        }
        )
      );
      setEditingExpenseId("");
      form.reset();
      setReimbursementRequested(true);
      flash(editingExpense ? "Expense record updated and saved." : "Expense record saved. It appears below.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Expense record save failed.");
    }
  }

  function deleteExpense(expenseId: string) {
    if (editingExpenseId === expenseId) setEditingExpenseId("");
    updateDataset((current) =>
      withAudit(
        {
          ...current,
          expenseItems: current.expenseItems.filter(
            (item) => !(item.id === expenseId && item.userId === userId && item.caseId === caseId)
          ),
        },
        {
          userId,
          caseId,
          action: "deleted",
          entityType: "expenseItem",
          entityId: expenseId,
          metadataSummary: "Expense record deleted.",
        }
      )
    );
    flash("Expense record deleted.");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">
        Totals, category chart, and the lawyer/court export include all saved expense records.
        Use Reports when you need a custom date range.
      </p>
      <section className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="Expense sections">
        <div className="grid gap-2 sm:grid-cols-3">
          {(["overview", "add", "history"] as const).map((value) => (
            <button key={value} type="button" onClick={() => setExpenseTab(value)} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${expenseTab === value ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}>
              {value === "overview" ? "Overview" : value === "add" ? "Add expense" : "History"}
            </button>
          ))}
        </div>
      </section>
      {expenseTab === "overview" ? (
      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Total recorded" value={formatMoney(expenseStats.totalExpenses)} detail="Selected range" />
        <StatCard label="Requested" value={formatMoney(expenseStats.reimbursementRequested)} detail="Reimbursement records" />
        <StatCard label="Received" value={formatMoney(expenseStats.reimbursementReceived)} detail="Recorded reimbursements" />
        <StatCard label="Remaining" value={formatMoney(expenseStats.unpaidReimbursement)} detail="Based on your records" tone="amber" />
      </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
        {expenseTab === "add" ? (
        <Panel title={editingExpense ? "Edit expense record" : "Add expense record"} action="Custody related expense">
          <form
            id="expense-record-form"
            key={editingExpense?.id || "new-expense"}
            onSubmit={saveExpense}
            className="grid gap-3"
          >
            <Field label="Expense date">
              <input name="expenseDate" type="date" className="input" defaultValue={editingExpense?.expenseDate || "2026-06-05"} />
            </Field>
            <Field label="Category">
              <select name="category" className="input" defaultValue={editingExpense?.category || "school"}>
                {["medical", "school", "childcare", "extracurricular", "transportation", "clothing", "supplies", "other"].map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description">
              <input name="description" className="input" defaultValue={editingExpense?.description || ""} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Amount">
                <input name="amount" type="number" step="0.01" className="input" defaultValue={editingExpense?.amount ?? ""} />
              </Field>
              <Field label="Currency">
                <input name="currency" className="input" defaultValue={editingExpense?.currency || "USD"} />
              </Field>
            </div>
            <Field label="Paid by label">
              <input name="paidByLabel" className="input" defaultValue={editingExpense?.paidByLabel || "Me"} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input name="reimbursementRequested" type="checkbox" checked={reimbursementRequested} onChange={(event) => setReimbursementRequested(event.target.checked)} />
              Reimbursement requested
            </label>
            {reimbursementRequested ? (
            <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Due date">
                <input name="reimbursementDueDate" type="date" className="input" defaultValue={editingExpense?.reimbursementDueDate || ""} />
              </Field>
              <Field label="Reimbursement date">
                <input name="reimbursementDate" type="date" className="input" defaultValue={editingExpense?.reimbursementDate || ""} />
              </Field>
              <Field label="Amount reimbursed">
                <input name="amountReimbursed" type="number" step="0.01" className="input" defaultValue={editingExpense?.amountReimbursed ?? 0} />
              </Field>
            </div>
            <Field label="Reimbursement status">
              <select name="reimbursementStatus" className="input" defaultValue={editingExpense?.reimbursementStatus || "requested"}>
                {[
                  "not_requested",
                  "requested",
                  "partially_reimbursed",
                  "reimbursed",
                  "unpaid",
                  "disputed",
                  "unknown",
                ].map((status) => (
                  <option key={status} value={status}>
                    {status.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </Field>
            </>
            ) : null}
            <Field label="Notes">
              <textarea name="notes" className="input min-h-20" defaultValue={editingExpense?.notes || ""} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" type="submit">
                {editingExpense ? "Update expense" : "Save expense"}
              </button>
              {editingExpense && (
                <button type="button" className="btn-secondary" onClick={() => setEditingExpenseId("")}>
                  Cancel editing
                </button>
              )}
            </div>
          </form>
        </Panel>
        ) : null}

        <div className="min-w-0 space-y-4">
          {expenseTab === "overview" && expenseStats.byCategory.length > 0 ? <Panel title="Expenses by category" action={`${expenses.length} records`}>
            <ExpenseCategoryChart rows={expenseStats.byCategory} />
          </Panel> : null}
          {expenseTab === "history" ? <Panel title="Expense records" action={`${expenses.length} saved`}>
            <Table
              headers={["Date", "Category", "Description", "Amount", "Reimbursement", "Action"]}
              rows={expenses.map((expense) => [
                expense.expenseDate,
                expense.category,
                expense.description,
                formatMoney(expense.amount),
                expense.reimbursementStatus.replaceAll("_", " "),
                <div key={expense.id} className="flex flex-wrap gap-2">
                  <EditButton
                    ariaLabel={`Edit expense ${expense.description}`}
                    onClick={() => {
                      setEditingExpenseId(expense.id);
                      setReimbursementRequested(expense.reimbursementRequested);
                      setExpenseTab("add");
                      window.requestAnimationFrame(() =>
                        document.getElementById("expense-record-form")?.scrollIntoView({ behavior: "smooth", block: "start" })
                      );
                    }}
                  />
                  <DeleteButton
                    label="Delete"
                    ariaLabel={`Delete expense ${expense.description}`}
                    onClick={() => deleteExpense(expense.id)}
                  />
                </div>,
              ])}
            />
          </Panel> : null}
        </div>
      </section>
    </div>
  );
}

function ReportsView({
  reportType,
  setReportType,
  preview,
  userId,
  caseId,
  range,
  terminology,
  updateDataset,
  flash,
}: {
  reportType: ReportType;
  setReportType: (type: ReportType) => void;
  preview: ReturnType<typeof buildReportPreview>;
  userId: string;
  caseId: string;
  range: DateRange;
  terminology: CaseTerminology;
  updateDataset: ReturnType<typeof useRecordsStore>["updateDataset"];
  flash: (message: string) => void;
}) {
  const [reportStep, setReportStep] = useState<"choose" | "preview" | "export">("choose");
  const [exportReview, setExportReview] = useState<Record<ExportReviewKey, boolean>>({
    neutralLabels: false,
    paymentRefs: false,
    notes: false,
  });
  const exportReviewComplete = exportReviewItems.every((item) => exportReview[item.key]);
  const reportOptions = reportsTabReportTypes.map((item) => {
    if (item.value === "exchange_compliance") {
      return { ...item, label: `${terminology.parentingTime} Report` };
    }
    if (item.value === "facetime_cancellations") {
      return { ...item, label: `${terminology.communication} Report` };
    }
    if (item.value === "filing_facetime_correlation") {
      return { ...item, label: `Filing / ${terminology.communication} Timing Report` };
    }
    return item;
  });
  const selectedReportOption =
    reportOptions.find((item) => item.value === reportType) || reportOptions[0];

  function toggleExportReview(key: ExportReviewKey, checked: boolean) {
    setExportReview((current) => ({ ...current, [key]: checked }));
  }

  function downloadCsv() {
    if (!exportReviewComplete) {
      flash("Complete the export review first.");
      return;
    }
    const csv = reportPreviewToCsv(preview);
    downloadTextFile(`custody_folio_records_${reportType}_${range.from}_${range.to}.csv`, csv, "text/csv");
    updateDataset((current) =>
      withAudit(current, {
        userId,
        caseId,
        action: "exported",
        entityType: "report",
        entityId: reportType,
        metadataSummary: "CSV report exported without sensitive row contents in audit metadata.",
      })
    );
    flash("CSV report downloaded.");
  }

  async function printPdf() {
    if (!exportReviewComplete) {
      flash("Complete the export review first.");
      return;
    }
    try {
      const generated = generatePrintableReportPdf(
        printableReportPacket(preview, range)
      );
      await downloadBlobFile(
        `custody_folio_records_${reportType}_${range.from}_${range.to}.pdf`,
        generated.blob
      );
    } catch (error) {
      flash(error instanceof Error ? error.message : "PDF export failed.");
      return;
    }
    updateDataset((current) =>
      withAudit(current, {
        userId,
        caseId,
        action: "exported",
        entityType: "report",
        entityId: reportType,
        metadataSummary: "Printable PDF report generated for print or save.",
      })
    );
    flash("PDF report ready to print or save.");
  }

  return (
    <div className="report-print-layout min-w-0 space-y-4">
      <section className="no-print rounded-xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="Report steps">
        <div className="grid gap-2 sm:grid-cols-3">
          {([[
            "choose", "1. Choose report"
          ], ["preview", "2. Preview"], ["export", "3. Review & export"]] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setReportStep(value)} disabled={value !== "choose" && !preview} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${reportStep === value ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}>{label}</button>
          ))}
        </div>
      </section>

      {reportStep === "choose" ? (
      <Panel title="Choose a report" action="Step 1" className="report-builder-panel no-print">
        <div className="grid gap-3">
          <Field label="Report type">
            <select
              value={reportType}
              onChange={(event) => setReportType(event.target.value as ReportType)}
              className="input"
            >
              {reportOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          {selectedReportOption && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
              <p className="font-semibold text-slate-950">{selectedReportOption.label}</p>
              <p>{selectedReportOption.description}</p>
            </div>
          )}
          <button type="button" className="btn-primary" onClick={() => setReportStep("preview")}>Preview report</button>
        </div>
      </Panel>
      ) : null}

      {reportStep === "export" ? (
      <Panel title="Review privacy and export" action="Step 3" className="report-builder-panel no-print">
        <div className="grid gap-3">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-950">Before downloading</p>
            <div className="mt-3 space-y-2">
              {exportReviewItems.map((item) => (
                <label key={item.key} className="flex items-start gap-2 text-xs leading-5 text-amber-950">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={exportReview[item.key]}
                    onChange={(event) => toggleExportReview(item.key, event.target.checked)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>
          <button className="btn-primary" type="button" onClick={downloadCsv} disabled={!exportReviewComplete}>
            Download CSV
          </button>
          <button className="btn-secondary" type="button" onClick={() => void printPdf()} disabled={!exportReviewComplete}>
            Print or save PDF
          </button>
          <p className="text-xs leading-5 text-slate-500">
            CSV contains the report&apos;s dated record rows in a clean table. PDF output is a
            complete letter size file that can be printed or saved. Downloaded reports leave
            protected storage. Review where you save or share them.
          </p>
        </div>
      </Panel>
      ) : null}

      {reportStep !== "choose" ? (
      <Panel title={preview.title} action={preview.caseName} className="report-preview-panel">
        <article className="report-surface space-y-5">
          <div className="border-b border-slate-200 pb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {range.from} to {range.to}
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              {preview.title}
            </h2>
            <p className="mt-2 text-sm font-semibold text-slate-800">{preview.focus}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{preview.disclaimer}</p>
            <p className="mt-2 text-xs text-slate-500">Generated {preview.generatedAt}</p>
          </div>
          <div className="report-metrics grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {preview.metrics.map((metric) => (
              <StatMini key={metric.label} label={metric.label} value={String(metric.value)} />
            ))}
          </div>
          <div className="report-summary-list grid gap-3">
            {preview.summaries.map((summary) => (
              <p key={summary} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                {summary}
              </p>
            ))}
          </div>
          <div className="report-chart-list grid gap-3">
            {preview.charts.filter((chart) => chart.rows.some((row) => row.value || row.secondaryValue || row.tertiaryValue)).map((chart) => (
              <ReportPreviewChartCard key={chart.title} chart={chart} />
            ))}
          </div>
          <div className="space-y-4">
            {preview.tables.filter((table) => table.rows.length > 0).map((table) => (
              <div key={table.title} className="report-table-section">
                <h3 className="mb-2 text-sm font-semibold text-slate-950">{table.title}</h3>
                <div className="screen-only">
                  <Table headers={table.headers} rows={table.rows.slice(0, 24)} />
                </div>
                <ReportPrintRows headers={table.headers} rows={table.rows.slice(0, 24)} />
                {table.rows.length > 24 && (
                  <p className="mt-2 text-xs text-slate-500">
                    {table.rows.length - 24} more rows included in the complete CSV and PDF exports.
                  </p>
                )}
              </div>
            ))}
            {preview.tables.every((table) => table.rows.length === 0) ? (
              <Empty label="No records match this report and date range. Try another range or report type." />
            ) : null}
          </div>
          {preview.evidenceIndex.length > 0 && (
            <div className="report-table-section">
              <h3 className="mb-2 text-sm font-semibold text-slate-950">Supporting file index</h3>
              {(() => {
                const headers = ["Index", "File", "Date", "Description", "Tags", "Scan", "Storage"];
                const rows = preview.evidenceIndex.map((item) => [
                  item.index,
                  item.fileName,
                  item.evidenceDate,
                  item.description,
                  item.tags,
                  item.scanStatus,
                  item.storageStatus,
                ]);
                return (
                  <>
                    <div className="screen-only">
                      <Table headers={headers} rows={rows} />
                    </div>
                    <ReportPrintRows headers={headers} rows={rows} />
                  </>
                );
              })()}
            </div>
          )}
        </article>
      </Panel>
      ) : null}
    </div>
  );
}

function RecordsTimezoneSelect({
  defaultValue,
}: {
  defaultValue: string;
}) {
  const hasSavedOption = recordsTimezoneOptions.some(
    (option) => option.value === defaultValue
  );

  return (
    <select name="timezone" className="input" defaultValue={defaultValue}>
      {!hasSavedOption ? (
        <option value={defaultValue}>{defaultValue} — currently saved</option>
      ) : null}
      {recordsTimezoneOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function SettingsView({
  dataset,
  updateDataset,
  resetDemoData,
  selected,
  userId,
  caseId,
  setSelectedCaseId,
  logout,
  flash,
  storageStatus,
  recordsStorageMode,
  onOpenAttorneyAccess,
  billingStatus,
  billingLoading,
  billingError,
  onOpenSubscription,
}: {
  dataset: RecordsDataset;
  updateDataset: ReturnType<typeof useRecordsStore>["updateDataset"];
  resetDemoData: () => void;
  selected: ReturnType<typeof useSelectedRecords>;
  userId: string;
  caseId: string;
  setSelectedCaseId: (caseId: string) => void;
  logout: () => void;
  flash: (message: string) => void;
  storageStatus: string;
  recordsStorageMode: "local" | "supabase";
  onOpenAttorneyAccess: () => void;
  billingStatus: BillingStatus | null;
  billingLoading: boolean;
  billingError: string | null;
  onOpenSubscription: () => void;
}) {
  const profile = dataset.users.find((user) => user.userId === userId);
  const selectedMatter = selected.matter;
  const [settingsSection, setSettingsSection] = useState<
    "profile" | "case" | "personalize" | "security"
  >("profile");

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const displayName = text(formData, "displayName");
    if (displayName.length < 2 || displayName.length > 120) {
      return flash("Enter the client name or clear identifying label that should be shown to an invited attorney.");
    }
    const parsedTimezone = timezoneSchema.safeParse(
      text(formData, "timezone") || profile?.timezone || defaultRecordsTimezone
    );
    if (!parsedTimezone.success) return flash(parsedTimezone.error.issues[0]?.message || "Check the timezone.");

    try {
      await updateDataset((current) => ({
        ...current,
        users: current.users.map((user) =>
          user.userId === userId
            ? {
                ...user,
                displayName,
                timezone: parsedTimezone.data,
                attorneySharingProfileConfirmedAt: nowIso(),
                updatedAt: nowIso(),
              }
            : user
        ),
      }));
      flash("Account settings updated and saved.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Account settings save failed.");
    }
  }

  async function createMatter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = custodyMatterSchema.safeParse({
      caseName: text(formData, "caseName"),
      courtOrOrderNickname: text(formData, "courtOrOrderNickname"),
      courtName: text(formData, "courtName"),
      orderDate: text(formData, "orderDate"),
      effectiveStartDate: text(formData, "effectiveStartDate"),
      childDisplayLabels: parseTags(text(formData, "childDisplayLabels")),
      userRoleLabel: text(formData, "userRoleLabel"),
      otherParentLabel: text(formData, "otherParentLabel"),
      defaultExchangeLocation: text(formData, "defaultExchangeLocation"),
      timezone: text(formData, "timezone") || profile?.timezone || defaultRecordsTimezone,
      notes: text(formData, "notes"),
    });
    if (!parsed.success) return flash(parsed.error.issues[0]?.message || "Check the custody matter form.");

    const id = createId("case");
    try {
      await updateDataset((current) =>
        withAudit(
        {
          ...current,
          matters: [
            {
              id,
              userId,
              createdAt: nowIso(),
              updatedAt: nowIso(),
              ...emptyToUndefined(parsed.data),
            },
            ...current.matters,
          ],
        },
        {
          userId,
          caseId: id,
          action: "created",
          entityType: "custodyMatter",
          entityId: id,
          metadataSummary: "Custody matter created without court or child labels in audit metadata.",
        }
        )
      );
      setSelectedCaseId(id);
      form.reset();
      flash("Custody matter created, saved, and selected.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Custody matter creation failed.");
    }
  }

  async function updateMatter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMatter) return flash("Select a custody matter first.");

    const formData = new FormData(event.currentTarget);
    const parsed = custodyMatterSchema.safeParse({
      caseName: text(formData, "caseName"),
      courtOrOrderNickname: text(formData, "courtOrOrderNickname"),
      courtName: text(formData, "courtName"),
      orderDate: text(formData, "orderDate"),
      effectiveStartDate: text(formData, "effectiveStartDate"),
      effectiveEndDate: text(formData, "effectiveEndDate"),
      childDisplayLabels: parseTags(text(formData, "childDisplayLabels")),
      userRoleLabel: text(formData, "userRoleLabel"),
      otherParentLabel: text(formData, "otherParentLabel"),
      defaultExchangeLocation: text(formData, "defaultExchangeLocation"),
      timezone: text(formData, "timezone") || profile?.timezone || defaultRecordsTimezone,
      notes: text(formData, "notes"),
    });
    if (!parsed.success) return flash(parsed.error.issues[0]?.message || "Check the selected case form.");

    try {
      await updateDataset((current) =>
        withAudit(
        {
          ...current,
          matters: current.matters.map((matter) =>
            matter.id === selectedMatter.id && matter.userId === userId
              ? {
                  ...matter,
                  ...emptyToUndefined(parsed.data),
                  updatedAt: nowIso(),
                }
              : matter
          ),
        },
        {
          userId,
          caseId: selectedMatter.id,
          action: "updated",
          entityType: "custodyMatter",
          entityId: selectedMatter.id,
          metadataSummary: "Custody matter settings updated without court or child labels in audit metadata.",
        }
        )
      );
      flash("Selected case settings updated and saved.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Selected case settings save failed.");
    }
  }

  async function updateTerminology(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMatter) return flash("Select a case before customizing its labels.");
    const formData = new FormData(event.currentTarget);
    const terminology = resolveCaseTerminology(
      Object.fromEntries(
        caseTerminologyFields.map((field) => [field.key, text(formData, field.key)])
      ) as Partial<CaseTerminology>
    );

    try {
      await updateDataset((current) => ({
        ...current,
        matters: current.matters.map((matter) =>
          matter.id === selectedMatter.id && matter.userId === userId
            ? { ...matter, terminology, updatedAt: nowIso() }
            : matter
        ),
      }));
      flash("Your labels were saved and applied across this case.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Label customization failed.");
    }
  }

  async function resetTerminology() {
    if (!selectedMatter) return flash("Select a case before resetting its labels.");

    try {
      await updateDataset((current) => ({
        ...current,
        matters: current.matters.map((matter) =>
          matter.id === selectedMatter.id && matter.userId === userId
            ? { ...matter, terminology: defaultCaseTerminology, updatedAt: nowIso() }
            : matter
        ),
      }));
      flash("Default labels were restored for this case.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Label reset failed.");
    }
  }

  async function deleteCase() {
    try {
      await updateDataset((current) => ({
        ...current,
        matters: current.matters.filter((item) => item.id !== caseId || item.userId !== userId),
        exchangeRules: current.exchangeRules.filter((item) => item.caseId !== caseId || item.userId !== userId),
        scheduleExceptions: current.scheduleExceptions.filter((item) => item.caseId !== caseId || item.userId !== userId),
        custodyDayAssignments: current.custodyDayAssignments.filter(
          (item) => item.caseId !== caseId || item.userId !== userId
        ),
        exchangeLogs: current.exchangeLogs.filter((item) => item.caseId !== caseId || item.userId !== userId),
        dateNotes: current.dateNotes.filter((item) => item.caseId !== caseId || item.userId !== userId),
        evidenceItems: current.evidenceItems.filter((item) => item.caseId !== caseId || item.userId !== userId),
        childSupportOrders: current.childSupportOrders.filter((item) => item.caseId !== caseId || item.userId !== userId),
        childSupportPayments: current.childSupportPayments.filter((item) => item.caseId !== caseId || item.userId !== userId),
        expenseItems: current.expenseItems.filter((item) => item.caseId !== caseId || item.userId !== userId),
      }));
      setSelectedCaseId(
        selected.matters.find((matter) => matter.id !== caseId)?.id ||
          (recordsStorageMode === "supabase"
            ? defaultCaseIdForUser(userId)
            : demoCaseId)
      );
      flash("Selected case deleted.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Case deletion failed.");
    }
  }

  function exportData() {
    const scoped = {
      user: profile,
      matters: selected.matters,
      exchangeRules: selected.exchangeRules,
      scheduleExceptions: dataset.scheduleExceptions.filter(
        (item) => item.userId === userId && item.caseId === caseId
      ),
      custodyDayAssignments: selected.custodyDayAssignments,
      exchangeLogs: selected.exchangeLogs,
      dateNotes: selected.dateNotes,
      evidenceItems: selected.evidenceItems,
      childSupportOrders: selected.childSupportOrders,
      childSupportPayments: selected.childSupportPayments,
      expenseItems: selected.expenseItems,
      auditLogs: selected.auditLogs,
    };
    const backup = {
      format: "custody_folio_selected_case_backup",
      schemaVersion: 1,
      exportedAt: nowIso(),
      data: scoped,
    };
    downloadTextFile(
      `custody_folio_selected_case_backup_${formatLocalDate(new Date(), profile?.timezone)}.json`,
      JSON.stringify(backup, null, 2),
      "application/json"
    );
    flash("Advanced JSON data backup downloaded.");
  }

  const matterTerminology = resolveCaseTerminology(selectedMatter?.terminology);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="Settings sections">
        <div className="grid gap-2 sm:grid-cols-4">
          {([
            ["profile", "Profile"],
            ["case", "Case"],
            ["personalize", "Personalize"],
            ["security", "Security & data"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSettingsSection(value)}
              className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                settingsSection === value
                  ? "bg-teal-700 text-white"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {settingsSection === "profile" ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[420px_1fr]">
          <Panel title="Your profile" action="Account">
            <form onSubmit={updateProfile} className="grid gap-3">
              <ThemeSelector />
              <Field label="Client name shown to attorneys">
                <input
                  name="displayName"
                  className="input"
                  defaultValue={profile?.displayName || ""}
                  required
                  minLength={2}
                  maxLength={120}
                />
              </Field>
              <p className="text-xs leading-5 text-slate-500">
                This name or clear identifying label appears with the selected case in the attorney portal. Verify it before sending an invitation.
                {profile?.attorneySharingProfileConfirmedAt
                  ? " Attorney sharing identity confirmed."
                  : " Save this profile once before creating an attorney invitation."}
              </p>
              <Field label="Email">
                <input className="input bg-slate-100" value={profile?.email || ""} readOnly />
              </Field>
              <Field label="Time zone">
                <RecordsTimezoneSelect defaultValue={profile?.timezone || defaultRecordsTimezone} />
              </Field>
              <button className="btn-primary" type="submit">Save profile</button>
            </form>
          </Panel>
          <div className="space-y-4">
            {recordsStorageMode === "supabase" ? (
              <AccountSubscriptionIndicator
                status={billingStatus}
                loading={billingLoading}
                error={billingError}
                onOpenSubscription={onOpenSubscription}
              />
            ) : null}
            <Panel title="Attorney access" action="Read only">
              <div className="space-y-4 text-sm leading-6 text-slate-600">
                <p>Invite an attorney, review who can see this case, or revoke access at any time.</p>
                <button type="button" className="btn-primary" onClick={onOpenAttorneyAccess}>
                  Manage attorney access
                </button>
              </div>
            </Panel>
          </div>
        </div>
      ) : null}

      {settingsSection === "case" ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[1fr_380px]">
          <Panel title="Selected case" action="Case details">
            {selectedMatter ? (
              <form onSubmit={updateMatter} className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Case name">
                    <input name="caseName" className="input" defaultValue={selectedMatter.caseName} />
                  </Field>
                  <Field label="Order nickname">
                    <input name="courtOrOrderNickname" className="input" defaultValue={selectedMatter.courtOrOrderNickname || ""} />
                  </Field>
                </div>
                <Field label="Court name">
                  <input name="courtName" className="input" defaultValue={selectedMatter.courtName || ""} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Order date">
                    <input name="orderDate" type="date" className="input" defaultValue={selectedMatter.orderDate || ""} />
                  </Field>
                  <Field label="Effective start">
                    <input name="effectiveStartDate" type="date" className="input" defaultValue={selectedMatter.effectiveStartDate || ""} />
                  </Field>
                  <Field label="Effective end">
                    <input name="effectiveEndDate" type="date" className="input" defaultValue={selectedMatter.effectiveEndDate || ""} />
                  </Field>
                </div>
                <Field label="Child labels">
                  <input name="childDisplayLabels" className="input" defaultValue={selectedMatter.childDisplayLabels.join(", ")} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Your label">
                    <input name="userRoleLabel" className="input" defaultValue={selectedMatter.userRoleLabel} />
                  </Field>
                  <Field label="Other parent label">
                    <input name="otherParentLabel" className="input" defaultValue={selectedMatter.otherParentLabel} />
                  </Field>
                </div>
                <Field label="Default exchange location">
                  <input name="defaultExchangeLocation" className="input" defaultValue={selectedMatter.defaultExchangeLocation || ""} />
                </Field>
                <Field label="Case time zone">
                  <RecordsTimezoneSelect defaultValue={selectedMatter.timezone || profile?.timezone || defaultRecordsTimezone} />
                </Field>
                <Field label="Private notes">
                  <textarea name="notes" className="input min-h-20" defaultValue={selectedMatter.notes || ""} />
                </Field>
                <button className="btn-primary" type="submit">Save case</button>
              </form>
            ) : (
              <p className="text-sm leading-6 text-slate-600">Create or select a case to edit its details.</p>
            )}
          </Panel>

          <details className="self-start rounded-xl border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-950">
              Create another case
            </summary>
            <form onSubmit={createMatter} className="grid gap-3 border-t border-slate-100 p-5">
              <Field label="Case name"><input name="caseName" className="input" /></Field>
              <Field label="Order nickname"><input name="courtOrOrderNickname" className="input" /></Field>
              <Field label="Court name"><input name="courtName" className="input" /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Order date"><input name="orderDate" type="date" className="input" /></Field>
                <Field label="Effective start"><input name="effectiveStartDate" type="date" className="input" /></Field>
              </div>
              <Field label="Child labels"><input name="childDisplayLabels" className="input" defaultValue="Child 1, Child 2" /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Your label"><input name="userRoleLabel" className="input" defaultValue="Me" /></Field>
                <Field label="Other parent label"><input name="otherParentLabel" className="input" defaultValue="Other Parent" /></Field>
              </div>
              <Field label="Default exchange location"><input name="defaultExchangeLocation" className="input" /></Field>
              <Field label="Time zone"><RecordsTimezoneSelect defaultValue={profile?.timezone || defaultRecordsTimezone} /></Field>
              <Field label="Private notes"><textarea name="notes" className="input min-h-20" /></Field>
              <button className="btn-primary" type="submit">Create case</button>
            </form>
          </details>
        </div>
      ) : null}

      {settingsSection === "personalize" ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[1fr_360px]">
          <Panel title="Choose the words that fit" action="Applies to this case">
            {selectedMatter ? (
              <form
                key={`${selectedMatter.id}-${Object.values(matterTerminology).join("|")}`}
                onSubmit={updateTerminology}
                className="grid gap-4"
              >
                <p className="text-sm leading-6 text-slate-600">
                  Change the broad section labels without changing the records underneath them.
                </p>
                {caseTerminologyFields.map((field) => (
                  <Field key={field.key} label={field.label} hint={`Examples: ${field.example}`}>
                    <input name={field.key} className="input" defaultValue={matterTerminology[field.key]} maxLength={36} />
                  </Field>
                ))}
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" type="submit">Save labels</button>
                  <button className="btn-secondary" type="button" onClick={resetTerminology}>Restore defaults</button>
                </div>
              </form>
            ) : (
              <p className="text-sm leading-6 text-slate-600">Create or select a case before customizing labels.</p>
            )}
          </Panel>
          <Panel title="Where these labels appear" action="Consistent wording">
            <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
              <li>Home overview tiles</li>
              <li>Navigation and page headings</li>
              <li>Attorney read-only view</li>
              <li>Report and export choices</li>
            </ul>
          </Panel>
        </div>
      ) : null}

      {settingsSection === "security" ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <Panel title="Storage" action={recordsStorageMode === "supabase" ? "Private cloud" : "This browser"}>
            <div className="space-y-3 text-sm leading-6 text-slate-600">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Storage mode</p>
                  <p className="mt-1 font-medium text-slate-900">{recordsStorageMode === "supabase" ? "Private cloud storage" : "This browser"}</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last status</p>
                  <p className="mt-1 font-medium text-slate-900">{storageStatus}</p>
                </div>
              </div>
              <p>{recordsStorageMode === "supabase" ? "Your records follow your account when you sign in." : "Records stay on this device in browser mode."}</p>
            </div>
          </Panel>

          <Panel title="Session" action="Account access">
            <div className="grid gap-3 text-sm leading-6 text-slate-600">
              <p>Signed in as <span className="font-medium text-slate-900">{profile?.email || "Demo user"}</span></p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={logout} className="btn-secondary">Sign out</button>
                {recordsStorageMode === "local" ? (
                  <button type="button" onClick={() => { clearFailedLoginAttempts(); flash("Demo login lockout counter reset."); }} className="btn-secondary">
                    Reset demo lockout
                  </button>
                ) : null}
              </div>
            </div>
          </Panel>

          <Panel title="Your data" action="Private by default">
            <details
              data-testid="advanced-data-backup"
              className="group overflow-hidden rounded-md border border-slate-200 bg-slate-50"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-sm font-semibold text-slate-900 marker:content-none">
                <span>Advanced data backup</span>
                <span
                  className="shrink-0 text-slate-500 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                >
                  <ChevronDownIcon />
                </span>
              </summary>
              <div className="space-y-3 border-t border-slate-200 p-3">
                <p className="text-xs leading-5 text-slate-600">
                  Download a machine-readable JSON backup of the selected case. Keep it for archival
                  or future migration; it is not formatted for court or attorney reading, and Custody
                  Folio cannot restore it automatically yet.
                </p>
                <button type="button" onClick={exportData} className="btn-secondary">
                  Download JSON backup
                </button>
              </div>
            </details>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => void deleteCase()} className="btn-secondary">Delete selected case</button>
              <button type="button" onClick={resetDemoData} className="btn-secondary">
                {recordsStorageMode === "supabase" ? "Clear workspace data" : "Reset demo data"}
              </button>
              <Link href={accountDeletionPath} className="btn-secondary text-center">Delete my account</Link>
              <Link href="/privacy" className="btn-secondary text-center">Privacy and deletion policy</Link>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">Export anything you need before deleting it. Deleted information cannot be restored from the app.</p>
          </Panel>

          <div className="space-y-3">
            <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-950">Workspace setup guide</summary>
              <ol className="list-decimal space-y-2 border-t border-slate-100 px-5 py-4 pl-10 text-sm leading-6 text-slate-600">
                <li>Create a case with neutral labels.</li>
                <li>Add a recurring schedule only if you need one.</li>
                <li>Record events as they happen.</li>
                <li>Attach files to the record they support.</li>
                <li>Review reports before sharing.</li>
              </ol>
            </details>
            <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-950">Audit trail · {selected.auditLogs.length} entries</summary>
              <div className="border-t border-slate-100 p-4">
                <Table
                  headers={["Time", "Action", "Entity", "Summary"]}
                  rows={selected.auditLogs.slice(0, 10).map((audit) => [
                    audit.timestamp,
                    audit.action.replaceAll("_", " "),
                    audit.entityType,
                    audit.metadataSummary,
                  ])}
                />
              </div>
            </details>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const compactMonthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function compactDateRangeLabel(range: DateRange) {
  const parseDate = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day || month < 1 || month > 12) return null;
    return { year, month, day };
  };
  const from = parseDate(range.from);
  const to = parseDate(range.to);
  if (!from || !to) return `${range.from} to ${range.to}`;

  if (from.year === to.year && from.month === to.month) {
    return `${compactMonthNames[from.month - 1]} ${from.day}-${to.day}`;
  }
  if (from.year === to.year) {
    return `${compactMonthNames[from.month - 1]} ${from.day}-${compactMonthNames[to.month - 1]} ${to.day}`;
  }
  return `${compactMonthNames[from.month - 1]} ${from.day}, ${from.year}-${compactMonthNames[to.month - 1]} ${to.day}, ${to.year}`;
}

function WorkspaceHeader({
  activeViewTitle,
  mobileOptionsOpen,
  setMobileOptionsOpen,
  matters,
  selectedCaseId,
  onSelectCase,
  range,
  setRange,
  timezone,
  onExport,
  onOpenSettings,
  onLogout,
}: {
  activeViewTitle: string;
  mobileOptionsOpen: boolean;
  setMobileOptionsOpen: Dispatch<SetStateAction<boolean>>;
  matters: Array<{ id: string; caseName: string }>;
  selectedCaseId: string;
  onSelectCase: (caseId: string) => void;
  range: DateRange;
  setRange: (range: DateRange) => void;
  timezone: string;
  onExport: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}) {
  const selectedMatter = matters.find((matter) => matter.id === selectedCaseId);
  const selectedCaseName = selectedMatter?.caseName || "No case selected";
  const mobileOptionsId = "mobile-workspace-options";

  return (
    <header
      data-testid="workspace-header"
      className="sticky top-0 z-10 border-b border-blue-200 bg-white/95 px-3 py-2 shadow-[0_1px_4px_rgba(37,99,235,0.08)] backdrop-blur lg:px-6 lg:py-3"
    >
      {mobileOptionsOpen && (
        <button
          type="button"
          aria-label="Close workspace options"
          onClick={() => setMobileOptionsOpen(false)}
          className="fixed inset-0 z-10 cursor-default bg-slate-950/10 lg:hidden"
        />
      )}

      <div className="flex flex-col gap-0 lg:gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="min-w-0">
          <div className="flex min-h-12 items-center gap-2 lg:hidden">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold tracking-tight text-slate-950">
                {activeViewTitle}
              </h1>
              <p className="truncate text-[11px] leading-4 text-slate-500">
                {selectedCaseName} | {compactDateRangeLabel(range)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setMobileOptionsOpen(false);
                onExport();
              }}
              className="h-10 shrink-0 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              Reports
            </button>
            <button
              type="button"
              aria-controls={mobileOptionsId}
              aria-expanded={mobileOptionsOpen}
              onClick={() => setMobileOptionsOpen((current) => !current)}
              className="h-10 shrink-0 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-teal-500 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-teal-100"
            >
              Options
            </button>
          </div>

          <div className="hidden lg:block">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              {activeViewTitle}
            </h1>
          </div>
        </div>

        <div
          id={mobileOptionsId}
          className={`${mobileOptionsOpen ? "grid" : "hidden"} absolute left-3 right-3 top-[calc(100%+0.5rem)] z-20 max-h-[calc(100vh-6rem)] min-w-0 gap-3 overflow-y-auto rounded-lg border border-blue-200 bg-white p-4 shadow-xl lg:static lg:z-auto lg:flex lg:w-full lg:flex-wrap lg:items-center lg:gap-2 lg:overflow-visible lg:bg-[#e8f1fb] lg:p-1.5 lg:shadow-inner xl:flex-nowrap 2xl:w-auto`}
        >
          <div className="lg:hidden">
            <h2 className="text-sm font-semibold text-slate-950">Workspace options</h2>
            <p className="mt-0.5 text-xs text-slate-500">Change the case or reporting dates.</p>
          </div>

          {matters.length > 1 ? (
            <label className="grid gap-1 text-xs font-semibold text-slate-600 lg:block">
              <span className="lg:sr-only">Case</span>
              <select
                aria-label="Case"
                value={selectedCaseId}
                onChange={(event) => {
                  setMobileOptionsOpen(false);
                  onSelectCase(event.target.value);
                }}
                className="h-10 min-w-0 max-w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 lg:w-auto xl:w-60"
              >
                {matters.map((matter) => (
                  <option key={matter.id} value={matter.id}>
                    {matter.caseName}
                  </option>
                ))}
              </select>
            </label>
          ) : selectedMatter ? (
            <div
              data-testid="case-summary"
              aria-label={`Current case: ${selectedMatter.caseName}`}
              className="flex h-10 min-w-0 max-w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm lg:w-auto xl:max-w-60"
            >
              <span className="shrink-0 text-xs font-semibold text-slate-500">Case</span>
              <span className="truncate font-medium text-slate-800">{selectedMatter.caseName}</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMobileOptionsOpen(false);
                onOpenSettings();
              }}
              className="h-10 min-w-0 max-w-full rounded-md border border-teal-300 bg-teal-50 px-3 text-sm font-semibold text-teal-900 transition hover:border-teal-500 hover:bg-teal-100 focus:outline-none focus:ring-2 focus:ring-teal-100"
            >
              Create case
            </button>
          )}

          <div className="grid gap-1">
            <span className="text-xs font-semibold text-slate-600 lg:sr-only">Date range</span>
            <RangeToolbar range={range} setRange={setRange} timezone={timezone} />
          </div>

          <div className="grid grid-cols-2 gap-2 lg:contents">
            <button
              type="button"
              onClick={onLogout}
              className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-teal-500 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-teal-100"
            >
              Logout
            </button>
            <button
              type="button"
              onClick={() => setMobileOptionsOpen(false)}
              className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-200 lg:hidden"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

function RangeToolbar({
  range,
  setRange,
  timezone,
}: {
  range: DateRange;
  setRange: (range: DateRange) => void;
  timezone: string;
}) {
  const [preset, setPreset] = useState<DateRangePreset | "custom">(defaultRangePreset);

  useEffect(() => {
    if (preset !== "custom") {
      setRange(buildDateRangePreset(preset, new Date(), timezone));
    }
  }, [preset, setRange, timezone]);

  return (
    <div className="grid w-full min-w-0 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
      <select
        className="h-10 min-w-0 max-w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 sm:w-auto xl:w-40"
        onChange={(event) => {
          const value = event.target.value as DateRangePreset | "custom";
          setPreset(value);
          if (value !== "custom") setRange(buildDateRangePreset(value, new Date(), timezone));
        }}
        value={preset}
        aria-label="Date range preset"
      >
        <option value="currentMonth">Current month</option>
        <option value="last30">Last 30 days</option>
        <option value="last90">Last 90 days</option>
        <option value="priorMonth">Prior month</option>
        <option value="ytd">Year to date</option>
        <option value="custom">Custom range</option>
      </select>
      <CenteredRangeDateInput
        label="From date"
        value={range.from}
        onChange={(value) => {
          setPreset("custom");
          setRange({ ...range, from: value });
        }}
      />
      <CenteredRangeDateInput
        label="To date"
        value={range.to}
        onChange={(value) => {
          setPreset("custom");
          setRange({ ...range, to: value });
        }}
      />
    </div>
  );
}

function CenteredRangeDateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className="relative h-10 w-full min-w-0 max-w-full rounded-md border border-slate-200 bg-white text-slate-900 focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-100 sm:w-36"
      data-testid="range-date-control"
    >
      <input
        aria-label={label}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="range-date-input h-full w-full cursor-pointer rounded-md bg-transparent px-2 text-center text-sm tabular-nums text-slate-900 outline-none [color-scheme:light]"
      />
    </div>
  );
}

function Panel({
  title,
  action,
  headerContent,
  children,
  className = "",
}: {
  title: string;
  action?: string;
  headerContent?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-lg border border-slate-200/90 bg-white p-4 shadow-[0_5px_18px_rgba(15,23,42,0.07)] sm:p-5 ${className}`}>
      <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-2">
        {headerContent ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <h2 className="min-w-0 text-base font-semibold text-slate-950 [overflow-wrap:anywhere]">{title}</h2>
            <div className="w-full lg:w-auto">{headerContent}</div>
          </div>
        ) : (
          <h2 className="min-w-0 text-base font-semibold text-slate-950 [overflow-wrap:anywhere]">{title}</h2>
        )}
        {action && <span className="min-w-0 max-w-full text-xs font-medium text-slate-500 [overflow-wrap:anywhere]">{action}</span>}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid min-w-0 max-w-full gap-1.5 text-sm font-medium text-slate-700 [&>*]:min-w-0 [&>*]:max-w-full">
      <span className="[overflow-wrap:anywhere]">{label}</span>
      {children}
      {hint ? <span className="text-xs font-normal leading-5 text-slate-500">{hint}</span> : null}
    </label>
  );
}

function CalendarColorPicker({
  label,
  ariaLabelPrefix,
  name,
  value,
  onChange,
}: {
  label: string;
  ariaLabelPrefix: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const selected =
    custodyDayColorOptions.find((option) => option.value === value) ||
    custodyDayColorOptions[0];

  return (
    <fieldset className="grid min-w-0 max-w-full gap-1.5">
      <legend className="text-sm font-medium text-slate-700">{label}</legend>
      {name && <input name={name} type="hidden" value={value} />}
      <div className="flex min-h-10 min-w-0 max-w-full flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1.5">
        {custodyDayColorOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-label={`${ariaLabelPrefix}: ${option.label}`}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`h-7 w-7 shrink-0 rounded-full border-2 transition focus:outline-none focus:ring-2 focus:ring-blue-200 ${
              value === option.value
                ? "border-slate-950 ring-2 ring-slate-300"
                : "border-white ring-1 ring-slate-200"
            }`}
            style={{ backgroundColor: option.value }}
          />
        ))}
        <span className="min-w-0 text-xs font-medium text-slate-600">
          {selected.label}
        </span>
      </div>
    </fieldset>
  );
}

function StatCard({
  label,
  value,
  detail,
  actionLabel,
  onClick,
  tone = "teal",
}: {
  label: string;
  value: string | number;
  detail: string;
  actionLabel?: string;
  onClick?: () => void;
  tone?: "teal" | "amber" | "slate";
}) {
  const toneClasses =
    tone === "amber"
      ? "border-l-amber-500 bg-amber-50/30 text-amber-700"
      : tone === "slate"
        ? "border-l-slate-500 bg-white text-slate-700"
        : "border-l-teal-600 bg-teal-50/30 text-teal-700";
  const content = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
      {actionLabel && (
        <p className="mt-3 text-xs font-semibold text-blue-700">{actionLabel} →</p>
      )}
    </>
  );

  const className = `min-w-0 max-w-full rounded-lg border border-l-4 border-slate-200 bg-white p-4 text-left shadow-[0_5px_18px_rgba(15,23,42,0.07)] ${toneClasses}`;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${actionLabel || "Open"}: ${label}, ${value}`}
        className={`${className} w-full transition hover:border-blue-400 hover:shadow-[0_7px_22px_rgba(15,23,42,0.1)] focus:outline-none focus:ring-2 focus:ring-blue-200`}
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 max-w-full rounded-md border border-slate-200 bg-slate-50/80 p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function SectionExportPanel({
  packet,
  onExport,
}: {
  packet: SectionExportPacket;
  onExport: (
    packet: SectionExportPacket,
    format: SectionExportFormat
  ) => void | Promise<void>;
}) {
  const hasRecords = packet.tables.some((table) => table.rows.length > 0);

  return (
    <Panel title="Lawyer/court export" action="Summary + charts">
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {packet.metrics.slice(0, 4).map((metric) => (
            <StatMini key={metric.label} label={metric.label} value={String(metric.value)} />
          ))}
        </div>

        <div className="space-y-3">
          {packet.charts.slice(0, 2).map((chart) => (
            <PacketChart key={chart.title} chart={chart} />
          ))}
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Best use</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-600">
            {packet.suggestedUses.slice(0, 2).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={!hasRecords}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void onExport(packet, "pdf")}
          >
            Print / save PDF
          </button>
          <button
            type="button"
            disabled={!hasRecords}
            className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void onExport(packet, "csv")}
          >
            Download CSV
          </button>
        </div>
        {!hasRecords && (
          <p className="text-xs font-medium text-amber-700">
            No records match the selected date range.
          </p>
        )}
        <p className="text-xs leading-5 text-slate-500">
          Exports leave protected storage. Review names, account numbers, and third party details before sharing.
        </p>
      </div>
    </Panel>
  );
}

function PacketChart({ chart }: { chart: SectionExportPacket["charts"][number] }) {
  if (chart.rows.length === 0) return <Empty label="No chart data for this range." />;
  const values = chart.rows.flatMap((row) =>
    [row.value, row.secondaryValue, row.tertiaryValue].filter((value): value is number => typeof value === "number")
  );
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));
  const shownRows = chart.rows.slice(0, 8);

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">{chart.title}</h3>
          {chart.description && <p className="mt-1 text-xs leading-5 text-slate-500">{chart.description}</p>}
        </div>
        {chart.unit && <span className="text-xs font-medium text-slate-500">{chart.unit}</span>}
      </div>
      <div className="mt-3 space-y-2">
        {shownRows.map((row) => (
          <div key={row.label} className="grid gap-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-medium text-slate-700">{row.label}</span>
              <span className="shrink-0 tabular-nums text-slate-500">
                {formatChartValue(row.value, chart.unit)}
                {typeof row.secondaryValue === "number" ? ` / ${formatChartValue(row.secondaryValue, chart.unit)}` : ""}
                {typeof row.tertiaryValue === "number" ? ` / ${formatChartValue(row.tertiaryValue, chart.unit)}` : ""}
              </span>
            </div>
            <div className="space-y-1">
              <ChartBar value={row.value} max={max} tone={row.value < 0 ? "teal" : "amber"} />
              {typeof row.secondaryValue === "number" && (
                <ChartBar value={row.secondaryValue} max={max} tone="blue" />
              )}
              {typeof row.tertiaryValue === "number" && (
                <ChartBar value={row.tertiaryValue} max={max} tone="slate" />
              )}
            </div>
          </div>
        ))}
      </div>
      {chart.rows.length > shownRows.length && (
        <p className="mt-2 text-xs text-slate-500">{chart.rows.length - shownRows.length} more rows included in export.</p>
      )}
    </div>
  );
}

function ChartBar({
  value,
  max,
  tone,
}: {
  value: number;
  max: number;
  tone: "amber" | "blue" | "slate" | "teal";
}) {
  const width = `${Math.max(4, Math.min(100, (Math.abs(value) / max) * 100))}%`;
  const color =
    tone === "blue"
      ? "bg-blue-600"
      : tone === "slate"
        ? "bg-slate-500"
        : tone === "teal"
          ? "bg-teal-600"
          : "bg-amber-500";
  return (
    <div className="h-2 rounded-full bg-slate-100">
      <div className={`h-2 rounded-full ${color}`} style={{ width }} />
    </div>
  );
}

function formatChartValue(value: number, unit?: string) {
  if (unit === "USD") return formatMoney(value);
  if (unit === "minutes") return `${value} min`;
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-white p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded px-3 py-1.5 text-sm font-semibold ${
            value === option.value ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function timelinePrimaryRecordId(event: CalendarEvent) {
  return event.relatedIds?.[0];
}

function canDeleteTimelineEvent(event: CalendarEvent) {
  return directTimelineDeleteTypes.has(event.type) && Boolean(timelinePrimaryRecordId(event));
}

function removeOwnedRecordById<T extends { id: string; userId: string; caseId: string }>(
  records: T[],
  recordId: string,
  userId: string,
  caseId: string
) {
  return records.filter(
    (record) => !(record.id === recordId && record.userId === userId && record.caseId === caseId)
  );
}

function deleteTimelineEventFromDataset(
  dataset: RecordsDataset,
  event: CalendarEvent,
  userId: string,
  caseId: string
) {
  const recordId = timelinePrimaryRecordId(event);
  if (!recordId) return dataset;

  const auditBase = {
    userId,
    caseId,
    action: "deleted" as const,
    entityId: recordId,
    metadataSummary: `${labelEventType(event.type)} removed from timeline.`,
  };

  if (event.type === "logged_exchange") {
    return withAudit(
      {
        ...dataset,
        exchangeLogs: removeOwnedRecordById(dataset.exchangeLogs, recordId, userId, caseId),
      },
      { ...auditBase, entityType: "exchangeLog" }
    );
  }

  if (event.type === "custody_note") {
    return withAudit(
      {
        ...dataset,
        dateNotes: removeOwnedRecordById(dataset.dateNotes, recordId, userId, caseId),
      },
      { ...auditBase, entityType: "dateNote" }
    );
  }

  if (event.type === "child_support_due" || event.type === "child_support_paid") {
    return withAudit(
      {
        ...dataset,
        childSupportPayments: removeOwnedRecordById(
          dataset.childSupportPayments,
          recordId,
          userId,
          caseId
        ),
      },
      { ...auditBase, entityType: "childSupportPayment" }
    );
  }

  if (event.type === "expense_item") {
    return withAudit(
      {
        ...dataset,
        expenseItems: removeOwnedRecordById(dataset.expenseItems, recordId, userId, caseId),
      },
      { ...auditBase, entityType: "expenseItem" }
    );
  }

  return dataset;
}

function setTimelineEventDesignation(
  dataset: RecordsDataset,
  event: CalendarEvent,
  choice: TimelineDesignationChoice,
  userId: string,
  caseId: string
) {
  const existingDesignations = dataset.timelineDesignations || [];
  const existing = existingDesignations.find(
    (item) =>
      item.eventId === event.id &&
      item.userId === userId &&
      item.caseId === caseId
  );
  const now = nowIso();
  const timelineDesignations =
    choice === "automatic"
      ? existingDesignations.filter(
          (item) =>
            !(
              item.eventId === event.id &&
              item.userId === userId &&
              item.caseId === caseId
            )
        )
      : existing
        ? existingDesignations.map((item) =>
            item.id === existing.id
              ? { ...item, severity: choice, updatedAt: now }
              : item
          )
        : [
            {
              id: createId("timeline-designation"),
              userId,
              caseId,
              eventId: event.id,
              severity: choice,
              createdAt: now,
              updatedAt: now,
            },
            ...existingDesignations,
          ];

  return withAudit(
    {
      ...dataset,
      timelineDesignations,
    },
    {
      userId,
      caseId,
      action: "updated",
      entityType: "timelineDesignation",
      entityId: event.id,
      metadataSummary:
        choice === "automatic"
          ? "Timeline designation returned to the automatic suggestion."
          : "Timeline designation changed by the account owner.",
    }
  );
}

function matchesTimelineFilter(event: CalendarEvent, filter: TimelineFilter) {
  if (filter === "all") return true;
  if (filter === "attention") return isAttentionTimelineEvent(event);
  return event.type === filter;
}

function isAttentionTimelineEvent(event: CalendarEvent) {
  return event.severity === "attention" || event.severity === "critical";
}

function groupTimelineEvents(events: CalendarEvent[]) {
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    groups.set(event.date, [...(groups.get(event.date) || []), event]);
  }
  return Array.from(groups, ([date, rows]) => ({ date, rows }));
}

function formatTimelineDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function timelineSeverity(event: CalendarEvent) {
  return event.severity || "neutral";
}

function timelineSeverityLabel(severity: NonNullable<CalendarEvent["severity"]>) {
  if (severity === "critical") return "Critical";
  if (severity === "attention") return "Recorded issue";
  if (severity === "positive") return "Recorded";
  return "Neutral";
}

function timelineSeverityPillClass(severity: NonNullable<CalendarEvent["severity"]>) {
  if (severity === "critical") return "bg-red-50 text-red-700";
  if (severity === "attention") return "bg-amber-50 text-amber-700";
  if (severity === "positive") return "bg-teal-50 text-teal-700";
  return "bg-slate-100 text-slate-600";
}

function timelineSeverityBorderClass(severity: NonNullable<CalendarEvent["severity"]>) {
  if (severity === "critical") return "border-red-200";
  if (severity === "attention") return "border-amber-200";
  if (severity === "positive") return "border-teal-200";
  return "border-slate-200";
}

function timelineSeverityDotClass(severity: NonNullable<CalendarEvent["severity"]>) {
  if (severity === "critical") return "bg-red-500";
  if (severity === "attention") return "bg-amber-500";
  if (severity === "positive") return "bg-teal-600";
  return "bg-slate-400";
}

function Timeline({
  events,
  emptyLabel = "No records yet.",
  compact = false,
  onDeleteEvent,
  onChangeDesignation,
  designationSavingId,
}: {
  events: CalendarEvent[];
  emptyLabel?: string;
  compact?: boolean;
  onDeleteEvent?: (event: CalendarEvent) => void;
  onChangeDesignation?: (
    event: CalendarEvent,
    choice: TimelineDesignationChoice
  ) => void;
  designationSavingId?: string;
}) {
  if (events.length === 0) return <Empty label={emptyLabel} />;

  const groups = compact ? [{ date: "compact", rows: events }] : groupTimelineEvents(events);

  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      {groups.map((group) => (
        <div
          key={group.date}
          className={compact ? "space-y-2" : "grid gap-2 md:grid-cols-[132px_1fr]"}
        >
          {!compact && (
            <div className="pt-2 text-sm">
              <p className="font-semibold text-slate-950">{formatTimelineDate(group.date)}</p>
              <p className="mt-1 text-xs text-slate-500">{group.rows.length} records</p>
            </div>
          )}
          <div className="space-y-2">
            {group.rows.map((event) => (
              <TimelineEventRow
                key={event.id}
                event={event}
                compact={compact}
                onDeleteEvent={onDeleteEvent}
                onChangeDesignation={onChangeDesignation}
                designationSaving={designationSavingId === event.id}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineEventRow({
  event,
  compact,
  onDeleteEvent,
  onChangeDesignation,
  designationSaving = false,
}: {
  event: CalendarEvent;
  compact: boolean;
  onDeleteEvent?: (event: CalendarEvent) => void;
  onChangeDesignation?: (
    event: CalendarEvent,
    choice: TimelineDesignationChoice
  ) => void;
  designationSaving?: boolean;
}) {
  const severity = timelineSeverity(event);
  const tagList = event.tags || [];
  const showDelete = Boolean(onDeleteEvent && canDeleteTimelineEvent(event));
  const summaryClassName = compact
    ? "flex cursor-pointer list-none flex-col gap-2 p-3.5 marker:hidden [&::-webkit-details-marker]:hidden"
    : "flex cursor-pointer list-none flex-col gap-2 p-3.5 marker:hidden sm:flex-row sm:items-start sm:justify-between [&::-webkit-details-marker]:hidden";
  const metaClassName = compact
    ? "flex flex-wrap items-center gap-1.5 pl-5"
    : "flex shrink-0 flex-wrap items-center gap-1.5 pl-5 sm:justify-end sm:pl-0";

  return (
    <details
      className={`group rounded-lg border bg-white shadow-[0_5px_18px_rgba(15,23,42,0.07)] transition hover:shadow-md ${timelineSeverityBorderClass(severity)}`}
    >
      <summary className={summaryClassName}>
        <div className="flex min-w-0 gap-3">
          <span
            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${timelineSeverityDotClass(severity)}`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-slate-950 [overflow-wrap:anywhere]">{event.title}</p>
            <p className="mt-1 break-words text-xs leading-5 text-slate-500 [overflow-wrap:anywhere]">
              {compact ? `${event.date}${event.time ? ` at ${event.time}` : ""}` : event.time || "All day"}
              {event.detail ? ` | ${event.detail}` : ""}
            </p>
          </div>
        </div>
        <div className={metaClassName}>
          <StatusPill label={labelEventType(event.type)} />
          <span className={`rounded px-2 py-1 text-xs font-semibold ${timelineSeverityPillClass(severity)}`}>
            {timelineSeverityLabel(severity)}
          </span>
          <span
            className="grid h-6 w-6 place-items-center rounded border border-slate-200 text-slate-500 transition group-open:rotate-180"
            aria-hidden="true"
          >
            <ChevronDownIcon />
          </span>
        </div>
      </summary>
      <div className="border-t border-slate-100 px-3.5 pb-3.5 pt-3 text-sm leading-6 text-slate-600">
        {event.summary && <p className="[overflow-wrap:anywhere]">{event.summary}</p>}
        {event.body && <p className={`${event.summary ? "mt-2" : ""} [overflow-wrap:anywhere]`}>{event.body}</p>}
        {!event.summary && !event.body && event.detail && <p className="[overflow-wrap:anywhere]">{event.detail}</p>}
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
          {event.sourceLabel && (
            <span className="rounded bg-slate-100 px-2 py-1 font-medium">
              Source: {event.sourceLabel}
            </span>
          )}
          {event.relatedIds && event.relatedIds.length > 0 && (
            <span className="rounded bg-slate-100 px-2 py-1 font-medium">
              Related records: {event.relatedIds.length}
            </span>
          )}
        </div>
        {onChangeDesignation && (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Timeline designation
              </span>
              <select
                aria-label={`Timeline designation for ${event.title}`}
                value={event.severitySource === "user" ? severity : "automatic"}
                onChange={(changeEvent) =>
                  onChangeDesignation(
                    event,
                    changeEvent.target.value as TimelineDesignationChoice
                  )
                }
                disabled={designationSaving}
                className="input mt-2"
              >
                <option value="automatic">
                  Automatic ({timelineSeverityLabel(severity)})
                </option>
                {timelineDesignationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {event.severitySource === "user"
                ? "You selected this designation. Choose Automatic to use the app suggestion again."
                : "This is an automatic suggestion based on the source record. You can change it here."}
            </p>
          </div>
        )}
        <TagList tags={tagList} />
        {showDelete && (
          <div className="mt-3">
            <DeleteButton
              label="Delete item"
              ariaLabel={`Delete timeline item ${event.title}`}
              onClick={() => onDeleteEvent?.(event)}
            />
          </div>
        )}
      </div>
    </details>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<ReactNode>>;
}) {
  if (headers.length === 0 || rows.length === 0) return <Empty label="No rows to show." />;

  return (
    <div className="records-table-scroll min-w-0 max-w-full overflow-x-auto rounded-md border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="max-w-[260px] px-3 py-2 align-top text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportPrintRows({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<ReactNode>>;
}) {
  if (headers.length === 0 || rows.length === 0) {
    return <p className="print-only text-sm text-slate-500">No rows to show.</p>;
  }

  const normalizedHeaders = headers.map((header) => header.toLowerCase());
  const findHeader = (...names: string[]) =>
    names
      .map((name) => normalizedHeaders.indexOf(name))
      .find((index): index is number => index >= 0);
  const dateIndex = findHeader("date");
  const timeIndex = findHeader("time");
  const titleIndex = findHeader("title", "file", "issue");
  const secondaryIndex = findHeader("issue", "source", "description");

  return (
    <div className="print-only report-print-record-list">
      {rows.map((row, rowIndex) => {
        const title = formatReportCell(row[titleIndex ?? -1]) || `Record ${rowIndex + 1}`;
        const secondary = secondaryIndex === titleIndex ? "" : formatReportCell(row[secondaryIndex ?? -1]);
        const dateParts = [formatReportCell(row[dateIndex ?? -1]), formatReportCell(row[timeIndex ?? -1])].filter(Boolean);

        return (
          <section key={rowIndex} className="report-print-record">
            <div className="report-print-record-heading">
              <div>
                <p className="report-print-record-title">{title}</p>
                {secondary && <p className="report-print-record-subtitle">{secondary}</p>}
              </div>
              {dateParts.length > 0 && (
                <p className="report-print-record-date">{dateParts.join(" ")}</p>
              )}
            </div>
            <dl>
              {headers.map((header, cellIndex) => {
                const cell = row[cellIndex];
                if (isEmptyReportCell(cell)) return null;
                return (
                  <div
                    key={`${header}-${cellIndex}`}
                    className={isWideReportField(header) ? "report-print-record-field-wide" : undefined}
                  >
                    <dt>{header}</dt>
                    <dd>{cell}</dd>
                  </div>
                );
              })}
            </dl>
          </section>
        );
      })}
    </div>
  );
}

function isEmptyReportCell(cell: ReactNode) {
  return cell === null || cell === undefined || cell === false || cell === "";
}

function formatReportCell(cell: ReactNode) {
  if (typeof cell === "string" || typeof cell === "number") return String(cell);
  return "";
}

function isWideReportField(header: string) {
  return /^(notes?|details?|description|issue|tags|source text|metadata)$/i.test(header.trim());
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="inline-flex max-w-full items-center justify-center whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold leading-5 text-slate-600">
      {label}
    </span>
  );
}

function EditButton({
  label = "Edit",
  ariaLabel,
  onClick,
}: {
  label?: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="inline-flex min-h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-teal-500 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-100"
    >
      {label}
    </button>
  );
}

function DeleteButton({
  label,
  ariaLabel,
  disabled = false,
  onClick,
}: {
  label: string;
  ariaLabel: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-8 items-center justify-center rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 transition hover:border-red-400 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {label}
    </button>
  );
}

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span key={tag} className="max-w-full rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 [overflow-wrap:anywhere]">
          {tag}
        </span>
      ))}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
      {label}
    </div>
  );
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function emptyToUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value === "" ? undefined : value])
  ) as T;
}

function withAlpha(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function calendarColorForCaregiver(
  caregiverLabel: string,
  userRoleLabel: string,
  otherParentLabel: string,
  assignments: CustodyDayAssignment[] = []
) {
  const savedColor = assignments.find(
    (assignment) => assignment.caregiverLabel === caregiverLabel
  )?.color;
  if (savedColor) return savedColor;
  if (caregiverLabel === userRoleLabel) return custodyDayColors[0];
  if (caregiverLabel === otherParentLabel) return custodyDayColors[1];
  if (caregiverLabel === "Alternate caregiver") return custodyDayColors[2];
  return custodyDayColors[2];
}
