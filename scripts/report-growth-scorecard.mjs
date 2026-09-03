import { createClient } from "@supabase/supabase-js";
import {
  buildGrowthScorecardRpcParameters,
  parseGrowthExcludedUserIds,
  validateGrowthScorecard,
} from "./growth-scorecard-lib.mjs";

function requiredEnvironment(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error("Missing " + name + ".");
  return value;
}

function dateEnvironment(name, fallback) {
  const value = String(process.env[name] || fallback);
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(name + " must be a valid date.");
  }
  return new Date(value).toISOString();
}

async function main() {
  const supabaseUrl = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const analyticsSecret = requiredEnvironment("MARKETING_ANALYTICS_SECRET");
  const from = dateEnvironment(
    "GROWTH_WINDOW_START",
    "2026-08-31T08:00:00.000Z"
  );
  const to = dateEnvironment("GROWTH_WINDOW_END", new Date().toISOString());
  const excludedUserIds = parseGrowthExcludedUserIds(
    process.env.GROWTH_EXCLUDED_USER_IDS
  );
  const parameters = buildGrowthScorecardRpcParameters({
    from,
    to,
    excludedUserIds,
    analyticsSecret,
  });

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await client.rpc(
    "custody_folio_growth_scorecard_v2",
    parameters
  );
  if (error) {
    const code = String(error.code || "unknown");
    const message = String(error.message || "query rejected");
    throw new Error(
      "Unable to load the aggregate growth scorecard. Supabase "
        + code
        + ": "
        + message
    );
  }

  const report = validateGrowthScorecard(data);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : "Growth scorecard failed.";
  console.error(message);
  process.exit(1);
});
