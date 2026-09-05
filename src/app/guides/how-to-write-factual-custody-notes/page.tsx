import Link from "next/link";
import PublicHeader from "@/components/marketing/PublicHeader";
import PolicyFooter from "@/components/PolicyFooter";
import { MarketingPageView, TrackedSignupLink } from "@/components/marketing/MarketingTracker";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "How to Write Factual Custody Notes: Examples and Checklist",
  description: "See fictional before-and-after custody notes, a simple entry template, and a checklist for keeping dates, observations, and original sources clear.",
  canonical: "/guides/how-to-write-factual-custody-notes",
});

const examples = [
  {
    title: "A late exchange",
    draft: "Late again. They never respect my time and clearly don’t care.",
    record: "September 2, 2026. The scheduled exchange was 5:00 p.m. at the agreed location. I arrived at 4:55 p.m. The other parent arrived at 5:24 p.m. At 4:58 p.m., I received a text saying they were running late. The exchange was completed at 5:26 p.m. Source: original text conversation saved with this entry.",
    explanation: "The entry gives a reader the scheduled time, observed time, relevant message, and outcome. It does not guess why the delay happened. If this was one of several late exchanges, record each event separately before describing a pattern.",
  },
  {
    title: "An expense awaiting reimbursement",
    draft: "I pay for everything. They refuse to help with school expenses.",
    record: "September 3, 2026. I paid $42.80 for school supplies. I saved the itemized receipt and sent a copy with a reimbursement request that evening. As of September 5 at 9:00 a.m., I had not received a response or reimbursement. The requested share and any applicable agreement are recorded separately.",
    explanation: "An unanswered request is different from an explicit refusal. Keep the amount paid, what you requested, and what actually happened distinct. A receipt alone does not establish what someone else owes.",
  },
  {
    title: "A change to a scheduled call",
    draft: "They deliberately stopped the call to punish me.",
    record: "September 4, 2026. A call was scheduled for 7:00 p.m. I called at 7:00 and 7:05 p.m.; neither call connected. At 7:12 p.m., I received a message asking to move the call to 7:30 p.m. I agreed. The call began at 7:31 p.m. Sources: call log and original message thread.",
    explanation: "The later message and completed call belong in the same entry. Include context that changes the picture, even when it complicates your first impression.",
  },
];

const checklist = [
  "Did I separate the event date from the date I wrote the note?",
  "Did I describe what I observed and identify anything reported by someone else?",
  "Did I label approximate times, missing information, and uncertainty?",
  "Did I include my own actions and the outcome, including later updates?",
  "Did I preserve the original source separately from my summary?",
  "Did I replace claims about motives with details that explain what happened?",
];

