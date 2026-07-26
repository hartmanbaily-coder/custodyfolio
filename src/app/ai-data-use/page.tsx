import { PolicyPage, type PolicySection } from "@/components/PolicyPage";

const sections: PolicySection[] = [
  {
    title: "Current status",
    body: [
      "AI assisted import is not currently enabled for customer records.",
      "Custody Folio does not send custody records to an AI provider for import processing while this feature is off.",
    ],
  },
  {
    title: "If this changes",
    body: [
      "Before enabling AI assisted import, we will identify the provider, explain what information would be sent and why, and ask the user to choose whether to use it.",
      "AI generated drafts would require user review and would not provide legal advice or court findings.",
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
