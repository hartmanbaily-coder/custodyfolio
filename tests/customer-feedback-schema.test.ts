import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260831120000_add_growth_events_and_feedback_consents.sql",
    import.meta.url
  ),
  "utf8"
);
const consentStorage = migration.split(
  "create table public.custody_folio_customer_feedback_consents"
)[1];

describe("customer feedback consent storage", () => {
  it("records a limited choice without storing contact content", () => {
    expect(consentStorage).toContain("status in ('opted_in', 'declined')");
    expect(consentStorage).toContain("check (contact_limit = 1)");
    expect(consentStorage).toContain("unique (user_id, prompt_key)");
    expect(consentStorage).not.toMatch(/\bemail\b/i);
    expect(consentStorage).not.toMatch(/\bmessage_body\b/i);
    expect(consentStorage).not.toMatch(/\bcase_id\b/i);
  });

  it("caps the cohort atomically at ten", () => {
    expect(consentStorage).toContain("pg_advisory_xact_lock");
    expect(consentStorage).toContain("v_opted_in_count >= 10");
    expect(consentStorage).toContain("return query select 'cohort_full'::text");
  });

  it("keeps choices behind the server access boundary", () => {
    expect(consentStorage).toContain(
      "alter table public.custody_folio_customer_feedback_consents force row level security"
    );
    expect(consentStorage).toContain(
      "revoke all on public.custody_folio_customer_feedback_consents from public, anon, authenticated"
    );
    expect(consentStorage).toContain(
      "grant all on public.custody_folio_customer_feedback_consents to service_role"
    );
    expect(consentStorage).toContain("security invoker");
    expect(consentStorage).not.toContain("security definer");
  });
});
