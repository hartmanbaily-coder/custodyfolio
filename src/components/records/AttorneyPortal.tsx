"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PolicyFooter from "@/components/PolicyFooter";
import {
  buildCalendarEvents,
  calculateChildSupportObligationStats,
  calculateExpenseStats,
  formatMoney,
  generateChildSupportObligations,
  isTimelineVisibleEvent,
} from "@/lib/records/calculations";
import { attorneyMutation, getRecordsCsrfToken } from "@/lib/records/attorneyClient";
import {
  downloadBlobFile,
  downloadTextFile,
  shareHtmlAsPdf,
  signOutRecordsSession,
} from "@/lib/records/clientStore";
import type { SharedCaseProjection, SharedEvidenceItem } from "@/lib/records/attorneyProjection";
import {
  attorneySelectionCounts,
  buildAttorneyExportDataset,
  createAttorneyRecordSelection,
  setAllAttorneyRecordsSelected,
  setAttorneyRecordSelected,
  type AttorneyRecordSelection,
  type AttorneySelectableRecordKind,
} from "@/lib/records/attorneyExports";
import {
  buildReportPreview,
  buildSectionExportPacket,
  fullProfileDateRange,
  reportPreviewToCsv,
  reportsTabReportTypes,
  sectionExportToCsv,
  type SectionExportId,
  type SectionExportPacket,
} from "@/lib/records/reports";
import type { DateRange, ReportType } from "@/lib/records/types";
import { formatLocalDate } from "@/lib/records/dateRanges";
import { maxBrowserTimeoutMs } from "@/lib/records/attorneyPolicy";
import { evidenceFileName } from "@/lib/records/validation";
import { buildEvidencePrintHtml } from "@/lib/records/evidencePrint";
import {
  generatePrintableReportPdf,
  printableReportPacket,
} from "@/lib/records/reportPdf";

type PortalView = "Overview" | "Timeline" | "Calendar" | "Exchanges" | "Notes" | "Files" | "Child Support" | "Expenses" | "Reports";
const portalViews: PortalView[] = ["Overview", "Timeline", "Calendar", "Exchanges", "Notes", "Files", "Child Support", "Expenses", "Reports"];
const portalViewLabels: Record<PortalView, string> = {
  Overview: "Overview",
  Timeline: "Timeline",
  Calendar: "Calendar",
  Exchanges: "Parenting time",
  Notes: "Notes & events",
  Files: "Files & evidence",
  "Child Support": "Child support",
  Expenses: "Expenses",
  Reports: "Reports",
};
const exportableViewSections: Partial<Record<PortalView, SectionExportId>> = {
  Timeline: "timeline",
  Calendar: "calendar",
  Exchanges: "exchanges",
  Notes: "notes",
  Files: "evidence",
  "Child Support": "child_support",
  Expenses: "expenses",
};
const attorneyExportReviewItems = [
  "I reviewed names and labels for neutral, accurate wording.",
  "I reviewed payment references and other account identifiers.",
  "I reviewed notes and file descriptions for private third-party information.",
] as const;

type MatterChoice = {
  accessHandle: string;
  label: string;
  clientName: string;
  caseName: string;
  profileConfirmed: boolean;
  grantedAt: string;
  expiresAt: string | null;
};
type PortalResponse = {
  accessHandle: string;
  projection: SharedCaseProjection;
  updatedAt: string | null;
  accessExpiresAt: string | null;
  readOnly: true;
};

function initialRange(projection: SharedCaseProjection): DateRange {
  const today = formatLocalDate(new Date(), projection.dataset.matters[0]?.timezone);
  const dates = [
    ...projection.dataset.exchangeLogs.map((record) => record.orderedExchangeAt.slice(0, 10)),
    ...projection.dataset.dateNotes.map((record) => record.noteDate),
    ...projection.dataset.evidenceItems.map((record) => record.evidenceDate || record.uploadedAt.slice(0, 10)),
    ...projection.dataset.childSupportPayments.map((record) => record.dueDate),
    ...projection.dataset.childSupportOrders.flatMap((record) => [
      record.effectiveStartDate,
      record.firstPaymentDueDate || "",
      record.secondPaymentDueDate || "",
    ]),
    ...projection.dataset.expenseItems.map((record) => record.expenseDate),
    ...projection.dataset.custodyDayAssignments.map((record) => record.date),
    today,
  ].filter(Boolean).sort();
  return { from: dates[0] || today, to: dates.at(-1) || today };
}

