import type { EvidenceItem } from "./types";
import { buildStoredEvidenceName } from "./validation";

export const defaultEvidenceBucket = "records-evidence";

interface EvidenceSnapshotRow {
  case_key?: string;
  dataset?: {
    evidenceItems?: unknown;
  } | null;
}

interface EvidenceSnapshotQuery {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      order: (column: string, options: { ascending: boolean }) => {
        limit: (count: number) => PromiseLike<{ data: EvidenceSnapshotRow[] | null; error: unknown }>;
      };
    };
  };
}

interface EvidenceRemovalStorageClient {
  storage: {
    from: (bucket: string) => {
      list: (
        path: string,
        options: {
          limit: number;
          offset: number;
          sortBy: { column: "name"; order: "asc" };
        }
      ) => PromiseLike<{
        data: Array<{ id?: string | null; name?: string | null }> | null;
        error: unknown;
      }>;
      remove: (paths: string[]) => PromiseLike<{ data?: unknown; error: unknown }>;
    };
  };
}

const evidenceRemovalBatchSize = 1000;
const evidenceListPageSize = 100;
const maximumEvidenceCleanupEntries = 10_000;
const maximumEvidenceCleanupDepth = 8;

function safePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 160);
}

export function getEvidenceBucket(env: Record<string, string | undefined> = process.env) {
  return env.RECORDS_EVIDENCE_BUCKET || defaultEvidenceBucket;
}

export function buildEvidenceStoragePath(input: {
  userId: string;
  caseId: string;
  evidenceId: string;
  originalFileName: string;
}) {
  const storedFileName = buildStoredEvidenceName({
    id: safePathSegment(input.evidenceId),
    originalFileName: input.originalFileName,
  });

  return [
    safePathSegment(input.userId),
    safePathSegment(input.caseId),
    safePathSegment(input.evidenceId),
    storedFileName,
  ].join("/");
}

