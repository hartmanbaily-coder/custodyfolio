import { PolicyPage, type PolicySection } from "@/components/PolicyPage";
import { pageMetadata, supportEmail, supportMailto } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Accessibility Statement",
  description: "Custody Folio accessibility goals and how to report an access barrier.",
  canonical: "/accessibility",
});

const sections: PolicySection[] = [
  {
    title: "Commitment",
    body: [
      "Custody Folio works to support keyboard navigation, readable text and contrast, labeled forms, visible focus, and mobile layouts.",
      "Charts and calendars include written labels or summaries where available.",
    ],
  },
  {
    title: "Content limitations",
    body: [
      "A document or image uploaded by a user may not be accessible if the original file is not accessible.",
      "If a feature creates a barrier, contact us for help or an available alternative.",
    ],
  },
  {
    title: "Report a barrier",
    body: [
      "Tell us which page or task was difficult, what device or assistive technology you used, and what happened.",
      "Do not send private records or sensitive case details unless we ask for them.",
    ],
  },
];

export default function AccessibilityPage() {
  return (
    <PolicyPage
      title="Accessibility Statement"
      description="This page describes the accessibility goals for the records workspace and how users can report access barriers."
      notice="If you cannot access a feature or page, contact support with the affected page and task. Do not send sensitive case files unless requested."
      sections={sections}
    >
      <section className="rounded-lg border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-600">
        <h2 className="text-base font-semibold text-slate-950">Accessibility Contact</h2>
        <p className="mt-2">
          Email accessibility issues to{" "}
          <a href={supportMailto} className="font-mono font-semibold text-emerald-700 underline underline-offset-2">
            {supportEmail}
          </a>
          . Use a subject such as Custody Folio accessibility issue and include the page, browser, device, and affected task.
        </p>
      </section>
    </PolicyPage>
  );
}
