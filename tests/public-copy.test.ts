import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const customerFacingFiles = [
  "src/app/privacy/page.tsx",
  "src/app/consumer-health-data/page.tsx",
  "src/app/terms/page.tsx",
  "src/app/security/page.tsx",
  "src/app/accessibility/page.tsx",
  "src/app/ai-data-use/page.tsx",
  "src/app/subprocessors/page.tsx",
  "src/app/open-source/page.tsx",
  "src/app/contact/page.tsx",
  "src/app/guides/factual-custody-record-checklist/page.tsx",
  "src/app/account/delete/page.tsx",
  "src/app/account/delete/AccountDeletionRequest.tsx",
  "src/components/records/AttorneyAccessPanel.tsx",
  "src/components/records/AttorneyPortal.tsx",
  "src/components/records/ExhibitBuilder.tsx",
  "src/components/billing/SubscriptionPanel.tsx",
  "ios/CustodyFolio/CustodyFolio/NativePolicyView.swift",
];

const forbiddenPublicPhrases = [
  /broad public launch/i,
  /qualified legal review/i,
  /product baseline/i,
  /prepared for broader use/i,
  /retention language/i,
  /not configured for this deployment/i,
  /configured server side model/i,
  /MFA ready structure/i,
  /protected route/i,
  /reloading cloud storage/i,
  /use the support address below instead of a personal email/i,
];

