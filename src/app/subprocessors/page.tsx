import { PolicyPage, type PolicySection } from "@/components/PolicyPage";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Subprocessors",
  description: "Service providers that may process information to operate Custody Folio.",
  canonical: "/subprocessors",
});

const sections: PolicySection[] = [
  {
    title: "Supabase",
    body: [
      "Provides account authentication, database storage, and private file storage.",
      "May process account information, custody records, uploaded files, and information needed to operate those services.",
      "Processing location depends on the configured project region and Supabase's authorized infrastructure and subprocessors.",
    ],
  },
  {
    title: "Hetzner",
    body: [
      "Hosts the Custody Folio application server.",
      "May process web traffic and limited operational information needed to provide hosting.",
    ],
  },
  {
    title: "Backblaze",
    body: [
      "Provides encrypted, access-restricted off-site backup storage for private evidence files because Supabase database backups do not include Storage objects.",
      "May process encrypted backup copies of uploaded evidence and the minimum object metadata required for recovery. Compliance retention prevents alteration or early deletion and expires no later than 180 days after the applicable backup.",
    ],
  },
  {
    title: "Cloudflare",
    body: [
      "Provides website traffic protection, DNS, and domain services.",
      "May process IP addresses, web request information, and security events.",
    ],
  },
  {
    title: "Apple iCloud Mail",
    body: [
      "Provides the Custody Folio support, privacy, and security mailboxes.",
      "May process the sender address, message content, attachments, and delivery information when someone contacts those mailboxes.",
    ],
  },
  {
    title: "Resend",
    body: [
      "Delivers authentication messages such as account confirmation, recovery, and security-related email on behalf of Supabase Auth.",
      "May process the recipient email address, message content, delivery status, IP and device information used for email delivery and abuse prevention. Custody record contents are not intentionally included.",
    ],
  },
  {
    title: "Have I Been Pwned",
    body: [
      "Provides optional compromised-password screening when the production control is enabled.",
      "Receives only the first five characters of a SHA-1 password hash through its range API. It does not receive the password, email address, complete hash, or custody records.",
    ],
  },
  {
    title: "Stripe — web billing subprocessor",
    body: [
      "Provides hosted web checkout, recurring subscriptions, invoices, payment-method management, refunds, disputes, and the Customer Portal when web billing is enabled.",
      "May process account email, provider customer and subscription identifiers, payment details, billing address, transaction information, and fraud-prevention signals. Custody Folio does not receive or store full card numbers.",
      "Custody-record contents, evidence files, case labels, and child information are not sent to Stripe.",
    ],
  },
  {
    title: "Apple — App Store billing provider",
    body: [
      "Provides in-app subscription purchase, renewal, cancellation, refund, and transaction-status services when App Store billing is enabled.",
      "May process Apple account, device, storefront, purchase, subscription, refund, and payment information. Custody Folio receives signed transaction and status information tied to a random app-account token.",
      "Custody-record contents, evidence files, case labels, and child information are not sent to Apple for billing. Apple processing is not required for a Stripe web subscription.",
    ],
  },
  {
    title: "Security monitoring",
    body: [
      "Custody Folio uses its protected production hosting and logging environment to retain minimized application and security events. A separate SIEM or security-event webhook will be identified here before it receives production events.",
      "Security events may contain request route, time, status, request identifier, and shortened hashes of IP address, user agent, account ID, or case ID. They are designed not to contain record or file contents.",
    ],
  },
  {
    title: "Provider changes",
    body: [
      "We require service providers to protect personal information and use it only to provide their services to Custody Folio.",
      "We review providers for access controls, encryption, retention, deletion, incident notice, and their own subprocessors in proportion to the sensitivity of the information they receive.",
      "We will update this page and provide notice when required before a material new provider begins processing customer records for a new purpose.",
    ],
  },
];

export default function SubprocessorsPage() {
  return (
    <PolicyPage
      title="Subprocessors"
      description="Service providers that may process information to operate Custody Folio."
      sections={sections}
    />
  );
}
