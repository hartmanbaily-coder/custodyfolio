import { PolicyPage, type PolicySection } from "@/components/PolicyPage";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Terms of Use",
  description: "Terms for using Custody Folio to organize custody records and reports.",
  canonical: "/terms",
});

const sections: PolicySection[] = [
  {
    title: "Purpose",
    body: [
      "Custody Folio helps adults organize custody records, calendars, expenses, files, and reports.",
      "It does not provide legal advice, legal representation, court findings, or a guarantee that any record will be accepted as evidence.",
      "Consult a qualified attorney about your situation and applicable court rules.",
    ],
  },
  {
    title: "Accounts",
    body: [
      "You must be an adult and provide accurate account information.",
      "Keep your password, email account, authenticator, and devices secure. Contact us promptly if you suspect unauthorized access.",
      "Do not create an account for a child or allow a child to use your account.",
    ],
  },
  {
    title: "Your records",
    body: [
      "You are responsible for records you enter, upload, export, or share and for having the right to use them.",
      "Keep original source files, review generated reports for accuracy, and protect copies downloaded from the app.",
      "We may reject unsafe, unsupported, or oversized files.",
    ],
  },
  {
    title: "Acceptable use",
    body: [
      "Do not use the service to harass, stalk, threaten, impersonate, surveil, dox, or unlawfully disclose another person's information.",
      "Do not upload malware, exploit code, illegal content, or content you do not have the right to store or use.",
      "Do not attempt to access another user's records, bypass account protections, or disrupt the service.",
    ],
  },
  {
    title: "Attorney Access",
    body: [
      "You may invite one adult attorney account to read the selected case for 30 days after acceptance.",
      "You can revoke future access, but copies already downloaded cannot be recalled.",
      "An invitation does not establish legal representation or attorney client privilege.",
    ],
  },
  {
    title: "Availability and account actions",
    body: [
      "The service may be temporarily unavailable for maintenance, security, or provider outages.",
      "We may limit or end access for misuse, security risk, or violation of these terms.",
      "You can export records and permanently delete your signed-in account through the self-service deletion page. Limited information may be retained when required by law.",
    ],
  },
  {
    title: "Safety and changes",
    body: [
      "Custody Folio is not an emergency service and does not monitor safety or enforce court orders. Contact emergency services when immediate help is needed.",
      "We may update the service or these terms. The date on this page identifies the current version.",
    ],
  },
];

export default function TermsPage() {
  return (
    <PolicyPage
      title="Terms of Use"
      description="The rules and limitations for using Custody Folio."
      sections={sections}
    />
  );
}