export function isEvidenceStoragePathOwnedByUser(path: string, userId: string) {
  if (!path || /[%\\?#\u0000-\u001f\u007f]/.test(path)) return false;
  const segments = path.split("/");
  if (
    segments.length !== 4 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        safePathSegment(segment) !== segment
    )
  ) {
    return false;
  }
  return segments[0] === safePathSegment(userId);
}

export function assertEvidenceItemAccess(
  item: Pick<EvidenceItem, "id" | "userId" | "caseId" | "originalFileName" | "storagePath" | "malwareScanStatus">,
  input: { userId: string; caseId: string }
) {
  if (item.userId !== input.userId || item.caseId !== input.caseId) {
    return { ok: false as const, error: "Evidence record is not owned by the authenticated user." };
  }

  const expectedStoragePath = buildEvidenceStoragePath({
    userId: input.userId,
    caseId: input.caseId,
    evidenceId: item.id,
    originalFileName: item.originalFileName,
  });

  if (
    !item.storagePath ||
    !isEvidenceStoragePathOwnedByUser(item.storagePath, input.userId) ||
    item.storagePath !== expectedStoragePath
  ) {
    return { ok: false as const, error: "Evidence storage path is invalid." };
  }

  return { ok: true as const };
}

export async function deleteEvidenceForCases(input: {
  supabase: unknown;
  userId: string;
  caseIds: string[];
  bucket?: string;
}) {
  const removedCaseIds = new Set(input.caseIds);
  if (removedCaseIds.size === 0) {
    return { ok: true as const, deletedObjects: 0 };
  }

  const client = input.supabase as EvidenceRemovalStorageClient;
  const bucket = client.storage.from(input.bucket || getEvidenceBucket());
  const casePrefixes: string[] = [];
  for (const caseId of removedCaseIds) {
    if (
      !caseId ||
      caseId === "." ||
      caseId === ".." ||
      safePathSegment(caseId) !== caseId
    ) {
      return { ok: false as const, error: "Stored case identifier is invalid." };
    }
    casePrefixes.push(`${safePathSegment(input.userId)}/${caseId}`);
  }

  async function listPathsUnderCasePrefixes() {
    const paths = new Set<string>();
    let entriesVisited = 0;
    const pending = casePrefixes.map((prefix) => ({ prefix, depth: 0 }));

    while (pending.length > 0) {
      const current = pending.shift();
      if (!current || current.depth > maximumEvidenceCleanupDepth) {
        return { ok: false as const, error: "Private evidence folder depth is invalid." };
      }

      for (let offset = 0; ; offset += evidenceListPageSize) {
        let page;
        try {
          page = await bucket.list(current.prefix, {
            limit: evidenceListPageSize,
            offset,
            sortBy: { column: "name", order: "asc" },
          });
        } catch {
          return { ok: false as const, error: "Unable to list private evidence for deletion." };
        }
        if (page.error || !Array.isArray(page.data)) {
          return { ok: false as const, error: "Unable to list private evidence for deletion." };
        }

        for (const item of page.data) {
          const name = item?.name;
          if (
            typeof name !== "string" ||
            !name ||
            name === "." ||
            name === ".." ||
            safePathSegment(name) !== name
          ) {
            return { ok: false as const, error: "Private evidence contains an invalid object name." };
          }
          entriesVisited += 1;
          if (entriesVisited > maximumEvidenceCleanupEntries) {
            return { ok: false as const, error: "Private evidence cleanup exceeds the safe batch limit." };
          }

          const fullPath = `${current.prefix}/${name}`;
          if (item.id === null) {
            pending.push({ prefix: fullPath, depth: current.depth + 1 });
          } else if (typeof item.id === "string" && item.id) {
            paths.add(fullPath);
          } else {
            return { ok: false as const, error: "Private evidence listing is invalid." };
          }
        }

        if (page.data.length < evidenceListPageSize) break;
      }
    }

    return { ok: true as const, paths: [...paths] };
  }

  const listing = await listPathsUnderCasePrefixes();
  if (!listing.ok) return listing;
  const storagePaths = listing.paths;
  for (let offset = 0; offset < storagePaths.length; offset += evidenceRemovalBatchSize) {
    const batch = storagePaths.slice(offset, offset + evidenceRemovalBatchSize);
    let failed = false;
    try {
      const { error } = await bucket.remove(batch);
      failed = Boolean(error);
    } catch {
      failed = true;
    }
    if (failed) {
      return {
        ok: false as const,
        error: "Unable to delete every private evidence file for the removed case.",
      };
    }
  }

  const verification = await listPathsUnderCasePrefixes();
  if (!verification.ok) return verification;
  if (verification.paths.length > 0) {
    return {
      ok: false as const,
      error: "Private evidence deletion could not be verified.",
    };
  }

  return { ok: true as const, deletedObjects: storagePaths.length };
}

function isStoredEvidenceItem(value: unknown): value is EvidenceItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<EvidenceItem>;
  return (
    typeof item.id === "string" &&
    typeof item.userId === "string" &&
    typeof item.caseId === "string" &&
    typeof item.originalFileName === "string" &&
    typeof item.storedFileName === "string" &&
    typeof item.fileType === "string" &&
    typeof item.storagePath === "string"
  );
}

export function findEvidenceItemInSnapshots(
  rows: EvidenceSnapshotRow[],
  input: { userId: string; evidenceId: string; caseId?: string }
) {
  for (const row of rows) {
    const evidenceItems = row.dataset?.evidenceItems;
    if (!Array.isArray(evidenceItems)) continue;

    const item = evidenceItems.find(
      (candidate) =>
        isStoredEvidenceItem(candidate) &&
        candidate.id === input.evidenceId &&
        candidate.userId === input.userId &&
        (!input.caseId || candidate.caseId === input.caseId)
    );

    if (item) return item;
  }

  return null;
}

export function findEvidenceRecordInSnapshots(
  rows: EvidenceSnapshotRow[],
  input: { userId: string; evidenceId: string; caseId?: string }
) {
  for (const row of rows) {
    if (!row.case_key) continue;
    const evidence = findEvidenceItemInSnapshots([row], input);
    if (evidence) return { evidence, caseKey: row.case_key };
  }
  return null;
}

export async function getAuthoritativeEvidenceItem(input: {
  supabase: unknown;
  userId: string;
  evidenceId: string;
  caseId?: string;
}) {
  const supabase = input.supabase as {
    from: (table: "records_case_snapshots") => EvidenceSnapshotQuery;
  };
  const { data, error } = await supabase
    .from("records_case_snapshots")
    .select("case_key,dataset")
    .eq("user_id", input.userId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return { error: "Unable to verify evidence record.", reason: "query_failed" as const };
  }

  const record = findEvidenceRecordInSnapshots(data || [], {
    userId: input.userId,
    evidenceId: input.evidenceId,
    caseId: input.caseId,
  });

  if (!record) {
    return {
      error: "Evidence record was not found for this account.",
      reason: "not_found" as const,
    };
  }

  return record;
}
