insert into public.custody_folio_billing_accounts (id, user_id)
values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004'),
  ('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005'),
  ('10000000-0000-4000-8000-000000000099', '20000000-0000-4000-8000-000000000099');

insert into public.custody_folio_trials (billing_account_id, started_at, ends_at)
select
  id,
  '2026-09-01 12:00:00+00'::timestamptz,
  '2026-10-01 12:00:00+00'::timestamptz
from public.custody_folio_billing_accounts;

insert into public.custody_folio_provider_subscriptions (
  id,
  billing_account_id,
  environment,
  status,
  plan_interval,
  created_at
)
values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'live', 'active', 'month', '2026-09-01 13:00:00+00'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'live', 'active', 'month', '2026-09-01 13:00:00+00'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'live', 'active', 'month', '2026-09-01 13:00:00+00'),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'live', 'active', 'year', '2026-09-01 13:00:00+00'),
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'live', 'active', 'year', '2026-09-01 13:00:00+00'),
  ('30000000-0000-4000-8000-000000000099', '10000000-0000-4000-8000-000000000099', 'live', 'active', 'year', '2026-09-01 13:00:00+00');

with cohort(cohort_identifier) as (
  values
    ('11111111111111111111111111111111'),
    ('22222222222222222222222222222222'),
    ('33333333333333333333333333333333'),
    ('44444444444444444444444444444444'),
    ('55555555555555555555555555555555')
), event(event_name, minute_offset) as (
  values
    ('marketing_page_viewed', 0),
    ('marketing_signup_selected', 1),
    ('account_signup_requested', 2),
    ('account_signup_confirmed', 3),
    ('customer_first_matter_created', 4),
    ('customer_first_record_saved', 5),
    ('customer_first_timeline_viewed', 6),
    ('customer_feedback_prompt_viewed', 7),
    ('customer_subscription_started', 8)
)
insert into public.custody_folio_growth_events (
  event_name,
  occurred_at,
  source,
  content_code,
  cohort_identifier
)
select
  event.event_name,
  '2026-09-01 12:00:00+00'::timestamptz
    + make_interval(mins => event.minute_offset),
  'checklist',
  'factual_checklist',
  cohort.cohort_identifier
from cohort
cross join event;

insert into public.custody_folio_growth_events (
  event_name,
  occurred_at,
  source,
  content_code,
  cohort_identifier
)
select
  'customer_feedback_opted_in',
  '2026-09-01 12:09:00+00'::timestamptz,
  'checklist',
  'factual_checklist',
  cohort_identifier
from (
  values
    ('11111111111111111111111111111111'),
    ('22222222222222222222222222222222'),
    ('33333333333333333333333333333333'),
    ('44444444444444444444444444444444')
) as opted_in(cohort_identifier);

insert into public.custody_folio_growth_events (
  event_name,
  occurred_at,
  source,
  content_code,
  cohort_identifier
)
values
  ('marketing_page_viewed', '2026-09-01 12:00:00+00', 'community', 'homepage', '66666666666666666666666666666666'),
  ('marketing_signup_selected', '2026-09-01 12:01:00+00', 'community', 'homepage', '66666666666666666666666666666666');

with event(event_name, minute_offset) as (
  values
    ('marketing_page_viewed', 0),
    ('marketing_signup_selected', 1),
    ('account_signup_confirmed', 2),
    ('customer_first_matter_created', 3),
    ('customer_first_record_saved', 4),
    ('customer_first_report_created', 5),
    ('customer_feedback_prompt_viewed', 6),
    ('customer_feedback_opted_in', 7),
    ('customer_subscription_started', 8)
)
insert into public.custody_folio_growth_events (
  event_name,
  occurred_at,
  source,
  content_code,
  cohort_identifier
)
select
  event.event_name,
  '2026-09-01 12:00:00+00'::timestamptz
    + make_interval(mins => event.minute_offset),
  'email',
  'homepage',
  '99999999999999999999999999999999'
from event;

insert into public.custody_folio_customer_value_responses (
  id,
  user_id,
  score,
  responded_at
)
values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 5, '2026-09-01 14:00:00+00'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 5, '2026-09-01 14:00:00+00'),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 4, '2026-09-01 14:00:00+00'),
  ('40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 4, '2026-09-01 14:00:00+00'),
  ('40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 3, '2026-09-01 14:00:00+00'),
  ('40000000-0000-4000-8000-000000000099', '20000000-0000-4000-8000-000000000099', 5, '2026-09-01 14:00:00+00');
