create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create table public.custody_folio_billing_accounts (
  id uuid primary key,
  user_id uuid unique,
  deleted_user_hash text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.custody_folio_trials (
  billing_account_id uuid primary key
    references public.custody_folio_billing_accounts(id),
  started_at timestamptz not null,
  ends_at timestamptz not null
);

create table public.custody_folio_provider_subscriptions (
  id uuid primary key,
  billing_account_id uuid not null
    references public.custody_folio_billing_accounts(id),
  environment text not null,
  status text not null,
  plan_interval text not null,
  created_at timestamptz not null
);

create table public.custody_folio_entitlements (
  billing_account_id uuid primary key
    references public.custody_folio_billing_accounts(id),
  environment text not null,
  mode text not null,
  source text not null,
  effective_until timestamptz,
  grace_period_ends_at timestamptz,
  computed_at timestamptz not null default now(),
  last_verified_at timestamptz,
  version bigint not null default 1
);

create table public.custody_folio_billing_audit_events (
  id bigint generated always as identity primary key,
  billing_account_id uuid,
  event_type text not null,
  actor_type text not null,
  result text not null,
  reason_code text,
  created_at timestamptz not null default now()
);

create table public.custody_folio_growth_events (
  id bigint generated always as identity primary key,
  event_name text not null,
  occurred_at timestamptz not null,
  source text,
  content_code text,
  cohort_identifier text not null,
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
  )
);

create table public.custody_folio_customer_value_responses (
  id uuid primary key,
  user_id uuid not null,
  score integer not null,
  responded_at timestamptz not null
);

revoke all on all tables in schema public from public, anon, authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
