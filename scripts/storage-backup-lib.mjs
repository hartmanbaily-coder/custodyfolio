import { createHash } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ObjectLockMode,
  PutObjectCommand,
  PutObjectRetentionCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

export const MAX_BACKUP_RETENTION_DAYS = 178;
const LIST_PAGE_SIZE = 100;

function requireValue(env, name) {
  const value = String(env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parseRetentionDays(value) {
  const days = Number(String(value || MAX_BACKUP_RETENTION_DAYS));
  if (!Number.isInteger(days) || days < 1 || days > MAX_BACKUP_RETENTION_DAYS) {
    throw new Error(
      `OFFSITE_BACKUP_RETENTION_DAYS must be between 1 and ${MAX_BACKUP_RETENTION_DAYS}.`,
    );
  }
  return days;
}

export function loadStorageBackupConfig(env = process.env) {
  const supabaseUrl = requireValue(env, "NEXT_PUBLIC_SUPABASE_URL");
  const endpoint = requireValue(env, "OFFSITE_BACKUP_S3_ENDPOINT");
  const expectedProjectRef = requireValue(env, "EXPECTED_SUPABASE_PROJECT_REF");
  if (!/^[a-z0-9]{20}$/.test(expectedProjectRef)) {
    throw new Error("EXPECTED_SUPABASE_PROJECT_REF must be a 20-character Supabase project ref.");
  }

  let supabaseHost;
  let endpointUrl;
  try {
    supabaseHost = new URL(supabaseUrl);
    endpointUrl = new URL(endpoint);
  } catch {
    throw new Error("Supabase and off-site backup endpoints must be valid URLs.");
  }
  if (supabaseHost.protocol !== "https:" || endpointUrl.protocol !== "https:") {
    throw new Error("Supabase and off-site backup endpoints must use HTTPS.");
  }
  if (
    supabaseHost.hostname !== `${expectedProjectRef}.supabase.co` ||
    supabaseHost.username ||
    supabaseHost.password
  ) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL does not match EXPECTED_SUPABASE_PROJECT_REF.");
  }

  const lockMode = String(env.OFFSITE_BACKUP_OBJECT_LOCK_MODE || "COMPLIANCE")
    .trim()
    .toUpperCase();
  if (lockMode !== "COMPLIANCE") {
    throw new Error("OFFSITE_BACKUP_OBJECT_LOCK_MODE must be COMPLIANCE.");
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey: requireValue(env, "SUPABASE_SERVICE_ROLE_KEY"),
    expectedProjectRef,
    sourceBucket: requireValue(env, "RECORDS_EVIDENCE_BUCKET"),
    endpoint: endpointUrl.toString().replace(/\/$/, ""),
    region: requireValue(env, "OFFSITE_BACKUP_S3_REGION"),
    backupBucket: requireValue(env, "OFFSITE_BACKUP_S3_BUCKET"),
    accessKeyId: requireValue(env, "OFFSITE_BACKUP_S3_ACCESS_KEY_ID"),
    secretAccessKey: requireValue(env, "OFFSITE_BACKUP_S3_SECRET_ACCESS_KEY"),
    retentionDays: parseRetentionDays(env.OFFSITE_BACKUP_RETENTION_DAYS),
    lockMode,
  };
}

export function createStorageBackupClients(config) {
  return {
    supabase: createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    s3: new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
  };
}

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function contentBackupKey(sha256) {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Invalid SHA-256 digest.");
  return `objects/sha256/${sha256.slice(0, 2)}/${sha256}`;
}

function timestampKey(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function isNotFound(error) {
  return (
    error?.name === "NotFound" ||
    error?.name === "NoSuchKey" ||
    error?.$metadata?.httpStatusCode === 404
  );
}

export async function bodyToBytes(body) {
  if (!body) throw new Error("Backup object response did not include a body.");
  if (typeof body.transformToByteArray === "function") {
    return new Uint8Array(await body.transformToByteArray());
  }
  if (typeof body.arrayBuffer === "function") {
    return new Uint8Array(await body.arrayBuffer());
  }
  if (body instanceof Uint8Array) return body;
  if (typeof body[Symbol.asyncIterator] === "function") {
    const chunks = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk));
    return new Uint8Array(Buffer.concat(chunks));
  }
  throw new Error("Backup object body type is unsupported.");
}

export async function listSupabaseStorageFiles(supabase, bucket) {
  const storage = supabase.storage.from(bucket);
  const files = [];
  const prefixes = [""];
  const visited = new Set();

  while (prefixes.length > 0) {
    const prefix = prefixes.shift();
    if (visited.has(prefix)) continue;
    visited.add(prefix);

    for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
      const { data, error } = await storage.list(prefix, {
        limit: LIST_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error("Unable to enumerate private evidence storage.");

      for (const item of data || []) {
        if (!item?.name || item.name === ".emptyFolderPlaceholder") continue;
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id) {
          files.push({ path: itemPath, metadata: item.metadata || {} });
        } else {
          prefixes.push(itemPath);
        }
      }
      if (!data || data.length < LIST_PAGE_SIZE) break;
    }
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function downloadSupabaseObject(supabase, bucket, objectPath) {
  const { data, error } = await supabase.storage.from(bucket).download(objectPath);
  if (error || !data) throw new Error("Unable to download a private evidence object for backup.");
  return new Uint8Array(await data.arrayBuffer());
}

async function ensureContentObject({ s3, config, key, bytes, retainUntil }) {
  let exists = false;
  try {
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: config.backupBucket, Key: key }),
    );
    exists = true;
    if (Number(head.ContentLength) !== bytes.byteLength) {
      throw new Error("Existing off-site backup object has an unexpected size.");
    }
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  if (!exists) {
    await s3.send(
      new PutObjectCommand({
        Bucket: config.backupBucket,
        Key: key,
        Body: bytes,
        ContentType: "application/octet-stream",
        ServerSideEncryption: "AES256",
        ObjectLockMode: ObjectLockMode.COMPLIANCE,
        ObjectLockRetainUntilDate: retainUntil,
      }),
    );
    return;
  }

  await s3.send(
    new PutObjectRetentionCommand({
      Bucket: config.backupBucket,
      Key: key,
      Retention: {
        Mode: ObjectLockMode.COMPLIANCE,
        RetainUntilDate: retainUntil,
      },
    }),
  );
}

