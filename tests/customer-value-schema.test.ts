import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260831010827_add_customer_value_responses.sql",
    import.meta.url
  ),
  "utf8"
);

describe("customer value response storage", () => {
  it("stores only a constrained score and operational metadata", () => {
    expect(migration).toContain("check (score between 1 and 5)");
    expect(migration).toContain("unique (user_id, prompt_key)");
    expect(migration).not.toMatch(/\bcomment\b/i);
    expect(migration).not.toMatch(/\bemail\b/i);
    expect(migration).not.toMatch(/\bcase_id\b/i);
  });

  it("keeps the table behind the server access boundary", () => {
    expect(migration).toContain(
      "alter table public.custody_folio_customer_value_responses enable row level security"
    );
    expect(migration).toContain(
      "alter table public.custody_folio_customer_value_responses force row level security"
    );
    expect(migration).toContain(
      "revoke all on public.custody_folio_customer_value_responses from public, anon, authenticated"
    );
    expect(migration).toContain(
      "grant all on public.custody_folio_customer_value_responses to service_role"
    );
  });
});
