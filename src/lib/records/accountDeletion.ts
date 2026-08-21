import { getEvidenceBucket } from "./evidenceStorage";
import type { SupabaseClient } from "@supabase/supabase-js";

interface StorageEntry {
  id?: string | null;
  name?: string;
}

interface StorageBucketClient {
  list: (
    path: string,
    options: {
      limit: number;
      offset: number;
      sortBy: { column: "name"; order: "asc" };
    }
  ) => PromiseLike<{ data: StorageEntry[] | null; error: unknown }>;
  remove: (paths: string[]) => PromiseLike<{ error: unknown }>;
}

interface StorageClient {
  storage: {
    from: (bucket: string) => StorageBucketClient;
  };
}

const deletionPageSize = 1000;
const maximumDeletionEntries = 250_000;
const maximumFolderDepth = 8;

export async function beginRecordsAccountDeletion(input: {
  supabase: SupabaseClient;
  userId: string;
}) {
  const startedAt = new Date().toISOString();
  const result = await input.supabase
    .from("records_account_deletion_tombstones")
    .upsert(
      {
        user_id: input.userId,
        status: "active",
        started_at: startedAt,
        completed_at: null,
      },
      { onConflict: "user_id" }
    );
  if (result.error) throw new Error("Account deletion could not be locked.");
  return startedAt;
}

export async function clearRecordsAccountDeletion(input: {
  supabase: SupabaseClient;
  userId: string;
}) {
  const result = await input.supabase
    .from("records_account_deletion_tombstones")
    .delete()
    .eq("user_id", input.userId)
    .eq("status", "active");
  if (result.error) throw new Error("Account deletion lock could not be cleared.");
}

export async function completeRecordsAccountDeletion(input: {
  supabase: SupabaseClient;
  userId: string;
}) {
  const result = await input.supabase
    .from("records_account_deletion_tombstones")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("user_id", input.userId);
  if (result.error) throw new Error("Account deletion completion could not be recorded.");
}

export async function recordsAccountDeletionInProgress(input: {
  supabase: SupabaseClient;
  userId: string;
}) {
  const result = await input.supabase
    .from("records_account_deletion_tombstones")
    .select("status")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (result.error) throw new Error("Account deletion state could not be verified.");
  return Boolean(result.data);
}

function validPathSegment(value: string) {
  return Boolean(value && value !== "." && value !== ".." && !value.includes("/") && !value.includes("\\"));
}

function childPath(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name;
}

export async function deleteRecordsEvidenceForUser(input: {
  supabase: unknown;
  userId: string;
  bucket?: string;
}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.userId)) {
    return { ok: false as const, error: "Account storage path is invalid." };
  }

  const client = input.supabase as StorageClient;
  const bucket = client.storage.from(input.bucket || getEvidenceBucket());
  let processedEntries = 0;
  let deletedObjects = 0;

  async function emptyFolder(path: string, depth: number): Promise<void> {
    if (depth > maximumFolderDepth) {
      throw new Error("Account evidence storage exceeded the supported folder depth.");
    }

    while (true) {
      const { data, error } = await bucket.list(path, {
        limit: deletionPageSize,
        offset: 0,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;

      const entries = data || [];
      if (entries.length === 0) return;

      processedEntries += entries.length;
      if (processedEntries > maximumDeletionEntries) {
        throw new Error("Account evidence storage exceeded the supported deletion size.");
      }

      for (const entry of entries.filter((item) => item.id == null)) {
        const name = typeof entry.name === "string" ? entry.name : "";
        if (!validPathSegment(name)) throw new Error("Account evidence storage contained an invalid folder name.");
        await emptyFolder(childPath(path, name), depth + 1);
      }

      const filePaths = entries
        .filter((entry) => entry.id != null)
        .map((entry) => {
          const name = typeof entry.name === "string" ? entry.name : "";
          if (!validPathSegment(name)) throw new Error("Account evidence storage contained an invalid file name.");
          return childPath(path, name);
        });

      if (filePaths.length > 0) {
        const { error: removeError } = await bucket.remove(filePaths);
        if (removeError) throw removeError;
        deletedObjects += filePaths.length;
      }
    }
  }

  try {
    await emptyFolder(input.userId, 0);
    return { ok: true as const, deletedObjects };
  } catch {
    return {
      ok: false as const,
      error: "Unable to remove all private evidence files for this account.",
    };
  }
}
