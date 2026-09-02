#!/usr/bin/env bash

set -euo pipefail

test_root="$(mktemp -d /private/tmp/custodyfolio-growth-scorecard-test.XXXXXX)"
database_dir="$test_root/database"
socket_dir="$test_root/socket"
mkdir -p "$socket_dir"

cleanup() {
  if pg_ctl -D "$database_dir" status >/dev/null 2>&1; then
    pg_ctl -D "$database_dir" -m immediate stop >/dev/null
  fi

  case "$test_root" in
    /private/tmp/custodyfolio-growth-scorecard-test.*)
      rm -rf -- "$test_root"
      ;;
  esac
}

trap cleanup EXIT

initdb \
  -D "$database_dir" \
  --auth-local=trust \
  --auth-host=reject \
  --encoding=UTF8 \
  --no-locale \
  >/dev/null

pg_ctl \
  -D "$database_dir" \
  -o "-F -h '' -k $socket_dir" \
  -w start \
  >/dev/null

psql \
  -X \
  -v ON_ERROR_STOP=1 \
  -h "$socket_dir" \
  -d postgres \
  -f scripts/fixtures/growth-scorecard-schema.sql \
  -f supabase/migrations/20260902073022_add_aggregate_growth_scorecard.sql \
  -f scripts/fixtures/growth-scorecard-data.sql \
  >/dev/null

if psql \
  -X \
  -v ON_ERROR_STOP=1 \
  -h "$socket_dir" \
  -d postgres \
  -c "set role anon; select public.custody_folio_growth_scorecard_v1('2026-09-01', '2026-09-30');" \
  >/dev/null 2>&1; then
  echo "anon unexpectedly executed the growth scorecard function" >&2
  exit 1
fi

if psql \
  -X \
  -v ON_ERROR_STOP=1 \
  -h "$socket_dir" \
  -d postgres \
  -c "set role authenticated; select public.custody_folio_growth_scorecard_v1('2026-09-01', '2026-09-30');" \
  >/dev/null 2>&1; then
  echo "authenticated unexpectedly executed the growth scorecard function" >&2
  exit 1
fi

scorecard_json="$(psql \
  -X \
  -v ON_ERROR_STOP=1 \
  -h "$socket_dir" \
  -d postgres \
  -Atqc "set role service_role; select public.custody_folio_growth_scorecard_v1('2026-09-01', '2026-09-30', array['20000000-0000-4000-8000-000000000099']::uuid[], array['99999999999999999999999999999999']::text[]);")"

node - "$scorecard_json" <<'NODE'
import assert from "node:assert/strict";
import { validateGrowthScorecard } from "./scripts/growth-scorecard-lib.mjs";

const raw = process.argv[2];
const report = validateGrowthScorecard(JSON.parse(raw));

assert.equal(report.acquisition.qualified_visits, 6);
assert.equal(report.acquisition.signup_selections, 6);
assert.equal(report.acquisition.completed_signups, 5);
assert.equal(report.acquisition.qualified_trials, 5);
assert.equal(report.activation.meaningfully_activated_accounts, 5);
assert.equal(report.activation.median_minutes_to_first_record, 2);
assert.equal(report.engagement.feedback_prompt_accounts, 5);
assert.equal(report.engagement.feedback_opt_in_accounts, 4);
assert.equal(report.satisfaction.responses, 5);
assert.equal(report.satisfaction.positive_responses, 4);
assert.equal(report.satisfaction.customer_value_satisfaction_percent, 80);
assert.equal(report.conversion.paid_subscribers, 5);
assert.equal(report.conversion.monthly_subscribers, 3);
assert.equal(report.conversion.annual_subscribers, 2);
assert.equal(report.conversion.subscription_start_accounts, 5);

const checklist = report.acquisition.visits_by_source.find(
  (group) => group.source === "checklist"
);
const community = report.acquisition.visits_by_source.find(
  (group) => group.source === "community"
);

assert.deepEqual(checklist, {
  source: "checklist",
  count: 5,
  suppressed: false,
});
assert.deepEqual(community, {
  source: "community",
  count: null,
  suppressed: true,
});
assert.equal(raw.includes("20000000-0000-4000-8000-000000000099"), false);
assert.equal(raw.includes("99999999999999999999999999999999"), false);
NODE

echo "growth scorecard SQL integration test passed"
