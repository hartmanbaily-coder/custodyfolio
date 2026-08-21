-- Remove the hardship/fee-waiver program while preserving the universal
-- 30-day account trial, paid provider access, grace periods, and export-only
-- safety. Historical audit events remain, but no service-role procedure or
-- entitlement value can grant free waiver access after this migration.

create temporary table custody_folio_removed_waiver_accounts
on commit drop
as
select distinct w.billing_account_id
from public.custody_folio_waiver_grants w;

insert into public.custody_folio_billing_audit_events (
  billing_account_id, event_type, actor_type, result, reason_code
)
select
  a.billing_account_id,
  'waiver_program_removed',
  'system',
  'success',
  'waivers_disabled'
from custody_folio_removed_waiver_accounts a;

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

do $$
declare
  affected record;
begin
  for affected in
    select
      a.billing_account_id,
      coalesce(e.environment, 'live') as environment
    from custody_folio_removed_waiver_accounts a
    left join public.custody_folio_entitlements e
      on e.billing_account_id = a.billing_account_id
  loop
    perform * from public.custody_folio_refresh_entitlement(
      affected.billing_account_id,
      affected.environment,
      now()
    );
  end loop;
end;
$$;

-- Fail closed if a stale waiver entitlement existed without a corresponding
-- grant row or could not be included in the refresh set above.
update public.custody_folio_entitlements
set
  mode = 'export_only',
  source = 'none',
  effective_until = null,
  grace_period_ends_at = null,
  computed_at = now(),
  last_verified_at = null,
  version = version + 1
where mode = 'waiver' or source = 'waiver';

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

  delete from public.custody_folio_trials
  where billing_account_id = account_id;
  delete from public.custody_folio_entitlements
  where billing_account_id = account_id;

  insert into public.custody_folio_billing_audit_events (
    billing_account_id, event_type, actor_type, result, reason_code
  ) values (
    account_id, 'billing_identity_redacted', 'account', 'success', 'account_deleted'
  );
  return true;
end;
$$;

drop function if exists public.custody_folio_grant_waiver(
  uuid, text, timestamptz, timestamptz, text, timestamptz
);
drop function if exists public.custody_folio_revoke_waiver(
  uuid, text, text, timestamptz
);
drop table if exists public.custody_folio_waiver_grants;

alter table public.custody_folio_entitlements
  drop constraint if exists custody_folio_entitlements_mode_check;
alter table public.custody_folio_entitlements
  add constraint custody_folio_entitlements_mode_check
  check (mode in ('trial', 'active', 'grace_period', 'export_only'));

alter table public.custody_folio_entitlements
  drop constraint if exists custody_folio_entitlements_source_check;
alter table public.custody_folio_entitlements
  add constraint custody_folio_entitlements_source_check
  check (source in ('trial', 'stripe', 'apple', 'none'));

revoke all on function public.custody_folio_refresh_entitlement(
  uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.custody_folio_refresh_entitlement(
  uuid, text, timestamptz
) to service_role;

revoke all on function public.custody_folio_redact_billing_account(
  uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.custody_folio_redact_billing_account(
  uuid, text, timestamptz
) to service_role;
