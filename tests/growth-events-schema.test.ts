import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260831120000_add_growth_events_and_feedback_consents.sql",
    import.meta.url
  ),
  "utf8"
);
const growthTable = migration.split(
  "create table public.custody_folio_customer_feedback_consents"
)[0];

describe("growth event storage", () => {
  it("contains only constrained aggregate fields", () => {
    expect(growthTable).toContain("cohort_identifier text not null");
    expect(growthTable).toContain("cohort_identifier ~ '^[a-f0-9]{32}$'");
    expect(growthTable).toContain("expires_at timestamptz not null");
    expect(growthTable).toContain("interval '180 days'");
    expect(growthTable).not.toMatch(/\bemail\s+text\b/i);
    expect(growthTable).not.toMatch(/\buser_id\b/i);
    expect(growthTable).not.toMatch(/\bcase_id\b/i);
    expect(growthTable).not.toMatch(/\brecord_title\b/i);
  });

  it("uses a fixed event taxonomy and server only access", () => {
    expect(growthTable).toContain("'marketing_page_viewed'");
    expect(growthTable).toContain("'customer_first_record_saved'");
    expect(growthTable).toContain("'customer_subscription_started'");
    expect(growthTable).toContain(
      "alter table public.custody_folio_growth_events force row level security"
    );
    expect(growthTable).toContain(
      "revoke all on public.custody_folio_growth_events from public, anon, authenticated"
    );
    expect(growthTable).toContain(
      "grant all on public.custody_folio_growth_events to service_role"
    );
    expect(growthTable).toContain("security invoker");
    expect(growthTable).not.toContain("security definer");
  });
});
