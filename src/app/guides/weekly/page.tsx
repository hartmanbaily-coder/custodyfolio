import Link from "next/link";

import PolicyFooter from "@/components/PolicyFooter";
import {
  MarketingPageView,
  TrackedSignupLink,
} from "@/components/marketing/MarketingTracker";
import {
  pageMetadata,
  recordsTagline,
  siteName,
} from "@/lib/site";

const description =
  "A five minute weekly routine for organizing custody dates, parenting time, expenses, notes, receipts, and supporting files without turning observations into conclusions.";

export const metadata = {
  ...pageMetadata({
    title: "How to Organize Custody Records Each Week",
    description,
    canonical: "/guides/weekly",
  }),
  openGraph: {
    type: "website" as const,
    url: "/guides/weekly",
    siteName,
    title: "A five minute weekly custody record routine",
    description,
  },
};

const routineSteps = [
  {
    title: "Choose one consistent review time",
    paragraphs: [
      "Choose one regular time each week when you can review recent custody related information without rushing.",
      "Five focused minutes is more useful than waiting for a large block of time that may never arrive. Consistency also makes it easier to notice what is missing before the details become harder to remember.",
    ],
  },
  {
    title: "Add any missing dated event",
    paragraphs: [
      "Begin with the date and time of the event.",
      "If you create the record later, keep the event date separate from the date you entered it. This helps preserve the sequence of what happened without implying that the record was created at the same time.",
      "Use plain language. Record actions, times, locations, amounts, and other details you directly observed. Keep guesses about another person's intent, motivation, diagnosis, or future behavior separate from the event.",
    ],
  },
  {
    title: "Check parenting time against the schedule",
    paragraphs: [
      "Review scheduled and observed parenting time using the same routine each week.",
      "Keep the scheduled time separate from what you directly observed. If a time changed, record the changed time without turning the entry into an argument about why it changed.",
      "Consistent labels make the timeline easier to scan later.",
    ],
  },
  {
    title: "Add expenses with the original amount",
    paragraphs: [
      "For each custody related expense, record the date, amount, purpose, payer, and receipt when available.",
      "Keep the amount shown on the original source separate from any later calculation, reimbursement request, or personal note. This makes it easier to distinguish the source from the explanation added later.",
    ],
  },
  {
    title: "Connect each supporting file",
    paragraphs: [
      "Save the original receipt, photo, message export, document, or other source when appropriate.",
      "Connect the source to the dated event it supports. Use a short neutral label that will still make sense months later. Keep your summary separate from the original file so the two are not confused.",
    ],
  },
  {
    title: "Remove conclusions from factual entries",
    paragraphs: [
      "Read each new entry once before finishing the review.",
      "Ask whether it describes what you directly observed or whether it makes a conclusion about motive, character, diagnosis, or legal meaning. When possible, replace a conclusion with the specific date, action, time, location, or amount that caused you to write it.",
      "The result should be easier for you to understand later without requiring another person to accept your interpretation.",
    ],
  },
  {
    title: "Confirm that the important detail is easy to find",
    paragraphs: [
      "Finish by checking whether you can locate the week's important date, parenting time entry, expense, note, or supporting file quickly.",
      "If the answer is no, improve the label or connect the item to the relevant event. The weekly review is complete when the information is easier to find than it was when you started.",
    ],
  },
];

const weeklyChecklist = [
  "Add any missing dated event.",
  "Review scheduled and observed parenting time.",
  "Add any new expense and original receipt.",
  "Connect new supporting files to the relevant event.",
  "Replace conclusions with observable details where appropriate.",
  "Confirm that the most important information can be found quickly.",
];

export default function WeeklyCustodyRecordRoutinePage() {
  return (
    <main className="min-h-screen bg-[#fffdf9] text-slate-950">
      <MarketingPageView contentCode="factual_checklist" />

      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <Link href="/" className="min-w-0">
          <span className="block text-sm font-semibold text-slate-950">
            {siteName}
          </span>
          <span className="block text-xs text-slate-500">
            {recordsTagline}
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/records"
            className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Sign in
          </Link>
          <TrackedSignupLink
            contentCode="factual_checklist"
            className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Start free
          </TrackedSignupLink>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
          Free organization guide
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">
          A five minute weekly routine for clearer custody records
        </h1>
        <p className="mt-5 text-xl leading-8 text-slate-600">
          Custody details can quickly become scattered across calendars, notes,
          receipts, screenshots, files, and memory. A short weekly routine can
          make those details easier to find and review later.
        </p>
        <p className="mt-4 text-base leading-7 text-slate-600">
          The goal is not to create a perfect record. The goal is to keep dates,
          direct observations, amounts, and original sources connected while the
          details are still fresh.
        </p>

        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          This guide provides general organization information. It is not legal
          advice, and it does not determine whether a record proves a fact or may
          be used in a legal proceeding.
        </div>

        <div className="mt-10 space-y-5">
          {routineSteps.map((step, index) => (
            <section
              key={step.title}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
            >
              <div className="flex items-start gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-800">
                  {index + 1}
                </span>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-950">
                    {step.title}
                  </h2>
                  <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
                    {step.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>

        <section className="mt-10 rounded-2xl bg-slate-950 p-6 text-white sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">
            A simple weekly checklist
          </p>
          <ol className="mt-5 space-y-3 text-sm leading-6 text-slate-200">
            {weeklyChecklist.map((item, index) => (
              <li key={item} className="flex gap-3">
                <span className="font-semibold text-teal-300">{index + 1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10 rounded-2xl border border-teal-200 bg-teal-50 p-6 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-tight text-teal-950">
            Keep the routine and the records together
          </h2>
          <p className="mt-3 text-sm leading-6 text-teal-900">
            Custody Folio gives adults one private place to organize dated
            custody events, parenting time, expenses, notes, files, and factual
            reports. No other parent account is required.
          </p>
          <p className="mt-3 text-sm leading-6 text-teal-900">
            Every eligible account includes 30 days of access without a card.
            You may choose a monthly or annual subscription during the trial or
            wait until the trial ends.
          </p>
          <TrackedSignupLink
            contentCode="factual_checklist"
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Start 30 days free
          </TrackedSignupLink>
          <p className="mt-5 text-xs leading-5 text-teal-900">
            Custody Folio organizes customer entered information. It does not
            provide legal advice, verify allegations, guarantee admissibility,
            or promise a court result.
          </p>
        </section>
      </article>

      <PolicyFooter />
    </main>
  );
}
