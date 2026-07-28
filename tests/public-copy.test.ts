import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const customerFacingFiles = [
  "src/app/privacy/page.tsx",
  "src/app/terms/page.tsx",
  "src/app/security/page.tsx",
  "src/app/accessibility/page.tsx",
  "src/app/ai-data-use/page.tsx",
  "src/app/subprocessors/page.tsx",
  "src/app/contact/page.tsx",
  "src/app/account/delete/page.tsx",
  "src/app/account/delete/AccountDeletionRequest.tsx",
  "src/components/records/AttorneyAccessPanel.tsx",
  "src/components/records/AttorneyPortal.tsx",
  "src/components/records/ExhibitBuilder.tsx",
  "ios/LostToFound/LostToFound/NativePolicyView.swift",
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