export default function FactualCustodyNotesPage() {
  return (
    <main className="min-h-screen bg-[#fffdf9] text-slate-950">
      <MarketingPageView contentCode="factual_checklist" />
      <PublicHeader />
      <article className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Practical recordkeeping</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">How to write factual custody notes</h1>
        <p className="mt-4 text-sm text-slate-500">By Custody Folio · September 5, 2026 · Examples and a simple checklist</p>
        <p className="mt-6 text-xl leading-8 text-slate-700">You open your notes after a difficult exchange. You know you need to write something down, but what comes out is frustration. Start there if you need to. Then ask: what happened that I want to be able to understand later?</p>
        <p className="mt-6 border-l-4 border-teal-700 pl-5 text-2xl font-semibold leading-8">Remove the emotion. Track the data.</p>
        <p className="mt-4 text-base leading-7 text-slate-700">Your feelings matter. In a factual entry, give the dates, actions, messages, and outcome enough room to speak clearly. You do not need to sound like a lawyer or make the event sound more serious than it was.</p>
        <p className="mt-5 text-sm leading-6 text-slate-600">This is general recordkeeping information, not legal advice. An organized note does not establish that an allegation is true or guarantee that a court will accept it. Ask your attorney what is relevant to your situation.</p>

        <section className="mt-10 border-t border-slate-200 pt-7">
          <h2 className="text-2xl font-semibold tracking-tight">Start with what you actually know</h2>
          <p className="mt-4 leading-7 text-slate-700">Use a date, a time or clearly labeled estimate, and a short account of the event. Distinguish what you directly saw or heard from information someone else gave you. Use quotation marks only for words you can reproduce accurately; otherwise label the text as a summary.</p>
          <p className="mt-4 leading-7 text-slate-700">If you write an entry later, say so. “Written September 5 about an exchange on September 2” is clearer than making a later recollection look contemporaneous. Leave an unknown time unknown. Precision should come from the source, not from filling a blank.</p>
        </section>

        <section className="mt-10" aria-labelledby="examples-heading">
          <h2 id="examples-heading" className="text-2xl font-semibold tracking-tight">Three examples: from a reaction to a record</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">Every example below is fictional. The factual versions assume the writer actually knows the added details. Never add a time, message, or outcome simply to make your note resemble an example.</p>
          <div className="mt-6 space-y-8">
            {examples.map((example, index) => (
              <section key={example.title} className="border-t border-slate-200 pt-6">
                <h3 className="text-xl font-semibold">{index + 1}. {example.title}</h3>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">First draft</p>
                <blockquote className="mt-2 border-l-2 border-slate-300 pl-4 leading-7 text-slate-600">{example.draft}</blockquote>
                <div className="mt-5 rounded-xl border border-teal-200 bg-teal-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-teal-800">Factual entry</p>
                  <p className="mt-2 leading-7 text-teal-950">{example.record}</p>
                </div>
                <p className="mt-4 leading-7 text-slate-700">{example.explanation}</p>
              </section>
            ))}
          </div>
        </section>

        <section className="mt-10 border-t border-slate-200 pt-7">
          <h2 className="text-2xl font-semibold tracking-tight">Keep the source and the summary separate</h2>
          <p className="mt-4 leading-7 text-slate-700">Your note explains why a file matters; it is not a replacement for that file. Keep the original message, receipt, photo, or document when you can lawfully and safely retain it. Avoid editing an original to add your explanation. Label a working copy or export as a copy.</p>
          <p className="mt-4 leading-7 text-slate-700">WomensLaw’s documentation guidance recommends recording incident details and related sources while leaving evidence unaltered. <a className="font-medium text-teal-800 underline underline-offset-4" href="https://www.womenslaw.org/about-abuse/abuse-using-technology/evidence-issues-cases-involving-technology/documentingsaving-0">Read its documentation guidance.</a></p>
          <p className="mt-4 leading-7 text-slate-700">If you discover an error in your own note, add a dated correction that explains what changed. Include the surrounding context and relevant follow-up. A useful record should remain understandable when someone reads the original source beside it.</p>
        </section>

        <section className="mt-10 rounded-xl bg-slate-950 p-6 text-white sm:p-8">
          <h2 className="text-2xl font-semibold">A simple entry template</h2>
          <p className="mt-3 leading-7 text-slate-300">Copy these headings into a notebook, document, or records app.</p>
          <ul className="mt-5 space-y-3 leading-7 text-slate-100">
            <li><strong>Event date and time:</strong> Include the timezone if it matters; label estimates.</li>
            <li><strong>Written on:</strong> When you created this entry.</li>
            <li><strong>What happened:</strong> Direct observations, relevant context, and your own actions.</li>
            <li><strong>Source:</strong> A neutral file label or a clear statement that no source is available.</li>
            <li><strong>Outcome or update:</strong> What happened next, with a date for later additions.</li>
            <li><strong>Question for review:</strong> Keep your question separate from the factual account.</li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-semibold tracking-tight">Before you finish</h2>
          <ul className="mt-5 list-disc space-y-3 pl-5 leading-7 text-slate-700">
            {checklist.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p className="mt-5 leading-7 text-slate-700">For a habit you can maintain, pair this with the <Link href="/guides/weekly" className="font-medium text-teal-800 underline underline-offset-4">weekly record routine</Link>. A short, accurate entry is a useful place to start.</p>
        </section>

        <section className="mt-10 rounded-xl border border-teal-200 bg-teal-50 p-6 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-tight text-teal-950">Put the notes and files in one place</h2>
          <p className="mt-3 leading-7 text-teal-950">Custody Folio organizes dated notes, supporting files, timelines, and PDF reports. Optional read-only attorney access lets you share with your attorney. You can use it independently; the other parent does not need an account.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href="/demo/custody-folio-starter-kit.pdf" className="inline-flex min-h-11 items-center rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800">Get the free starter kit</a>
            <Link href="/demo" className="inline-flex min-h-11 items-center rounded-lg border border-teal-300 px-5 py-3 text-sm font-semibold text-teal-950 hover:bg-teal-100">Watch the walkthrough</Link>
          </div>
          <p className="mt-5 text-sm leading-6 text-teal-950">Ready to try it? <TrackedSignupLink contentCode="factual_checklist" className="font-semibold underline underline-offset-4">Start 30 days free</TrackedSignupLink>. No card required. U.S. plans are $5.99/month or $59.99/year.</p>
        </section>
      </article>
      <PolicyFooter />
    </main>
  );
}
