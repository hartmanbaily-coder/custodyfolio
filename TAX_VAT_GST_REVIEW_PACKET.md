# Custody Folio Tax / VAT / GST Review Packet

Review status: prepared August 15, 2026; approval by a qualified tax professional remains pending.

This packet is not tax or legal advice. It provides the current product and payment facts needed for an independent indirect-tax review. The reviewer should record conclusions, registrations, effective dates, filing obligations, and any required configuration changes in a separate privileged or protected workpaper.

## Business and product facts

- Operator: Slantwire LLC, a United States business based in Alaska.
- Product: consumer software for organizing custody-related records, evidence, schedules, expenses, and court-packet-oriented exports.
- Delivery: electronically supplied subscription software; no physical goods.
- Web billing: direct-to-consumer Stripe Checkout subscriptions at USD $5.99 monthly or USD $59.99 annually.
- Apple billing: native iOS subscriptions sold through StoreKit. The local StoreKit catalog uses USD $6.99 monthly and USD $69.99 annually; the customer sees Apple’s localized storefront price before purchase.
- Trial: one universal 30-day account trial managed by Custody Folio, with no card required. Stripe and Apple introductory offers are intentionally disabled.
- Refunds: Stripe refunds are operator-issued; App Store refunds are Apple-managed. Subscription access is reconciled from signed provider events and server API state.
- Customer geography: the service is internet-accessible and is not currently limited to a single US state or country.
- Attorney guests: invited attorney access is free and read-only; attorneys are not billed.

## Current tax controls

- Stripe automatic tax is disabled.
- No Stripe tax registration is treated as valid merely because it exists in Stripe; the business must first be registered with the relevant authority.
- The Stripe Price allowlist and Checkout implementation do not currently add tax.
- Apple’s storefront calculates applicable transaction taxes in the jurisdictions it administers; App Store Connect financial reports show customer price, applicable taxes, commission, refunds, and proceeds.
- Live billing readiness remains blocked until a qualified reviewer sets `BILLING_TAX_REVIEW_APPROVED=true` based on documented conclusions.

## Questions requiring the reviewer’s written conclusion

1. Classify the web subscription and Apple subscription for US sales-tax purposes and for non-US VAT/GST or similar consumption taxes.
2. Determine Slantwire LLC’s physical nexus, economic nexus, and registration obligations based on its Alaska location, personnel, contractors, sales history, and expected launch footprint.
3. Determine whether direct Stripe sales into Alaska municipal jurisdictions create collection or registration duties, including any Alaska Remote Seller Sales Tax Commission rules.
4. Identify every jurisdiction in which direct web sales must be registered, collected, reported, or filed before launch, and state the effective date for each registration.
5. Determine whether any jurisdiction requires filings even when no tax is due.
6. Confirm the correct Stripe product tax code and whether USD prices should be tax-exclusive, tax-inclusive, or automatic by currency.
7. Confirm whether Stripe Tax should remain disabled at launch or be enabled only after specific registrations become effective.
8. Confirm how Apple’s role under the Paid Apps Agreement affects Slantwire LLC’s customer-transaction tax obligations, proceeds reporting, commission taxes, and any residual filing duties.
9. Confirm the App Store tax category for Custody Folio and its in-app subscriptions.
10. Review US federal and Alaska income, business-license, and information-reporting obligations separately from transaction tax.
11. Identify record-retention requirements for invoices, exemption evidence, location evidence, refunds, Apple reports, Stripe reports, and tax returns.
12. State whether non-US sales should be geographically restricted until any required VAT/GST registrations are active.

## Evidence to give the reviewer

- This packet and `BILLING_LAUNCH_CHECKLIST.md`.
- Stripe product, Price, Checkout, refund, and monthly balance/transaction reports.
- Current Stripe Tax monitoring and registration screens, without treating Stripe’s monitoring as professional advice.
- App Store Connect Paid Apps Agreement, tax forms, tax category, pricing, and financial-report configuration.
- Actual and forecast gross sales by customer jurisdiction and payment provider.
- Slantwire LLC formation, ownership, address, personnel/contractor locations, and any existing registrations.
- Refund and cancellation policy text in the exact release policy bundle.

## Primary platform references

- Stripe requires a business to register with a jurisdiction before collecting through Stripe Tax: https://docs.stripe.com/tax/registering
- Stripe Tax setup and registration behavior: https://docs.stripe.com/tax/set-up
- Apple tax-information requirements for the Paid Apps Agreement: https://developer.apple.com/help/app-store-connect/manage-tax-information/provide-tax-information
- Apple App Store tax-category guidance: https://developer.apple.com/help/app-store-connect/manage-app-information/set-a-tax-category
- Apple financial reports and transaction-tax reporting: https://developer.apple.com/help/app-store-connect/getting-paid/download-financial-reports
- Alaska Remote Seller Sales Tax Commission: https://arsstc.org/

## Approval evidence to record

Do not mark the billing tax gate approved until the review is complete. Record:

- reviewer name, professional designation, and organization;
- review date and next-review date;
- jurisdictions and transaction types reviewed;
- registrations required, registration identifiers, and effective dates;
- approved tax codes and price tax behavior;
- filing and remittance owner and calendar;
- launch restrictions or sales thresholds to monitor;
- the exact digest or version of this packet and the billing policies reviewed;
- the reviewer’s explicit approved / approved-with-limitations / not-approved decision.
