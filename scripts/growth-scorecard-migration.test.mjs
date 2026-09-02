import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath =
  "../supabase/migrations/20260902073022_add_aggregate_growth_scorecard.sql";

async function migrationSource() {
  return readFile(new URL(migrationPath, import.meta.url), "utf8");
}

test("migration uses an invoker function with an empty search path", async () => {
  const source = await migrationSource();
  assert.match(
    source,
    /create or replace function public\.custody_folio_growth_scorecard_v1\(/
  );
  assert.match(source, /\nsecurity invoker\nset search_path = ''\n/);
  assert.doesNotMatch(source, /security definer/i);
});

test("migration grants only the exact service role function signature", async () => {
  const source = await migrationSource();
  const signature =
    "public.custody_folio_growth_scorecard_v1(timestamptz, timestamptz, uuid[], text[])";
  assert.equal(
    source.includes(
      "revoke execute on function "
        + signature
        + " from public, anon, authenticated;"
    ),
    true
  );
  assert.equal(
    source.includes(
      "grant execute on function " + signature + " to service_role;"
    ),
    true
  );
});

test("database result contains aggregate fields and no identifier fields", async () => {
  const source = await migrationSource();
  const resultStart = source.indexOf("select jsonb_build_object(");
  assert.notEqual(resultStart, -1);
  const resultSource = source.slice(resultStart);
  assert.doesNotMatch(
    resultSource,
    /'(user_id|billing_account_id|subscription_id|cohort_identifier)'/
  );
  assert.match(resultSource, /'minimum_reportable_group_size', 5/);
  assert.match(
    resultSource,
    /'satisfaction_source', 'persisted_production_responses'/
  );
});

test("report command uses only the aggregate RPC and no local response file", async () => {
  const source = await readFile(
    new URL("./report-growth-scorecard.mjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /\.rpc\(\s*"custody_folio_growth_scorecard_v1"/);
  assert.doesNotMatch(source, /\.from\(/);
  assert.doesNotMatch(
    source,
    /readFile|GROWTH_SATISFACTION_FILE|customer_value_responses\.csv/
  );
});
