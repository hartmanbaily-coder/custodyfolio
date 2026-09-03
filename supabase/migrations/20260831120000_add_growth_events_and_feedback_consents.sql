create table public.custody_folio_growth_events (
  id bigint generated always as identity primary key,
  event_name text not null,
  occurred_at timestamptz not null default now(),
  platform text not null,
  source text,
  medium text,
  campaign text,
  content_code text,
  plan_interval text,
  first_time boolean not null default false,
  success boolean not null default true,
  failure_code text,
  cohort_identifier text not null,
  dedupe_key text,
  expires_at timestamptz not null default (now() + interval '180 days'),
  constraint custody_folio_growth_events_event_name_check check (
    event_name in (
      'marketing_page_viewed',
      'marketing_signup_selected',
      'account_signup_requested',
      'account_signup_confirmed',
      'customer_first_matter_created',
      'customer_first_record_saved',
      'customer_first_timeline_viewed',
      'customer_first_report_created',
      'customer_feedback_prompt_viewed',
      'customer_feedback_opted_in',
      'customer_subscription_started',
      'customer_subscription_cancelled',
      'customer_refund_requested'
    )
  ),
  constraint custody_folio_growth_events_platform_check
    check (platform in ('web', 'ios')),
  constraint custody_folio_growth_events_source_check check (
    source is null or source in (
      'direct',
      'app_store',
      'checklist',
      'community',
      'referral',
      'email',
      'apple_ads'
    )
  ),
  constraint custody_folio_growth_events_medium_check check (
    medium is null or medium in (
      'direct',
      'organic',
      'referral',
      'email',
      'cpc'
    )
  ),
  constraint custody_folio_growth_events_campaign_check check (
    campaign is null or campaign in (
      'launch',
      'checklist',
      'customer_referral',
      'apple_search',
      'founder_update',
      'customer_feedback'
    )
  ),
  constraint custody_folio_growth_events_content_code_check check (
    content_code is null or content_code in (
      'homepage',
      'header_desktop',
      'header_mobile',
      'hero',
      'quick_add_record',
      'quick_review_timeline',
      'quick_prepare_or_share',
      'pricing',
      'factual_checklist',
      'in_product_feedback',
      'subscription'
    )
  ),
  constraint custody_folio_growth_events_plan_interval_check
    check (plan_interval is null or plan_interval in ('month', 'year')),
  constraint custody_folio_growth_events_failure_code_check
    check (failure_code is null or failure_code ~ '^[a-z0-9_]{1,64}$'),
  constraint custody_folio_growth_events_cohort_identifier_check
    check (cohort_identifier ~ '^[a-f0-9]{32}$'),
  constraint custody_folio_growth_events_dedupe_key_check
    check (dedupe_key is null or dedupe_key ~ '^[a-f0-9]{64}$'),
  constraint custody_folio_growth_events_dedupe_key_unique unique (dedupe_key),
  constraint custody_folio_growth_events_expiry_check
    check (expires_at > occurred_at)
);

create index custody_folio_growth_events_occurred_at_idx
  on public.custody_folio_growth_events(occurred_at desc);

create index custody_folio_growth_events_name_occurred_at_idx
  on public.custody_folio_growth_events(event_name, occurred_at desc);

create index custody_folio_growth_events_cohort_idx
  on public.custody_folio_growth_events(cohort_identifier, occurred_at);

alter table public.custody_folio_growth_events enable row level security;
alter table public.custody_folio_growth_events force row level security;

revoke all on public.custody_folio_growth_events from public, anon, authenticated;
grant all on public.custody_folio_growth_events to service_role;

create function public.custody_folio_cleanup_expired_growth_events()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  delete from public.custody_folio_growth_events
  where expires_at <= now();
  return null;
end;
$$;

revoke all on function public.custody_folio_cleanup_expired_growth_events() from public;
grant execute on function public.custody_folio_cleanup_expired_growth_events() to service_role;

create trigger custody_folio_growth_events_cleanup_trigger
before insert on public.custody_folio_growth_events
for each statement execute function public.custody_folio_cleanup_expired_growth_events();

create table public.custody_folio_customer_feedback_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt_key text not null,
  status text not null,
  contact_limit smallint not null default 1,
  contact_count smallint not null default 0,
  contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custody_folio_customer_feedback_consents_prompt_key_check
    check (prompt_key = 'first_record_feedback_v1'),
  constraint custody_folio_customer_feedback_consents_status_check
    check (status in ('opted_in', 'declined')),
  constraint custody_folio_customer_feedback_consents_contact_limit_check
    check (contact_limit = 1),
  constraint custody_folio_customer_feedback_consents_contact_count_check
    check (contact_count between 0 and contact_limit),
  constraint custody_folio_customer_feedback_consents_contacted_at_check
    check (
      (contact_count = 0 and contacted_at is null) or
      (contact_count = 1 and contacted_at is not null)
    ),
  constraint custody_folio_customer_feedback_consents_user_prompt_key
    unique (user_id, prompt_key)
);

create index custody_folio_customer_feedback_consents_status_idx
  on public.custody_folio_customer_feedback_consents(status, created_at);

alter table public.custody_folio_customer_feedback_consents enable row level security;
alter table public.custody_folio_customer_feedback_consents force row level security;

revoke all on public.custody_folio_customer_feedback_consents from public, anon, authenticated;
grant all on public.custody_folio_customer_feedback_consents to service_role;

create function public.custody_folio_record_feedback_choice(
  p_user_id uuid,
  p_choice text,
  p_now timestamptz default now()
)
returns table(choice text, cohort_full boolean, opted_in_count integer)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing text;
  v_opted_in_count integer;
begin
  if p_user_id is null or p_choice not in ('opted_in', 'declined') then
    raise exception 'Invalid feedback choice.';
  end if;

  perform pg_advisory_xact_lock(1329810417);

  select consent.status
  into v_existing
  from public.custody_folio_customer_feedback_consents as consent
  where consent.user_id = p_user_id
    and consent.prompt_key = 'first_record_feedback_v1';

  select count(*)::integer
  into v_opted_in_count
  from public.custody_folio_customer_feedback_consents as consent
  where consent.prompt_key = 'first_record_feedback_v1'
    and consent.status = 'opted_in';

  if v_existing is not null then
    return query select v_existing, false, v_opted_in_count;
    return;
  end if;

  if p_choice = 'opted_in' and v_opted_in_count >= 10 then
    return query select 'cohort_full'::text, true, v_opted_in_count;
    return;
  end if;

  insert into public.custody_folio_customer_feedback_consents (
    user_id,
    prompt_key,
    status,
    contact_limit,
    contact_count,
    created_at,
    updated_at
  ) values (
    p_user_id,
    'first_record_feedback_v1',
    p_choice,
    1,
    0,
    p_now,
    p_now
  );

  if p_choice = 'opted_in' then
    v_opted_in_count := v_opted_in_count + 1;
  end if;

  return query select p_choice, false, v_opted_in_count;
end;
$$;

revoke all on function public.custody_folio_record_feedback_choice(uuid, text, timestamptz) from public;
grant execute on function public.custody_folio_record_feedback_choice(uuid, text, timestamptz) to service_role;
