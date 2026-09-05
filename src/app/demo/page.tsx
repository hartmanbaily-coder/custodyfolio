import Link from "next/link";
import PublicHeader from "@/components/marketing/PublicHeader";
import PolicyFooter from "@/components/PolicyFooter";
import { pageMetadata, recordsTagline } from "@/lib/site";

export const metadata = pageMetadata({
  title: "See Custody Folio in action",
  description: "Watch a short walkthrough, read a fictional sample report, and download a free recordkeeping starter kit.",
  canonical: "/demo",
});

const steps = [
  ["Start with one dated record", "Add what happened and keep the supporting details with it. No other parent account is required."],
  ["Review the timeline", "Choose the date range and review your entries before creating a report."],
  ["Prepare something readable", "Create timeline reports or arrange screenshots into a PDF. Keep the original sources for reference."],
  ["Share with an attorney", "Invite an attorney using their exact email address. They verify that mailbox to open read-only access. You can revoke future access; downloaded copies cannot be recalled."],
];

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-[#fffdf9] text-slate-950">
      <PublicHeader />
      <article className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">A short product walkthrough</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">See what your records can become.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">From one dated note to an organized timeline and a readable PDF. Take a look before you create an account.</p>
        <figure className="mt-8">
          <video controls playsInline preload="none" poster="/demo/walkthrough-poster.jpg" className="aspect-video w-full rounded-lg border border-slate-200 bg-slate-950" aria-label="Custody Folio product walkthrough">
            <source src="/demo/custody-folio-walkthrough.mp4" type="video/mp4" />
            <track kind="captions" src="/demo/custody-folio-walkthrough.vtt" srcLang="en" label="English" default />
            Your browser does not support embedded video. <a href="/demo/custody-folio-walkthrough.mp4">Download the walkthrough.</a>
          </video>
          <figcaption className="mt-3 text-sm leading-6 text-slate-500">2 minutes 36 seconds. Web app screens and fictional examples, with AI-generated narration. Attorney sharing is explained using invitation guidance.</figcaption>
        </figure>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link href="/records?mode=signup" className="inline-flex min-h-12 items-center rounded-md bg-teal-700 px-6 font-semibold text-white hover:bg-teal-800">Start 30 days free</Link>
          <a href="/demo/custody-folio-sample-report.pdf" className="inline-flex min-h-12 items-center font-semibold text-teal-700 underline underline-offset-4">Read the sample report (PDF)</a>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600">No card required. Web access: $5.99/month or $59.99/year. App Store prices are shown by Apple.</p>

        <section className="mt-12 grid gap-x-10 md:grid-cols-2" aria-label="What the walkthrough covers">
          {steps.map(([title, detail], i) => <div key={title} className="border-t border-slate-200 py-6"><p className="text-xs font-semibold text-teal-700">0{i + 1}</p><h2 className="mt-2 text-xl font-semibold">{title}</h2><p className="mt-3 text-base leading-7 text-slate-600">{detail}</p></div>)}
        </section>
        <section className="mt-8 rounded-xl bg-slate-950 p-6 text-white sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">Free recordkeeping starter kit</p>
          <h2 className="mt-3 text-3xl font-semibold">{recordsTagline}</h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">A four-page guide with a fictional example, a fillable note page, and a review checklist. Use it on paper or alongside the app. No signup needed.</p>
          <a href="/demo/custody-folio-starter-kit.pdf" className="mt-5 inline-flex min-h-12 items-center rounded-md bg-white px-5 font-semibold text-slate-950 hover:bg-slate-100">Download the starter kit (PDF)</a>
        </section>
        <section className="mt-12 max-w-3xl">
          <h2 className="text-2xl font-semibold">This is the starting point.</h2>
          <p className="mt-4 text-base leading-7 text-slate-600">Feedback from parents and the people supporting them will help guide what we improve and build next. Tell us what takes the most time or what would make your records easier to review. A fictional example is enough; no personal case details are needed.</p>
          <Link href="/contact" className="mt-3 inline-flex min-h-11 items-center font-semibold text-teal-700 underline underline-offset-4">Share product feedback</Link>
        </section>
        <details className="mt-10 border-y border-slate-200 py-5">
          <summary className="cursor-pointer text-base font-semibold">Read the walkthrough transcript</summary>
          <div className="mt-5 space-y-4 text-base leading-7 text-slate-600">
            <p>Custody Folio helps parents organize custody notes and supporting files for an attorney meeting or custody proceeding. Remove the emotion. Track the data. This walkthrough uses fictional examples and synthetic narration.</p>
            <p>Start with one dated record. Add what happened and keep the supporting details with it. You do not need an account for the other parent. Home also gives you a direct route to building a PDF or sharing with an attorney.</p>
            <p>The timeline brings dated entries together. Open Options to choose the date range, filter the kinds of records you want to review, and check the details before exporting. The purpose is to make your own records easier to find and follow.</p>
            <p>Here is an actual sample PDF export. Notice the factual description: scheduled pickup at six, actual pickup at six fifteen. Compare every report with the original records before sharing. A report organizes what you entered; it does not verify an allegation or guarantee court acceptance.</p>
            <p>The picture to PDF builder lets you select screenshots and arrange them into a printable document. Add a neutral title and description, review the page order, and keep the original pictures for reference. This is the starting screen before selecting any images.</p>
            <p>Attorney access is optional. Choose a case and authorize sharing, enter the attorney’s exact email, and send the private invitation link yourself. The attorney verifies that mailbox with a one-time code. Access is read-only, with downloads available. You can revoke future access, but you cannot recall copies already downloaded. Sharing does not establish representation.</p>
            <p>This is the starting point for Custody Folio. The core tools are available now, and feedback will help guide what improves and what comes next. What takes the most time when you organize records? What would make a report easier to review? You can give feedback using a fictional example without sharing personal case details.</p>
            <p>Visit custody folio dot com to try the web app free for thirty days, with no card required. Web access is five dollars and ninety-nine cents monthly, or fifty-nine dollars and ninety-nine cents annually. Custody Folio helps organize records and does not provide legal advice.</p>
          </div>
        </details>
        <p className="mt-6 text-sm leading-6 text-slate-500">Custody Folio provides organization tools, not legal advice. Reports do not verify their contents or guarantee court acceptance. Attorney sharing does not establish representation.</p>
      </article>
      <PolicyFooter />
    </main>
  );
}