export default function AttorneyPortal() {
  const [sessionState, setSessionState] = useState<"loading" | "signed_out" | "ready">("loading");
  const [matters, setMatters] = useState<MatterChoice[]>([]);
  const [portal, setPortal] = useState<PortalResponse | null>(null);
  const [view, setView] = useState<PortalView>("Overview");
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [reportType, setReportType] = useState<ReportType>("exchange_compliance");
  const [generatedReport, setGeneratedReport] = useState<{ type: ReportType; range: DateRange } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [matterSearch, setMatterSearch] = useState("");
  const [selection, setSelection] = useState<AttorneyRecordSelection | null>(null);
  const [exportReview, setExportReview] = useState<boolean[]>(() =>
    attorneyExportReviewItems.map(() => false)
  );

  async function loadPortal(accessHandle: string) {
    const body = await attorneyMutation("/api/records/attorney/portal", { accessHandle }) as unknown as PortalResponse;
    setPortal(body);
    setRange(initialRange(body.projection));
    setGeneratedReport(null);
    setSelection(createAttorneyRecordSelection(body.projection.dataset));
    setExportReview(attorneyExportReviewItems.map(() => false));
    window.sessionStorage.setItem("l2f.attorney.access", accessHandle);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      const response = await fetch("/api/records/attorney/portal", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = (await response.json().catch(() => ({}))) as {
        matters?: MatterChoice[];
        error?: string;
      };
      if (!active) return;
      if (response.status === 401) {
        setSessionState("signed_out");
        return;
      }
      if (!response.ok) throw new Error(body.error || "Unable to load shared matters.");
      setSessionState("ready");
      setMatters(body.matters || []);
      if (body.matters?.length === 1) await loadPortal(body.matters[0].accessHandle);
    }
    void load().catch((error: unknown) => {
      if (active) setMessage(error instanceof Error ? error.message : "Unable to load shared matters.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!portal?.accessExpiresAt) return;
    const expiresAt = new Date(portal.accessExpiresAt).getTime();
    const endAccess = () => {
      window.sessionStorage.removeItem("l2f.attorney.access");
      setPortal(null);
      setMatters([]);
      setMessage("This legacy access period has ended. Ask the client to send a new invitation.");
    };
    let timer: number | undefined;
    const checkExpiry = () => {
      const remaining = expiresAt - Date.now();
      if (!Number.isFinite(expiresAt) || remaining <= 0) {
        endAccess();
        return;
      }
      timer = window.setTimeout(
        checkExpiry,
        Math.min(remaining + 250, maxBrowserTimeoutMs)
      );
    };
    checkExpiry();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [portal]);

  const dataset = portal?.projection.dataset;
  const evidence = portal?.projection.evidence || [];
  const exportDataset = useMemo(
    () => dataset && selection ? buildAttorneyExportDataset(dataset, selection) : dataset,
    [dataset, selection]
  );
  const selectionCounts = useMemo(
    () => dataset && selection ? attorneySelectionCounts(dataset, selection) : { selected: 0, total: 0 },
    [dataset, selection]
  );
  const timeline = useMemo(
    () => dataset && range.from && range.to
      ? buildCalendarEvents(dataset, "shared-owner", "shared-case", range).filter(isTimelineVisibleEvent)
      : [],
    [dataset, range]
  );
  const reportPreview = useMemo(
    () => exportDataset && generatedReport
      ? buildReportPreview(exportDataset, "shared-owner", "shared-case", generatedReport.range, generatedReport.type)
      : null,
    [exportDataset, generatedReport]
  );
  const activeSectionPacket = useMemo(() => {
    const section = exportableViewSections[view];
    return exportDataset && section && range.from && range.to
      ? buildSectionExportPacket(exportDataset, "shared-owner", "shared-case", range, section)
      : null;
  }, [exportDataset, range, view]);
  const visibleMatters = useMemo(() => {
    const query = matterSearch.trim().toLocaleLowerCase();
    if (!query) return matters;
    return matters.filter((matter) => matter.label.toLocaleLowerCase().includes(query));
  }, [matterSearch, matters]);

  async function downloadEvidence(item: SharedEvidenceItem) {
    if (!portal) return;
    setBusy(item.downloadHandle);
    setMessage("");
    try {
      const csrf = await getRecordsCsrfToken();
      const response = await fetch("/api/records/attorney/evidence/download", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-L2F-CSRF": csrf },
        body: JSON.stringify({ accessHandle: portal.accessHandle, evidenceHandle: item.downloadHandle }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Evidence file is unavailable.");
      }
      await downloadBlobFile(evidenceFileName(item), await response.blob());
      setMessage("Your evidence download is ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Evidence download failed.");
    } finally {
      setBusy("");
    }
  }

  function printEvidenceSheet(item: SharedEvidenceItem) {
    const printHtml = buildEvidencePrintHtml(item);
    if (!shareHtmlAsPdf(`custody_folio_file_sheet_${item.id}.pdf`, printHtml)) {
      const printUrl = URL.createObjectURL(new Blob([printHtml], { type: "text/html" }));
      const printWindow = window.open(printUrl, "_blank", "width=900,height=700");
      if (!printWindow) {
        URL.revokeObjectURL(printUrl);
        setMessage("Popup blocked. Allow popups to print the file sheet.");
        return;
      }
      printWindow.opener = null;
      printWindow.addEventListener("load", () => {
        printWindow.focus();
        printWindow.print();
      }, { once: true });
      window.setTimeout(() => URL.revokeObjectURL(printUrl), 60_000);
    }
    setMessage("File sheet opened. Printing does not change the client record.");
    if (portal) {
      void attorneyMutation("/api/records/attorney/portal/action", {
        accessHandle: portal.accessHandle,
        action: "report_downloaded",
        sectionId: "evidence",
      }).catch(() => setMessage("File sheet opened, but its audit event could not be recorded."));
    }
  }

  async function auditReport(action: "report_generated" | "report_downloaded", type: ReportType) {
    if (!portal) return;
    await attorneyMutation("/api/records/attorney/portal/action", {
      accessHandle: portal.accessHandle,
      action,
      reportType: type,
    });
  }

  async function generateReport() {
    try {
      await auditReport("report_generated", reportType);
      setGeneratedReport({ type: reportType, range: { ...range } });
      setMessage("Read-only report preview generated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Report access could not be verified.");
    }
  }

  async function downloadReport(format: "csv" | "pdf") {
    if (!reportPreview || !generatedReport) return;
    if (exportReview.some((reviewed) => !reviewed)) {
      setMessage("Complete the pre-export privacy review first.");
      return;
    }
    try {
      await auditReport("report_downloaded", generatedReport.type);
      const slug = `custody_folio_shared_${generatedReport.type}_${generatedReport.range.from}_${generatedReport.range.to}`;
      if (format === "csv") {
        downloadTextFile(`${slug}.csv`, reportPreviewToCsv(reportPreview), "text/csv");
      } else {
        const generated = generatePrintableReportPdf(
          printableReportPacket(reportPreview, generatedReport.range)
        );
        await downloadBlobFile(`${slug}.pdf`, generated.blob);
      }
      setMessage(`${format.toUpperCase()} report prepared. Download activity was recorded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Report download failed.");
    }
  }

  function updateReportRange(field: keyof DateRange, value: string) {
    setRange((current) => ({ ...current, [field]: value }));
    setGeneratedReport(null);
  }

  function updateReportType(value: ReportType) {
    setReportType(value);
    if (value === "full_profile_export" && dataset) {
      setRange(fullProfileDateRange(dataset, "shared-owner", "shared-case"));
    }
    setGeneratedReport(null);
  }

  function updateSelection(
    kind: AttorneySelectableRecordKind,
    id: string,
    selected: boolean
  ) {
    setSelection((current) => current
      ? setAttorneyRecordSelected(current, kind, id, selected)
      : current);
    setGeneratedReport(null);
  }

  function updateAllSelections(selected: boolean) {
    if (!dataset) return;
    setSelection(setAllAttorneyRecordsSelected(dataset, selected));
    setGeneratedReport(null);
  }

  async function exportSection(packet: SectionExportPacket, format: "csv" | "pdf") {
    if (!packet.tables.some((table) => table.rows.length > 0)) {
      setMessage("No selected records match this date range.");
      return;
    }
    setBusy(`section-${packet.id}-${format}`);
    setMessage("");
    try {
      if (!portal) return;
      await attorneyMutation("/api/records/attorney/portal/action", {
        accessHandle: portal.accessHandle,
        action: "report_downloaded",
        sectionId: packet.id,
      });
      const slug = `custody_folio_shared_${packet.id}_${packet.range.from}_${packet.range.to}`;
      if (format === "csv") {
        downloadTextFile(`${slug}.csv`, sectionExportToCsv(packet), "text/csv");
      } else {
        const generated = generatePrintableReportPdf(packet);
        await downloadBlobFile(`${slug}.pdf`, generated.blob);
      }
      setMessage(`${packet.title} ${format.toUpperCase()} export ready.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Section export failed.");
    } finally {
      setBusy("");
    }
  }

  async function leaveMatter() {
    if (!portal) return;
    setBusy("leave");
    try {
      await attorneyMutation("/api/records/attorney/portal/action", {
        accessHandle: portal.accessHandle,
        action: "leave",
      });
      window.sessionStorage.removeItem("l2f.attorney.access");
      setPortal(null);
      setMatters((current) => current.filter((matter) => matter.accessHandle !== portal.accessHandle));
      setMessage("You left the shared matter. Future access is blocked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to leave the matter.");
    } finally {
      setBusy("");
    }
  }

  async function logout() {
    await signOutRecordsSession();
    window.sessionStorage.removeItem("l2f.attorney.access");
    window.location.replace("/attorney/sign-in");
  }

  if (sessionState === "loading") return <main className="grid min-h-screen place-items-center bg-[#f4f7f6]"><p>Opening shared matters…</p></main>;
  if (sessionState === "signed_out") {
    return <main className="grid min-h-screen place-items-center bg-[#f4f7f6] px-4"><section className="max-w-lg rounded-lg border bg-white p-6 shadow-sm"><h1 className="text-2xl font-semibold">Shared With Me</h1><p className="mt-3 text-sm text-slate-600">Sign in with the attorney account created through your first client invitation. A new client can share another matter with the same account.</p><div className="mt-5 flex flex-wrap gap-2"><Link href="/attorney/sign-in" className="btn-primary">Attorney sign in</Link><Link href="/" className="btn-secondary">Custody Folio home</Link></div></section></main>;
  }

  if (!portal) {
    return (
      <main className="min-h-screen bg-[#f4f7f6] px-4 py-8 text-slate-950">
        <section className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-semibold">Shared With Me</h1><p className="mt-2 text-sm text-slate-600">Read-only client matters available until each client revokes access.</p></div><button type="button" className="btn-secondary" onClick={() => void logout()}>Sign out</button></div>
          {message ? <p role="status" className="mt-4 rounded-md border bg-slate-50 p-3 text-sm">{message}</p> : null}
          {matters.length > 1 ? <label className="mt-5 grid gap-1.5 text-sm font-medium text-slate-700">Search clients or cases<input type="search" className="input" value={matterSearch} onChange={(event) => setMatterSearch(event.target.value)} placeholder="Client or case name" /></label> : null}
          <div className="mt-5 space-y-3">
            {visibleMatters.map((matter) => (
              <button key={matter.accessHandle} type="button" className="btn-secondary w-full text-left" onClick={() => void loadPortal(matter.accessHandle)}>
                <span className="block text-xs font-semibold uppercase tracking-wide text-teal-700">Client profile</span>
                <span className="mt-1 block font-semibold text-slate-900">{matter.clientName || matter.label}</span>
                <span className="mt-1 block text-sm text-slate-700">Case: {matter.caseName || "Shared matter"}</span>
                <span className="mt-2 block text-xs text-slate-500">Granted {new Date(matter.grantedAt).toLocaleDateString()} · {matter.expiresAt ? `legacy access ends ${new Date(matter.expiresAt).toLocaleString()}` : "active until client revocation"}</span>
              </button>
            ))}
            {matters.length > 0 && visibleMatters.length === 0 ? <p className="text-sm text-slate-500">No client or case matches that search.</p> : null}
            {!matters.length ? <p className="text-sm text-slate-500">No active shared matters are available. An invitation may still need to be accepted.</p> : null}
          </div>
        </section>
      </main>
    );
  }

  const matter = dataset?.matters[0];
  const selectedMatter = matters.find((choice) => choice.accessHandle === portal.accessHandle);
  const selectedClientName = selectedMatter?.clientName || selectedMatter?.label.split(" — ")[0] || "Client";
  const selectedCaseName = selectedMatter?.caseName || matter?.caseName || "Shared matter";
  const supportObligations = dataset
    ? generateChildSupportObligations(
        dataset.childSupportOrders,
        dataset.childSupportPayments,
        range,
        formatLocalDate(new Date(), matter?.timezone)
      )
    : [];
  const supportStats = calculateChildSupportObligationStats(
    supportObligations,
    formatLocalDate(new Date(), matter?.timezone)
  );
  const expenseStats = dataset ? calculateExpenseStats(dataset.expenseItems, range) : null;
  const selectedReportOption = reportsTabReportTypes.find((option) => option.value === reportType);
  const exportReviewComplete = exportReview.every(Boolean);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f4f7f6] text-slate-950">
      <header className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Read-only attorney portal</p><h1 className="mt-1 text-xl font-semibold">{selectedCaseName}</h1></div>
          <div className="flex max-w-full flex-wrap items-end gap-2">
            <label className="grid min-w-64 max-w-full gap-1 text-xs font-semibold text-slate-700" htmlFor="attorney-matter-switcher">
              Client profile and case
              <select id="attorney-matter-switcher" className="input max-w-full" value={portal.accessHandle} onChange={(event) => void loadPortal(event.target.value)}>{matters.map((choice) => <option key={choice.accessHandle} value={choice.accessHandle}>{choice.clientName || "Client"} — {choice.caseName || "Shared matter"}</option>)}</select>
            </label>
            {matters.length > 1 ? <button type="button" className="btn-secondary" onClick={() => setPortal(null)}>All matters</button> : null}
            <button type="button" className="btn-secondary" onClick={() => void logout()}>Sign out</button>
            <button type="button" className="btn-secondary text-red-700" disabled={busy === "leave"} onClick={() => void leaveMatter()}>{busy === "leave" ? "Leaving…" : "Leave matter"}</button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-5">
        <section className={`rounded-lg border p-4 ${selectedMatter?.profileConfirmed ? "border-teal-200 bg-teal-50" : "border-amber-200 bg-amber-50"}`} aria-labelledby="current-attorney-profile-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Currently viewing</p>
              <h2 id="current-attorney-profile-heading" className="mt-1 text-lg font-semibold text-slate-950">{selectedClientName}</h2>
              <p className="mt-1 text-sm text-slate-700"><span className="font-semibold">Case:</span> {selectedCaseName}</p>
            </div>
            <p className="max-w-lg text-sm leading-6 text-slate-700">
              {selectedMatter?.profileConfirmed
                ? "The client confirmed these profile labels. Verify the client and case here before reviewing or exporting records."
                : "The client has not confirmed these profile labels. Verify the client outside Custody Folio before relying on downloads or reports."}
            </p>
          </div>
        </section>
        <div className="mt-4 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm leading-6 text-teal-950">{portal.accessExpiresAt ? `This legacy grant remains read only through ${new Date(portal.accessExpiresAt).toLocaleString()}.` : "This grant remains read only until the client revokes it or you leave the matter."} You may return through attorney sign in without asking for another invitation. You cannot create, edit, delete, upload, change report inclusion, invite others, or access the client’s account settings. Custody Folio organizes user provided information and does not verify allegations or provide legal advice.</div>
        <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="attorney-export-selection-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="attorney-export-selection-heading" className="font-semibold text-slate-950">Choose records for attorney exports</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Select only the records you want in CSV and PDF exports. These choices are private to this session and never change the client&apos;s records.
              </p>
            </div>
            <p className="rounded-full bg-teal-50 px-3 py-1.5 text-sm font-semibold text-teal-800">
              {selectionCounts.selected} of {selectionCounts.total} selected
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              From
              <input type="date" className="input" value={range.from} onChange={(event) => updateReportRange("from", event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              To
              <input type="date" className="input" value={range.to} onChange={(event) => updateReportRange("to", event.target.value)} />
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => updateAllSelections(true)}>Select all</button>
              <button type="button" className="btn-secondary" onClick={() => updateAllSelections(false)}>Clear all</button>
            </div>
          </div>
        </section>
        <nav className="mt-4 flex max-w-full gap-2 overflow-x-auto pb-2" aria-label="Shared matter sections">{portalViews.map((item) => <button key={item} type="button" onClick={() => setView(item)} className={`shrink-0 rounded-md px-3 py-2 text-sm font-semibold ${view === item ? "bg-teal-700 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{portalViewLabels[item]}</button>)}</nav>
        {message ? <p role="status" aria-live="polite" className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-sm">{message}</p> : null}
        <main className="mt-4 min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          {view === "Overview" ? <div><h2 className="text-lg font-semibold">Shared case overview</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Timeline records", timeline.length],["Notes", dataset?.dateNotes.length || 0],["Files", evidence.length],["Expenses", dataset?.expenseItems.length || 0]].map(([label,value]) => <div key={String(label)} className="rounded-md border bg-slate-50 p-4"><p className="text-xs uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}</div><p className="mt-4 text-sm leading-6 text-slate-600">Granted case information is refreshed from the owner’s current persisted snapshot. Access is checked again on every protected request.</p></div> : null}
          {view === "Timeline" ? <div><h2 className="text-lg font-semibold">Timeline</h2><div className="mt-3 space-y-3">{timeline.map((event) => <article key={event.id} className="rounded-md border p-3"><p className="text-sm font-semibold">{event.title}</p><p className="mt-1 text-xs text-slate-500">{event.date} {event.time || ""}</p>{event.body ? <p className="mt-2 text-sm leading-6 text-slate-600">{event.body}</p> : null}</article>)}{!timeline.length ? <p className="text-sm text-slate-500">No timeline records in this range.</p> : null}</div></div> : null}
          {view === "Calendar" ? (
            <div>
              <h2 className="text-lg font-semibold">Calendar records</h2>
              <p className="mt-1 text-sm text-slate-600">Choose the custody days to include in this section&apos;s exports and combined reports.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {dataset?.custodyDayAssignments.map((record) => (
                  <article key={record.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{record.date}</p>
                        <p className="text-sm text-slate-600">{record.caregiverLabel}{record.exchangeTime ? ` · exchange ${record.exchangeTime}` : ""}</p>
                      </div>
                      <AttorneyRecordCheckbox
                        checked={selection?.custodyDayAssignments.has(record.id) || false}
                        label="Include"
                        onChange={(checked) => updateSelection("custodyDayAssignments", record.id, checked)}
                      />
                    </div>
                  </article>
                ))}
                {!dataset?.custodyDayAssignments.length ? <p className="text-sm text-slate-500">No custody calendar records are available.</p> : null}
              </div>
            </div>
          ) : null}
          {view === "Exchanges" ? (
            <div>
              <h2 className="text-lg font-semibold">Exchange records</h2>
              <p className="mt-1 text-sm text-slate-600">Review the saved schedule and choose the rules and logged outcomes to export.</p>
              {dataset?.exchangeRules.length ? (
                <section className="mt-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Scheduled exchange rules</h3>
                  <div className="mt-2 space-y-2">
                    {dataset.exchangeRules.map((record) => (
                      <article key={record.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border bg-slate-50 p-3">
                        <div>
                          <p className="font-semibold">{record.ruleName}</p>
                          <p className="mt-1 text-sm text-slate-600">Day {record.dayOfWeek} · {record.orderedExchangeTime}{record.location ? ` · ${record.location}` : ""}</p>
                        </div>
                        <AttorneyRecordCheckbox checked={selection?.exchangeRules.has(record.id) || false} label="Include" onChange={(checked) => updateSelection("exchangeRules", record.id, checked)} />
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
              <section className="mt-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Logged outcomes</h3>
                <div className="mt-2 space-y-3">
                  {dataset?.exchangeLogs.map((record) => (
                    <article key={record.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{record.orderedExchangeAt}</p>
                          <p className="mt-1 text-sm text-slate-600">{record.status.replaceAll("_", " ")}{record.location ? ` · ${record.location}` : ""}</p>
                        </div>
                        <AttorneyRecordCheckbox checked={selection?.exchangeLogs.has(record.id) || false} label="Include" onChange={(checked) => updateSelection("exchangeLogs", record.id, checked)} />
                      </div>
                      {record.notes ? <p className="mt-2 text-sm">{record.notes}</p> : null}
                    </article>
                  ))}
                  {!dataset?.exchangeLogs.length ? <p className="text-sm text-slate-500">No logged exchange outcomes are available.</p> : null}
                </div>
              </section>
            </div>
          ) : null}
          {view === "Notes" ? (
            <div>
              <h2 className="text-lg font-semibold">Notes & events</h2>
              <p className="mt-1 text-sm text-slate-600">Choose each note you want included in attorney-created exports.</p>
              <div className="mt-3 space-y-3">
                {dataset?.dateNotes.map((record) => (
                  <article key={record.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{record.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{record.noteDate} · {record.category.replaceAll("_", " ")}</p>
                      </div>
                      <AttorneyRecordCheckbox checked={selection?.dateNotes.has(record.id) || false} label="Include" onChange={(checked) => updateSelection("dateNotes", record.id, checked)} />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{record.body}</p>
                  </article>
                ))}
                {!dataset?.dateNotes.length ? <p className="text-sm text-slate-500">No notes are available.</p> : null}
              </div>
            </div>
          ) : null}
          {view === "Files" ? (
            <div>
              <h2 className="text-lg font-semibold">Evidence files</h2>
              <p className="mt-1 text-sm text-slate-600">Download any original file individually. Use Include to choose which files appear in PDF and CSV file indexes.</p>
              <div className="mt-3 space-y-3">
                {evidence.map((item) => (
                  <article key={item.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-semibold">{evidenceFileName(item)}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.evidenceDate || item.uploadedAt.slice(0, 10)} · {Math.round(item.fileSize / 1024)} KB</p>
                        {item.description ? <p className="mt-2 text-sm text-slate-600">{item.description}</p> : null}
                      </div>
                      <div className="flex flex-wrap items-start gap-2">
                        <AttorneyRecordCheckbox checked={selection?.evidenceItems.has(item.id) || false} label="Include" onChange={(checked) => updateSelection("evidenceItems", item.id, checked)} />
                        <button type="button" className="btn-secondary" aria-label={`Print file sheet ${evidenceFileName(item)}`} onClick={() => printEvidenceSheet(item)}>Print sheet</button>
                        <button type="button" className="btn-secondary" aria-label={`Download ${evidenceFileName(item)}`} disabled={busy === item.downloadHandle || item.malwareScanStatus !== "clean"} onClick={() => void downloadEvidence(item)}>{busy === item.downloadHandle ? "Preparing…" : "Download file"}</button>
                      </div>
                    </div>
                  </article>
                ))}
                {!evidence.length ? <p className="text-sm text-slate-500">No evidence files are available.</p> : null}
              </div>
            </div>
          ) : null}
          {view === "Child Support" ? (
            <div>
              <h2 className="text-lg font-semibold">Child support</h2>
              <p className="mt-2 text-sm text-slate-600">Scheduled due to date: {formatMoney(supportStats.totalDue)} · recorded paid: {formatMoney(supportStats.totalPaid)} · calculated past-due balance: {formatMoney(supportStats.pastDueBalance)}</p>
              <p className="mt-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-950">Scheduled obligations are calculated from the owner&apos;s entered order terms and matched to user-entered payment records by due date. Check against the signed order and official agency history.</p>
              <section className="mt-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Orders</h3>
                <div className="mt-2 space-y-2">
                  {dataset?.childSupportOrders.map((record) => (
                    <article key={record.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border bg-slate-50 p-3">
                      <div>
                        <p className="font-semibold">{record.orderNickname}</p>
                        <p className="mt-1 text-sm text-slate-600">{formatMoney(record.orderedAmount, record.currency)} · {record.paymentFrequency.replaceAll("_", " ")} · effective {record.effectiveStartDate}</p>
                      </div>
                      <AttorneyRecordCheckbox checked={selection?.childSupportOrders.has(record.id) || false} label="Include" onChange={(checked) => updateSelection("childSupportOrders", record.id, checked)} />
                    </article>
                  ))}
                  {!dataset?.childSupportOrders.length ? <p className="text-sm text-slate-500">No child support orders are available.</p> : null}
                </div>
              </section>
              <section className="mt-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Payment records</h3>
                <div className="mt-2 space-y-3">
                  {dataset?.childSupportPayments.map((record) => (
                    <article key={record.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">Due {record.dueDate}</p>
                          <p className="text-sm text-slate-600">Due {formatMoney(record.amountDue)} · recorded paid {formatMoney(record.amountPaid)} · {record.paymentStatus.replaceAll("_", " ")}</p>
                        </div>
                        <AttorneyRecordCheckbox checked={selection?.childSupportPayments.has(record.id) || false} label="Include" onChange={(checked) => updateSelection("childSupportPayments", record.id, checked)} />
                      </div>
                      {record.notes ? <p className="mt-2 text-sm text-slate-600">{record.notes}</p> : null}
                    </article>
                  ))}
                  {!dataset?.childSupportPayments.length ? <p className="text-sm text-slate-500">No child support payment records are available.</p> : null}
                </div>
              </section>
              {supportObligations.length ? <p className="mt-4 text-xs text-slate-500">The calculated obligation totals above use the selected date range. The export uses the orders and payment records you checked.</p> : null}
            </div>
          ) : null}
          {view === "Expenses" ? (
            <div>
              <h2 className="text-lg font-semibold">Expenses</h2>
              <p className="mt-2 text-sm text-slate-600">Recorded total in this date range: {formatMoney(expenseStats?.totalExpenses || 0)}</p>
              <div className="mt-3 space-y-3">
                {dataset?.expenseItems.map((record) => (
                  <article key={record.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{record.expenseDate} · {formatMoney(record.amount, record.currency)}</p>
                        <p className="text-sm text-slate-600">{record.description} · {record.reimbursementStatus.replaceAll("_", " ")}</p>
                      </div>
                      <AttorneyRecordCheckbox checked={selection?.expenseItems.has(record.id) || false} label="Include" onChange={(checked) => updateSelection("expenseItems", record.id, checked)} />
                    </div>
                    {record.notes ? <p className="mt-2 text-sm text-slate-600">{record.notes}</p> : null}
                  </article>
                ))}
                {!dataset?.expenseItems.length ? <p className="text-sm text-slate-500">No expense records are available.</p> : null}
              </div>
            </div>
          ) : null}
          {view === "Reports" ? (
            <div className="grid min-w-0 gap-4 xl:grid-cols-[360px_1fr]">
              <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h2 className="text-lg font-semibold">Report builder</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">Uses the date range and checked records above. Change either one, then generate a new preview.</p>
                <label className="mt-4 grid gap-1 text-sm font-medium">
                  Report type
                  <select className="input" value={reportType} onChange={(event) => updateReportType(event.target.value as ReportType)}>
                    {reportsTabReportTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                {selectedReportOption ? (
                  <div className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-600">
                    <p className="font-semibold text-slate-950">{selectedReportOption.label}</p>
                    <p>{selectedReportOption.description}</p>
                  </div>
                ) : null}
                <button type="button" className="btn-primary mt-3 w-full" onClick={() => void generateReport()}>Generate report preview</button>
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-semibold text-amber-950">Pre-export privacy review</p>
                  <div className="mt-3 space-y-2">
                    {attorneyExportReviewItems.map((item, index) => (
                      <label key={item} className="flex items-start gap-2 text-xs leading-5 text-amber-950">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={exportReview[index]}
                          onChange={(event) => setExportReview((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.checked : value))}
                        />
                        <span>{item}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="mt-3 grid gap-2">
                  <button type="button" className="btn-primary" disabled={!reportPreview || !exportReviewComplete} onClick={() => void downloadReport("csv")}>Download CSV</button>
                  <button type="button" className="btn-secondary" disabled={!reportPreview || !exportReviewComplete} onClick={() => void downloadReport("pdf")}>Print or save PDF</button>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">Downloaded reports leave protected storage. Attorney selections do not alter the client&apos;s account.</p>
              </section>
              <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
                {reportPreview ? (
                  <article>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{generatedReport?.range.from} to {generatedReport?.range.to}</p>
                    <h2 className="mt-1 text-2xl font-semibold">{reportPreview.title}</h2>
                    <p className="mt-2 text-sm font-semibold text-slate-800">{reportPreview.focus}</p>
                    <p className="mt-2 rounded-md border bg-slate-50 p-3 text-sm leading-6">{reportPreview.disclaimer}</p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {reportPreview.metrics.map((metric) => <div key={metric.label} className="rounded-md border bg-slate-50 p-3"><p className="text-xs text-slate-500">{metric.label}</p><p className="mt-1 text-xl font-semibold">{metric.value}</p></div>)}
                    </div>
                    <div className="mt-4 space-y-2">{reportPreview.summaries.map((summary) => <p key={summary} className="rounded-md border bg-slate-50 p-3 text-sm leading-6 text-slate-700">{summary}</p>)}</div>
                    {reportPreview.charts.map((chart) => (
                      <section key={chart.title} className="mt-4 rounded-md border p-3">
                        <h3 className="font-semibold">{chart.title}</h3>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">{chart.rows.slice(0, 8).map((row) => <div key={row.label} className="flex justify-between gap-3 rounded bg-slate-50 px-3 py-2 text-xs"><span>{row.label}</span><span className="font-semibold">{row.value}</span></div>)}</div>
                      </section>
                    ))}
                    {reportPreview.tables.map((table) => (
                      <section key={table.title} className="mt-4">
                        <h3 className="font-semibold">{table.title}</h3>
                        <div className="mt-2 space-y-2">{table.rows.slice(0, 24).map((row, index) => <div key={index} className="grid gap-1 rounded border p-2 text-xs sm:grid-cols-2">{row.map((cell, cellIndex) => <p key={cellIndex} className="break-words"><span className="font-semibold">{table.headers[cellIndex]}:</span> {cell}</p>)}</div>)}</div>
                        {table.rows.length > 24 ? <p className="mt-2 text-xs text-slate-500">{table.rows.length - 24} more rows are included in the complete export.</p> : null}
                      </section>
                    ))}
                    {reportPreview.evidenceIndex.length ? (
                      <section className="mt-4">
                        <h3 className="font-semibold">Supporting file index</h3>
                        <div className="mt-2 space-y-2">{reportPreview.evidenceIndex.map((item) => <div key={item.index} className="rounded border p-2 text-xs"><span className="font-semibold">{item.index}. {item.fileName}</span><span className="ml-2 text-slate-500">{item.evidenceDate}</span></div>)}</div>
                      </section>
                    ) : null}
                  </article>
                ) : <div className="grid min-h-64 place-items-center text-center text-sm text-slate-500"><p>Choose a report type and generate a preview.</p></div>}
              </section>
            </div>
          ) : null}
          {activeSectionPacket ? (
            <section className="mt-6 border-t border-slate-200 pt-5" aria-labelledby="attorney-section-export-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="attorney-section-export-heading" className="text-lg font-semibold">{activeSectionPacket.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">Export only the checked records in the selected date range.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-primary" disabled={busy.startsWith("section-") || !activeSectionPacket.tables.some((table) => table.rows.length)} onClick={() => void exportSection(activeSectionPacket, "pdf")}>{busy === `section-${activeSectionPacket.id}-pdf` ? "Preparing…" : "Print / save PDF"}</button>
                  <button type="button" className="btn-secondary" disabled={busy.startsWith("section-") || !activeSectionPacket.tables.some((table) => table.rows.length)} onClick={() => void exportSection(activeSectionPacket, "csv")}>{busy === `section-${activeSectionPacket.id}-csv` ? "Preparing…" : "Download CSV"}</button>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {activeSectionPacket.metrics.slice(0, 4).map((metric) => <div key={metric.label} className="rounded-md border bg-slate-50 p-3"><p className="text-xs text-slate-500">{metric.label}</p><p className="mt-1 text-xl font-semibold">{metric.value}</p></div>)}
              </div>
              <ul className="mt-4 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-600">{activeSectionPacket.suggestedUses.slice(0, 2).map((item) => <li key={item}>{item}</li>)}</ul>
              {!activeSectionPacket.tables.some((table) => table.rows.length) ? <p className="mt-3 text-sm font-medium text-amber-700">No selected records match this date range.</p> : null}
            </section>
          ) : null}
        </main>
      </div>
      <PolicyFooter recordsNote="Read-only attorney guest access. Downloaded copies cannot be recalled after revocation." />
    </div>
  );
}

function AttorneyRecordCheckbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex shrink-0 items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
