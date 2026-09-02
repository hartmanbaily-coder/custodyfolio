import { PolicyPage, type PolicySection } from "@/components/PolicyPage";
import {
  accountDeletionPath,
  legalOperatorName,
  pageMetadata,
  privacyEmail,
  privacyMailto,
} from "@/lib/site";
import Link from "next/link";

export const metadata = pageMetadata({
  title: "Privacy Policy",
  description: "How Custody Folio collects, uses, protects, retains, and deletes information.",
  canonical: "/privacy",
});

const sections: PolicySection[] = [
  {
    title: "Who operates Custody Folio",
    body: [
      `${legalOperatorName} operates Custody Folio and is responsible for the personal information described in this policy.`,
      `Privacy questions and rights requests may be sent to ${privacyEmail}.`,
      "Custody Folio is intended for adult users. Children may not create or use accounts.",
    ],
  },
  {
    title: "Information you provide",
    body: [
      "Account and profile information: email address, account role and status, display name, timezone, and email-code authentication settings and events.",
      "Case and family records: matter labels, court and order information, child labels, parenting schedules, exchanges, locations, witnesses, notes, tags, and event details.",
      "Financial records: child-support orders and payments, agency or case references, expenses, reimbursements, amounts, dates, and related notes.",
      "Files and communications: photos, videos, screenshots, documents, email or text-message copies, evidence metadata, support messages, and generated reports or exports.",
      "Optional records may reveal health, behavioral, school, family, legal, or other sensitive information about you, children, or other people. Enter only what is reasonably necessary.",
    ],
  },
  {
    title: "Information collected automatically",
    body: [
      "We process IP address and network information, browser or device type, request time, route, request identifier, authentication and security events, and diagnostic information needed to deliver and protect the service.",
      "Security logs use shortened hashes for IP addresses, user agents, account IDs, and case IDs where practical. They do not intentionally include note bodies, file contents, child names, court details, or payment references.",
      "When first party product measurement is enabled, we process a fixed event name, event time, web or iOS platform, approved source and campaign codes, plan interval when relevant, completion or bounded technical status, and a keyed opaque cohort identifier. This event store does not include names, email addresses, raw account identifiers, case identifiers, customer record contents, file information, child information, health information, full IP addresses, full user agents, or free text feedback.",
      "Passwordless sign-in codes are generated and verified by Supabase Auth and delivered through Resend. Codes expire, can be used only once, and are not stored in Custody Folio records.",
    ],
  },
  {
    title: "How information is used",
    body: [
      "To create and secure accounts, save and synchronize records, provide attorney access you authorize, generate exports, scan uploads for malware, respond to support and rights requests, and maintain service reliability.",
      "To prevent fraud or abuse, investigate security events, enforce our Terms, comply with law, and establish, exercise, or defend legal claims.",
      "When first party product measurement is enabled, to understand whether people find the service, create an account, save a first record, use a timeline or report, choose to provide feedback, and start or end a subscription. General marketing reports suppress source groups representing fewer than five people.",
      "Where a legal basis is required, we rely on performance of our agreement, your requested use of the service, legitimate interests in operating and securing the service, compliance with law, and consent when the law requires consent.",
      "Custody Folio does not use customer records for advertising, does not sell personal information, and does not train or operate an AI import service on customer records while AI features remain disabled.",
    ],
  },
  {
    title: "Optional product feedback",
    body: [
      "After an adult customer saves a first record, Custody Folio may offer an optional invitation to provide product feedback. The invitation concerns the product experience, not the contents of customer records, and declining does not affect access, trial, or subscription status.",
      "If a customer chooses Yes, contact me once, we store the account identifier, the invitation version, the permission choice, and a contact count limited to one. We do not copy custody record contents into the feedback consent record.",
      "A later feedback message may be sent only after separate operational authorization and only from support@custodyfolio.com. Custody Folio does not send a message merely because the customer selects the permission choice.",
    ],
  },
  {
    title: "Service providers and disclosures",
    body: [
      "Supabase provides authentication, database, and private file storage; Backblaze provides encrypted off-site evidence backups; Hetzner hosts the application; Cloudflare provides network delivery, DNS, and security protection; and Resend delivers authentication email.",
      "Apple iCloud Mail processes support, privacy, and security messages. Resend processes the recipient address and delivery information needed to send passwordless sign-in codes.",
      "When web subscription billing is enabled, Stripe processes checkout, subscription, invoice, refund, dispute, payment-method, and U.S. service-address information used to enforce the current web-purchase territory. When App Store billing is enabled, Apple processes in-app purchases, subscriptions, cancellations, and refunds. Custody Folio does not store full card details.",
      "Providers process information only to provide contracted services and are required to protect user data consistently with this policy and applicable law. The current provider list and processing descriptions appear on the Subprocessors page.",
      "We may disclose information in response to valid legal process, to protect people or the service, or as part of a business transfer where the recipient assumes these privacy obligations. We review requests and disclose only what we reasonably believe is required.",
    ],
  },
  {
    title: "Subscription information",
    body: [
      "Custody Folio stores a pseudonymous billing-account identifier, Stripe customer or subscription identifiers, Apple signed transaction identifiers and status information, product and status information, payment-period dates, verified provider-event digests, trial dates, and privacy-safe billing audit records. Card details remain with the billing provider.",
      "Billing records needed for financial, fraud, dispute, tax, or legal obligations are separated from custody records. After account deletion, the user link is replaced with a keyed pseudonymous hash and trial and active-entitlement records are removed. Provider financial records may remain for the period legally required.",
    ],
  },
  {
    title: "Attorney access and sharing",
    body: [
      "When you create an attorney invitation and affirmatively authorize sharing, the verified adult attorney account receives read-only access to the selected case until you revoke it, the attorney leaves, or the case or account is deleted.",
      "The attorney may view, download, print, and export the shared records. Revocation blocks future access but cannot recall copies already downloaded.",
      "An invitation does not create legal representation or attorney-client privilege. Custody Folio is not a law firm and cannot determine whether a communication or record is privileged.",
    ],
  },
  {
    title: "Children and information about other people",
    body: [
      "Adults may keep records referring to children, another parent, witnesses, attorneys, or other people, but must have a lawful reason to do so and must use neutral labels where possible.",
      "Do not enter Social Security numbers, full bank or card numbers, passwords, verification codes, unnecessary medical or school details, or information unrelated to the custody matter.",
      "If we learn that a child created an account or directly provided account information, we will disable the account and delete the information as appropriate. Contact the privacy inbox to report a suspected child account.",
      "The account holder is the source of information entered about other people and is responsible for providing any notice or obtaining any authorization required by applicable law.",
    ],
  },
  {
    title: "Retention and deletion",
    body: [
      "Account and case records remain until you delete them or close the account. Deleted active records and private evidence files are removed from active systems immediately through the available deletion controls.",
      "Encrypted backups rotate and deleted customer content ages out no later than 180 days after a verified deletion. Restored backups must reapply valid deletion requests before serving production traffic.",
      "Raw request logs are retained for up to 180 days. Authentication, security, attorney-access, and deletion audit events may be retained for up to 365 days when reasonably necessary to protect accounts, prove actions, or comply with law.",
      "First party product measurement events expire no later than 180 days after collection. A feedback permission choice remains while the account is active so Custody Folio can enforce the one message limit, and is removed when the account is deleted.",
      "Closed support and privacy correspondence is normally retained for up to 24 months. A documented legal hold may extend a period only for information reasonably necessary to comply with law or establish, exercise, or defend a legal claim.",
      "Billing-provider transaction and legally required accounting records may follow longer statutory retention periods. They are minimized and separated from deleted custody content. The operator documents the applicable retention basis before activating production billing.",
    ],
  },
  {
    title: "Your privacy choices and rights",
    body: [
      "You can view, correct, export, and delete records inside the app; choose neutral labels; revoke attorney access; withdraw optional sharing consent; and permanently delete the account.",
      "You may request access, correction, deletion, portability, withdrawal of consent, or information about disclosures by contacting the privacy inbox. We will verify identity and respond within the period required by applicable law.",
      "We do not discriminate against a user for exercising a privacy right. If we deny a request, you may reply with the subject Privacy Appeal for a separate review and instructions for contacting the appropriate regulator.",
      "Washington residents and people whose consumer health data is collected in Washington should also review the Consumer Health Data Privacy Policy.",
    ],
  },
  {
    title: "Tracking and browser signals",
    body: [
      "Custody Folio does not track users across unrelated websites or apps for targeted advertising, and we do not permit advertising networks to collect records-workspace activity.",
      "When first party product measurement is enabled, Custody Folio uses a same service cookie containing an opaque random visitor token and signed approved attribution codes for up to 30 days. It is used only for aggregate acquisition and product improvement measurement and is not an advertising identifier.",
      "Because we do not perform cross-site advertising tracking, browser Do Not Track signals do not change how the service operates. Privacy controls such as Global Privacy Control are honored where applicable to a covered sale or sharing, but Custody Folio does not currently sell or share data for cross-context behavioral advertising.",
    ],
  },
  {
    title: "International processing",
    body: [
      "Custody Folio is operated from the United States. Providers may process information in the United States or other countries where they operate, including the European Economic Area.",
      "Where required, we use contractual or other lawful transfer safeguards. Users in jurisdictions providing additional rights may contact the privacy inbox and may complain to their local data-protection authority.",
    ],
  },
  {
    title: "Policy changes",
    body: [
      "The date at the top identifies the current version. We will post changes here before they take effect and provide an in-app or email notice when a change materially affects how sensitive records are collected, used, shared, or retained.",
      "When law requires renewed consent, the app will ask for it before the new processing begins. Prior versions and acceptance records are retained as reasonably necessary to document the agreement that applied.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <PolicyPage
      title="Privacy Policy"
      description="How Custody Folio collects, uses, shares, retains, and deletes information."
      sections={sections}
    >
      <section className="rounded-lg border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-600">
        <h2 className="text-base font-semibold text-slate-950">Privacy Requests</h2>
        <p className="mt-2">
          Permanently delete a signed-in account from{" "}
          <Link href={accountDeletionPath} className="font-semibold text-emerald-700 underline underline-offset-2">
            Delete Account
          </Link>
          . Send other privacy, access, correction, or account-data requests to{" "}
          <a href={privacyMailto} className="font-mono font-semibold text-emerald-700 underline underline-offset-2">
            {privacyEmail}
          </a>
          . Include the email address associated with the account and do not include sensitive case details in the subject line.
        </p>
      </section>
      <section className="rounded-lg border border-teal-200 bg-teal-50 p-6 text-sm leading-6 text-teal-950">
        <h2 className="text-base font-semibold">Consumer health data</h2>
        <p className="mt-2">
          Custody records may include health-related information. Review the separate{" "}
          <Link href="/consumer-health-data" className="font-semibold underline underline-offset-2">
            Consumer Health Data Privacy Policy
          </Link>{" "}
          for Washington-specific disclosures, consent choices, deletion rules, and appeal rights.
        </p>
      </section>
    </PolicyPage>
  );
}
