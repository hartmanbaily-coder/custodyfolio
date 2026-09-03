import { createHmac } from "node:crypto";
import { z } from "zod";

const minimumReportableGroupSize = 5;

const growthSources = z.enum([
  "direct",
  "app_store",
  "checklist",
  "community",
  "referral",
  "email",
  "apple_ads",
  "unattributed",
]);

const growthContentCodes = z.enum([
  "homepage",
  "header_desktop",
  "header_mobile",
  "hero",
  "quick_add_record",
  "quick_review_timeline",
  "quick_prepare_or_share",
  "pricing",
  "factual_checklist",
  "in_product_feedback",
  "subscription",
  "unattributed",
]);

const nonnegativeInteger = z.number().int().nonnegative();
const percentage = z.number().min(0).max(100);
const nullableNonnegativeNumber = z.number().nonnegative().nullable();
const nullablePercentage = percentage.nullable();

function suppressedBreakdownSchema(field, valueSchema) {
  return z
    .object({
      [field]: valueSchema,
      count: nonnegativeInteger.nullable(),
      suppressed: z.boolean(),
    })
    .strict()
    .superRefine((value, context) => {
      if (value.suppressed && value.count !== null) {
        context.addIssue({
          code: "custom",
          message: "Suppressed groups must not include a count.",
          path: ["count"],
        });
      }
      if (
        !value.suppressed &&
        (value.count === null || value.count < minimumReportableGroupSize)
      ) {
        context.addIssue({
          code: "custom",
          message: "Reportable groups must meet the minimum group size.",
          path: ["count"],
        });
      }
    });
}

const sourceBreakdown = suppressedBreakdownSchema("source", growthSources);
const contentBreakdown = suppressedBreakdownSchema(
  "content_code",
  growthContentCodes
);

