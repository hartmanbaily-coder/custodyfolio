import { PolicyPage, type PolicySection } from "@/components/PolicyPage";
import {
  accountDeletionPath,
  legalOperatorLocation,
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
      `${legalOperatorName}, located in ${legalOperatorLocation}, operates Custody Folio and is responsible for the personal information described in this policy.`,
      `Privacy questions and rights requests may be sent to ${privacyEmail}.`,
      "Custody Folio is intended for adult users. Children may not create or use accounts.",
    ],
  },
  {
    title: "Information you provide",
    body: [
      "Account and profile information: email address, account role and status, display name, timezone, and authentication settings.",
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
      "When compromised-password screening is enabled, only a short password-hash prefix is sent to the Have I Been Pwned range service. Your password, email address, and complete password hash are not sent.",
    ],
  },
  {
    title: "How information is used",
    body: [
      "To create and secure accounts, save and synchronize records, provide attorney access you authorize, generate exports, scan uploads for malware, respond to support and rights requests, and maintain service reliability.",
      "To prevent fraud or abuse, investigate security events, enforce our Terms, comply with law, and establish, exercise, or defend legal claims.",
      "Where a legal basis is required, we rely on performance of our agreement, your requested use of the service, legitimate interests in operating and securing the service, compliance with law, and consent when the law requires consent.",
      "Custody Folio does not use customer records for advertising, does not sell personal information, and does not train or operate an AI import service on customer records while AI features remain disabled.",
    ],
  },
  {
    title: "Service providers and disclosures",
    body: [
      "Supabase provides authentication, database, and private file storage; Backblaze provides encrypted off-site evidence backups; Hetzner hosts the application; Cloudflare provides network delivery, DNS, and security protection; and Resend delivers authentication email.",
      "Apple iCloud Mail processes support, privacy, and security messages. Have I Been Pwned processes password-hash prefixes only when compromised-password screening is enabled.",
      "Providers process information only to provide contracted services and are required to protect it. The current provider list and processing descriptions appear on the Subprocessors page.",
      "We may disclose information in response to valid legal process, to protect people or the service, or as part of a business transfer where the recipient assumes these privacy obligations. We review requests and disclose only what we reasonably believe is required.",
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
      "Closed support and privacy correspondence is normally retained for up to 24 months. A documented legal hold may extend a period only for information reasonably necessary to comply with law or establish, exercise, or defend a legal claim.",
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
