import Link from "next/link";

import { AccountDeletionRequest } from "@/app/account/delete/AccountDeletionRequest";
import { PolicyPage, type PolicySection } from "@/components/PolicyPage";
import { accountDeletionMailto, pageMetadata, supportEmail } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Delete Account",
  description: "Permanently delete your Custody Folio account and associated records.",
  canonical: "/account/delete",
});

const sections: PolicySection[] = [
  {
    title: "What will be deleted",
    body: [
      "Deleting your account removes the account and its custody matters, calendars, notes, support and expense records, reports, and uploaded files from active systems.",
      "Limited audit information may be kept when reasonably necessary for security or required by law. Deleted customer content ages out of encrypted backups no later than 180 days after verified deletion.",
    ],
  },
  {
    title: "Before you delete the account",
    body: [
      "Export any records and download any files you need before confirming deletion.",
      "Account deletion cannot be undone.",
    ],
  },
  {
    title: "What happens when you confirm",
    body: [
      "The signed-in account, active records, private evidence files, and Attorney Access are deleted immediately, and you are signed out.",
      "Encrypted backup copies age out no later than 180 days after verified deletion. A narrow, documented legal requirement may preserve only the information the law requires.",
    ],
  },
];

export default function AccountDeletePage() {
  return (
    <PolicyPage
      title="Delete Account"
      description="Permanently delete your Custody Folio account and associated records."
      sections={sections}
    >
      <AccountDeletionRequest />

      <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <h2 className="text-base font-semibold text-slate-950">Cannot sign in?</h2>
        <p className="mt-3">
          Self-service deletion requires a verified sign-in. If you cannot sign in, contact support from the email address connected to the account.
          Use a short message such as
          <span className="font-medium text-slate-800"> Please delete my account for Custody Folio.</span>{" "}
          Support will help restore access or verify an assisted deletion.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={accountDeletionMailto}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-200"
          >
            Email deletion support
          </a>
          <Link
            href="/records"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-teal-500 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-teal-100"
          >
            Open records workspace
          </Link>
        </div>
        <p className="mt-4">
          Direct support address:{" "}
          <a href={accountDeletionMailto} className="font-mono font-semibold text-emerald-700 underline underline-offset-2">
            {supportEmail}
          </a>
        </p>
      </section>
    </PolicyPage>
  );
}