export const growthScorecardSchema = z
  .object({
    schema_version: z.literal(2),
    window: z
      .object({
        from: z.string().datetime({ offset: true }),
        to: z.string().datetime({ offset: true }),
      })
      .strict(),
    reporting_contract: z
      .object({
        minimum_reportable_group_size: z.literal(minimumReportableGroupSize),
        billing_totals: z.literal("authoritative_live_billing"),
        trial_attribution: z.literal("protected_billing_growth_cohort"),
        source_conclusions_rule: z.literal(
          "complete_trial_mapping_required"
        ),
        visitor_signup_measure: z.literal(
          "aggregate_diagnostic_ratio_only"
        ),
        satisfaction_scope: z.literal("campaign_trial_respondents"),
        minimum_viable_segment_evidence: z.literal(
          "not_established_by_article_attribution"
        ),
      })
      .strict(),
    acquisition: z
      .object({
        tracked_visits: nonnegativeInteger,
        signup_selections: nonnegativeInteger,
        confirmed_signups: nonnegativeInteger,
        qualified_trials: nonnegativeInteger,
        mapped_qualified_trials: nonnegativeInteger,
        unmapped_qualified_trials: nonnegativeInteger,
        trial_mapping_coverage_percent: nullablePercentage,
        source_conclusions_available: z.boolean(),
        target_trials: z.literal(500),
        trial_target_progress_percent: z.number().nonnegative(),
        visit_to_confirmed_signup_diagnostic_ratio_percent:
          nullableNonnegativeNumber,
        visits_by_source: z.array(sourceBreakdown),
        confirmed_signups_by_source: z.array(sourceBreakdown),
        qualified_trials_by_source: z.array(sourceBreakdown),
        visits_by_content: z.array(contentBreakdown),
        confirmed_signups_by_content: z.array(contentBreakdown),
        qualified_trials_by_content: z.array(contentBreakdown),
      })
      .strict(),
    activation: z
      .object({
        mapped_meaningfully_activated_trial_accounts: nonnegativeInteger,
        meaningful_activation_rate_percent: nullablePercentage,
        mapped_first_timeline_trial_accounts: nonnegativeInteger,
        mapped_first_report_trial_accounts: nonnegativeInteger,
        first_report_rate_percent: nullablePercentage,
        median_minutes_from_trial_start_to_first_record:
          nullableNonnegativeNumber,
        activated_trials_by_source: z.array(sourceBreakdown),
        activated_trials_by_content: z.array(contentBreakdown),
      })
      .strict(),
    engagement: z
      .object({
        mapped_feedback_prompt_trial_accounts: nonnegativeInteger,
        mapped_feedback_opt_in_trial_accounts: nonnegativeInteger,
        feedback_opt_in_rate_percent: nullablePercentage,
        mapped_customer_value_prompt_trial_accounts: nonnegativeInteger,
        customer_value_prompt_rate_percent: nullablePercentage,
      })
      .strict(),
    satisfaction: z
      .object({
        campaign_trial_responses: nonnegativeInteger,
        positive_campaign_trial_responses: nonnegativeInteger,
        customer_value_satisfaction_among_respondents_percent:
          nullablePercentage,
        responses_with_tracked_prompt: nonnegativeInteger,
        response_coverage_percent: nullablePercentage,
        response_measurement_ready: z.boolean(),
      })
      .strict(),
    conversion: z
      .object({
        new_active_paid_subscribers: nonnegativeInteger,
        monthly_subscribers: nonnegativeInteger,
        annual_subscribers: nonnegativeInteger,
        campaign_trial_active_paid_subscribers: nonnegativeInteger,
        mapped_subscription_start_event_accounts: nonnegativeInteger,
        mapped_cancellation_event_accounts: nonnegativeInteger,
        mapped_refund_request_event_accounts: nonnegativeInteger,
        paid_target: z.literal(100),
        paid_target_progress_percent: z.number().nonnegative(),
        campaign_trial_to_active_paid_percent: nullablePercentage,
        active_paid_campaign_trials_by_source: z.array(sourceBreakdown),
        active_paid_campaign_trials_by_content: z.array(contentBreakdown),
      })
      .strict(),
  })
  .strict()
  .superRefine((report, context) => {
    if (Date.parse(report.window.from) > Date.parse(report.window.to)) {
      context.addIssue({
        code: "custom",
        message: "Growth window is invalid.",
        path: ["window"],
      });
    }
    if (
      report.acquisition.mapped_qualified_trials
        + report.acquisition.unmapped_qualified_trials
      !== report.acquisition.qualified_trials
    ) {
      context.addIssue({
        code: "custom",
        message: "Mapped and unmapped trials must equal qualified trials.",
        path: ["acquisition", "qualified_trials"],
      });
    }
    if (!report.acquisition.source_conclusions_available) {
      const unavailableGroups = [
        report.acquisition.qualified_trials_by_source,
        report.acquisition.qualified_trials_by_content,
        report.activation.activated_trials_by_source,
        report.activation.activated_trials_by_content,
        report.conversion.active_paid_campaign_trials_by_source,
        report.conversion.active_paid_campaign_trials_by_content,
      ];
      if (unavailableGroups.some((groups) => groups.length > 0)) {
        context.addIssue({
          code: "custom",
          message: "Trial linked groups must be empty when source conclusions are unavailable.",
          path: ["acquisition", "source_conclusions_available"],
        });
      }
    }
  });

function cohortIdentifierForUser(userId, analyticsSecret) {
  return createHmac("sha256", analyticsSecret)
    .update("user:" + userId)
    .digest("hex")
    .slice(0, 32);
}

const excludedUserIdSchema = z.string().uuid();

export function parseGrowthExcludedUserIds(value) {
  const identifiers = String(value || "")
    .split(",")
    .map((identifier) => identifier.trim())
    .filter(Boolean);
  const unique = [...new Set(identifiers)];
  if (unique.length > 100) {
    throw new Error("GROWTH_EXCLUDED_USER_IDS may contain at most 100 values.");
  }
  return z.array(excludedUserIdSchema).parse(unique);
}

export function buildGrowthScorecardRpcParameters(input) {
  const analyticsSecret = String(input.analyticsSecret || "");
  if (analyticsSecret.length < 32) {
    throw new Error(
      "MARKETING_ANALYTICS_SECRET must contain at least 32 characters."
    );
  }
  const from = new Date(input.from);
  const to = new Date(input.to);
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    from.getTime() > to.getTime()
  ) {
    throw new Error("Growth window is invalid.");
  }
  const excludedUserIds = z
    .array(excludedUserIdSchema)
    .max(100)
    .parse(input.excludedUserIds || []);

  return {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_excluded_user_ids: excludedUserIds,
    p_excluded_cohort_identifiers: excludedUserIds.map((userId) =>
      cohortIdentifierForUser(userId, analyticsSecret)
    ),
  };
}

export function validateGrowthScorecard(value) {
  return growthScorecardSchema.parse(value);
}
