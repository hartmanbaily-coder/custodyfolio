-- Custody Folio billing identities, provider state, and effective access.
--
-- This migration intentionally stores no card details, case content, domestic
-- violence narratives, or other evidence. Browser roles receive no access;
-- all reads and writes are mediated by the authenticated Next.js server with
-- the Supabase service role.

create table public.custody_folio_billing_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  apple_app_account_token uuid not null unique default gen_random_uuid(),
  deleted_user_hash text unique
    check (deleted_user_hash is null or char_length(deleted_user_hash) = 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (user_id is not null or deleted_user_hash is not null)
);

create table public.custody_folio_trials (
  billing_account_id uuid primary key
    references public.custody_folio_billing_accounts(id) on delete cascade,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > started_at),
  check (ends_at <= started_at + interval '30 days')
);

create table public.custody_folio_provider_customers (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null
    references public.custody_folio_billing_accounts(id) on delete cascade,
  provider text not null check (provider in ('stripe')),
  environment text not null check (environment in ('test', 'live')),
  provider_customer_id text not null check (char_length(provider_customer_id) between 3 and 255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_verified_at timestamptz,
  unique (billing_account_id, provider, environment),
  unique (provider, environment, provider_customer_id)
);

create table public.custody_folio_provider_subscriptions (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null
    references public.custody_folio_billing_accounts(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'apple')),
  environment text not null check (environment in ('test', 'live')),
  provider_subscription_id text not null
    check (char_length(provider_subscription_id) between 3 and 255),
  original_transaction_id text,
  provider_customer_id text,
  product_id text not null check (char_length(product_id) between 1 and 255),
  plan_interval text not null check (plan_interval in ('month', 'year')),
  status text not null check (
    status in (
      'incomplete',
      'active',
      'past_due',
      'grace_period',
      'billing_retry',
      'paused',
      'canceled',
      'expired',
      'revoked',
      'refunded',
      'provider_conflict'
    )
  ),
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_period_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  revoked_at timestamptz,
  last_provider_event_id text,
  last_provider_occurred_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (original_transaction_id is null or char_length(original_transaction_id) between 1 and 255),
  check (provider_customer_id is null or char_length(provider_customer_id) between 3 and 255),
  unique (provider, environment, provider_subscription_id)
);

-- A billing account may never have simultaneous current subscriptions across
-- providers. Application checks prevent the purchase; this constraint is the
-- final race-condition guard.
create unique index custody_folio_one_current_provider_idx
  on public.custody_folio_provider_subscriptions(billing_account_id, environment)
  where status in ('active', 'past_due', 'grace_period', 'billing_retry');

create unique index custody_folio_apple_original_transaction_idx
  on public.custody_folio_provider_subscriptions(environment, original_transaction_id)
  where provider = 'apple' and original_transaction_id is not null;

create index custody_folio_subscriptions_account_updated_idx
  on public.custody_folio_provider_subscriptions(billing_account_id, updated_at desc);

create table public.custody_folio_waiver_grants (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null
    references public.custody_folio_billing_accounts(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  reason_category text not null check (
    reason_category in ('hardship', 'domestic_violence', 'other_hardship')
  ),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  granted_by_hash text not null check (char_length(granted_by_hash) = 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_hash text check (
    revoked_by_hash is null or char_length(revoked_by_hash) = 64
  ),
  revocation_reason_code text check (
    revocation_reason_code is null or revocation_reason_code in (
      'support_decision', 'account_request', 'grant_replaced',
      'administrative_correction'
    )
  ),
  check (ends_at > starts_at),
  check (ends_at <= starts_at + interval '1 year')
);

create unique index custody_folio_one_active_waiver_idx
  on public.custody_folio_waiver_grants(billing_account_id)
  where status = 'active';

create index custody_folio_waivers_renewal_idx
  on public.custody_folio_waiver_grants(ends_at)
  where status = 'active';

create table public.custody_folio_provider_events (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('stripe', 'apple')),
  environment text not null check (environment in ('test', 'live')),
  provider_event_id text not null check (char_length(provider_event_id) between 3 and 255),
  billing_account_id uuid
    references public.custody_folio_billing_accounts(id) on delete set null,
  event_type text not null check (char_length(event_type) between 1 and 180),
  payload_sha256 text not null check (char_length(payload_sha256) = 64),
  provider_occurred_at timestamptz,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'ignored', 'failed', 'conflict')),
  processing_code text check (
    processing_code is null or char_length(processing_code) between 1 and 120
  ),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, environment, provider_event_id)
);

