import Link from "next/link";
import Image from "next/image";

import PolicyFooter from "@/components/PolicyFooter";
import { pageMetadata, recordsTagline, siteDescription, siteName } from "@/lib/site";

export const metadata = {
  ...pageMetadata({
    title: "Custody Folio | Custody Logs and Evidence",
    description: siteDescription,
    canonical: "/",
  }),
  title: { absolute: "Custody Folio | Custody Logs and Evidence" },
};

const quickActions = [
  "Add a record",
  "Review your timeline",
  "Prepare or share",
];

const workflowSteps = [
  {
    title: "Track",
    detail: "Add parenting time, communication, notes, expenses, and other dated events.",
  },
  {
    title: "Attach",
    detail: "Keep supporting files tied to the timeline item they belong with.",
  },
  {
    title: "Export",
    detail: "Create cleaner summaries and court useful packets when you need to review the data.",
  },
];

const previewRows = [
  { date: "Jul 03", title: "Parenting time update", status: "Saved" },
  { date: "Jul 05", title: "Communication note", status: "Saved" },
  { date: "Jul 08", title: "Supporting file", status: "Attached" },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f4f7f6] text-slate-950">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
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

        <nav className="hidden items-center gap-1 text-sm font-medium md:flex">
          <Link href="/records" className="rounded-md bg-slate-950 px-4 py-2 text-white shadow-sm transition hover:bg-slate-800">
            Open workspace
          </Link>
        </nav>

        <Link href="/records" className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white shadow-sm md:hidden">
          Workspace
        </Link>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-88px)] max-w-7xl content-center gap-10 px-4 pb-10 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_500px] lg:px-8">
        <div className="flex max-w-3xl flex-col justify-center">
          <h1 className="text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
            A calmer way to keep custody records organized.
          </h1>
          <p className="mt-5 max-w-2xl text-xl leading-8 text-slate-600">
            Add events, parenting time, expenses, notes, and files in one private place—then prepare clear information when you need it.
          </p>

          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex min-h-12 flex-1 items-center gap-3 rounded-lg bg-slate-50 px-4 text-left text-sm text-slate-500">
                <SearchIcon />
                <span>What would you like to add?</span>
              </div>
              <Link
                href="/records"
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-200"
              >
                Open records workspace
              </Link>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 px-1 pb-1">
              {quickActions.map((action) => (
                <Link
                  key={action}
                  href="/records"
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-teal-500 hover:text-slate-950"
                >
                  {action}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <p className="text-sm font-semibold text-slate-950">Parenting plan records</p>
                <p className="mt-1 text-xs text-slate-500">Current month</p>
              </div>
              <div className="rounded-md bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800">
                9 timeline records
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <MetricPreview label="Recent" value="9" tone="teal" />
              <MetricPreview label="Parenting" value="4" tone="amber" />
              <MetricPreview label="Files" value="12" tone="slate" />
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-950">Case timeline</p>
                <p className="text-xs font-medium text-slate-500">Case overview</p>
              </div>
              <div className="mt-3 space-y-2">
                {previewRows.map((row) => (
                  <div key={`${row.date}-${row.title}`} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{row.date}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">{row.title}</p>
                      </div>
                      <span className="rounded bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                        {row.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Report ready</p>
              <p className="mt-1 text-sm leading-6 text-amber-950">
                Export a readable summary with charts, records, and supporting file index.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-4 pb-12 sm:px-6 md:grid-cols-3 lg:px-8">
        {workflowSteps.map((step) => (
          <div key={step.title} className="border-t border-slate-200 bg-white/60 px-1 py-5">
            <p className="text-lg font-semibold tracking-tight text-slate-950">{step.title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{step.detail}</p>
          </div>
        ))}
      </section>

      <PolicyFooter />
    </main>
  );
}

function MetricPreview({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "teal" | "amber" | "slate";
}) {
  const toneClass =
    tone === "teal"
      ? "border-l-teal-600 text-teal-700"
      : tone === "amber"
        ? "border-l-amber-500 text-amber-700"
        : "border-l-slate-500 text-slate-700";

  return (
    <div className={`rounded-lg border border-l-4 border-slate-200 bg-white p-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 16 16" fill="none">
      <path
        d="m11.2 11.2 2.3 2.3M12.3 7.1a5.2 5.2 0 1 1-10.4 0 5.2 5.2 0 0 1 10.4 0Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}
