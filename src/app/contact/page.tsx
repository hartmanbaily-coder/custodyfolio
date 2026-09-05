import Link from "next/link";

import { PolicyPage, type PolicySection } from "@/components/PolicyPage";
import {
  accountDeletionPath,
  legalOperatorName,
  pageMetadata,
  privacyEmail,
  privacyMailto,
  securityEmail,
  securityMailto,
  supportEmail,
  supportMailto,
} from "@/lib/site";

export const metadata = pageMetadata({
  title: "Contact",
  description: "Contact Custody Folio support, privacy, or security.",
  canonical: "/contact",
});

const sections: PolicySection[] = [
  {
    title: "Operator",
    body: [
      `${legalOperatorName} operates Custody Folio.`,
      "Use the monitored addresses below for written support, privacy, accessibility, security, and legal notices. Do not send sensitive case records unless we provide a protected method and ask for them.",
    ],
  },
  {
    title: "Account and product support",
    body: [
      "Contact support for sign in, account recovery, files, imports, exports, calendars, reports, accessibility, or product problems.",
      "Include the affected page, what happened, and your device. Do not send passwords, verification codes, court files, or sensitive case details.",
    ],
  },
  {
    title: "Privacy and deletion",
    body: [
      "Use the Account Deletion page to delete your account. Contact the privacy inbox for access, correction, export, or privacy questions.",
      "We may verify your identity before acting on an account or privacy request.",
      "We respond within the period required by applicable law. Washington consumer-health requests are answered within 45 days, subject to a legally permitted extension with notice.",
      "If a privacy request is denied, reply with the subject Privacy Appeal for a separate review and regulator-contact instructions where required.",
    ],
  },
  {
    title: "Security",
    body: [
      "Contact the security inbox promptly if you suspect unauthorized access or discover a security vulnerability.",
      "Include the affected page, approximate time, and device without sending private records.",
    ],
  },
  {
    title: "Legal and emergency boundaries",
    body: [
      "Support cannot provide legal advice, court strategy, filing advice, emergency response, law enforcement response, or supervised exchange services.",
      "For legal advice, contact a qualified attorney. For emergencies or immediate safety concerns, contact local emergency services or appropriate authorities.",
      "Do not rely on support email to preserve records or meet a deadline.",
    ],
  },
];

export default function ContactPage() {
  return (
    <PolicyPage
      title="Contact"
      description="Need help with Custody Folio? Choose the address below for product support, a privacy request, or a security concern."
      sections={sections}
      introduction={
      <section className="mb-10 max-w-3xl border-l-2 border-teal-600 bg-white px-5 py-4 text-base leading-7 text-slate-600">
        <h2 className="text-base font-semibold text-slate-950">Contact the team</h2>
        <p className="mt-2">
          Product and account support:{" "}
          <a href={supportMailto} className="break-words font-semibold text-teal-700 underline underline-offset-2">
            {supportEmail}
          </a>
          .
        </p>
        <p className="mt-2">
          Privacy and data requests:{" "}
          <a href={privacyMailto} className="break-words font-semibold text-teal-700 underline underline-offset-2">
            {privacyEmail}
          </a>
          .
        </p>
        <p className="mt-2">
          Security reports:{" "}
          <a href={securityMailto} className="break-words font-semibold text-teal-700 underline underline-offset-2">
            {securityEmail}
          </a>
          .
        </p>
        <p className="mt-3">
          For account deletion, go directly to{" "}
          <Link href={accountDeletionPath} className="font-semibold text-teal-700 underline underline-offset-2">
            Delete Account
          </Link>
          .
        </p>
      </section>
      }
    />
  );
}