create index custody_folio_provider_events_account_received_idx
  on public.custody_folio_provider_events(billing_account_id, received_at desc);

create table public.custody_folio_entitlements (
  billing_account_id uuid primary key
    references public.custody_folio_billing_accounts(id) on delete cascade,
  environment text not null check (environment in ('test', 'live')),
  mode text not null check (
    mode in ('trial', 'active', 'grace_period', 'waiver', 'export_only')
  ),
  source text not null check (
    source in ('trial', 'stripe', 'apple', 'waiver', 'none')
  ),
  effective_until timestamptz,
  grace_period_ends_at timestamptz,
  computed_at timestamptz not null default now(),
  last_verified_at timestamptz,
  version bigint not null default 1
);

create table public.custody_folio_reconciliation_runs (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('stripe', 'apple')),
  environment text not null check (environment in ('test', 'live')),
  billing_account_id uuid
    references public.custody_folio_billing_accounts(id) on delete set null,
  status text not null check (status in ('started', 'succeeded', 'failed')),
  result_code text check (result_code is null or char_length(result_code) between 1 and 120),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.custody_folio_billing_audit_events (
  id bigint generated always as identity primary key,
  billing_account_id uuid
    references public.custody_folio_billing_accounts(id) on delete set null,
  event_type text not null check (char_length(event_type) between 1 and 120),
  actor_type text not null check (actor_type in ('account', 'support', 'provider', 'system')),
  result text not null check (result in ('success', 'denied', 'failed', 'conflict')),
  reason_code text check (reason_code is null or char_length(reason_code) between 1 and 120),
  created_at timestamptz not null default now()
);

create index custody_folio_billing_audit_account_created_idx
  on public.custody_folio_billing_audit_events(billing_account_id, created_at desc);

alter table public.custody_folio_billing_accounts enable row level security;
alter table public.custody_folio_trials enable row level security;
alter table public.custody_folio_provider_customers enable row level security;
alter table public.custody_folio_provider_subscriptions enable row level security;
alter table public.custody_folio_waiver_grants enable row level security;
alter table public.custody_folio_provider_events enable row level security;
alter table public.custody_folio_entitlements enable row level security;
alter table public.custody_folio_reconciliation_runs enable row level security;
alter table public.custody_folio_billing_audit_events enable row level security;

alter table public.custody_folio_billing_accounts force row level security;
alter table public.custody_folio_trials force row level security;
alter table public.custody_folio_provider_customers force row level security;
alter table public.custody_folio_provider_subscriptions force row level security;
alter table public.custody_folio_waiver_grants force row level security;
alter table public.custody_folio_provider_events force row level security;
alter table public.custody_folio_entitlements force row level security;
alter table public.custody_folio_reconciliation_runs force row level security;
alter table public.custody_folio_billing_audit_events force row level security;

revoke all on
  public.custody_folio_billing_accounts,
  public.custody_folio_trials,
  public.custody_folio_provider_customers,
  public.custody_folio_provider_subscriptions,
  public.custody_folio_waiver_grants,
  public.custody_folio_provider_events,
  public.custody_folio_entitlements,
  public.custody_folio_reconciliation_runs,
  public.custody_folio_billing_audit_events
from public, anon, authenticated;

revoke all on sequence
  public.custody_folio_provider_events_id_seq,
  public.custody_folio_reconciliation_runs_id_seq,
  public.custody_folio_billing_audit_events_id_seq
from public, anon, authenticated;

grant select, insert, update, delete on
  public.custody_folio_billing_accounts,
  public.custody_folio_trials,
  public.custody_folio_provider_customers,
  public.custody_folio_provider_subscriptions,
  public.custody_folio_waiver_grants,
  public.custody_folio_provider_events,
  public.custody_folio_entitlements,
  public.custody_folio_reconciliation_runs,
  public.custody_folio_billing_audit_events
