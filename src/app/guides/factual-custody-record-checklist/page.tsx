import Link from "next/link";

import PolicyFooter from "@/components/PolicyFooter";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Factual Custody Record Checklist",
  description:
    "A practical checklist for organizing custody dates, observable details, parenting time, expenses, supporting files, and private records.",
  canonical: "/guides/factual-custody-record-checklist",
});

const checklistSections = [
  {
    title: "Start with the date",
    detail:
      "Record when the event happened. If you enter it later, keep the event date separate from the date you created the record.",
  },
  {
    title: "Describe what you directly observed",
    detail:
      "Use plain language for actions, times, locations, amounts, and other details you observed. Avoid guessing about intent, motivation, diagnosis, or future behavior.",
  },
  {
    title: "Keep the original source",
    detail:
      "Save the original receipt, photo, message export, document, or other source when appropriate. Keep your summary separate from the source.",
  },
  {
    title: "Connect the source to the event",
    detail:
      "Attach or reference the source next to the dated event it supports. Use a short neutral label that will still make sense months later.",
  },
  {
    title: "Record parenting time consistently",
    detail:
      "Use the same routine for scheduled, completed, changed, late, early, or missed parenting time. Keep the scheduled time separate from the observed time.",
  },
  {
    title: "Record expenses consistently",
    detail:
      "Include the date, amount, purpose, payer, and receipt when available. Keep the source amount separate from a later calculation or reimbursement note.",
  },
  {
    title: "Review once each week",
    detail:
      "Check for missing dates, missing sources, duplicate entries, and unclear labels while the details are still fresh.",
  },
  {
    title: "Protect sensitive information",
    detail:
      "Use a private account and strong unique password. Confirm who can access information before sharing it, and keep case details out of public posts and marketing surveys.",
  },
];

export default function FactualCustodyRecordChecklistPage() {
  return (
    <main className="min-h-screen bg-[#fffdf9] text-slate-950">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm font-semibold text-slate-950">
          Custody Folio
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/records" className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Sign in
          </Link>
          <Link href="/records?mode=signup" className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            Start free
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
          Free organization guide
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">
          The factual custody record checklist
        </h1>
        <p className="mt-5 text-xl leading-8 text-slate-600">
          A simple routine for keeping custody dates, notes, receipts, files, parenting time, and expenses clearer and easier to find.
        </p>

        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          This guide provides general organization information. It is not legal advice, and it does not determine whether a record proves a fact or may be used in a legal proceeding.
        </div>

        <div className="mt-10 space-y-4">
          {checklistSections.map((section, index) => (
            <section key={section.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-800">
                  {index + 1}
                </span>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                    {section.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {section.detail}
                  </p>
                </div>
              </div>
            </section>
          ))}
        </div>

        <section className="mt-10 rounded-2xl bg-slate-950 p-6 text-white sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">
            The five minute weekly review
          </p>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
            <li>1. Add any missing dated event.</li>
            <li>2. Connect any new receipt or supporting file.</li>
            <li>3. Check parenting time and expense entries for accuracy.</li>
            <li>4. Replace conclusions with observable details where appropriate.</li>
            <li>5. Confirm that important information can be found quickly.</li>
          </ol>
        </section>

        <section className="mt-10 rounded-2xl border border-teal-200 bg-teal-50 p-6 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-tight text-teal-950">
            Keep the checklist and the records together.
          </h2>
          <p className="mt-3 text-sm leading-6 text-teal-900">
            Custody Folio gives adults one private place to organize dated custody events, parenting time, expenses, notes, files, and reports. No other parent account is required.
          </p>
          <Link
            href="/records?mode=signup"
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Start 30 days free
          </Link>
        </section>
      </article>

      <PolicyFooter />
    </main>
  );
}