export async function backupSupabaseStorage({ config, supabase, s3, now = new Date() }) {
  const files = await listSupabaseStorageFiles(supabase, config.sourceBucket);
  const retainUntil = new Date(now.getTime() + config.retentionDays * 86_400_000);
  const entries = [];
  let totalBytes = 0;

  for (const file of files) {
    const bytes = await downloadSupabaseObject(supabase, config.sourceBucket, file.path);
    const sha256 = sha256Hex(bytes);
    const backupKey = contentBackupKey(sha256);
    await ensureContentObject({ s3, config, key: backupKey, bytes, retainUntil });
    totalBytes += bytes.byteLength;
    entries.push({
      sourcePath: file.path,
      backupKey,
      sha256,
      size: bytes.byteLength,
      contentType: String(file.metadata?.mimetype || "application/octet-stream"),
    });
  }

  const manifest = {
    format: "custody_folio_supabase_storage_backup_v1",
    generatedAt: now.toISOString(),
    retainUntil: retainUntil.toISOString(),
    sourceProjectRef: config.expectedProjectRef,
    sourceBucket: config.sourceBucket,
    fileCount: entries.length,
    totalBytes,
    entries,
  };
  const manifestKey = `manifests/${now.toISOString().slice(0, 10)}/${timestampKey(now)}.json`;
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  await s3.send(
    new PutObjectCommand({
      Bucket: config.backupBucket,
      Key: manifestKey,
      Body: manifestBytes,
      ContentType: "application/json",
      ServerSideEncryption: "AES256",
      ObjectLockMode: ObjectLockMode.COMPLIANCE,
      ObjectLockRetainUntilDate: retainUntil,
    }),
  );

  return { manifestKey, fileCount: entries.length, totalBytes, retainUntil };
}

async function listManifestKeys(s3, bucket) {
  const keys = [];
  let continuationToken;
  do {
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "manifests/",
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of result.Contents || []) {
      if (object.Key?.endsWith(".json")) keys.push(object.Key);
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys.sort();
}

export async function verifyLatestStorageBackup({ config, s3 }) {
  const manifestKeys = await listManifestKeys(s3, config.backupBucket);
  const manifestKey = manifestKeys.at(-1);
  if (!manifestKey) throw new Error("No off-site storage backup manifest exists.");

  const manifestResult = await s3.send(
    new GetObjectCommand({ Bucket: config.backupBucket, Key: manifestKey }),
  );
  let manifest;
  try {
    manifest = JSON.parse(Buffer.from(await bodyToBytes(manifestResult.Body)).toString("utf8"));
  } catch {
    throw new Error("The latest off-site backup manifest is invalid.");
  }
  if (
    manifest?.format !== "custody_folio_supabase_storage_backup_v1" ||
    manifest.sourceProjectRef !== config.expectedProjectRef ||
    manifest.sourceBucket !== config.sourceBucket ||
    !Number.isInteger(manifest.fileCount) ||
    !Number.isInteger(manifest.totalBytes) ||
    !Array.isArray(manifest.entries)
  ) {
    throw new Error("The latest off-site backup manifest does not match production.");
  }
  if (manifest.fileCount !== manifest.entries.length || manifest.totalBytes < 0) {
    throw new Error("The latest off-site backup manifest has inconsistent totals.");
  }

  let restoredBytes = 0;
  const sourcePaths = new Set();
  for (const entry of manifest.entries) {
    if (
      typeof entry?.sourcePath !== "string" ||
      !entry.sourcePath ||
      !/^[a-f0-9]{64}$/.test(String(entry.sha256)) ||
      !Number.isInteger(entry.size) ||
      entry.size < 0 ||
      entry.backupKey !== contentBackupKey(entry.sha256) ||
      sourcePaths.has(entry.sourcePath)
    ) {
      throw new Error("The latest off-site backup manifest contains an invalid entry.");
    }
    sourcePaths.add(entry.sourcePath);
    const object = await s3.send(
      new GetObjectCommand({ Bucket: config.backupBucket, Key: entry.backupKey }),
    );
    const bytes = await bodyToBytes(object.Body);
    if (bytes.byteLength !== entry.size || sha256Hex(bytes) !== entry.sha256) {
      throw new Error("An off-site evidence backup failed its restore integrity check.");
    }
    restoredBytes += bytes.byteLength;
  }
  if (restoredBytes !== manifest.totalBytes) {
    throw new Error("The latest off-site backup manifest has inconsistent totals.");
  }

  return {
    manifestKey,
    generatedAt: manifest.generatedAt,
    fileCount: manifest.entries.length,
    restoredBytes,
  };
}
