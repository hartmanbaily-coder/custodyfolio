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
  signOutRecordsSession,
} from "@/lib/records/clientStore";
import type { SharedCaseProjection, SharedEvidenceItem } from "@/lib/records/attorneyProjection";
import {
  buildReportPreview,
  reportPreviewToCsv,
  reportsTabReportTypes,
} from "@/lib/records/reports";
import type { DateRange, ReportType } from "@/lib/records/types";
import { formatLocalDate } from "@/lib/records/dateRanges";
import { maxBrowserTimeoutMs } from "@/lib/records/attorneyPolicy";
import { evidenceFileName } from "@/lib/records/validation";
import {
  generatePrintableReportPdf,
  printableReportPacket,
} from "@/lib/records/reportPdf";

type PortalView = "Overview" | "Timeline" | "Calendar" | "Exchanges" | "Notes" | "Files" | "Child Support" | "Expenses" | "Reports";
const portalViews: PortalView[] = ["Overview", "Timeline", "Calendar", "Exchanges", "Notes", "Files", "Child Support", "Expenses", "Reports"];

type MatterChoice = {
  accessHandle: string;
  label: string;
  clientName: string;
  caseName: string;
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

  async function loadPortal(accessHandle: string) {
    const body = await attorneyMutation("/api/records/attorney/portal", { accessHandle }) as unknown as PortalResponse;
    setPortal(body);
    setRange(initialRange(body.projection));
    setGeneratedReport(null);
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
  const timeline = useMemo(
    () => dataset && range.from && range.to
      ? buildCalendarEvents(dataset, "shared-owner", "shared-case", range).filter(isTimelineVisibleEvent)
      : [],
    [dataset, range]
  );
  const reportPreview = useMemo(
    () => dataset && generatedReport
      ? buildReportPreview(dataset, "shared-owner", "shared-case", generatedReport.range, generatedReport.type)
      : null,
    [dataset, generatedReport]
  );
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
    setGeneratedReport(null);
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
            {visibleMatters.map((matter) => <button key={matter.accessHandle} type="button" className="btn-secondary w-full text-left" onClick={() => void loadPortal(matter.accessHandle)}><span className="block font-semibold text-slate-900">{matter.label}</span><span className="mt-1 block text-xs text-slate-500">Granted {new Date(matter.grantedAt).toLocaleDateString()} · {matter.expiresAt ? `legacy access ends ${new Date(matter.expiresAt).toLocaleString()}` : "active until client revocation"}</span></button>)}
            {matters.length > 0 && visibleMatters.length === 0 ? <p className="text-sm text-slate-500">No client or case matches that search.</p> : null}
            {!matters.length ? <p className="text-sm text-slate-500">No active shared matters are available. An invitation may still need to be accepted.</p> : null}
          </div>
        </section>
      </main>
    );
  }

  const matter = dataset?.matters[0];
  const selectedMatter = matters.find((choice) => choice.accessHandle === portal.accessHandle);
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

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f4f7f6] text-slate-950">
      <header className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Read-only attorney portal</p><h1 className="mt-1 text-xl font-semibold">{selectedMatter?.label || matter?.caseName || "Shared matter"}</h1></div>
          <div className="flex flex-wrap items-center gap-2">
            {matters.length > 1 ? <label className="sr-only" htmlFor="attorney-matter-switcher">Switch client matter</label> : null}
            {matters.length > 1 ? <select id="attorney-matter-switcher" className="input min-w-56" value={portal.accessHandle} onChange={(event) => void loadPortal(event.target.value)}>{matters.map((choice) => <option key={choice.accessHandle} value={choice.accessHandle}>{choice.label}</option>)}</select> : null}
            {matters.length > 1 ? <button type="button" className="btn-secondary" onClick={() => setPortal(null)}>All matters</button> : null}
            <button type="button" className="btn-secondary" onClick={() => void logout()}>Sign out</button>
            <button type="button" className="btn-secondary text-red-700" disabled={busy === "leave"} onClick={() => void leaveMatter()}>{busy === "leave" ? "Leaving…" : "Leave matter"}</button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-5">
        <div className="rounded-md border border-teal-200 bg-teal-50 p-3 text-sm leading-6 text-teal-950">{portal.accessExpiresAt ? `This legacy grant remains read only through ${new Date(portal.accessExpiresAt).toLocaleString()}.` : "This grant remains read only until the client revokes it or you leave the matter."} You may return through attorney sign in without asking for another invitation. You cannot create, edit, delete, upload, change report inclusion, invite others, or access the client’s account settings. Custody Folio organizes user provided information and does not verify allegations or provide legal advice.</div>
        <nav className="mt-4 flex max-w-full gap-2 overflow-x-auto pb-2" aria-label="Shared matter sections">{portalViews.map((item) => <button key={item} type="button" onClick={() => setView(item)} className={`shrink-0 rounded-md px-3 py-2 text-sm font-semibold ${view === item ? "bg-teal-700 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{item}</button>)}</nav>
        {message ? <p role="status" aria-live="polite" className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-sm">{message}</p> : null}
        <main className="mt-4 min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          {view === "Overview" ? <div><h2 className="text-lg font-semibold">Shared case overview</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Timeline records", timeline.length],["Notes", dataset?.dateNotes.length || 0],["Files", evidence.length],["Expenses", dataset?.expenseItems.length || 0]].map(([label,value]) => <div key={String(label)} className="rounded-md border bg-slate-50 p-4"><p className="text-xs uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}</div><p className="mt-4 text-sm leading-6 text-slate-600">Granted case information is refreshed from the owner’s current persisted snapshot. Access is checked again on every protected request.</p></div> : null}
          {view === "Timeline" ? <div><h2 className="text-lg font-semibold">Timeline</h2><div className="mt-3 space-y-3">{timeline.map((event) => <article key={event.id} className="rounded-md border p-3"><p className="text-sm font-semibold">{event.title}</p><p className="mt-1 text-xs text-slate-500">{event.date} {event.time || ""}</p>{event.body ? <p className="mt-2 text-sm leading-6 text-slate-600">{event.body}</p> : null}</article>)}{!timeline.length ? <p className="text-sm text-slate-500">No timeline records in this range.</p> : null}</div></div> : null}
          {view === "Calendar" ? <div><h2 className="text-lg font-semibold">Calendar records</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{dataset?.custodyDayAssignments.map((record) => <div key={record.id} className="rounded-md border p-3"><p className="font-semibold">{record.date}</p><p className="text-sm text-slate-600">{record.caregiverLabel}{record.exchangeTime ? ` · exchange ${record.exchangeTime}` : ""}</p></div>)}</div></div> : null}
          {view === "Exchanges" ? <div><h2 className="text-lg font-semibold">Exchange records</h2><div className="mt-3 space-y-3">{dataset?.exchangeLogs.map((record) => <article key={record.id} className="rounded-md border p-3"><p className="font-semibold">{record.orderedExchangeAt}</p><p className="mt-1 text-sm text-slate-600">{record.status.replaceAll("_", " ")}{record.location ? ` · ${record.location}` : ""}</p>{record.notes ? <p className="mt-2 text-sm">{record.notes}</p> : null}</article>)}</div></div> : null}
          {view === "Notes" ? <div><h2 className="text-lg font-semibold">Notes</h2><div className="mt-3 space-y-3">{dataset?.dateNotes.map((record) => <article key={record.id} className="rounded-md border p-3"><p className="font-semibold">{record.title}</p><p className="mt-1 text-xs text-slate-500">{record.noteDate} · {record.category.replaceAll("_", " ")}</p><p className="mt-2 text-sm leading-6 text-slate-600">{record.body}</p></article>)}</div></div> : null}
          {view === "Files" ? <div><h2 className="text-lg font-semibold">Evidence files</h2><div className="mt-3 space-y-3">{evidence.map((item) => <article key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3"><div className="min-w-0"><p className="break-words font-semibold">{evidenceFileName(item)}</p><p className="mt-1 text-xs text-slate-500">{item.evidenceDate || item.uploadedAt.slice(0,10)} · {Math.round(item.fileSize/1024)} KB</p>{item.description ? <p className="mt-2 text-sm text-slate-600">{item.description}</p> : null}</div><button type="button" className="btn-secondary" disabled={busy === item.downloadHandle || item.malwareScanStatus !== "clean"} onClick={() => void downloadEvidence(item)}>{busy === item.downloadHandle ? "Preparing…" : "Download"}</button></article>)}</div></div> : null}
          {view === "Child Support" ? <div><h2 className="text-lg font-semibold">Child support</h2><p className="mt-2 text-sm text-slate-600">Scheduled due to date: {formatMoney(supportStats.totalDue)} · recorded paid: {formatMoney(supportStats.totalPaid)} · calculated past-due balance: {formatMoney(supportStats.pastDueBalance)}</p><p className="mt-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-950">Scheduled obligations are calculated from the owner&apos;s entered order terms and matched to user-entered payment records by due date. Check against the signed order and official agency history.</p><div className="mt-3 space-y-3">{supportObligations.map((record) => <article key={record.id} className="rounded-md border p-3"><p className="font-semibold">{record.orderNickname} · due {record.dueDate}</p><p className="text-sm text-slate-600">Scheduled {formatMoney(record.amountDue, record.currency)} · paid {formatMoney(record.amountPaid, record.currency)} · balance {formatMoney(record.balance, record.currency)} · {record.status.replaceAll("_", " ")}</p></article>)}</div></div> : null}
          {view === "Expenses" ? <div><h2 className="text-lg font-semibold">Expenses</h2><p className="mt-2 text-sm text-slate-600">Recorded total: {formatMoney(expenseStats?.totalExpenses || 0)}</p><div className="mt-3 space-y-3">{dataset?.expenseItems.map((record) => <article key={record.id} className="rounded-md border p-3"><p className="font-semibold">{record.expenseDate} · {formatMoney(record.amount)}</p><p className="text-sm text-slate-600">{record.description} · {record.reimbursementStatus.replaceAll("_", " ")}</p></article>)}</div></div> : null}
          {view === "Reports" ? <div><h2 className="text-lg font-semibold">Reports</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="grid gap-1 text-sm font-medium">From<input type="date" className="input" value={range.from} onChange={(event) => updateReportRange("from", event.target.value)} /></label><label className="grid gap-1 text-sm font-medium">To<input type="date" className="input" value={range.to} onChange={(event) => updateReportRange("to", event.target.value)} /></label><label className="grid gap-1 text-sm font-medium sm:col-span-2">Report type<select className="input" value={reportType} onChange={(event) => updateReportType(event.target.value as ReportType)}>{reportsTabReportTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn-primary" onClick={() => void generateReport()}>Generate report preview</button><button type="button" className="btn-secondary" disabled={!reportPreview} onClick={() => void downloadReport("csv")}>Download CSV</button><button type="button" className="btn-secondary" disabled={!reportPreview} onClick={() => void downloadReport("pdf")}>Share or print PDF</button></div>{reportPreview ? <article className="mt-5"><h3 className="text-xl font-semibold">{reportPreview.title}</h3><p className="mt-2 rounded-md border bg-slate-50 p-3 text-sm">{reportPreview.disclaimer}</p>{reportPreview.tables.map((table) => <section key={table.title} className="mt-4"><h4 className="font-semibold">{table.title}</h4><div className="mt-2 space-y-2">{table.rows.slice(0,20).map((row,index) => <div key={index} className="grid gap-1 rounded border p-2 text-xs sm:grid-cols-2">{row.map((cell,cellIndex) => <p key={cellIndex} className="break-words"><span className="font-semibold">{table.headers[cellIndex]}:</span> {cell}</p>)}</div>)}</div></section>)}</article> : null}</div> : null}
        </main>
      </div>
      <PolicyFooter recordsNote="Read-only attorney guest access. Downloaded copies cannot be recalled after revocation." />
    </div>
  );
}
