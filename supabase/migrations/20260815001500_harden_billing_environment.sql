-- Keep effective entitlements isolated to the configured billing environment.
-- This follow-up is additive for databases that already applied the original
-- Custody Folio billing migration.

alter table public.custody_folio_entitlements
  add column if not exists environment text;

update public.custody_folio_entitlements
set environment = 'test'
where environment is null;

alter table public.custody_folio_entitlements
  alter column environment set not null;

alter table public.custody_folio_entitlements
  drop constraint if exists custody_folio_entitlements_environment_check;
alter table public.custody_folio_entitlements
  add constraint custody_folio_entitlements_environment_check
  check (environment in ('test', 'live'));

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

-- Waiver changes are environment-independent. The next authenticated status
-- read recomputes the effective entitlement for the configured environment.
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
  set status = 'revoked', revoked_at = p_now,
    revoked_by_hash = p_granted_by_hash,
    revocation_reason_code = 'grant_replaced', updated_at = p_now
  where w.billing_account_id = p_billing_account_id and w.status = 'active';

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
    p_billing_account_id, 'waiver_granted', 'support', 'success', p_reason_category
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
  set status = 'revoked', revoked_at = p_now,
    revoked_by_hash = p_revoked_by_hash,
    revocation_reason_code = p_reason_code, updated_at = p_now
  where w.billing_account_id = p_billing_account_id and w.status = 'active';
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

revoke all on function public.custody_folio_refresh_entitlement(uuid, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.custody_folio_refresh_entitlement(uuid, text, timestamptz)
to service_role;

drop function if exists public.custody_folio_refresh_entitlement(uuid, timestamptz);
