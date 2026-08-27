# Custody Folio Policy Accuracy Review

Reviewed August 27, 2026 against the current Custody Folio code, implemented account and attorney flows, configured service providers, billing behavior, dependency versions, current Apple App Review privacy requirements, Washington's Consumer Health Data law, and WCAG 2.2.

This is a technical and product-accuracy review. It does not determine whether a contract term is enforceable or replace jurisdiction-specific legal advice.

## Result

The public policy set is internally consistent and accurately describes the implemented app after the five wording corrections below. No subscription, checkout, attorney-access, account-deletion, retention, pricing, or other product behavior was changed.

| Page | Result | Review note |
| --- | --- | --- |
| Terms of Use | Pass; no edit | Adult-only use, product boundaries, one subscription tier, Stripe web billing, Apple in-app billing, export-only access, cancellation, refunds, deletion, and attorney access match the app. |
| Privacy Policy | Pass with one clarification | Provider-protection wording now states more clearly that providers must protect user data consistently with the policy and applicable law. |
| Consumer Health Data Privacy Policy | Pass with three clarifications | The page now explicitly identifies the categories shared through attorney access, includes recipient contact information in the disclosure right when required, and uses the statute's “authenticated deletion request” terminology. |
| Subprocessors | Pass with one correction | Hetzner may process web traffic at the application host; the prior phrase “encrypted web traffic” was too narrow. All named providers match the implemented service. |
| Security | Pass; no edit | Account protection, private-record boundaries, malware screening, minimized logging, retention references, and incident reporting match the implemented controls. |
| AI Data Use | Pass; no edit | Customer-record AI remains disabled, and the page does not claim that an AI provider receives customer records. |
| Accessibility | Pass; no edit | WCAG 2.2 Level AA remains a testing target and is expressly not presented as a conformance claim. |
| Contact | Pass; no edit | Operator name, monitored inboxes, deletion route, Washington response timing, and legal/emergency boundaries are consistent. |
| Open-Source Notices | Pass; no edit | The installed `heic-to` version is 1.5.2 and its bundled libheif version is 1.22.2; the stated LGPL notices and source links match. |
| Account Deletion | Pass; no edit | Signed-in, self-service permanent account deletion and the separate Apple-subscription cancellation warning match the app flow. |

All policy pages now display `Last updated August 27, 2026`.

## Exact Proposed Wording Changes

1. Privacy Policy:

   > Providers process information only to provide contracted services and are required to protect user data consistently with this policy and applicable law. The current provider list and processing descriptions appear on the Subprocessors page.

2. Consumer Health Data Privacy Policy:

   > The categories shared are the health-related records contained in the selected case, together with the minimum account, case, and security information needed to provide and protect that access.

3. Consumer Health Data Privacy Policy:

   > You may confirm whether we collect, share, or sell consumer health data concerning you; access that data; and receive a list of third parties and affiliates with whom it was shared or sold, including an active email address or other online contact method when required.

4. Consumer Health Data Privacy Policy:

   > You may withdraw consent from future collection or sharing and request deletion. An authenticated deletion request is sent to processors, contractors, and other recipients as required by law.

5. Subprocessors:

   > May process web traffic and limited operational information needed to provide hosting.

## Current-Requirement Checks

- Apple's current App Review Guidelines require an accessible privacy-policy link, disclosure of collected data and its uses, protection by third parties, retention and deletion explanations, consent controls, and in-app account deletion. The current policy pages and native Help Center cover these submission requirements.
- Washington RCW 19.373.020 requires a prominent homepage link plus disclosure of collected categories, sources, shared categories, recipient categories, and rights. The current home page and health-data policy contain those items.
- Washington RCW 19.373.040 supports the policy's 45-day response period, one 45-day extension, two free responses annually, authenticated deletion workflow, recipient notification, and six-month backup maximum.
- W3C continues to publish WCAG 2.2 as the current recommendation, so the accessibility page's WCAG 2.2 Level AA target is current.

Official references:

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Washington RCW 19.373.020](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.020)
- [Washington RCW 19.373.040](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.040)
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## Items That Still Need Human or Legal Confirmation

1. **Approve the exact five wording changes above before deployment.** They change public promises and therefore produce a new policy-bundle digest even though they do not change app behavior.
2. **Worldwide legal coverage cannot be certified from code alone.** The general policy identifies the controller, purposes, legal bases, recipients, retention, rights, transfers, and complaint route. An expedited privacy-law review should still determine whether Slantwire Studios, LLC needs an EU or UK representative, a data-protection officer, or additional country-specific notices before actively serving residents there.
3. **Service-provider commitments.** The operator should retain the applicable service terms and data-processing agreements supporting the statement that providers protect data consistently with the policy and law.
4. **Native policy-link convenience.** Build 16 links directly to Privacy, Terms, Security, AI Data Use, Subprocessors, Accessibility, Account Deletion, and Contact. Health Data Privacy is linked from the Privacy page; Open-Source Notices is available on the website. Adding both as direct native Help Center links would require a new iOS build, so no binary change was made during this policy-only pass.

## Verification

- `npm run lint`: pass.
- `npm run typecheck`: pass.
- Full Vitest suite: 69 files and 410 tests passed.
- Public-copy regression suite after the final wording edit: 15 tests passed.
- Production build after the final wording edit: pass.
- Local rendered-page check: all ten public policy/account-deletion routes returned HTTP 200 and displayed the August 27, 2026 review date.
- Generated policy bundle: `sha256:2808448b1466bc477bf0845845df3a9fb0db8735a43cd66a015cde57df5f2362`.

These changes remain undeployed pending operator review and approval.