describe("customer facing copy", () => {
  it("preserves the Custody Folio brand statement", () => {
    const site = readFileSync(resolve(process.cwd(), "src/lib/site.ts"), "utf8");
    expect(site).toContain(
      'recordsTagline = "Keep the facts clear. Keep your records together."'
    );
  });

  it("does not expose internal readiness or implementation language", () => {
    for (const file of customerFacingFiles) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const phrase of forbiddenPublicPhrases) {
        expect(source, `${file} contains ${phrase}`).not.toMatch(phrase);
      }
    }
  });

  it("uses the monitored support channel", () => {
    const site = readFileSync(resolve(process.cwd(), "src/lib/site.ts"), "utf8");
    expect(site).toContain('supportEmail = "support@custodyfolio.com"');
    expect(site).toContain('privacyEmail = "privacy@custodyfolio.com"');
    expect(site).toContain('securityEmail = "security@custodyfolio.com"');
  });

  it("publishes the exact operator and no public location", () => {
    const site = readFileSync(resolve(process.cwd(), "src/lib/site.ts"), "utf8");
    expect(site).toContain('legalOperatorName = "Slantwire Studios, LLC"');
    expect(site).not.toContain("legalOperatorLocation");

    for (const file of customerFacingFiles) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, `${file} exposes an Alaska location`).not.toMatch(/Alaska/i);
    }
  });

  it("contains the proposed dual-provider billing and attorney clauses", () => {
    const terms = readFileSync(resolve(process.cwd(), "src/app/terms/page.tsx"), "utf8");
    const privacy = readFileSync(resolve(process.cwd(), "src/app/privacy/page.tsx"), "utf8");

    expect(terms).not.toContain("draft for counsel review");
    expect(privacy).not.toContain("draft for counsel review");
    expect(terms).toContain("Stripe Customer Portal");
    expect(terms).toContain("Apple subscription settings");
    expect(terms).toContain("separately authorizing sharing");
  });

  it("declares the native UserDefaults required-reason API", () => {
    const manifest = readFileSync(
      resolve(process.cwd(), "ios/CustodyFolio/CustodyFolio/PrivacyInfo.xcprivacy"),
      "utf8"
    );
    expect(manifest).toContain("NSPrivacyAccessedAPICategoryUserDefaults");
    expect(manifest).toContain("CA92.1");
  });

  it("links the complete public policy set", () => {
    const site = readFileSync(resolve(process.cwd(), "src/lib/site.ts"), "utf8");
    for (const path of [
      "/privacy",
      "/consumer-health-data",
      "/terms",
      "/security",
      "/ai-data-use",
      "/subprocessors",
      "/accessibility",
      "/open-source",
      "/contact",
      "/account/delete",
    ]) {
      expect(site).toContain(path);
    }
  });

  it("prominently links the consumer health data policy from the home page", () => {
    const home = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
    expect(home).toContain('href="/consumer-health-data"');
    expect(home).toContain("Consumer Health Data Privacy Policy");
  });

  it("provides a direct trial signup path and factual public checklist", () => {
    const home = readFileSync(resolve(process.cwd(), "src/app/page.tsx"), "utf8");
    const checklist = readFileSync(
      resolve(
        process.cwd(),
        "src/app/guides/factual-custody-record-checklist/page.tsx"
      ),
      "utf8"
    );
    const records = readFileSync(
      resolve(process.cwd(), "src/components/records/RecordsApp.tsx"),
      "utf8"
    );

    expect(home).toContain('href="/records?mode=signup"');
    expect(home).toContain("Read the free checklist");
    expect(records).toContain("recordsSignupRoute(");
    expect(checklist).toContain("The factual custody record checklist");
    expect(checklist).toContain("This guide provides general organization information");
    expect([home, checklist].join("\n")).not.toMatch(
      /win custody|beat your ex|court approved|legally admissible|guaranteed evidence|tamper proof/i
    );
  });

  it("does not expose the retired product name in export filenames", () => {
    const exportFiles = [
      "src/components/records/RecordsApp.tsx",
      "src/components/records/AttorneyPortal.tsx",
      "src/lib/records/exhibits.ts",
    ];
    for (const file of exportFiles) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).not.toContain("my_custody_case_");
      expect(source).toContain("custody_folio_");
    }
  });

  it("states that signed-in account deletion is immediate and self-service", () => {
    const deletionPage = readFileSync(
      resolve(process.cwd(), "src/app/account/delete/page.tsx"),
      "utf8"
    );
    const deletionControl = readFileSync(
      resolve(process.cwd(), "src/app/account/delete/AccountDeletionRequest.tsx"),
      "utf8"
    );
    expect(deletionPage).toContain("deleted immediately");
    expect(deletionControl).toContain("self-service deletion, not a request for approval");
    expect(deletionControl).toContain("Permanently delete my account");
  });

  it("uses accessible, nonjudgmental billing disclosures without blocking export", () => {
    const subscription = readFileSync(
      resolve(process.cwd(), "src/components/billing/SubscriptionPanel.tsx"),
      "utf8"
    );
    const billingConfig = readFileSync(
      resolve(process.cwd(), "src/lib/billing/config.ts"),
      "utf8"
    );
    const billingPolicyCopy = [
      subscription,
      readFileSync(resolve(process.cwd(), "src/app/contact/page.tsx"), "utf8"),
      readFileSync(resolve(process.cwd(), "src/app/terms/page.tsx"), "utf8"),
      readFileSync(resolve(process.cwd(), "src/app/privacy/page.tsx"), "utf8"),
    ].join("\n");
    expect(subscription).toContain("Your no-card trial is active");
    expect(subscription).toContain("Export-only access");
    expect(subscription).toContain("Cancellation never prevents record export");
    expect(billingPolicyCopy).not.toMatch(/hardship fee waiver|fee-waiver request/i);
    expect(subscription).toContain('aria-label="Subscription prices"');
    expect(subscription).toContain('aria-live="polite"');
    expect(billingConfig).toContain('display: "$59.99/year"');
    expect(subscription).toContain("16.5% less");
  });

  it("distinguishes email ownership confirmation from authenticator MFA", () => {
    const recordsApp = readFileSync(
      resolve(process.cwd(), "src/components/records/RecordsApp.tsx"),
      "utf8"
    );
    expect(recordsApp).toContain("Email confirmation proves you control the account address");
    expect(recordsApp).toContain("separate second factor");
  });

  it("uses the requested attorney access history wording", () => {
    const attorneyAccess = readFileSync(
      resolve(process.cwd(), "src/components/records/AttorneyAccessPanel.tsx"),
      "utf8"
    );
    expect(attorneyAccess).toContain("Privacy safe access history");
    expect(attorneyAccess).not.toContain("Privacy-safe access history");
    expect(attorneyAccess).toContain("How to give an attorney access");
    expect(attorneyAccess).toContain("Send the one private link yourself");
    expect(attorneyAccess).toContain("Review or revoke access here at any time");
    expect(attorneyAccess).toContain("I authorize Custody Folio to share this selected case");
    expect(attorneyAccess).toContain("Consumer Health Data Privacy Policy");
  });

  it("tells invited attorneys that the private invitation is a single-link flow", () => {
    const attorneyAccept = readFileSync(
      resolve(process.cwd(), "src/components/records/AttorneyAccept.tsx"),
      "utf8"
    );
    expect(attorneyAccept).toContain("This private invitation is bound to the attorney email");
    expect(attorneyAccept).toContain("mailbox through a separate secure email");
    expect(attorneyAccept).toContain("Email secure account link");
    expect(attorneyAccept).toContain("Before you begin");
    expect(attorneyAccept).toContain("Use the exact email address the client invited");
    expect(attorneyAccept).toContain("Set up your authenticator");
    expect(attorneyAccept).not.toContain("Check Inbox and Junk");
  });

  it("keeps recurring exchange setup out of the primary exchange logging flow", () => {
    const recordsApp = readFileSync(
      resolve(process.cwd(), "src/components/records/RecordsApp.tsx"),
      "utf8"
    );
    const exchangeView = recordsApp.slice(
      recordsApp.indexOf("function ExchangesView"),
      recordsApp.indexOf("function NotesView")
    );
    const calendarView = recordsApp.slice(
      recordsApp.indexOf("function CalendarView"),
      recordsApp.indexOf("function TimelineView")
    );

    expect(exchangeView).toContain('title="Log exchange outcome"');
    expect(exchangeView).toContain('label="Scheduled exchange (optional)"');
    expect(exchangeView).toContain("Manage recurring exchange schedule");
    expect(exchangeView).not.toContain('id="exchange-rule-form"');
    expect(calendarView).toContain("Recurring exchange schedule (optional)");
    expect(calendarView).toContain("<ExchangeScheduleManager");
  });
});
