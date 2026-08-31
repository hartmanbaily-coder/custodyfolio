import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { summarizeGrowth } from "./growth-scorecard-lib.mjs";

function requiredEnvironment(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function dateEnvironment(name, fallback) {
  const value = String(process.env[name] || fallback);
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${name} must be a valid date.`);
  }
  return new Date(value).toISOString();
}

async function loadRows(client, table, columns) {
  const pageSize = 500;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .range(offset, offset + pageSize - 1);
    if (error) {
      const code = String(error.code || "unknown");
      const message = String(error.message || "query rejected");
      throw new Error(
        `Unable to load aggregate inputs from ${table}. Supabase ${code}: ${message}`
      );
    }
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

function parseCsvLine(line) {
  const [respondedAt, rawScore] = line.split(",").map((value) => value.trim());
  const score = Number(rawScore);
  if (!Number.isFinite(Date.parse(respondedAt)) || !Number.isInteger(score) || score < 1 || score > 5) {
    throw new Error("Satisfaction responses must contain a date and a score from 1 through 5.");
  }
  return { responded_at: respondedAt, score };
}

async function loadSatisfactionResponses() {
  const path = resolve(
    process.cwd(),
    process.env.GROWTH_SATISFACTION_FILE ||
      "marketing/customer_value_responses.csv"
  );
  try {
    const content = await readFile(path, "utf8");
    return content
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parseCsvLine);
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function main() {
  const supabaseUrl = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const from = dateEnvironment("GROWTH_WINDOW_START", "2026-08-30T00:00:00.000Z");
  const to = dateEnvironment("GROWTH_WINDOW_END", new Date().toISOString());
  const excludedUserIds = String(process.env.GROWTH_EXCLUDED_USER_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const accounts = await loadRows(
    client,
    "custody_folio_billing_accounts",
    "id,user_id"
  );
  const trials = await loadRows(
    client,
    "custody_folio_trials",
    "billing_account_id,started_at,ends_at"
  );
  const subscriptions = await loadRows(
    client,
    "custody_folio_provider_subscriptions",
    "billing_account_id,environment,status,plan_interval,created_at"
  );
  const snapshots = await loadRows(
    client,
    "records_case_snapshots",
    "user_id,dataset"
  );
  const satisfactionResponses = await loadSatisfactionResponses();

  const report = summarizeGrowth({
    accounts,
    trials,
    subscriptions,
    snapshots,
    satisfactionResponses,
    excludedUserIds,
    from,
    to,
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Growth scorecard failed.";
  const cause = error instanceof Error && error.cause instanceof Error
    ? ` Cause: ${error.cause.message}`
    : "";
  console.error(`${message}${cause}`);
  process.exit(1);
});
