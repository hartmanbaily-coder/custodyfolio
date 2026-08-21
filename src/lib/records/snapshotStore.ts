import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecordsDataset } from "./types";

export type RecordsSnapshotWriteResult =
  | { ok: true; updatedAt: string }
  | { ok: false; reason: "conflict" | "database_error" };

export function nextRecordsSnapshotTimestamp(previous: string | null) {
  const previousTime = previous ? Date.parse(previous) : Number.NaN;
  const nextTime = Number.isFinite(previousTime)
    ? Math.max(Date.now(), previousTime + 1)
    : Date.now();
  return new Date(nextTime).toISOString();
}

export async function compareAndSetRecordsSnapshot(input: {
  supabase: SupabaseClient;
  userId: string;
  caseKey: string;
  expectedUpdatedAt: string | null;
  dataset: RecordsDataset;
  updatedAt: string;
}): Promise<RecordsSnapshotWriteResult> {
  const payload = {
    user_id: input.userId,
    case_key: input.caseKey,
    dataset: input.dataset,
    schema_version: 1,
    updated_at: input.updatedAt,
  };

  if (input.expectedUpdatedAt === null) {
    const inserted = await input.supabase
      .from("records_case_snapshots")
      .insert(payload)
      .select("updated_at")
      .single();
    if (inserted.error) {
      return {
        ok: false,
        reason: inserted.error.code === "23505" ? "conflict" : "database_error",
      };
    }
    return { ok: true, updatedAt: inserted.data.updated_at as string };
  }

  const updated = await input.supabase
    .from("records_case_snapshots")
    .update(payload)
    .eq("user_id", input.userId)
    .eq("case_key", input.caseKey)
    .eq("updated_at", input.expectedUpdatedAt)
    .select("updated_at")
    .maybeSingle();
  if (updated.error) return { ok: false, reason: "database_error" };
  if (!updated.data) return { ok: false, reason: "conflict" };
  return { ok: true, updatedAt: updated.data.updated_at as string };
}
