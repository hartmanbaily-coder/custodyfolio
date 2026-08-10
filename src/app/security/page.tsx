import { PolicyPage, type PolicySection } from "@/components/PolicyPage";
import { pageMetadata, securityEmail, securityMailto } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Security",
  description: "How to protect your Custody Folio account and report a security concern.",
  canonical: "/security",
});

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
      "Custody records are not public. Access by another app user is limited to sharing you initiate, such as revocable read-only Attorney Access, or an export or file you choose to send.",
      "If you see records you do not recognize or believe someone else accessed your account, contact support promptly. Do not include sensitive case details in your initial message.",
    ],
  },
  {
    title: "Files and exports",
    body: [
      "Uploaded files pass through automated malware screening before accepted storage. Screening reduces risk but cannot guarantee that every harmful or deceptive file will be detected.",
      "Files and generated reports are private inside the app. Protect any copy you download or share because the app cannot control it afterward.",
    ],
  },
  {
    title: "Security monitoring",
    body: [
      "The service records minimized authentication, request, evidence, attorney-access, deletion, and security events to detect abuse and investigate incidents.",
      "Security logs may include timestamps, routes, request identifiers, status codes, and shortened hashes of IP addresses, browser or device information, account IDs, or case IDs. They are designed not to contain custody-record or file contents.",
      "Access to production systems and logs is restricted and reviewed. Security and raw request logs are deleted under the retention periods stated in the Privacy Policy.",
    ],
  },
  {
    title: "Incident response",
    body: [
      "We investigate suspected unauthorized access, contain confirmed incidents, preserve necessary evidence, and notify affected people and regulators when applicable law requires notice.",
      "Do not use email for an emergency or to meet a legal deadline. Security reports should omit sensitive case content unless we provide a protected method for sending it.",
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
          <a href={securityMailto} className="font-mono font-semibold text-emerald-700 underline underline-offset-2">
            {securityEmail}
          </a>
          . Do not include sensitive case details unless we ask for them.
        </p>
      </section>
    </PolicyPage>
  );
}
