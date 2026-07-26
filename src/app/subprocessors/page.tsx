import { PolicyPage, type PolicySection } from "@/components/PolicyPage";

const sections: PolicySection[] = [
  {
    title: "Supabase",
    body: [
      "Provides account authentication, database storage, and private file storage.",
      "May process account information, custody records, uploaded files, and information needed to operate those services.",
    ],
  },
  {
    title: "Hetzner",
    body: [
      "Hosts the Custody Folio application server.",
      "May process encrypted web traffic and limited operational information needed to provide hosting.",
    ],
  },
  {
    title: "Cloudflare",
    body: [
      "Provides website traffic protection, domain services, and email routing.",
      "May process IP addresses, web request information, security events, and email routing information.",
    ],
  },
  {
    title: "Provider changes",
    body: [
      "We require service providers to protect personal information and use it only to provide their services to Custody Folio.",
      "We will update this page before a material new provider begins processing customer records.",
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
