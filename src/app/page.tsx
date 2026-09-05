import Link from "next/link";
import Image from "next/image";

import PublicHeader from "@/components/marketing/PublicHeader";
import PolicyFooter from "@/components/PolicyFooter";
import {
  MarketingPageView,
  TrackedSignupLink,
} from "@/components/marketing/MarketingTracker";
import { pageMetadata, recordsTagline, siteDescription } from "@/lib/site";

export const metadata = {
  ...pageMetadata({
    title: "Custody Folio | Private Custody Records",
    description: siteDescription,
    canonical: "/",
  }),
  title: { absolute: "Custody Folio | Private Custody Records" },
};

const workflowSteps = [
  {
    title: "Record what happened",
    detail: "Add parenting time, communication, notes, expenses, and other dated events.",
  },
  {
    title: "Keep the context",
    detail: "Keep supporting files connected to the record they belong with.",
  },
  {
    title: "Prepare for your next meeting",
    detail: "Create PDF and timeline reports for personal review or an attorney conversation. Check the details before sharing.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fffdf9] text-slate-950">
      <MarketingPageView />
      <PublicHeader />

      <section className="mx-auto grid max-w-7xl content-center gap-10 px-4 pb-14 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:px-8">
        <div className="flex max-w-3xl flex-col justify-center">
          <h1 className="text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
            {recordsTagline}
          </h1>
          <p className="mt-5 max-w-2xl text-xl leading-8 text-slate-600">
            Organize custody notes, pictures, and important events into clear PDFs and timeline reports for your next attorney meeting or custody proceeding.
          </p>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            Keep your own records, at your own pace. No other parent account is required.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
            <TrackedSignupLink contentCode="hero" className="inline-flex min-h-12 items-center justify-center rounded-md bg-teal-700 px-6 text-base font-semibold text-white transition hover:bg-teal-800">
              Start 30 days free
            </TrackedSignupLink>
            <a href="/demo/custody-folio-sample-report.pdf" className="inline-flex min-h-12 items-center text-sm font-semibold text-teal-700 underline underline-offset-4">
              See a sample report (PDF)
            </a>
            <Link href="/demo" className="inline-flex min-h-12 items-center text-sm font-semibold text-teal-700 underline underline-offset-4">Watch the walkthrough</Link>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
            No card required. You may subscribe during the trial if you choose. Custody Folio helps organize records and does not provide legal advice.
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Health-related records are optional. Review how they are handled in the{" "}
            <Link href="/consumer-health-data" className="font-semibold text-teal-700 underline underline-offset-2">
              Consumer Health Data Privacy Policy
            </Link>
            .
          </p>
        </div>

        <figure className="mx-auto w-full max-w-md self-center">
          <a href="/demo/custody-folio-sample-report.pdf" className="block rounded-md border border-slate-200 bg-white p-3 shadow-[0_12px_40px_rgba(15,23,42,0.10)]" aria-label="Open the fictional sample timeline report PDF">
            <Image src="/demo/report-preview.png" alt="A Custody Folio timeline report with three fictional dated records" width={1237} height={1600} priority className="h-auto w-full" />
          </a>
          <figcaption className="mt-3 text-center text-sm leading-6 text-slate-500">
            An actual PDF export, using fictional records. Open it to read the details.
          </figcaption>
        </figure>
      </section>

      <section id="how-it-works" aria-label="How Custody Folio works" className="mx-auto grid scroll-mt-8 max-w-7xl gap-4 px-4 pb-12 sm:px-6 md:grid-cols-3 lg:px-8">
        {workflowSteps.map((step) => (
          <div key={step.title} className="border-t border-slate-200 bg-white/60 px-1 py-5">
            <p className="text-lg font-semibold tracking-tight text-slate-950">{step.title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{step.detail}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 pb-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-8">
        <div className="rounded-2xl bg-slate-950 p-6 text-white sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">
            Free organization guide
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Start with a factual record routine.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
            Use a simple checklist for dates, observable details, original sources, parenting time, expenses, weekly review, and privacy.
          </p>
          <Link
            href="/guides/factual-custody-record-checklist"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
          >
            Read the free checklist
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            One complete plan
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Try every core feature for 30 days.
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-600">
            No card is required. Web access costs $5.99 monthly or $59.99 annually. You may subscribe during the trial or wait until it ends. App Store prices are shown by Apple.
          </p>
          <TrackedSignupLink
            contentCode="pricing"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white transition hover:bg-teal-800"
          >
            Create your account
          </TrackedSignupLink>
        </div>
      </section>

      <section className="mx-auto max-w-7xl border-t border-slate-200 px-4 py-12 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight">Built from personal experience</h2>
          <p className="mt-4 text-base leading-7 text-slate-600">
            Custody Folio grew out of firsthand experience with custody litigation and the work of keeping records organized. The aim is practical: make it easier to record what happened, find it later, and prepare something readable.
          </p>
          <Link href="/contact" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-teal-700 underline underline-offset-4">Questions or feedback? Get in touch.</Link>
        </div>
      </section>

      <PolicyFooter />
    </main>
  );
}
