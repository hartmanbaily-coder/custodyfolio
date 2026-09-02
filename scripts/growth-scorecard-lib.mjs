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
    schema_version: z.literal(1),
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
        source_content_attribution: z.literal(
          "privacy_preserving_growth_events"
        ),
        satisfaction_source: z.literal("persisted_production_responses"),
        minimum_viable_segment_evidence: z.literal(
          "not_established_by_article_attribution"
        ),
      })
      .strict(),
    acquisition: z
      .object({
        qualified_visits: nonnegativeInteger,
        signup_selections: nonnegativeInteger,
        completed_signups: nonnegativeInteger,
        qualified_trials: nonnegativeInteger,
        target_trials: z.literal(500),
        trial_target_progress_percent: percentage,
        visit_to_signup_percent: percentage,
        visits_by_source: z.array(sourceBreakdown),
        signups_by_source: z.array(sourceBreakdown),
        visits_by_content: z.array(contentBreakdown),
        signups_by_content: z.array(contentBreakdown),
        confirmed_trial_events_by_content: z.array(contentBreakdown),
      })
      .strict(),
    activation: z
      .object({
        meaningfully_activated_accounts: nonnegativeInteger,
        meaningful_activation_rate_percent: percentage,
        first_timeline_accounts: nonnegativeInteger,
        first_report_accounts: nonnegativeInteger,
        first_report_rate_percent: percentage,
        median_minutes_to_first_record: nullableNonnegativeNumber,
        activated_by_content: z.array(contentBreakdown),
      })
      .strict(),
    engagement: z
      .object({
        feedback_prompt_accounts: nonnegativeInteger,
        feedback_opt_in_accounts: nonnegativeInteger,
        feedback_opt_in_rate_percent: percentage,
      })
      .strict(),
    satisfaction: z
      .object({
        responses: nonnegativeInteger,
        positive_responses: nonnegativeInteger,
        customer_value_satisfaction_percent: percentage,
      })
      .strict(),
    conversion: z
      .object({
        paid_subscribers: nonnegativeInteger,
        monthly_subscribers: nonnegativeInteger,
        annual_subscribers: nonnegativeInteger,
        subscription_start_accounts: nonnegativeInteger,
        cancellations: nonnegativeInteger,
        refund_requests: nonnegativeInteger,
        paid_target: z.literal(100),
        paid_target_progress_percent: percentage,
        eligible_trial_to_paid_percent: percentage,
        subscription_starts_by_source: z.array(sourceBreakdown),
        subscription_starts_by_content: z.array(contentBreakdown),
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
