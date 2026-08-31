import { PolicyPage, type PolicySection } from "@/components/PolicyPage";
import {
  legalOperatorName,
  pageMetadata,
  supportEmail,
} from "@/lib/site";

export const metadata = pageMetadata({
  title: "Terms of Use",
  description: "Terms for using Custody Folio to organize custody records and reports.",
  canonical: "/terms",
});

const sections: PolicySection[] = [
  {
    title: "Agreement and operator",
    body: [
      `${legalOperatorName} operates Custody Folio. These Terms form an agreement between you and ${legalOperatorName}.`,
      "By creating an account or signing in after being shown the acceptance notice, you affirmatively agree to these Terms and acknowledge the Privacy Policy. If you do not agree, do not create or use an account.",
      "You must be an adult legally able to enter this agreement. Children may not create or use accounts.",
    ],
  },
  {
    title: "Service and limited license",
    body: [
      "Custody Folio gives adult users a private workspace to organize custody-related calendars, exchanges, notes, financial records, files, reports, and authorized attorney access.",
      "While your account remains authorized, we grant you a personal, limited, nonexclusive, nontransferable, revocable license to use the service for lawful personal recordkeeping or authorized professional review.",
      "Custody Folio and its software, design, branding, and original content remain owned by the operator or applicable licensors. Open-source components remain governed by their own licenses.",
    ],
  },
  {
    title: "Not a law firm or emergency service",
    body: [
      "Custody Folio is an organizational tool. It does not provide legal advice, legal representation, court findings, case strategy, supervised exchanges, law-enforcement response, or emergency assistance.",
      "Reports, charts, calculations, timelines, summaries, and exports depend on user-entered information and may contain errors. They do not guarantee admissibility, accuracy, completeness, legal effect, or a particular outcome.",
      "Keep original source material, independently review every export, follow applicable court rules, and consult a qualified attorney about your circumstances. Contact emergency services for immediate safety concerns.",
    ],
  },
  {
    title: "Accounts and security",
    body: [
      "Provide accurate account information and use only accounts and matters you are authorized to access. You are responsible for activity under your account except activity caused by our breach of these Terms or applicable law.",
      "Protect your email, password, authenticator, recovery information, devices, downloads, and exports. Notify us promptly at the security address if you suspect unauthorized access.",
      "We may require identity or account-control verification for recovery, privacy requests, deletion, or other sensitive actions.",
    ],
  },
  {
    title: "Your records and permissions",
    body: [
      "You retain ownership of records and files you provide. You grant us a limited permission to host, copy, process, scan, transmit, and format them only as needed to provide, secure, support, and comply with law for the service.",
      "You are responsible for the legality, accuracy, and appropriateness of information you enter, upload, export, or share and for having the necessary rights or authority concerning information about children and other people.",
      "Do not enter unnecessary identifiers or sensitive information. Protect downloaded copies because they leave Custody Folio's access controls.",
      "We may block or remove malware, illegal material, unsupported files, or content that creates a credible security or legal risk.",
    ],
  },
  {
    title: "Attorney access",
    body: [
      "A client may expressly authorize one adult attorney account to receive read-only access to a selected case. Access continues until the client revokes it, the attorney leaves, or the case or account is deleted.",
      "Attorney users may view, select, download, print, and export shared records solely for the client matter and must protect those copies and comply with professional, ethical, confidentiality, and legal obligations.",
      "Revocation blocks future requests but cannot recall a copy already downloaded or otherwise received. An invitation does not create representation or attorney-client privilege, and Custody Folio is not part of the attorney-client relationship.",
    ],
  },
  {
    title: "Acceptable use",
    body: [
      "Do not use the service to harass, stalk, threaten, impersonate, unlawfully surveil, dox, retaliate against, exploit, or unlawfully disclose information about another person.",
      "Do not upload malware, illegal content, misleading fabricated evidence, or material you have no right to possess or share.",
      "Do not access another account without authorization, bypass security or rate limits, probe for vulnerabilities without written permission, scrape the service, interfere with operation, or use automated access not provided by us.",
    ],
  },
  {
    title: "Subscriptions, trial, renewal, cancellation, and refunds",
    body: [
      "Custody Folio offers one complete subscription tier. Each eligible account receives one 30-day no-card trial managed by Custody Folio. Stripe and Apple do not add a second introductory trial.",
      "Web subscriptions cost $5.99 each month or $59.99 each year in U.S. dollars. Direct Stripe web checkout is currently limited to customers with a United States service address. Stripe Checkout shows the selected price, billing frequency, and final charge before purchase. In the iOS app, Apple's purchase sheet shows the localized monthly or annual price and renewal period before purchase.",
      "Subscriptions automatically renew at the selected monthly or annual frequency until cancelled. Stripe-managed subscriptions are changed or cancelled through the Stripe Customer Portal. App Store subscriptions are managed through Apple subscription settings.",
      "Cancellation takes effect at the end of a paid period unless the provider or applicable law requires an earlier remedy. A payment grace period may temporarily preserve full access. After trial or paid access ends, the account becomes export-only: existing records remain viewable, downloadable, exportable, and deletable, and account deletion and attorney revocation remain available.",
      "Refund requests for web purchases are handled through Stripe and the support channel, subject to applicable law. Apple controls refunds for App Store purchases. A full refund, chargeback, or payment reversal may end paid entitlement sooner, but never blocks export of existing records.",
      "Quoted prices may exclude taxes. Tax is collected only where the operator has configured collection after reviewing registration obligations. Stripe Checkout shows the final charge before purchase.",
      "Use only one billing provider at a time. An iOS purchase is processed by Apple; a web purchase is processed by Stripe. Custody Folio does not present Stripe checkout inside the iOS app.",
    ],
  },
  {
    title: "Attorney access availability",
    body: [
      "A client may activate attorney access only by choosing a case, naming the intended adult attorney, and separately authorizing sharing, including any health-related information in that case. Invitations expire, are single-use, and may be revoked before acceptance.",
      "Attorneys do not pay for client-granted read-only access. Their access is governed by the client’s invitation and grant, not the client’s subscription state.",
    ],
  },
  {
    title: "Availability and changes to the service",
    body: [
      "We work to keep the service available but do not promise uninterrupted or error-free operation. Maintenance, security work, network failures, legal requirements, or provider outages may interrupt access.",
      "Features may be added, changed, limited, or discontinued. When reasonably possible, we will provide advance notice before a material change that removes access to stored records and will preserve a reasonable export opportunity.",
    ],
  },
  {
    title: "Suspension, termination, and deletion",
    body: [
      "We may limit or suspend access when reasonably necessary to address misuse, a credible security risk, unlawful conduct, or a material breach of these Terms. We will use a proportionate response and provide notice when legally and practically permitted.",
      "You may export records and permanently delete your signed-in account using the self-service deletion page. Account deletion is irreversible and ends attorney access.",
      "Before deleting an account, Custody Folio attempts to cancel active Stripe web subscriptions and stops deletion if cancellation cannot be confirmed. Apple controls App Store billing, so deleting the Custody Folio account does not cancel an App Store subscription; users may delete immediately and should separately cancel through Apple subscription settings.",
      "Provisions concerning ownership, downloaded copies, disclaimers, responsibility, disputes, and any lawful retention survive account closure to the extent needed to give them effect.",
    ],
  },
  {
    title: "Disclaimers and responsibility",
    body: [
      "To the fullest extent permitted by law, the service is provided as available without warranties of merchantability, fitness for a particular purpose, title, noninfringement, uninterrupted availability, evidentiary acceptance, or legal outcome.",
      "Nothing in these Terms excludes a warranty, remedy, or liability that applicable consumer law does not allow us to exclude. You remain responsible for independent backups of material needed for a legal or personal deadline.",
      "Where permitted by law, neither party is liable to the other for indirect, incidental, special, exemplary, or consequential loss that was not reasonably foreseeable. Our total liability relating to the service will not exceed the greater of $100 or the amount you paid us during the preceding 12 months.",
      "Where permitted by law, you are responsible for reasonable losses and claims caused by your unlawful content, unauthorized sharing, intentional misuse, or material violation of these Terms.",
    ],
  },
  {
    title: "Governing law and disputes",
    body: [
      "Applicable law governs these Terms without overriding mandatory consumer protections that apply where you live. The operator has not selected a state-specific governing-law or exclusive-forum clause.",
      `Before filing a non-emergency dispute, contact ${supportEmail} and provide a concise description so both sides can try to resolve it informally. This does not extend a legal deadline or prevent a party from seeking urgent relief.`,
      "These Terms do not require private arbitration and do not waive a right that cannot lawfully be waived.",
    ],
  },
  {
    title: "General terms",
    body: [
      "If part of these Terms is unenforceable, the remaining provisions continue to apply and the affected provision will be limited only as much as necessary.",
      "Our failure to enforce a provision is not a waiver. You may not transfer your account or this agreement without written permission; we may transfer the agreement as part of a lawful restructuring or business transfer subject to the Privacy Policy.",
      "The Privacy Policy and any feature-specific terms expressly presented to you are incorporated into this agreement. Headings are for readability and do not limit the provisions.",
    ],
  },
  {
    title: "Changes and contact",
    body: [
      "The date at the top identifies the current version. We will post updated Terms and provide conspicuous notice of material changes. When required, you must affirmatively accept revised Terms before continuing to use the service.",
      `Questions about these Terms may be sent to ${supportEmail}. Notices to Custody Folio should identify the account email but should not include sensitive case details in the subject line.`,
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
