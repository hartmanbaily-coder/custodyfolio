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
  -f supabase/migrations/20260903064803_add_growth_kpi_cohort_integrity.sql \
  -f scripts/fixtures/growth-scorecard-data.sql \
  >/dev/null

if psql \
  -X \
  -v ON_ERROR_STOP=1 \
  -h "$socket_dir" \
  -d postgres \
  -c "set role anon; select public.custody_folio_growth_scorecard_v2('2026-09-01', '2026-09-30');" \
  >/dev/null 2>&1; then
  echo "anon unexpectedly executed the growth scorecard function" >&2
  exit 1
fi

if psql \
  -X \
  -v ON_ERROR_STOP=1 \
  -h "$socket_dir" \
  -d postgres \
  -c "set role authenticated; select public.custody_folio_growth_scorecard_v2('2026-09-01', '2026-09-30');" \
  >/dev/null 2>&1; then
  echo "authenticated unexpectedly executed the growth scorecard function" >&2
  exit 1
fi

scorecard_json="$(psql \
  -X \
  -v ON_ERROR_STOP=1 \
  -h "$socket_dir" \
  -d postgres \
  -Atqc "set role service_role; select public.custody_folio_growth_scorecard_v2('2026-09-01', '2026-09-30', array['20000000-0000-4000-8000-000000000099']::uuid[], array['99999999999999999999999999999999']::text[]);")"

node - "$scorecard_json" <<'NODE'
import assert from "node:assert/strict";
import { validateGrowthScorecard } from "./scripts/growth-scorecard-lib.mjs";

const raw = process.argv[2];
const report = validateGrowthScorecard(JSON.parse(raw));

assert.equal(report.acquisition.tracked_visits, 6);
assert.equal(report.acquisition.signup_selections, 6);
assert.equal(report.acquisition.confirmed_signups, 5);
assert.equal(report.acquisition.qualified_trials, 5);
assert.equal(report.acquisition.mapped_qualified_trials, 5);
assert.equal(report.acquisition.unmapped_qualified_trials, 0);
assert.equal(report.acquisition.trial_mapping_coverage_percent, 100);
assert.equal(report.acquisition.source_conclusions_available, true);
assert.equal(report.activation.mapped_meaningfully_activated_trial_accounts, 5);
assert.equal(report.activation.meaningful_activation_rate_percent, 100);
assert.equal(report.activation.median_minutes_from_trial_start_to_first_record, 5);
assert.equal(report.engagement.mapped_feedback_prompt_trial_accounts, 5);
assert.equal(report.engagement.mapped_feedback_opt_in_trial_accounts, 4);
assert.equal(report.engagement.mapped_customer_value_prompt_trial_accounts, 5);
assert.equal(report.satisfaction.campaign_trial_responses, 5);
assert.equal(report.satisfaction.positive_campaign_trial_responses, 4);
assert.equal(report.satisfaction.customer_value_satisfaction_among_respondents_percent, 80);
assert.equal(report.satisfaction.responses_with_tracked_prompt, 5);
assert.equal(report.satisfaction.response_coverage_percent, 100);
assert.equal(report.conversion.new_active_paid_subscribers, 5);
assert.equal(report.conversion.monthly_subscribers, 3);
assert.equal(report.conversion.annual_subscribers, 2);
assert.equal(report.conversion.campaign_trial_active_paid_subscribers, 5);
assert.equal(report.conversion.mapped_subscription_start_event_accounts, 5);

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

psql \
  -X \
  -v ON_ERROR_STOP=1 \
  -h "$socket_dir" \
  -d postgres \
  -c "set role service_role; update public.custody_folio_billing_accounts set growth_cohort_identifier = null where id = '10000000-0000-4000-8000-000000000005';" \
  >/dev/null

incomplete_json="$(psql \
  -X \
  -v ON_ERROR_STOP=1 \
  -h "$socket_dir" \
  -d postgres \
  -Atqc "set role service_role; select public.custody_folio_growth_scorecard_v2('2026-09-01', '2026-09-30', array['20000000-0000-4000-8000-000000000099']::uuid[], array['99999999999999999999999999999999']::text[]);")"

node - "$incomplete_json" <<'NODE'
import assert from "node:assert/strict";
import { validateGrowthScorecard } from "./scripts/growth-scorecard-lib.mjs";

const report = validateGrowthScorecard(JSON.parse(process.argv[2]));
assert.equal(report.acquisition.qualified_trials, 5);
assert.equal(report.acquisition.mapped_qualified_trials, 4);
assert.equal(report.acquisition.unmapped_qualified_trials, 1);
assert.equal(report.acquisition.trial_mapping_coverage_percent, 80);
assert.equal(report.acquisition.source_conclusions_available, false);
assert.equal(report.activation.meaningful_activation_rate_percent, null);
assert.deepEqual(report.acquisition.qualified_trials_by_source, []);
assert.deepEqual(report.activation.activated_trials_by_content, []);
assert.deepEqual(report.conversion.active_paid_campaign_trials_by_source, []);
NODE

psql \
  -X \
  -v ON_ERROR_STOP=1 \
  -h "$socket_dir" \
  -d postgres \
  -c "set role service_role; select public.custody_folio_capture_billing_growth_cohort('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', '55555555555555555555555555555555');" \
  -c "set role service_role; select public.custody_folio_capture_billing_growth_cohort('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');" \
  -c "set role service_role; select public.custody_folio_capture_billing_growth_cohort('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'invalid');" \
  >/dev/null

capture_values="$(psql \
  -X \
  -v ON_ERROR_STOP=1 \
  -h "$socket_dir" \
  -d postgres \
  -Atqc "set role service_role; select public.custody_folio_capture_billing_growth_cohort('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', '55555555555555555555555555555555'), public.custody_folio_capture_billing_growth_cohort('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), public.custody_folio_capture_billing_growth_cohort('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'invalid');")"

if [[ "$capture_values" != "t|f|f" ]]; then
  echo "billing growth cohort capture did not preserve write once behavior" >&2
  exit 1
fi

if psql \
  -X \
  -v ON_ERROR_STOP=1 \
  -h "$socket_dir" \
  -d postgres \
  -c "set role authenticated; select public.custody_folio_capture_billing_growth_cohort('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', '55555555555555555555555555555555');" \
  >/dev/null 2>&1; then
  echo "authenticated unexpectedly captured a billing growth cohort" >&2
  exit 1
fi

redaction_values="$(psql \
  -X \
  -v ON_ERROR_STOP=1 \
  -h "$socket_dir" \
  -d postgres \
  -Atqc "set role service_role; select public.custody_folio_redact_billing_account('20000000-0000-4000-8000-000000000005', repeat('f', 64)); select (user_id is null and growth_cohort_identifier is null) from public.custody_folio_billing_accounts where id = '10000000-0000-4000-8000-000000000005';")"

if [[ "$redaction_values" != $'t\nt' ]]; then
  echo "billing redaction did not clear the protected cohort" >&2
  exit 1
fi

echo "growth scorecard SQL integration test passed"