to service_role;

grant usage, select on sequence
  public.custody_folio_provider_events_id_seq,
  public.custody_folio_reconciliation_runs_id_seq,
  public.custody_folio_billing_audit_events_id_seq
to service_role;

create or replace function public.custody_folio_ensure_billing_account(
  p_user_id uuid,
  p_now timestamptz default now()
)
returns table (
  billing_account_id uuid,
  apple_app_account_token uuid,
  trial_started_at timestamptz,
  trial_ends_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  account_row public.custody_folio_billing_accounts%rowtype;
  trial_row public.custody_folio_trials%rowtype;
begin
  if p_user_id is null then
    raise exception 'billing_user_required';
  end if;

  insert into public.custody_folio_billing_accounts (user_id, created_at, updated_at)
  values (p_user_id, p_now, p_now)
  on conflict (user_id) do update
    set updated_at = greatest(public.custody_folio_billing_accounts.updated_at, excluded.updated_at)
  returning * into account_row;

  insert into public.custody_folio_trials (
    billing_account_id,
    started_at,
    ends_at,
    created_at
  ) values (
    account_row.id,
    p_now,
    p_now + interval '30 days',
    p_now
  )
  on conflict on constraint custody_folio_trials_pkey do nothing;

  select * into trial_row
  from public.custody_folio_trials t
  where t.billing_account_id = account_row.id;

  return query select account_row.id, account_row.apple_app_account_token,
    trial_row.started_at, trial_row.ends_at;
end;
$$;

create or replace function public.custody_folio_refresh_entitlement(
  p_billing_account_id uuid,
  p_environment text,
  p_now timestamptz default now()
)
returns table (
  mode text,
  source text,
  effective_until timestamptz,
  grace_period_ends_at timestamptz,
  computed_at timestamptz,
  last_verified_at timestamptz,
  version bigint
)
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  next_mode text := 'export_only';
  next_source text := 'none';
  next_effective_until timestamptz;
  next_grace_end timestamptz;
  next_verified_at timestamptz;
  waiver_row public.custody_folio_waiver_grants%rowtype;
  subscription_row public.custody_folio_provider_subscriptions%rowtype;
  trial_row public.custody_folio_trials%rowtype;
  entitlement_row public.custody_folio_entitlements%rowtype;
begin
  if p_environment not in ('test', 'live') then
    raise exception 'invalid_billing_environment';
  end if;

  perform 1 from public.custody_folio_billing_accounts a
  where a.id = p_billing_account_id
  for update;
  if not found then
    raise exception 'billing_account_not_found';
  end if;

  update public.custody_folio_waiver_grants w
  set status = 'expired', updated_at = p_now
  where w.billing_account_id = p_billing_account_id
    and w.status = 'active'
    and w.ends_at <= p_now;

  select * into waiver_row
  from public.custody_folio_waiver_grants w
  where w.billing_account_id = p_billing_account_id
    and w.status = 'active'
    and w.starts_at <= p_now
    and w.ends_at > p_now
  order by w.ends_at desc
  limit 1;

  if found then
    next_mode := 'waiver';
    next_source := 'waiver';
    next_effective_until := waiver_row.ends_at;
    next_verified_at := waiver_row.updated_at;
  else
    select * into subscription_row
    from public.custody_folio_provider_subscriptions s
    where s.billing_account_id = p_billing_account_id
      and s.environment = p_environment
      and (
        (s.status = 'active' and (s.current_period_end is null or s.current_period_end > p_now))
        or (
          s.status in ('past_due', 'grace_period', 'billing_retry')
          and s.grace_period_ends_at is not null
          and s.grace_period_ends_at > p_now
        )
      )
    order by
      case when s.status = 'active' then 0 else 1 end,
      s.last_verified_at desc nulls last
    limit 1;

    if found and subscription_row.status = 'active' then
      next_mode := 'active';
      next_source := subscription_row.provider;
      next_effective_until := subscription_row.current_period_end;
      next_verified_at := subscription_row.last_verified_at;
    elsif found then
      next_mode := 'grace_period';
      next_source := subscription_row.provider;
      next_effective_until := subscription_row.grace_period_ends_at;
      next_grace_end := subscription_row.grace_period_ends_at;
      next_verified_at := subscription_row.last_verified_at;
    else
      select * into trial_row
      from public.custody_folio_trials t
      where t.billing_account_id = p_billing_account_id
        and t.started_at <= p_now
        and t.ends_at > p_now;

      if found then
        next_mode := 'trial';
        next_source := 'trial';
        next_effective_until := trial_row.ends_at;
        next_verified_at := trial_row.started_at;
      end if;
    end if;
  end if;

  insert into public.custody_folio_entitlements (
    billing_account_id,
    environment,
    mode,
    source,
    effective_until,
    grace_period_ends_at,
    computed_at,
    last_verified_at,
    version
  ) values (
    p_billing_account_id,
    p_environment,
    next_mode,
    next_source,
    next_effective_until,
    next_grace_end,
    p_now,
    next_verified_at,
    1
  )
  on conflict (billing_account_id) do update set
    environment = excluded.environment,
    mode = excluded.mode,
    source = excluded.source,
    effective_until = excluded.effective_until,
    grace_period_ends_at = excluded.grace_period_ends_at,
    computed_at = excluded.computed_at,
    last_verified_at = excluded.last_verified_at,
    version = public.custody_folio_entitlements.version + 1
  returning * into entitlement_row;

  return query select entitlement_row.mode, entitlement_row.source,
    entitlement_row.effective_until, entitlement_row.grace_period_ends_at,
    entitlement_row.computed_at, entitlement_row.last_verified_at,
    entitlement_row.version;
end;
$$;

create or replace function public.custody_folio_apply_provider_event(
  p_provider text,
  p_environment text,
  p_provider_event_id text,
  p_billing_account_id uuid,
  p_event_type text,
  p_payload_sha256 text,
  p_provider_occurred_at timestamptz,
  p_subscription jsonb
)
returns table (processed boolean, provider_conflict boolean, entitlement_mode text)
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  inserted_event_id bigint;
  incoming_status text;
  effective_status text;
  has_provider_conflict boolean := false;
  entitlement_record record;
begin
  if p_provider not in ('stripe', 'apple')
    or p_environment not in ('test', 'live')
    or char_length(p_provider_event_id) not between 3 and 255
    or char_length(p_event_type) not between 1 and 180
    or char_length(p_payload_sha256) <> 64
    or p_billing_account_id is null
    or p_subscription is null
  then
    raise exception 'invalid_provider_event';
  end if;

  perform 1 from public.custody_folio_billing_accounts a
  where a.id = p_billing_account_id
  for update;
  if not found then
    raise exception 'billing_account_not_found';
  end if;

  insert into public.custody_folio_provider_events (
    provider, environment, provider_event_id, billing_account_id,
    event_type, payload_sha256, provider_occurred_at, processing_status
  ) values (
    p_provider, p_environment, p_provider_event_id, p_billing_account_id,
    p_event_type, p_payload_sha256, p_provider_occurred_at, 'received'
  )
  on conflict (provider, environment, provider_event_id) do nothing
  returning id into inserted_event_id;

  if inserted_event_id is null then
    return query select false, false, coalesce(
      (
        select e.mode
        from public.custody_folio_entitlements e
        where e.billing_account_id = p_billing_account_id
          and e.environment = p_environment
      ),
      'export_only'
    );
    return;
  end if;

  incoming_status := p_subscription ->> 'status';
  if incoming_status not in (
    'incomplete', 'active', 'past_due', 'grace_period', 'billing_retry',
    'paused', 'canceled', 'expired', 'revoked', 'refunded', 'provider_conflict'
  )
  then
    raise exception 'invalid_subscription_status';
  end if;

  effective_status := incoming_status;
  if incoming_status in ('active', 'past_due', 'grace_period', 'billing_retry')
    and exists (
      select 1
      from public.custody_folio_provider_subscriptions s
      where s.billing_account_id = p_billing_account_id
        and s.environment = p_environment
        and s.provider <> p_provider
        and s.status in ('active', 'past_due', 'grace_period', 'billing_retry')
    )
  then
    effective_status := 'provider_conflict';
    has_provider_conflict := true;
  end if;

  insert into public.custody_folio_provider_subscriptions (
    billing_account_id, provider, environment, provider_subscription_id,
    original_transaction_id, provider_customer_id, product_id, plan_interval,
    status, current_period_start, current_period_end, grace_period_ends_at,
    cancel_at_period_end, canceled_at, revoked_at, last_provider_event_id,
    last_provider_occurred_at, last_verified_at, created_at, updated_at
  ) values (
    p_billing_account_id,
    p_provider,
    p_environment,
    p_subscription ->> 'providerSubscriptionId',
    nullif(p_subscription ->> 'originalTransactionId', ''),
    nullif(p_subscription ->> 'providerCustomerId', ''),
    p_subscription ->> 'productId',
    p_subscription ->> 'planInterval',
    effective_status,
    nullif(p_subscription ->> 'currentPeriodStart', '')::timestamptz,
    nullif(p_subscription ->> 'currentPeriodEnd', '')::timestamptz,
    nullif(p_subscription ->> 'gracePeriodEndsAt', '')::timestamptz,
    coalesce((p_subscription ->> 'cancelAtPeriodEnd')::boolean, false),
    nullif(p_subscription ->> 'canceledAt', '')::timestamptz,
    nullif(p_subscription ->> 'revokedAt', '')::timestamptz,
    p_provider_event_id,
    p_provider_occurred_at,
    now(),
    now(),
    now()
  )
  on conflict (provider, environment, provider_subscription_id) do update set
    billing_account_id = excluded.billing_account_id,
    original_transaction_id = excluded.original_transaction_id,
    provider_customer_id = excluded.provider_customer_id,
    product_id = excluded.product_id,
    plan_interval = excluded.plan_interval,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    grace_period_ends_at = excluded.grace_period_ends_at,
    cancel_at_period_end = excluded.cancel_at_period_end,
    canceled_at = excluded.canceled_at,
    revoked_at = excluded.revoked_at,
    last_provider_event_id = excluded.last_provider_event_id,
    last_provider_occurred_at = excluded.last_provider_occurred_at,
    last_verified_at = excluded.last_verified_at,
    updated_at = excluded.updated_at
  where public.custody_folio_provider_subscriptions.last_provider_occurred_at is null
    or excluded.last_provider_occurred_at is null
    or excluded.last_provider_occurred_at >= public.custody_folio_provider_subscriptions.last_provider_occurred_at;

  update public.custody_folio_provider_events
  set
    processing_status = case when has_provider_conflict then 'conflict' else 'processed' end,
    processing_code = case when has_provider_conflict then 'cross_provider_subscription' else null end,
    processed_at = now()
  where id = inserted_event_id;

  if has_provider_conflict then
    insert into public.custody_folio_billing_audit_events (
      billing_account_id, event_type, actor_type, result, reason_code
    ) values (
      p_billing_account_id, 'provider_event_applied', 'provider',
      'conflict', 'cross_provider_subscription'
    );
  end if;

  select * into entitlement_record
  from public.custody_folio_refresh_entitlement(
    p_billing_account_id, p_environment, now()
  );

  return query select true, has_provider_conflict, entitlement_record.mode::text;
end;
$$;

create or replace function public.custody_folio_grant_waiver(
  p_billing_account_id uuid,
  p_reason_category text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_granted_by_hash text,
  p_now timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if p_billing_account_id is null
    or p_reason_category not in ('hardship', 'domestic_violence', 'other_hardship')
    or char_length(p_granted_by_hash) <> 64
    or p_starts_at is null
    or p_ends_at is null
    or p_ends_at <= p_starts_at
    or p_ends_at > p_starts_at + interval '1 year'
  then
    return false;
  end if;

  perform 1 from public.custody_folio_billing_accounts a
  where a.id = p_billing_account_id
  for update;
  if not found then
    return false;
  end if;

  update public.custody_folio_waiver_grants w
  set
    status = 'revoked',
    revoked_at = p_now,
    revoked_by_hash = p_granted_by_hash,
    revocation_reason_code = 'grant_replaced',
    updated_at = p_now
  where w.billing_account_id = p_billing_account_id
    and w.status = 'active';

  insert into public.custody_folio_waiver_grants (
    billing_account_id, status, reason_category, starts_at, ends_at,
    granted_by_hash, created_at, updated_at
  ) values (
    p_billing_account_id, 'active', p_reason_category, p_starts_at, p_ends_at,
    p_granted_by_hash, p_now, p_now
  );

  insert into public.custody_folio_billing_audit_events (
    billing_account_id, event_type, actor_type, result, reason_code
  ) values (
    p_billing_account_id, 'waiver_granted', 'support', 'success',
    p_reason_category
  );
  return true;
end;
$$;

create or replace function public.custody_folio_revoke_waiver(
  p_billing_account_id uuid,
  p_revoked_by_hash text,
  p_reason_code text,
  p_now timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  affected_count integer;
begin
  if p_billing_account_id is null
    or char_length(p_revoked_by_hash) <> 64
    or p_reason_code not in (
      'support_decision', 'account_request', 'administrative_correction'
    )
  then
    return false;
  end if;

  perform 1 from public.custody_folio_billing_accounts a
  where a.id = p_billing_account_id
  for update;
  if not found then
    return false;
  end if;

  update public.custody_folio_waiver_grants w
  set
    status = 'revoked',
    revoked_at = p_now,
    revoked_by_hash = p_revoked_by_hash,
    revocation_reason_code = p_reason_code,
    updated_at = p_now
  where w.billing_account_id = p_billing_account_id
    and w.status = 'active';
  get diagnostics affected_count = row_count;
  if affected_count = 0 then
    return false;
  end if;

  insert into public.custody_folio_billing_audit_events (
    billing_account_id, event_type, actor_type, result, reason_code
  ) values (
    p_billing_account_id, 'waiver_revoked', 'support', 'success', p_reason_code
  );
  return true;
end;
$$;

create or replace function public.custody_folio_redact_billing_account(
  p_user_id uuid,
  p_deleted_user_hash text,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  account_id uuid;
begin
  if p_user_id is null or char_length(p_deleted_user_hash) <> 64 then
    return false;
  end if;

  update public.custody_folio_billing_accounts a
  set
    user_id = null,
    deleted_user_hash = p_deleted_user_hash,
    deleted_at = p_now,
    updated_at = p_now
  where a.user_id = p_user_id
  returning a.id into account_id;

  if account_id is null then
    return true;
  end if;

  delete from public.custody_folio_trials where billing_account_id = account_id;
  delete from public.custody_folio_waiver_grants where billing_account_id = account_id;
  delete from public.custody_folio_entitlements where billing_account_id = account_id;

  insert into public.custody_folio_billing_audit_events (
    billing_account_id, event_type, actor_type, result, reason_code
  ) values (
    account_id, 'billing_identity_redacted', 'account', 'success', 'account_deleted'
  );
  return true;
end;
$$;

revoke all on function public.custody_folio_ensure_billing_account(uuid, timestamptz)
from public, anon, authenticated;
revoke all on function public.custody_folio_refresh_entitlement(uuid, text, timestamptz)
from public, anon, authenticated;
revoke all on function public.custody_folio_apply_provider_event(
  text, text, text, uuid, text, text, timestamptz, jsonb
) from public, anon, authenticated;
revoke all on function public.custody_folio_grant_waiver(
  uuid, text, timestamptz, timestamptz, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.custody_folio_revoke_waiver(
  uuid, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.custody_folio_redact_billing_account(uuid, text, timestamptz)
from public, anon, authenticated;

grant execute on function public.custody_folio_ensure_billing_account(uuid, timestamptz)
to service_role;
grant execute on function public.custody_folio_refresh_entitlement(uuid, text, timestamptz)
to service_role;
grant execute on function public.custody_folio_apply_provider_event(
  text, text, text, uuid, text, text, timestamptz, jsonb
) to service_role;
grant execute on function public.custody_folio_grant_waiver(
  uuid, text, timestamptz, timestamptz, text, timestamptz
) to service_role;
grant execute on function public.custody_folio_revoke_waiver(
  uuid, text, text, timestamptz
) to service_role;
grant execute on function public.custody_folio_redact_billing_account(uuid, text, timestamptz)
to service_role;
