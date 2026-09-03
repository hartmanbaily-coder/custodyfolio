create or replace function public.custody_folio_growth_scorecard_v1(
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
  campaign_cohorts as (
    select cohort.cohort_identifier
    from event_cohorts as cohort
    where cohort.event_name = 'account_signup_confirmed'
  ),
  cohort_attribution as (
    select
      event.cohort_identifier,
      coalesce(
        (
          array_agg(event.source order by event.occurred_at)
            filter (where event.source is not null)
        )[1],
        'unattributed'
      ) as source,
      coalesce(
        (
          array_agg(event.content_code order by event.occurred_at)
            filter (where event.content_code is not null)
        )[1],
        'unattributed'
      ) as content_code
    from filtered_events as event
    group by event.cohort_identifier
  ),
  activated_cohorts as (
    select campaign.cohort_identifier
    from campaign_cohorts as campaign
    join event_cohorts as matter
      on matter.cohort_identifier = campaign.cohort_identifier
      and matter.event_name = 'customer_first_matter_created'
    join event_cohorts as record
      on record.cohort_identifier = campaign.cohort_identifier
      and record.event_name = 'customer_first_record_saved'
    where exists (
      select 1
      from event_cohorts as completion
      where completion.cohort_identifier = campaign.cohort_identifier
        and completion.event_name in (
          'customer_first_timeline_viewed',
          'customer_first_report_created'
        )
    )
  ),
  campaign_event_cohorts as (
    select
      cohort.event_name,
      cohort.cohort_identifier
    from event_cohorts as cohort
    join campaign_cohorts as campaign
      on campaign.cohort_identifier = cohort.cohort_identifier
  ),
  first_times as (
    select
      campaign.cohort_identifier,
      min(event.occurred_at)
        filter (where event.event_name = 'account_signup_confirmed') as signup_at,
      min(event.occurred_at)
        filter (where event.event_name = 'customer_first_record_saved') as first_record_at
    from campaign_cohorts as campaign
    join filtered_events as event
      on event.cohort_identifier = campaign.cohort_identifier
    group by campaign.cohort_identifier
  ),
  event_totals as (
    select
      count(distinct cohort.cohort_identifier)
        filter (where cohort.event_name = 'marketing_page_viewed')::integer
          as qualified_visits,
      count(distinct cohort.cohort_identifier)
        filter (where cohort.event_name = 'marketing_signup_selected')::integer
          as signup_selections,
      count(distinct cohort.cohort_identifier)
        filter (where cohort.event_name = 'account_signup_confirmed')::integer
          as completed_signups,
      count(distinct cohort.cohort_identifier)
        filter (where cohort.event_name = 'customer_first_timeline_viewed')::integer
          as first_timeline_accounts,
      count(distinct cohort.cohort_identifier)
        filter (where cohort.event_name = 'customer_first_report_created')::integer
          as first_report_accounts,
      count(distinct cohort.cohort_identifier)
        filter (where cohort.event_name = 'customer_feedback_prompt_viewed')::integer
          as feedback_prompt_accounts,
      count(distinct cohort.cohort_identifier)
        filter (where cohort.event_name = 'customer_feedback_opted_in')::integer
          as feedback_opt_in_accounts,
      count(distinct cohort.cohort_identifier)
        filter (where cohort.event_name = 'customer_subscription_started')::integer
          as subscription_start_accounts,
      count(distinct cohort.cohort_identifier)
        filter (where cohort.event_name = 'customer_subscription_cancelled')::integer
          as cancellation_accounts,
      count(distinct cohort.cohort_identifier)
        filter (where cohort.event_name = 'customer_refund_requested')::integer
          as refund_request_accounts
    from (
      select event_name, cohort_identifier
      from event_cohorts
      where event_name in ('marketing_page_viewed', 'marketing_signup_selected')

      union all

      select event_name, cohort_identifier
      from campaign_event_cohorts
    ) as cohort
  ),
  trial_accounts as (
    select distinct trial.billing_account_id
    from public.custody_folio_trials as trial
    join public.custody_folio_billing_accounts as account
      on account.id = trial.billing_account_id
    where account.user_id is not null
      and trial.started_at >= p_from
      and trial.started_at <= p_to
      and not (account.user_id = any(v_excluded_user_ids))
  ),
  paid_accounts as (
    select distinct
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
  ),
  billing_totals as (
    select
      (select count(*)::integer from trial_accounts) as qualified_trials,
      (select count(*)::integer from paid_accounts) as paid_subscribers,
      (
        select count(*)::integer
        from paid_accounts as paid
        where paid.plan_interval = 'month'
      ) as monthly_subscribers,
      (
        select count(*)::integer
        from paid_accounts as paid
        where paid.plan_interval = 'year'
      ) as annual_subscribers,
      (
        select count(*)::integer
        from trial_accounts as trial
        join paid_accounts as paid
          on paid.billing_account_id = trial.billing_account_id
      ) as paid_trial_accounts
  ),
  response_totals as (
    select
      count(*)::integer as responses,
      count(*) filter (where response.score >= 4)::integer as positive_responses
    from public.custody_folio_customer_value_responses as response
    where response.responded_at >= p_from
      and response.responded_at <= p_to
      and not (response.user_id = any(v_excluded_user_ids))
  ),
  source_stage_cohorts as (
    select
      cohort.event_name as stage,
      cohort.cohort_identifier
    from event_cohorts as cohort
    where cohort.event_name in (
      'marketing_page_viewed',
      'account_signup_confirmed'
    )

    union all

    select 'meaningfully_activated', cohort.cohort_identifier
    from activated_cohorts as cohort

    union all

    select 'customer_subscription_started', cohort.cohort_identifier
    from campaign_event_cohorts as cohort
    where cohort.event_name = 'customer_subscription_started'
  ),
  source_counts as (
    select
      stage.stage,
      attribution.source,
      count(*)::integer as cohort_count
    from source_stage_cohorts as stage
    join cohort_attribution as attribution
      on attribution.cohort_identifier = stage.cohort_identifier
    group by stage.stage, attribution.source
  ),
  source_groups as (
    select
      source.stage,
      jsonb_agg(
        jsonb_build_object(
          'source', source.source,
          'count', case when source.cohort_count >= 5 then source.cohort_count else null end,
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
      attribution.content_code,
      count(*)::integer as cohort_count
    from source_stage_cohorts as stage
    join cohort_attribution as attribution
      on attribution.cohort_identifier = stage.cohort_identifier
    group by stage.stage, attribution.content_code
  ),
  content_groups as (
    select
      content.stage,
      jsonb_agg(
        jsonb_build_object(
          'content_code', content.content_code,
          'count', case when content.cohort_count >= 5 then content.cohort_count else null end,
          'suppressed', content.cohort_count < 5
        )
        order by content.content_code
      ) as groups
    from content_counts as content
    group by content.stage
  ),
  activation_totals as (
    select
      (select count(*)::integer from activated_cohorts)
        as meaningfully_activated_accounts,
      (
        select round(
          percentile_cont(0.5) within group (
            order by extract(epoch from (timing.first_record_at - timing.signup_at)) / 60.0
          )::numeric,
          1
        )
        from first_times as timing
        where timing.signup_at is not null
          and timing.first_record_at is not null
          and timing.first_record_at >= timing.signup_at
      ) as median_minutes_to_first_record
  )
  select jsonb_build_object(
    'schema_version', 1,
    'window', jsonb_build_object(
      'from', to_jsonb(p_from),
      'to', to_jsonb(p_to)
    ),
    'reporting_contract', jsonb_build_object(
      'minimum_reportable_group_size', 5,
      'billing_totals', 'authoritative_live_billing',
      'source_content_attribution', 'privacy_preserving_growth_events',
      'satisfaction_source', 'persisted_production_responses',
      'minimum_viable_segment_evidence', 'not_established_by_article_attribution'
    ),
    'acquisition', jsonb_build_object(
      'qualified_visits', event_totals.qualified_visits,
      'signup_selections', event_totals.signup_selections,
      'completed_signups', event_totals.completed_signups,
      'qualified_trials', billing_totals.qualified_trials,
      'target_trials', 500,
      'trial_target_progress_percent', case
        when billing_totals.qualified_trials > 0
          then round((billing_totals.qualified_trials * 100.0 / 500.0)::numeric, 1)
        else 0
      end,
      'visit_to_signup_percent', case
        when event_totals.qualified_visits > 0
          then round(
            (
              event_totals.completed_signups * 100.0
              / event_totals.qualified_visits
            )::numeric,
            1
          )
        else 0
      end,
      'visits_by_source', coalesce(
        (
          select groups
          from source_groups
          where stage = 'marketing_page_viewed'
        ),
        '[]'::jsonb
      ),
      'signups_by_source', coalesce(
        (
          select groups
          from source_groups
          where stage = 'account_signup_confirmed'
        ),
        '[]'::jsonb
      ),
      'visits_by_content', coalesce(
        (
          select groups
          from content_groups
          where stage = 'marketing_page_viewed'
        ),
        '[]'::jsonb
      ),
      'signups_by_content', coalesce(
        (
          select groups
          from content_groups
          where stage = 'account_signup_confirmed'
        ),
        '[]'::jsonb
      ),
      'confirmed_trial_events_by_content', coalesce(
        (
          select groups
          from content_groups
          where stage = 'account_signup_confirmed'
        ),
        '[]'::jsonb
      )
    ),
    'activation', jsonb_build_object(
      'meaningfully_activated_accounts',
        activation_totals.meaningfully_activated_accounts,
      'meaningful_activation_rate_percent', case
        when billing_totals.qualified_trials > 0
          then round(
            (
              activation_totals.meaningfully_activated_accounts * 100.0
              / billing_totals.qualified_trials
            )::numeric,
            1
          )
        else 0
      end,
      'first_timeline_accounts', event_totals.first_timeline_accounts,
      'first_report_accounts', event_totals.first_report_accounts,
      'first_report_rate_percent', case
        when billing_totals.qualified_trials > 0
          then round(
            (
              event_totals.first_report_accounts * 100.0
              / billing_totals.qualified_trials
            )::numeric,
            1
          )
        else 0
      end,
      'median_minutes_to_first_record',
        activation_totals.median_minutes_to_first_record,
      'activated_by_content', coalesce(
        (
          select groups
          from content_groups
          where stage = 'meaningfully_activated'
        ),
        '[]'::jsonb
      )
    ),
    'engagement', jsonb_build_object(
      'feedback_prompt_accounts', event_totals.feedback_prompt_accounts,
      'feedback_opt_in_accounts', event_totals.feedback_opt_in_accounts,
      'feedback_opt_in_rate_percent', case
        when event_totals.feedback_prompt_accounts > 0
          then round(
            (
              event_totals.feedback_opt_in_accounts * 100.0
              / event_totals.feedback_prompt_accounts
            )::numeric,
            1
          )
        else 0
      end
    ),
    'satisfaction', jsonb_build_object(
      'responses', response_totals.responses,
      'positive_responses', response_totals.positive_responses,
      'customer_value_satisfaction_percent', case
        when response_totals.responses > 0
          then round(
            (
              response_totals.positive_responses * 100.0
              / response_totals.responses
            )::numeric,
            1
          )
        else 0
      end
    ),
    'conversion', jsonb_build_object(
      'paid_subscribers', billing_totals.paid_subscribers,
      'monthly_subscribers', billing_totals.monthly_subscribers,
      'annual_subscribers', billing_totals.annual_subscribers,
      'subscription_start_accounts', event_totals.subscription_start_accounts,
      'cancellations', event_totals.cancellation_accounts,
      'refund_requests', event_totals.refund_request_accounts,
      'paid_target', 100,
      'paid_target_progress_percent', case
        when billing_totals.paid_subscribers > 0
          then round((billing_totals.paid_subscribers * 100.0 / 100.0)::numeric, 1)
        else 0
      end,
      'eligible_trial_to_paid_percent', case
        when billing_totals.qualified_trials > 0
          then round(
            (
              billing_totals.paid_trial_accounts * 100.0
              / billing_totals.qualified_trials
            )::numeric,
            1
          )
        else 0
      end,
      'subscription_starts_by_source', coalesce(
        (
          select groups
          from source_groups
          where stage = 'customer_subscription_started'
        ),
        '[]'::jsonb
      ),
      'subscription_starts_by_content', coalesce(
        (
          select groups
          from content_groups
          where stage = 'customer_subscription_started'
        ),
        '[]'::jsonb
      )
    )
  )
  into v_result
  from event_totals
  cross join billing_totals
  cross join response_totals
  cross join activation_totals;

  return v_result;
end;
$$;

revoke execute on function public.custody_folio_growth_scorecard_v1(timestamptz, timestamptz, uuid[], text[]) from public, anon, authenticated;
grant execute on function public.custody_folio_growth_scorecard_v1(timestamptz, timestamptz, uuid[], text[]) to service_role;
