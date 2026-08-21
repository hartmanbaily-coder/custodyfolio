-- Stripe can open more than one dispute against charges for the same
-- subscription. Track each dispute independently so closing one dispute
-- cannot clear the access restriction imposed by another open dispute.

alter table public.custody_folio_provider_events
  add column if not exists provider_event_object_id text;

create index if not exists custody_folio_provider_events_object_idx
  on public.custody_folio_provider_events(
    provider, environment, provider_event_object_id, received_at desc
  )
  where provider_event_object_id is not null;

create table if not exists public.custody_folio_provider_restrictions (
  provider text not null check (provider in ('stripe', 'apple')),
  environment text not null check (environment in ('test', 'live')),
  provider_subscription_id text not null,
  restriction_type text not null check (restriction_type in ('open_dispute')),
  provider_object_id text not null,
  active boolean not null,
  opened_at timestamptz,
  closed_at timestamptz,
  opened_by_event_id text,
  closed_by_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (
    provider, environment, provider_subscription_id,
    restriction_type, provider_object_id
  ),
  check (char_length(provider_subscription_id) between 3 and 255),
  check (char_length(provider_object_id) between 3 and 255),
  check (active or closed_at is not null)
);

alter table public.custody_folio_provider_restrictions enable row level security;
alter table public.custody_folio_provider_restrictions force row level security;

revoke all on table public.custody_folio_provider_restrictions
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.custody_folio_provider_restrictions to service_role;

create index if not exists custody_folio_provider_restrictions_active_idx
  on public.custody_folio_provider_restrictions(
    provider, environment, provider_subscription_id, active
  );

-- Existing scalar restrictions cannot be associated with a dispute ID after
-- the fact. Keep them fail-closed until an operator reconciles them with
-- Stripe rather than silently granting access during this migration.
insert into public.custody_folio_provider_restrictions (
  provider, environment, provider_subscription_id, restriction_type,
  provider_object_id, active, opened_at, opened_by_event_id
)
select
  s.provider,
  s.environment,
  s.provider_subscription_id,
  'open_dispute',
  'legacy-unidentified',
  true,
  coalesce(s.last_provider_occurred_at, s.updated_at),
  s.last_provider_event_id
from public.custody_folio_provider_subscriptions s
where s.provider = 'stripe'
  and s.access_restriction = 'open_dispute'
on conflict do nothing;

alter function public.custody_folio_apply_provider_event(
  text, text, text, uuid, text, text, timestamptz, jsonb
) rename to custody_folio_apply_provider_event_v1;

