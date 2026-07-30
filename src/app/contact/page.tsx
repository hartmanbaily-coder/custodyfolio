import Link from "next/link";

import { PolicyPage, type PolicySection } from "@/components/PolicyPage";
import {
  accountDeletionPath,
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
      description="Use this page to reach support for account, privacy, security, accessibility, file, import, export, and product issues."
      sections={sections}
    >
      <section className="rounded-lg border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-600">
        <h2 className="text-base font-semibold text-slate-950">Contact Emails</h2>
        <p className="mt-2">
          Product and account support:{" "}
          <a href={supportMailto} className="font-mono font-semibold text-emerald-700 underline underline-offset-2">
            {supportEmail}
          </a>
          .
        </p>
        <p className="mt-2">
          Privacy and data requests:{" "}
          <a href={privacyMailto} className="font-mono font-semibold text-emerald-700 underline underline-offset-2">
            {privacyEmail}
          </a>
          .
        </p>
        <p className="mt-2">
          Security reports:{" "}
          <a href={securityMailto} className="font-mono font-semibold text-emerald-700 underline underline-offset-2">
            {securityEmail}
          </a>
          .
        </p>
        <p className="mt-3">
          For account deletion, go directly to{" "}
          <Link href={accountDeletionPath} className="font-semibold text-emerald-700 underline underline-offset-2">
            Delete Account
          </Link>
          .
        </p>
      </section>
    </PolicyPage>
  );
}
