import { PolicyPage, type PolicySection } from "@/components/PolicyPage";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "AI Data Use",
  description: "The current status of AI assisted import in Custody Folio.",
  canonical: "/ai-data-use",
});

const sections: PolicySection[] = [
  {
    title: "Current status",
    body: [
      "AI assisted import is not currently enabled for customer records.",
      "Custody Folio does not currently send custody records, files, reports, account data, or attorney-shared matters to an AI provider for import, summarization, training, or other AI processing.",
    ],
  },
  {
    title: "If this changes",
    body: [
      "Before enabling any customer-record AI feature, we will identify the provider, explain what information would be sent, the purpose, retention, training restrictions, and material risks, update applicable privacy and subprocessor disclosures, and ask the user to affirmatively choose whether to use it.",
      "AI generated drafts would require user review and would not provide legal advice or court findings.",
      "AI processing will remain optional unless a new essential use is separately disclosed and lawfully implemented.",
    ],
  },
];

export default function AiDataUsePage() {
  return (
    <PolicyPage
      title="AI Data Use"
      description="The current status of AI assisted import in Custody Folio."
      sections={sections}
    />
  );
}
