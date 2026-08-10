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
      "Custody Folio uses WCAG 2.2 Level AA as its accessibility target. This is a design and testing target, not a claim that every page or user-uploaded file currently conforms.",
      "The service works to support keyboard navigation, screen readers, readable text and contrast, labeled forms, visible focus, error identification, zoom, and mobile layouts.",
      "Charts and calendars include written labels or summaries where available.",
    ],
  },
  {
    title: "Testing and improvement",
    body: [
      "We use automated checks together with keyboard, zoom, responsive-layout, and assistive-technology review because automated testing alone cannot establish accessibility.",
      "New or materially changed workflows should be checked as complete processes, including account creation, sign in, record entry, file handling, export, attorney access, and account deletion.",
      "We prioritize barriers that prevent account access, privacy choices, safety information, or core recordkeeping tasks.",
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
      "We aim to acknowledge accessibility reports within five business days and will provide an available alternative or remediation update when reasonably possible.",
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
