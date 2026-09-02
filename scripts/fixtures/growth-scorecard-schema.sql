create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create table public.custody_folio_billing_accounts (
  id uuid primary key,
  user_id uuid unique
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

create table public.custody_folio_growth_events (
  id bigint generated always as identity primary key,
  event_name text not null,
  occurred_at timestamptz not null,
  source text,
  content_code text,
  cohort_identifier text not null
);

create table public.custody_folio_customer_value_responses (
  id uuid primary key,
  user_id uuid not null,
  score integer not null,
  responded_at timestamptz not null
);

revoke all on all tables in schema public from public, anon, authenticated;
grant select on all tables in schema public to service_role;
