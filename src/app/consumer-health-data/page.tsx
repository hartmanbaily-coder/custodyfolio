import Link from "next/link";

import { PolicyPage, type PolicySection } from "@/components/PolicyPage";
import {
  accountDeletionPath,
  legalOperatorName,
  pageMetadata,
  privacyEmail,
  privacyMailto,
} from "@/lib/site";

export const metadata = pageMetadata({
  title: "Consumer Health Data Privacy Policy",
  description: "Washington consumer health data disclosures, choices, and rights for Custody Folio.",
  canonical: "/consumer-health-data",
});

const sections: PolicySection[] = [
  {
    title: "Scope and operator",
    body: [
      `${legalOperatorName} operates Custody Folio. This policy supplements the general Privacy Policy for Washington residents and people whose consumer health data is collected in Washington.`,
      "Custody Folio is a general custody-recordkeeping service, not a medical provider. Users can nevertheless choose to enter records that reveal physical or mental health information.",
    ],
  },
  {
    title: "Consumer health data we may collect",
    body: [
      "Health conditions, symptoms, diagnoses, treatment, medications, medical appointments, counseling, behavioral or psychological information, disability information, reproductive or sexual-health information, and health-related expenses when a user includes them in a note, event, file, expense, or other record.",
      "Photos, videos, documents, communications, locations, dates, or other records that reveal or can reasonably be linked to a person's health status or effort to obtain health services.",
      "Account, case, device, and security information used to associate, protect, retrieve, export, delete, or share the health-related record at the user's direction.",
      "Health information is optional. Custody Folio does not require a diagnosis, medical record, or precise health-service location to create an account or use general recordkeeping features.",
    ],
  },
  {
    title: "Sources",
    body: [
      "The account holder is the primary source and may type information, upload a file or communication, record an expense, or create an event.",
      "An authorized attorney may view and export information the client chose to share but cannot add to or alter the client's case through attorney access.",
      "We do not purchase consumer health data from data brokers, infer it for advertising, or collect it from health-care providers or connected health devices.",
    ],
  },
  {
    title: "Purposes and use",
    body: [
      "We process a health-related record only to provide the recordkeeping, storage, retrieval, display, search, malware scanning, export, deletion, support, and client-authorized attorney-access functions the user requests.",
      "We may process limited related security information to prevent fraud, protect accounts, investigate unauthorized access, comply with law, and establish, exercise, or defend legal claims.",
      "We do not use consumer health data for advertising, profiling, employment, insurance eligibility, credit, or decisions unrelated to the user's requested Custody Folio service.",
    ],
  },
  {
    title: "Collection and sharing choices",
    body: [
      "Entering or uploading a health-related record requests that Custody Folio process it to provide the selected private recordkeeping function. Avoid entering health information that is not reasonably necessary.",
      "Before creating attorney access, the client must separately and affirmatively authorize sharing of the selected case, including any health-related records it contains. The client may withhold or withdraw that authorization by not creating or by revoking attorney access.",
      "The categories shared are the health-related records contained in the selected case, together with the minimum account, case, and security information needed to provide and protect that access.",
      "Revocation stops future attorney access but cannot recall copies already downloaded. Delete or remove health-related records before sharing if the attorney should not receive them.",
    ],
  },
  {
    title: "Processors and other recipients",
    body: [
      "Supabase processes authentication, database records, and private files; Backblaze stores encrypted off-site evidence backups; Hetzner hosts the application; Cloudflare processes network and security traffic; and our production logging environment processes minimized security events.",
      "An attorney selected by the client may receive the shared case. Apple iCloud Mail may receive health information only if a person voluntarily includes it in a support or privacy email; users are instructed not to email sensitive records unless requested.",
      "Resend handles authentication email and is not intended to receive custody or health record contents. Have I Been Pwned may receive a password-hash prefix and is not intended to receive health information.",
      "Custody Folio has no affiliate that receives consumer health data and does not sell consumer health data. The separate Subprocessors page identifies current service-provider categories.",
    ],
  },
  {
    title: "Your Washington rights",
    body: [
      "You may confirm whether we collect, share, or sell consumer health data concerning you; access that data; and receive a list of third parties and affiliates with whom it was shared or sold, including an active email address or other online contact method when required.",
      "You may withdraw consent from future collection or sharing and request deletion. An authenticated deletion request is sent to processors, contractors, and other recipients as required by law.",
      "You may use existing in-app controls, permanently delete the account, or contact the privacy inbox. You do not need to create a new account to submit a request, and we will not discriminate against you for exercising a right.",
      "We respond without undue delay and within 45 days, subject to one legally permitted 45-day extension with notice. Information is provided free up to twice annually unless a request is manifestly unfounded, excessive, or repetitive.",
    ],
  },
  {
    title: "Deletion and backups",
    body: [
      "Deletion removes the requested consumer health data from active systems and notifies applicable processors and recipients. Account deletion removes active records, files, and attorney access immediately.",
      "If deleted consumer health data exists in an encrypted archived or backup system, it will be deleted or allowed to age out as soon as restoration permits and no later than six months after we authenticate the request.",
      "A narrow, documented legal exception may delay deletion only to the extent applicable law permits. We will explain a denial unless legally prohibited.",
    ],
  },
  {
    title: "Appeals and complaints",
    body: [
      `If we refuse a request, reply to ${privacyEmail} with the subject Privacy Appeal. A reviewer will respond in writing within 45 days and explain the decision.`,
      "If an appeal is denied, the response will provide a method to contact the Washington Attorney General. You may also contact the Attorney General directly through its official consumer-complaint channels.",
    ],
  },
  {
    title: "Changes",
    body: [
      "We will not collect, use, or share a new category of consumer health data or use existing data for a materially new purpose without first updating this policy and obtaining affirmative consent when required.",
      "The date at the top identifies the current version. Material changes will also receive conspicuous in-app or email notice before taking effect when required.",
    ],
  },
];

export default function ConsumerHealthDataPage() {
  return (
    <PolicyPage
      title="Consumer Health Data Privacy Policy"
      description="Washington-specific disclosures and rights for health-related information a user chooses to place in Custody Folio."
      sections={sections}
    >
      <section className="rounded-lg border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-600">
        <h2 className="text-base font-semibold text-slate-950">Exercise a right</h2>
        <p className="mt-2">
          Use in-app edit and deletion controls, permanently delete a signed-in account from{" "}
          <Link href={accountDeletionPath} className="font-semibold text-emerald-700 underline underline-offset-2">
            Delete Account
          </Link>
          , or email{" "}
          <a href={privacyMailto} className="font-mono font-semibold text-emerald-700 underline underline-offset-2">
            {privacyEmail}
          </a>
          . Include the account email and the right you want to exercise, but do not put health or case details in the subject line.
        </p>
      </section>
    </PolicyPage>
  );
}
