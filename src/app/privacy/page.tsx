import { PolicyPage, type PolicySection } from "@/components/PolicyPage";
import { accountDeletionPath, privacyEmail, privacyMailto } from "@/lib/site";
import Link from "next/link";

const sections: PolicySection[] = [
  {
    title: "Information we collect",
    body: [
      "Account information, including your email address, account status, and timezone.",
      "Custody records you enter, including calendars, exchanges, notes, child support, expenses, and report settings.",
      "Files you upload and basic technical information needed to operate and secure the service.",
    ],
  },
  {
    title: "How we use it",
    body: [
      "We use your information to provide the app, protect accounts, save records, create exports, respond to requests, and comply with legal obligations.",
      "We do not sell custody records or account information, and we do not use advertising trackers in the records workspace.",
    ],
  },
  {
    title: "Service providers and disclosure",
    body: [
      "We use Supabase for account authentication and data storage, Hetzner for application hosting, Cloudflare for website protection and domain services, and Apple iCloud Mail for support, privacy, and security email.",
      "These providers may process only the information needed to provide their services and must protect it.",
      "We may disclose information when required by law or valid legal process, or when needed to protect people, accounts, or the service.",
    ],
  },
  {
    title: "Attorney Access",
    body: [
      "If you invite an attorney, the verified adult account you name receives read only access to the selected case until you revoke access or the attorney leaves.",
      "You can revoke future access. Copies already downloaded by the attorney cannot be recalled.",
      "An invitation does not establish legal representation or attorney client privilege.",
    ],
  },
  {
    title: "Retention and deletion",
    body: [
      "We keep records while your account is active unless you delete them sooner.",
      "Deleted information is removed from active systems. Limited copies may remain temporarily in backups or when retention is required by law.",
      "A signed-in user can permanently delete the account, active records, and private evidence files immediately from the Account Deletion page without waiting for approval.",
    ],
  },
  {
    title: "Your choices",
    body: [
      "You can use neutral labels, edit or delete records, export your data, and decide when to share files or Attorney Access.",
      "Do not enter Social Security numbers, full bank or card numbers, passwords, verification codes, or unnecessary information about other people.",
      "Contact us to request access, correction, or deletion. We may verify your identity first.",
    ],
  },
  {
    title: "Children",
    body: [
      "The app is for adults. Adults may keep custody records that refer to children, but children must not create or use accounts.",
      "Do not upload unnecessary child identifiers.",
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
    </PolicyPage>
  );
}
