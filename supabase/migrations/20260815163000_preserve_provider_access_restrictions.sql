-- Provider safety events can arrive after ordinary subscription events while
-- carrying an earlier provider timestamp. Preserve dispute/refund/revocation
-- restrictions until the provider sends the event that explicitly resolves
-- them, instead of allowing a later ordinary event to restore access.

alter table public.custody_folio_provider_events
  add column if not exists provider_subscription_id text;

create index if not exists custody_folio_provider_events_subscription_received_idx
  on public.custody_folio_provider_events(
    provider, environment, provider_subscription_id, received_at desc
  )
  where provider_subscription_id is not null;

alter table public.custody_folio_provider_subscriptions
  add column if not exists access_restriction text;

alter table public.custody_folio_provider_subscriptions
  drop constraint if exists custody_folio_provider_subscriptions_access_restriction_check;
alter table public.custody_folio_provider_subscriptions
  add constraint custody_folio_provider_subscriptions_access_restriction_check
  check (access_restriction is null or access_restriction in (
    'open_dispute', 'refunded', 'revoked'
  ));

update public.custody_folio_provider_subscriptions
set access_restriction = case status
  when 'refunded' then 'refunded'
  when 'revoked' then 'revoked'
  else access_restriction
end
where status in ('refunded', 'revoked')
  and access_restriction is null;

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
  incoming_restriction text;
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
    provider_subscription_id, event_type, payload_sha256,
    provider_occurred_at, processing_status
  ) values (
    p_provider, p_environment, p_provider_event_id, p_billing_account_id,
    nullif(p_subscription ->> 'providerSubscriptionId', ''),
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

  incoming_restriction := case
    when p_provider = 'stripe' and p_event_type = 'charge.dispute.created'
      then 'open_dispute'
    when effective_status = 'refunded' then 'refunded'
    when effective_status = 'revoked' then 'revoked'
    else null
  end;

  insert into public.custody_folio_provider_subscriptions (
    billing_account_id, provider, environment, provider_subscription_id,
    original_transaction_id, provider_customer_id, product_id, plan_interval,
    status, access_restriction, current_period_start, current_period_end,
    grace_period_ends_at, cancel_at_period_end, canceled_at, revoked_at,
    last_provider_event_id, last_provider_occurred_at, last_verified_at,
    created_at, updated_at
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
    incoming_restriction,
    nullif(p_subscription ->> 'currentPeriodStart', '')::timestamptz,
    nullif(p_subscription ->> 'currentPeriodEnd', '')::timestamptz,
    nullif(p_subscription ->> 'gracePeriodEndsAt', '')::timestamptz,
    coalesce((p_subscription ->> 'cancelAtPeriodEnd')::boolean, false),
    nullif(p_subscription ->> 'canceledAt', '')::timestamptz,
    coalesce(
      nullif(p_subscription ->> 'revokedAt', '')::timestamptz,
      case when effective_status = 'revoked' then p_provider_occurred_at end
    ),
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
    status = case
      when public.custody_folio_provider_subscriptions.access_restriction
        in ('refunded', 'revoked')
        then public.custody_folio_provider_subscriptions.status
      when public.custody_folio_provider_subscriptions.access_restriction = 'open_dispute'
        and not (
          p_provider = 'stripe'
          and p_event_type = 'charge.dispute.closed'
        )
        and excluded.status not in ('canceled', 'expired', 'refunded', 'revoked')
        then public.custody_folio_provider_subscriptions.status
      else excluded.status
    end,
    access_restriction = case
      when public.custody_folio_provider_subscriptions.access_restriction
        in ('refunded', 'revoked')
        then public.custody_folio_provider_subscriptions.access_restriction
      when public.custody_folio_provider_subscriptions.access_restriction = 'open_dispute'
        and not (
          p_provider = 'stripe'
          and p_event_type = 'charge.dispute.closed'
        )
        and excluded.status not in ('canceled', 'expired', 'refunded', 'revoked')
        then 'open_dispute'
      else excluded.access_restriction
    end,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    grace_period_ends_at = case
      when public.custody_folio_provider_subscriptions.access_restriction = 'open_dispute'
        and not (
          p_provider = 'stripe'
          and p_event_type = 'charge.dispute.closed'
        )
        and excluded.status not in ('canceled', 'expired', 'refunded', 'revoked')
        then public.custody_folio_provider_subscriptions.grace_period_ends_at
      else excluded.grace_period_ends_at
    end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    canceled_at = excluded.canceled_at,
    revoked_at = case
      when public.custody_folio_provider_subscriptions.access_restriction = 'revoked'
        then public.custody_folio_provider_subscriptions.revoked_at
      else excluded.revoked_at
    end,
    last_provider_event_id = excluded.last_provider_event_id,
    last_provider_occurred_at = excluded.last_provider_occurred_at,
    last_verified_at = excluded.last_verified_at,
    updated_at = excluded.updated_at
  where public.custody_folio_provider_subscriptions.last_provider_occurred_at is null
    or excluded.last_provider_occurred_at is null
    or excluded.last_provider_occurred_at
      >= public.custody_folio_provider_subscriptions.last_provider_occurred_at
    or incoming_restriction in ('refunded', 'revoked')
    or (
      p_provider = 'stripe'
      and p_event_type = 'charge.dispute.closed'
    )
    or (
      incoming_restriction = 'open_dispute'
      and not exists (
        select 1
        from public.custody_folio_provider_events closed_event
        where closed_event.provider = p_provider
          and closed_event.environment = p_environment
          and closed_event.provider_subscription_id
            = excluded.provider_subscription_id
          and closed_event.event_type = 'charge.dispute.closed'
          and coalesce(closed_event.provider_occurred_at, closed_event.received_at)
            >= coalesce(excluded.last_provider_occurred_at, '-infinity'::timestamptz)
      )
    );

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
