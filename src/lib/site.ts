import type { Metadata } from "next";

export const siteName = "Custody Folio";
export const recordsTagline = "Remove the emotion. Track the data.";
export const siteDescription =
  "Privately organize custody events, parenting time, expenses, notes, and files in one clear timeline. No other parent account is required.";
export const legalDisclaimer =
  "This tool helps organize records and does not provide legal advice. Consult a qualified attorney about your situation.";
export const supportEmail = "support@custodyfolio.com";
export const privacyEmail = "privacy@custodyfolio.com";
export const securityEmail = "security@custodyfolio.com";
export const legalOperatorName = "Slantwire Studios, LLC";
export const supportMailto = `mailto:${supportEmail}`;
export const privacyMailto = `mailto:${privacyEmail}`;
export const securityMailto = `mailto:${securityEmail}`;
export const accountDeletionPath = "/account/delete";
export const accountDeletionMailto = `mailto:${supportEmail}?subject=Custody%20Folio%20account%20deletion%20request`;
export const policyLastUpdated = "August 31, 2026";

export const publicPolicyLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/consumer-health-data", label: "Health data privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/security", label: "Security" },
  { href: "/ai-data-use", label: "AI data use" },
  { href: "/subprocessors", label: "Subprocessors" },
  { href: "/accessibility", label: "Accessibility" },
  { href: "/open-source", label: "Open source" },
  { href: "/contact", label: "Contact" },
  { href: accountDeletionPath, label: "Account deletion" },
];

export function pageMetadata({
  title,
  description,
  canonical,
}: {
  title: string;
  description: string;
  canonical: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      siteName,
      title,
      description,
    },
  };
}
