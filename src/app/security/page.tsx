import { PolicyPage, type PolicySection } from "@/components/PolicyPage";
import { supportEmail, supportMailto } from "@/lib/site";

const sections: PolicySection[] = [
  {
    title: "Protecting your account",
    body: [
      "Custody Folio uses verified accounts and additional sign in verification to protect access to records.",
      "Use a unique password, protect your email and authenticator, and sign out on devices you do not control.",
      "Account recovery may require identity verification.",
    ],
  },
  {
    title: "Keeping your records private",
    body: [
      "The app keeps each custody matter and its files tied to the account that created them.",
      "Custody records are not public. Access by another app user is limited to sharing you initiate, such as 30-day Attorney Access, or an export or file you choose to send.",
      "If you see records you do not recognize or believe someone else accessed your account, contact support promptly. Do not include sensitive case details in your initial message.",
    ],
  },
  {
    title: "Files and exports",
    body: [
      "Uploaded files are checked before they can be stored or downloaded.",
      "Files and generated reports are private inside the app. Protect any copy you download or share because the app cannot control it afterward.",
    ],
  },
  {
    title: "Report a concern",
    body: [
      "If you see records you do not recognize or believe someone else accessed your account, sign out and contact us promptly.",
      "Include the affected page, approximate time, and device. Do not email passwords, verification codes, court files, or sensitive case details.",
    ],
  },
];

export default function SecurityPage() {
  return (
    <PolicyPage
      title="Security"
      description="How to protect your account and report a security concern."
      notice="Security controls reduce risk but do not make any internet service risk free. Keep local downloads, exports, passwords, and devices protected."
      sections={sections}
    >
      <section className="rounded-lg border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-600">
        <h2 className="text-base font-semibold text-slate-950">Report a Security Issue</h2>
        <p className="mt-2">
          Email security reports to{" "}
          <a href={supportMailto} className="font-mono font-semibold text-emerald-700 underline underline-offset-2">
            {supportEmail}
          </a>
          . Do not include sensitive case details unless we ask for them.
        </p>
      </section>
    </PolicyPage>
  );
}
