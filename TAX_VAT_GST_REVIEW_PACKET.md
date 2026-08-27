# Custody Folio Tax / VAT / GST Review Packet

Review status: approved with limitations by Slantwire Studios, LLC through operator self-review on August 27, 2026. Direct Stripe checkout is limited to United States service addresses and launches with `STRIPE_TAX_MODE=not_collecting`; App Store distribution remains worldwide. No professional tax review or tax-compliance certification is represented.

This packet is not tax or legal advice. It provides the current product and payment facts needed for an independent indirect-tax review. The reviewer should record conclusions, registrations, effective dates, filing obligations, and any required configuration changes in a separate privileged or protected workpaper.

## Business and product facts

- Operator: Slantwire Studios, LLC, owned and operated from Alaska, United States. The public site does not publish a street or mailing address.
- Product: consumer software for organizing custody-related records, evidence, schedules, expenses, and court-packet-oriented exports.
- Delivery: electronically supplied subscription software; no physical goods.
- Approved launch footprint: direct Stripe web subscriptions are limited to customers with a United States service address. App Store distribution remains available in all configured countries and regions, including the European Union.
- Web billing: direct-to-consumer Stripe Checkout subscriptions at USD $5.99 monthly or USD $59.99 annually.
- Apple billing: native iOS subscriptions sold through StoreKit. The local StoreKit catalog uses USD $6.99 monthly and USD $69.99 annually; the customer sees Apple’s localized storefront price before purchase.
- Trial: one universal 30-day account trial managed by Custody Folio, with no card required. Stripe and Apple introductory offers are intentionally disabled.
- Refunds: Stripe refunds are operator-issued; App Store refunds are Apple-managed. Subscription access is reconciled from signed provider events and server API state.
- Customer geography: the service is internet-accessible worldwide, but the direct Stripe purchase flow requires a United States service address. Non-U.S. customers may use the App Store purchase flow where Apple makes it available.
- Attorney guests: invited attorney access is free and read-only; attorneys are not billed.

## Current tax controls

- Stripe automatic tax is disabled and the approved launch mode is `not_collecting`.
- Hosted Stripe Checkout collects a service address and offers only the United States as an allowed country. The checkout copy states that Custody Folio is digital and nothing will be shipped.
- No Stripe tax registration is treated as valid merely because it exists in Stripe; the business must first be registered with the relevant authority.
- The Stripe Price allowlist and Checkout implementation do not currently add tax.
- Apple’s storefront calculates applicable transaction taxes in the jurisdictions it administers; App Store Connect financial reports show customer price, applicable taxes, commission, refunds, and proceeds.
- Slantwire Studios, LLC approved `BILLING_TAX_REVIEW_APPROVED=true` on the limited basis recorded here: Anchorage is the operator's business location, Alaska has no statewide sales tax, Anchorage has no general sales tax, current direct Custody Folio web volume is de minimis, and non-U.S. direct purchases are blocked. This is an operator launch decision, not professional tax advice or a conclusion that no future registration can arise.
- The operator will review Stripe Tax threshold monitoring monthly and before expanding direct checkout outside the United States. Any Stripe threshold notice, new business location, personnel location, registration, or material change in sales footprint triggers an earlier review.

## Questions requiring professional review before expanding the footprint

1. Classify the web subscription and Apple subscription for US sales-tax purposes and for non-US VAT/GST or similar consumption taxes.
2. Determine Slantwire Studios, LLC’s physical nexus, economic nexus, and registration obligations based on its places of business, personnel, contractors, sales history, and expected launch footprint.
3. Determine whether direct Stripe sales into any home or local jurisdiction create collection, registration, or filing duties.
4. Identify every jurisdiction in which direct web sales must be registered, collected, reported, or filed before launch, and state the effective date for each registration.
5. Determine whether any jurisdiction requires filings even when no tax is due.
6. Confirm the correct Stripe product tax code and whether USD prices should be tax-exclusive, tax-inclusive, or automatic by currency.
7. Confirm whether Stripe Tax should remain disabled at launch or be enabled only after specific registrations become effective.
8. Confirm how Apple’s role under the Paid Apps Agreement affects Slantwire Studios, LLC’s customer-transaction tax obligations, proceeds reporting, commission taxes, and any residual filing duties.
9. Confirm the App Store tax category for Custody Folio and its in-app subscriptions.
10. Review US federal, state, and local income, business-license, and information-reporting obligations separately from transaction tax.
11. Identify record-retention requirements for invoices, exemption evidence, location evidence, refunds, Apple reports, Stripe reports, and tax returns.
12. State whether non-US sales should be geographically restricted until any required VAT/GST registrations are active.

## Evidence to give the reviewer

- This packet and `BILLING_LAUNCH_CHECKLIST.md`.
- Stripe product, Price, Checkout, refund, and monthly balance/transaction reports.
- Current Stripe Tax monitoring and registration screens, without treating Stripe’s monitoring as professional advice.
- App Store Connect Paid Apps Agreement, tax forms, tax category, pricing, and financial-report configuration.
- Actual and forecast gross sales by customer jurisdiction and payment provider.
- Slantwire Studios, LLC formation, ownership, business contact information, personnel/contractor locations, and any existing registrations. Keep nonpublic personal addresses out of this repository.
- Refund and cancellation policy text in the exact release policy bundle.

## Primary platform references

- Alaska confirms that it does not levy statewide sales tax and directs businesses to applicable municipal rules: https://www.commerce.alaska.gov/web/dcra/OfficeoftheStateAssessor/AlaskaSalesTaxInformation
- Alaska's municipal tax table reports a 0.0% general sales-tax rate for the Municipality of Anchorage: https://www.commerce.alaska.gov/web/Portals/4/pub/OSA/14Taxable-Table02Bor.pdf
- Stripe requires a business to register with a jurisdiction before collecting through Stripe Tax: https://docs.stripe.com/tax/registering
- Stripe Tax setup and registration behavior: https://docs.stripe.com/tax/set-up
- Apple tax-information requirements for the Paid Apps Agreement: https://developer.apple.com/help/app-store-connect/manage-tax-information/provide-tax-information
- Apple App Store tax-category guidance: https://developer.apple.com/help/app-store-connect/manage-app-information/set-a-tax-category
- Apple financial reports and transaction-tax reporting: https://developer.apple.com/help/app-store-connect/getting-paid/download-financial-reports

## Approval evidence recorded

The protected production configuration must record:

- reviewer: Slantwire Studios, LLC, acting as product owner through operator self-review;
- decision date: August 27, 2026;
- decision: approved with the United States-only direct-web limitation;
- Stripe tax mode: `not_collecting`; no registration or professional tax determination is represented;
- monitoring: review Stripe Tax thresholds monthly and before any direct-web geographic expansion;
- expansion gate: do not offer non-U.S. direct Stripe checkout until the applicable VAT/GST registrations, collection configuration, filing ownership, and product tax treatment are reviewed;
- operative public disclosures: the exact Terms, Privacy, Subprocessors, and billing checklist digests bound to the protected production approval evidence.