create function public.custody_folio_apply_provider_event(
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
  base_result record;
  prior_subscription record;
  current_subscription record;
  entitlement_record record;
  provider_object_id text;
  has_open_dispute boolean := false;
  projection_changed boolean := false;
begin
  provider_object_id := nullif(p_subscription ->> 'providerEventObjectId', '');
  if p_provider = 'stripe'
    and p_event_type in ('charge.dispute.created', 'charge.dispute.closed')
    and (
      provider_object_id is null
      or char_length(provider_object_id) not between 3 and 255
    )
  then
    raise exception 'stripe_dispute_id_required';
  end if;

  -- Serialize every provider transition for an account before capturing the
  -- prior projection. The v1 function takes the same lock reentrantly.
  perform 1
  from public.custody_folio_billing_accounts a
  where a.id = p_billing_account_id
  for update;

  select
    s.status,
    s.access_restriction,
    s.grace_period_ends_at,
    s.provider_subscription_id
  into prior_subscription
  from public.custody_folio_provider_subscriptions s
  where s.provider = p_provider
    and s.environment = p_environment
    and s.provider_subscription_id = p_subscription ->> 'providerSubscriptionId';

  select * into base_result
  from public.custody_folio_apply_provider_event_v1(
    p_provider,
    p_environment,
    p_provider_event_id,
    p_billing_account_id,
    p_event_type,
    p_payload_sha256,
    p_provider_occurred_at,
    p_subscription
  );

  if not base_result.processed then
    return query select
      base_result.processed,
      base_result.provider_conflict,
      base_result.entitlement_mode;
    return;
  end if;

  update public.custody_folio_provider_events
  set provider_event_object_id = provider_object_id
  where provider = p_provider
    and environment = p_environment
    and provider_event_id = p_provider_event_id;

  if p_provider = 'stripe' and p_event_type = 'charge.dispute.created' then
    insert into public.custody_folio_provider_restrictions (
      provider, environment, provider_subscription_id, restriction_type,
      provider_object_id, active, opened_at, opened_by_event_id
    ) values (
      p_provider,
      p_environment,
      p_subscription ->> 'providerSubscriptionId',
      'open_dispute',
      provider_object_id,
      true,
      p_provider_occurred_at,
      p_provider_event_id
    )
    on conflict (
      provider, environment, provider_subscription_id,
      restriction_type, provider_object_id
    ) do update set
      active = case
        when public.custody_folio_provider_restrictions.closed_at is not null
          and public.custody_folio_provider_restrictions.closed_at
            >= excluded.opened_at
          then false
        else true
      end,
      opened_at = least(
        coalesce(public.custody_folio_provider_restrictions.opened_at, excluded.opened_at),
        excluded.opened_at
      ),
      opened_by_event_id = excluded.opened_by_event_id,
      updated_at = now();
  elsif p_provider = 'stripe' and p_event_type = 'charge.dispute.closed' then
    insert into public.custody_folio_provider_restrictions (
      provider, environment, provider_subscription_id, restriction_type,
      provider_object_id, active, closed_at, closed_by_event_id
    ) values (
      p_provider,
      p_environment,
      p_subscription ->> 'providerSubscriptionId',
      'open_dispute',
      provider_object_id,
      false,
      p_provider_occurred_at,
      p_provider_event_id
    )
    on conflict (
      provider, environment, provider_subscription_id,
      restriction_type, provider_object_id
    ) do update set
      active = false,
      closed_at = greatest(
        coalesce(public.custody_folio_provider_restrictions.closed_at, excluded.closed_at),
        excluded.closed_at
      ),
      closed_by_event_id = excluded.closed_by_event_id,
      updated_at = now();
  end if;

  select exists (
    select 1
    from public.custody_folio_provider_restrictions r
    where r.provider = p_provider
      and r.environment = p_environment
      and r.provider_subscription_id = p_subscription ->> 'providerSubscriptionId'
      and r.restriction_type = 'open_dispute'
      and r.active
  ) into has_open_dispute;

  select
    s.status,
    s.access_restriction,
    s.grace_period_ends_at,
    s.provider_subscription_id
  into current_subscription
  from public.custody_folio_provider_subscriptions s
  where s.provider = p_provider
    and s.environment = p_environment
    and s.provider_subscription_id = p_subscription ->> 'providerSubscriptionId'
  for update;

  if current_subscription.access_restriction not in ('refunded', 'revoked')
    and has_open_dispute
  then
    update public.custody_folio_provider_subscriptions s
    set
      status = case
        when s.status in ('canceled', 'expired', 'refunded', 'revoked') then s.status
        else 'grace_period'
      end,
      access_restriction = 'open_dispute',
      grace_period_ends_at = coalesce(
        prior_subscription.grace_period_ends_at,
        s.grace_period_ends_at,
        nullif(p_subscription ->> 'gracePeriodEndsAt', '')::timestamptz
      ),
      updated_at = now()
    where s.provider = p_provider
      and s.environment = p_environment
      and s.provider_subscription_id = p_subscription ->> 'providerSubscriptionId';
    projection_changed := true;
  elsif p_provider = 'stripe'
    and p_event_type = 'charge.dispute.created'
    and not has_open_dispute
    and current_subscription.access_restriction = 'open_dispute'
  then
    -- A delayed create that was already followed by a close must not reopen
    -- access restrictions. Restore the projection from before that stale event.
    update public.custody_folio_provider_subscriptions s
    set
      status = coalesce(prior_subscription.status, 'active'),
      access_restriction = prior_subscription.access_restriction,
      grace_period_ends_at = prior_subscription.grace_period_ends_at,
      updated_at = now()
    where s.provider = p_provider
      and s.environment = p_environment
      and s.provider_subscription_id = p_subscription ->> 'providerSubscriptionId';
    projection_changed := true;
  elsif prior_subscription.status = 'grace_period'
    and current_subscription.status = 'grace_period'
    and prior_subscription.grace_period_ends_at is not null
    and current_subscription.grace_period_ends_at is distinct from
      prior_subscription.grace_period_ends_at
  then
    -- Retried invoice failures do not start a fresh grace period.
    update public.custody_folio_provider_subscriptions s
    set
      grace_period_ends_at = prior_subscription.grace_period_ends_at,
      updated_at = now()
    where s.provider = p_provider
      and s.environment = p_environment
      and s.provider_subscription_id = p_subscription ->> 'providerSubscriptionId';
    projection_changed := true;
  end if;

  if projection_changed then
    select * into entitlement_record
    from public.custody_folio_refresh_entitlement(
      p_billing_account_id, p_environment, now()
    );
    base_result.entitlement_mode := entitlement_record.mode::text;
  end if;

  return query select
    base_result.processed,
    base_result.provider_conflict,
    base_result.entitlement_mode;
end;
$$;

revoke all on function public.custody_folio_apply_provider_event_v1(
  text, text, text, uuid, text, text, timestamptz, jsonb
) from public, anon, authenticated;
revoke all on function public.custody_folio_apply_provider_event(
  text, text, text, uuid, text, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.custody_folio_apply_provider_event(
  text, text, text, uuid, text, text, timestamptz, jsonb
) to service_role;
