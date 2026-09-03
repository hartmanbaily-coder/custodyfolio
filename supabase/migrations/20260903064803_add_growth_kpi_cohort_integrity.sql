alter table public.custody_folio_billing_accounts
  add column growth_cohort_identifier text;

alter table public.custody_folio_billing_accounts
  add constraint custody_folio_billing_accounts_growth_cohort_check
  check (
    growth_cohort_identifier is null
    or growth_cohort_identifier ~ '^[a-f0-9]{32}$'
  );

create unique index custody_folio_billing_accounts_growth_cohort_idx
  on public.custody_folio_billing_accounts(growth_cohort_identifier)
  where growth_cohort_identifier is not null;

create or replace function public.custody_folio_capture_billing_growth_cohort(
  p_billing_account_id uuid,
  p_user_id uuid,
  p_growth_cohort_identifier text,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_affected_count integer;
begin
  if p_billing_account_id is null
    or p_user_id is null
    or p_growth_cohort_identifier is null
    or p_growth_cohort_identifier !~ '^[a-f0-9]{32}$'
    or p_now is null
  then
    return false;
  end if;

  update public.custody_folio_billing_accounts as account
  set
    growth_cohort_identifier = coalesce(
      account.growth_cohort_identifier,
      p_growth_cohort_identifier
    ),
    updated_at = p_now
  where account.id = p_billing_account_id
    and account.user_id = p_user_id
    and (
      account.growth_cohort_identifier is null
      or account.growth_cohort_identifier = p_growth_cohort_identifier
    );

  get diagnostics v_affected_count = row_count;
  return v_affected_count = 1;
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
    growth_cohort_identifier = null,
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

alter table public.custody_folio_growth_events
  drop constraint custody_folio_growth_events_event_name_check;

alter table public.custody_folio_growth_events
  add constraint custody_folio_growth_events_event_name_check check (
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
      'customer_value_prompt_viewed',
      'customer_feedback_opted_in',
      'customer_subscription_started',
      'customer_subscription_cancelled',
      'customer_refund_requested'
    )
  );

create or replace function public.custody_folio_growth_scorecard_v2(
  p_from timestamptz,
  p_to timestamptz,
  p_excluded_user_ids uuid[] default '{}'::uuid[],
  p_excluded_cohort_identifiers text[] default '{}'::text[]
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_excluded_user_ids uuid[] := coalesce(p_excluded_user_ids, '{}'::uuid[]);
  v_excluded_cohort_identifiers text[] := coalesce(
    p_excluded_cohort_identifiers,
    '{}'::text[]
  );
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Growth window is invalid.' using errcode = '22007';
  end if;

  if cardinality(v_excluded_user_ids) > 100
    or cardinality(v_excluded_cohort_identifiers) > 100 then
    raise exception 'Growth exclusion list is too large.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_excluded_cohort_identifiers) as excluded(cohort_identifier)
    where excluded.cohort_identifier !~ '^[a-f0-9]{32}$'
  ) then
    raise exception 'Growth cohort exclusion is invalid.' using errcode = '22023';
  end if;

  with
  filtered_events as (
    select
      event.id,
      event.event_name,
      event.occurred_at,
      event.source,
      event.content_code,
      event.cohort_identifier
    from public.custody_folio_growth_events as event
    where event.occurred_at >= p_from
      and event.occurred_at <= p_to
      and not (
        event.cohort_identifier = any(v_excluded_cohort_identifiers)
      )
  ),
  event_cohorts as (
    select distinct
      event.event_name,
      event.cohort_identifier
    from filtered_events as event
  ),
  event_attribution as (
    select
      event.cohort_identifier,
      coalesce(
        (
          array_agg(event.source order by event.occurred_at, event.id)
            filter (where event.source is not null)
        )[1],
        'unattributed'
      ) as source,
      coalesce(
        (
          array_agg(event.content_code order by event.occurred_at, event.id)
            filter (where event.content_code is not null)
        )[1],
        'unattributed'
      ) as content_code
    from filtered_events as event
    group by event.cohort_identifier
  ),
  campaign_trial_accounts as (
    select
      trial.billing_account_id,
      account.user_id,
      account.growth_cohort_identifier,
      trial.started_at
    from public.custody_folio_trials as trial
    join public.custody_folio_billing_accounts as account
      on account.id = trial.billing_account_id
    where account.user_id is not null
      and trial.started_at >= p_from
      and trial.started_at <= p_to
      and not (account.user_id = any(v_excluded_user_ids))
      and not (
        coalesce(account.growth_cohort_identifier, '')
          = any(v_excluded_cohort_identifiers)
      )
  ),
  mapped_campaign_trials as (
    select trial.*
    from campaign_trial_accounts as trial
    where trial.growth_cohort_identifier is not null
  ),
  mapping_totals as (
    select
      count(*)::integer as qualified_trials,
      count(*) filter (
        where trial.growth_cohort_identifier is not null
      )::integer as mapped_qualified_trials,
      count(*) filter (
        where trial.growth_cohort_identifier is null
      )::integer as unmapped_qualified_trials
    from campaign_trial_accounts as trial
  ),
  trial_attribution as (
    select
      trial.billing_account_id,
      trial.growth_cohort_identifier,
      coalesce(
        (
          array_agg(event.source order by event.occurred_at, event.id)
            filter (where event.source is not null)
        )[1],
        'unattributed'
      ) as source,
      coalesce(
        (
          array_agg(event.content_code order by event.occurred_at, event.id)
            filter (where event.content_code is not null)
        )[1],
        'unattributed'
      ) as content_code
    from mapped_campaign_trials as trial
    left join public.custody_folio_growth_events as event
      on event.cohort_identifier = trial.growth_cohort_identifier
    group by trial.billing_account_id, trial.growth_cohort_identifier
  ),
  trial_event_cohorts as (
    select distinct
      trial.billing_account_id,
      trial.growth_cohort_identifier,
      event.event_name
    from mapped_campaign_trials as trial
    join filtered_events as event
      on event.cohort_identifier = trial.growth_cohort_identifier
      and event.occurred_at >= trial.started_at
  ),
  activated_trial_accounts as (
    select event.billing_account_id, event.growth_cohort_identifier
    from trial_event_cohorts as event
    group by event.billing_account_id, event.growth_cohort_identifier
    having bool_or(event.event_name = 'customer_first_matter_created')
      and bool_or(event.event_name = 'customer_first_record_saved')
      and bool_or(
        event.event_name in (
          'customer_first_timeline_viewed',
          'customer_first_report_created'
        )
      )
  ),
  trial_first_events as (
    select
      trial.billing_account_id,
      trial.started_at,
      min(event.occurred_at) filter (
        where event.event_name = 'customer_first_record_saved'
      ) as first_record_at
    from mapped_campaign_trials as trial
    left join filtered_events as event
      on event.cohort_identifier = trial.growth_cohort_identifier
      and event.occurred_at >= trial.started_at
    group by trial.billing_account_id, trial.started_at
  ),
  campaign_value_responses as (
    select distinct on (trial.billing_account_id)
      trial.billing_account_id,
      trial.growth_cohort_identifier,
      response.score
    from campaign_trial_accounts as trial
    join public.custody_folio_customer_value_responses as response
      on response.user_id = trial.user_id
      and response.responded_at >= trial.started_at
      and response.responded_at >= p_from
      and response.responded_at <= p_to
    order by trial.billing_account_id, response.responded_at desc
  ),
  new_paid_accounts as (
    select distinct on (subscription.billing_account_id)
      subscription.billing_account_id,
      subscription.plan_interval
    from public.custody_folio_provider_subscriptions as subscription
    join public.custody_folio_billing_accounts as account
      on account.id = subscription.billing_account_id
    where account.user_id is not null
      and subscription.environment = 'live'
      and subscription.status = 'active'
      and subscription.created_at >= p_from
      and subscription.created_at <= p_to
      and not (account.user_id = any(v_excluded_user_ids))
      and not (
        coalesce(account.growth_cohort_identifier, '')
          = any(v_excluded_cohort_identifiers)
      )
    order by
      subscription.billing_account_id,
      subscription.created_at desc,
      subscription.id desc
  ),
  campaign_paid_accounts as (
    select paid.billing_account_id, paid.plan_interval
    from new_paid_accounts as paid
    join campaign_trial_accounts as trial
      on trial.billing_account_id = paid.billing_account_id
  ),
  mapped_campaign_paid_accounts as (
    select
      paid.billing_account_id,
      paid.plan_interval,
      trial.growth_cohort_identifier
    from campaign_paid_accounts as paid
    join mapped_campaign_trials as trial
      on trial.billing_account_id = paid.billing_account_id
  ),
  event_totals as (
    select
      count(distinct cohort.cohort_identifier) filter (
        where cohort.event_name = 'marketing_page_viewed'
      )::integer as tracked_visits,
      count(distinct cohort.cohort_identifier) filter (
        where cohort.event_name = 'marketing_signup_selected'
      )::integer as signup_selections,
      count(distinct cohort.cohort_identifier) filter (
        where cohort.event_name = 'account_signup_confirmed'
      )::integer as confirmed_signups
    from event_cohorts as cohort
  ),
  mapped_trial_event_totals as (
    select
      count(distinct event.billing_account_id) filter (
        where event.event_name = 'customer_first_timeline_viewed'
      )::integer as first_timeline_accounts,
      count(distinct event.billing_account_id) filter (
        where event.event_name = 'customer_first_report_created'
      )::integer as first_report_accounts,
      count(distinct event.billing_account_id) filter (
        where event.event_name = 'customer_feedback_prompt_viewed'
      )::integer as feedback_prompt_accounts,
      count(distinct event.billing_account_id) filter (
        where event.event_name = 'customer_feedback_opted_in'
      )::integer as feedback_opt_in_accounts,
      count(distinct event.billing_account_id) filter (
        where event.event_name = 'customer_value_prompt_viewed'
      )::integer as customer_value_prompt_accounts,
      count(distinct event.billing_account_id) filter (
        where event.event_name = 'customer_subscription_started'
      )::integer as subscription_start_accounts,
      count(distinct event.billing_account_id) filter (
        where event.event_name = 'customer_subscription_cancelled'
      )::integer as cancellation_accounts,
      count(distinct event.billing_account_id) filter (
        where event.event_name = 'customer_refund_requested'
      )::integer as refund_request_accounts
    from trial_event_cohorts as event
  ),
  activation_totals as (
    select
      (select count(*)::integer from activated_trial_accounts)
        as activated_accounts,
      (
        select round(
          percentile_cont(0.5) within group (
            order by extract(
              epoch from (timing.first_record_at - timing.started_at)
            ) / 60.0
          )::numeric,
          1
        )
        from trial_first_events as timing
        where timing.first_record_at is not null
          and timing.first_record_at >= timing.started_at
      ) as median_minutes_to_first_record
  ),
  response_totals as (
    select
      count(*)::integer as responses,
      count(*) filter (where response.score >= 4)::integer
        as positive_responses,
      count(*) filter (
        where exists (
          select 1
          from trial_event_cohorts as prompt
          where prompt.billing_account_id = response.billing_account_id
            and prompt.event_name = 'customer_value_prompt_viewed'
        )
      )::integer as responses_with_tracked_prompt
    from campaign_value_responses as response
  ),
  billing_totals as (
    select
      (select count(*)::integer from new_paid_accounts)
        as new_active_paid_subscribers,
      (
        select count(*)::integer
        from new_paid_accounts as paid
        where paid.plan_interval = 'month'
      ) as monthly_subscribers,
      (
        select count(*)::integer
        from new_paid_accounts as paid
        where paid.plan_interval = 'year'
      ) as annual_subscribers,
      (select count(*)::integer from campaign_paid_accounts)
        as campaign_trial_paid_subscribers
  ),
  stage_attribution as (
    select
      cohort.event_name as stage,
      cohort.cohort_identifier,
      attribution.source,
      attribution.content_code
    from event_cohorts as cohort
    join event_attribution as attribution
      on attribution.cohort_identifier = cohort.cohort_identifier
    where cohort.event_name in (
      'marketing_page_viewed',
      'account_signup_confirmed'
    )

    union all

    select
      'qualified_trial',
      trial.growth_cohort_identifier,
      attribution.source,
      attribution.content_code
    from mapped_campaign_trials as trial
    join trial_attribution as attribution
      on attribution.billing_account_id = trial.billing_account_id

    union all

    select
      'meaningfully_activated',
      trial.growth_cohort_identifier,
      attribution.source,
      attribution.content_code
    from activated_trial_accounts as trial
    join trial_attribution as attribution
      on attribution.billing_account_id = trial.billing_account_id

    union all

    select
      'active_paid_campaign_trial',
      paid.growth_cohort_identifier,
      attribution.source,
      attribution.content_code
    from mapped_campaign_paid_accounts as paid
    join trial_attribution as attribution
      on attribution.billing_account_id = paid.billing_account_id
  ),
  source_counts as (
    select
      stage.stage,
      stage.source,
      count(distinct stage.cohort_identifier)::integer as cohort_count
    from stage_attribution as stage
    group by stage.stage, stage.source
  ),
  source_groups as (
    select
      source.stage,
      jsonb_agg(
        jsonb_build_object(
          'source', source.source,
          'count', case
            when source.cohort_count >= 5 then source.cohort_count
            else null
          end,
          'suppressed', source.cohort_count < 5
        )
        order by source.source
      ) as groups
    from source_counts as source
    group by source.stage
  ),
  content_counts as (
    select
      stage.stage,
      stage.content_code,
      count(distinct stage.cohort_identifier)::integer as cohort_count
    from stage_attribution as stage
    group by stage.stage, stage.content_code
  ),
  content_groups as (
    select
      content.stage,
      jsonb_agg(
        jsonb_build_object(
          'content_code', content.content_code,
          'count', case
            when content.cohort_count >= 5 then content.cohort_count
            else null
          end,
          'suppressed', content.cohort_count < 5
        )
        order by content.content_code
      ) as groups
    from content_counts as content
    group by content.stage
  ),
  readiness as (
    select
      mapping.qualified_trials > 0
        and mapping.unmapped_qualified_trials = 0
          as source_conclusions_available
    from mapping_totals as mapping
  )
  select jsonb_build_object(
    'schema_version', 2,
    'window', jsonb_build_object(
      'from', to_jsonb(p_from),
      'to', to_jsonb(p_to)
    ),
    'reporting_contract', jsonb_build_object(
      'minimum_reportable_group_size', 5,
      'billing_totals', 'authoritative_live_billing',
      'trial_attribution', 'protected_billing_growth_cohort',
      'source_conclusions_rule', 'complete_trial_mapping_required',
      'visitor_signup_measure', 'aggregate_diagnostic_ratio_only',
      'satisfaction_scope', 'campaign_trial_respondents',
      'minimum_viable_segment_evidence',
        'not_established_by_article_attribution'
    ),
    'acquisition', jsonb_build_object(
      'tracked_visits', event_totals.tracked_visits,
      'signup_selections', event_totals.signup_selections,
      'confirmed_signups', event_totals.confirmed_signups,
      'qualified_trials', mapping_totals.qualified_trials,
      'mapped_qualified_trials', mapping_totals.mapped_qualified_trials,
      'unmapped_qualified_trials', mapping_totals.unmapped_qualified_trials,
      'trial_mapping_coverage_percent', case
        when mapping_totals.qualified_trials > 0 then round(
          (
            mapping_totals.mapped_qualified_trials * 100.0
            / mapping_totals.qualified_trials
          )::numeric,
          1
        )
        else null
      end,
      'source_conclusions_available', readiness.source_conclusions_available,
      'target_trials', 500,
      'trial_target_progress_percent', round(
        (mapping_totals.qualified_trials * 100.0 / 500.0)::numeric,
        1
      ),
      'visit_to_confirmed_signup_diagnostic_ratio_percent', case
        when event_totals.tracked_visits > 0 then round(
          (
            event_totals.confirmed_signups * 100.0
            / event_totals.tracked_visits
          )::numeric,
          1
        )
        else null
      end,
      'visits_by_source', coalesce(
        (
          select groups from source_groups
          where stage = 'marketing_page_viewed'
        ),
        '[]'::jsonb
      ),
      'confirmed_signups_by_source', coalesce(
        (
          select groups from source_groups
          where stage = 'account_signup_confirmed'
        ),
        '[]'::jsonb
      ),
      'qualified_trials_by_source', case
        when readiness.source_conclusions_available then coalesce(
          (
            select groups from source_groups
            where stage = 'qualified_trial'
          ),
          '[]'::jsonb
        )
        else '[]'::jsonb
      end,
      'visits_by_content', coalesce(
        (
          select groups from content_groups
          where stage = 'marketing_page_viewed'
        ),
        '[]'::jsonb
      ),
      'confirmed_signups_by_content', coalesce(
        (
          select groups from content_groups
          where stage = 'account_signup_confirmed'
        ),
        '[]'::jsonb
      ),
      'qualified_trials_by_content', case
        when readiness.source_conclusions_available then coalesce(
          (
            select groups from content_groups
            where stage = 'qualified_trial'
          ),
          '[]'::jsonb
        )
        else '[]'::jsonb
      end
    ),
    'activation', jsonb_build_object(
      'mapped_meaningfully_activated_trial_accounts',
        activation_totals.activated_accounts,
      'meaningful_activation_rate_percent', case
        when readiness.source_conclusions_available then round(
          (
            activation_totals.activated_accounts * 100.0
            / mapping_totals.qualified_trials
          )::numeric,
          1
        )
        else null
      end,
      'mapped_first_timeline_trial_accounts',
        mapped_trial_event_totals.first_timeline_accounts,
      'mapped_first_report_trial_accounts',
        mapped_trial_event_totals.first_report_accounts,
      'first_report_rate_percent', case
        when readiness.source_conclusions_available then round(
          (
            mapped_trial_event_totals.first_report_accounts * 100.0
            / mapping_totals.qualified_trials
          )::numeric,
          1
        )
        else null
      end,
      'median_minutes_from_trial_start_to_first_record', case
        when readiness.source_conclusions_available
          then activation_totals.median_minutes_to_first_record
        else null
      end,
      'activated_trials_by_source', case
        when readiness.source_conclusions_available then coalesce(
          (
            select groups from source_groups
            where stage = 'meaningfully_activated'
          ),
          '[]'::jsonb
        )
        else '[]'::jsonb
      end,
      'activated_trials_by_content', case
        when readiness.source_conclusions_available then coalesce(
          (
            select groups from content_groups
            where stage = 'meaningfully_activated'
          ),
          '[]'::jsonb
        )
        else '[]'::jsonb
      end
    ),
    'engagement', jsonb_build_object(
      'mapped_feedback_prompt_trial_accounts',
        mapped_trial_event_totals.feedback_prompt_accounts,
      'mapped_feedback_opt_in_trial_accounts',
        mapped_trial_event_totals.feedback_opt_in_accounts,
      'feedback_opt_in_rate_percent', case
        when readiness.source_conclusions_available
          and mapped_trial_event_totals.feedback_prompt_accounts > 0 then round(
            (
              mapped_trial_event_totals.feedback_opt_in_accounts * 100.0
              / mapped_trial_event_totals.feedback_prompt_accounts
            )::numeric,
            1
          )
        else null
      end,
      'mapped_customer_value_prompt_trial_accounts',
        mapped_trial_event_totals.customer_value_prompt_accounts,
      'customer_value_prompt_rate_percent', case
        when readiness.source_conclusions_available then round(
          (
            mapped_trial_event_totals.customer_value_prompt_accounts * 100.0
            / mapping_totals.qualified_trials
          )::numeric,
          1
        )
        else null
      end
    ),
    'satisfaction', jsonb_build_object(
      'campaign_trial_responses', response_totals.responses,
      'positive_campaign_trial_responses', response_totals.positive_responses,
      'customer_value_satisfaction_among_respondents_percent', case
        when response_totals.responses > 0 then round(
          (
            response_totals.positive_responses * 100.0
            / response_totals.responses
          )::numeric,
          1
        )
        else null
      end,
      'responses_with_tracked_prompt',
        response_totals.responses_with_tracked_prompt,
      'response_coverage_percent', case
        when readiness.source_conclusions_available
          and mapped_trial_event_totals.customer_value_prompt_accounts > 0
          then round(
            (
              response_totals.responses_with_tracked_prompt * 100.0
              / mapped_trial_event_totals.customer_value_prompt_accounts
            )::numeric,
            1
          )
        else null
      end,
      'response_measurement_ready',
        readiness.source_conclusions_available
        and response_totals.responses >= 10
        and response_totals.responses_with_tracked_prompt = response_totals.responses
    ),
    'conversion', jsonb_build_object(
      'new_active_paid_subscribers', billing_totals.new_active_paid_subscribers,
      'monthly_subscribers', billing_totals.monthly_subscribers,
      'annual_subscribers', billing_totals.annual_subscribers,
      'campaign_trial_active_paid_subscribers',
        billing_totals.campaign_trial_paid_subscribers,
      'mapped_subscription_start_event_accounts',
        mapped_trial_event_totals.subscription_start_accounts,
      'mapped_cancellation_event_accounts',
        mapped_trial_event_totals.cancellation_accounts,
      'mapped_refund_request_event_accounts',
        mapped_trial_event_totals.refund_request_accounts,
      'paid_target', 100,
      'paid_target_progress_percent', round(
        (billing_totals.new_active_paid_subscribers * 100.0 / 100.0)::numeric,
        1
      ),
      'campaign_trial_to_active_paid_percent', case
        when mapping_totals.qualified_trials > 0 then round(
          (
            billing_totals.campaign_trial_paid_subscribers * 100.0
            / mapping_totals.qualified_trials
          )::numeric,
          1
        )
        else null
      end,
      'active_paid_campaign_trials_by_source', case
        when readiness.source_conclusions_available then coalesce(
          (
            select groups from source_groups
            where stage = 'active_paid_campaign_trial'
          ),
          '[]'::jsonb
        )
        else '[]'::jsonb
      end,
      'active_paid_campaign_trials_by_content', case
        when readiness.source_conclusions_available then coalesce(
          (
            select groups from content_groups
            where stage = 'active_paid_campaign_trial'
          ),
          '[]'::jsonb
        )
        else '[]'::jsonb
      end
    )
  )
  into v_result
  from event_totals
  cross join mapped_trial_event_totals
  cross join activation_totals
  cross join response_totals
  cross join billing_totals
  cross join mapping_totals
  cross join readiness;

  return v_result;
end;
$$;

revoke execute on function public.custody_folio_capture_billing_growth_cohort(
  uuid, uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.custody_folio_capture_billing_growth_cohort(
  uuid, uuid, text, timestamptz
) to service_role;

revoke execute on function public.custody_folio_redact_billing_account(
  uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.custody_folio_redact_billing_account(
  uuid, text, timestamptz
) to service_role;

revoke execute on function public.custody_folio_growth_scorecard_v2(
  timestamptz, timestamptz, uuid[], text[]
) from public, anon, authenticated;
grant execute on function public.custody_folio_growth_scorecard_v2(
  timestamptz, timestamptz, uuid[], text[]
) to service_role;
