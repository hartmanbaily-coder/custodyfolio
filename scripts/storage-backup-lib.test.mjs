import assert from "node:assert/strict";
import test from "node:test";
import {
  backupSupabaseStorage,
  contentBackupKey,
  loadStorageBackupConfig,
  sha256Hex,
  verifyLatestStorageBackup,
} from "./storage-backup-lib.mjs";

const baseEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key",
  EXPECTED_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  RECORDS_EVIDENCE_BUCKET: "records-evidence",
  OFFSITE_BACKUP_S3_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
  OFFSITE_BACKUP_S3_REGION: "us-west-004",
  OFFSITE_BACKUP_S3_BUCKET: "custody-folio-test-backups",
  OFFSITE_BACKUP_S3_ACCESS_KEY_ID: "test-access-key",
  OFFSITE_BACKUP_S3_SECRET_ACCESS_KEY: "test-secret-key",
  OFFSITE_BACKUP_RETENTION_DAYS: "178",
  OFFSITE_BACKUP_OBJECT_LOCK_MODE: "COMPLIANCE",
};

test("requires HTTPS, production project matching, and at most 180 days retention", () => {
  assert.equal(loadStorageBackupConfig(baseEnv).retentionDays, 178);
  assert.throws(
    () => loadStorageBackupConfig({ ...baseEnv, OFFSITE_BACKUP_RETENTION_DAYS: "179" }),
    /between 1 and 178/,
  );
  assert.throws(
    () => loadStorageBackupConfig({ ...baseEnv, OFFSITE_BACKUP_S3_ENDPOINT: "http://backup" }),
    /must use HTTPS/,
  );
  assert.throws(
    () => loadStorageBackupConfig({ ...baseEnv, EXPECTED_SUPABASE_PROJECT_REF: "wrong" }),
    /20-character/,
  );
  assert.throws(
    () =>
      loadStorageBackupConfig({
        ...baseEnv,
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.attacker.example",
      }),
    /does not match/,
  );
  assert.throws(
    () =>
      loadStorageBackupConfig({
        ...baseEnv,
        OFFSITE_BACKUP_RETENTION_DAYS: "178 days",
      }),
    /between 1 and 178/,
  );
});

test("uses content-addressed keys without exposing the source path", () => {
  const digest = sha256Hex(Buffer.from("court exhibit"));
  const key = contentBackupKey(digest);
  assert.match(key, /^objects\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/);
  assert.doesNotMatch(key, /court|exhibit/);
});

test("backs up and restore-verifies evidence without logging source paths", async () => {
  const config = loadStorageBackupConfig(baseEnv);
  const sourceBytes = Buffer.from("synthetic evidence only");
  const stored = new Map();
  const supabase = {
    storage: {
      from() {
        return {
          async list(prefix) {
            if (prefix === "") return { data: [{ id: null, name: "user-1" }], error: null };
            if (prefix === "user-1") {
              return {
                data: [
                  { id: "file-id", name: "private-file.txt", metadata: { mimetype: "text/plain" } },
                ],
                error: null,
              };
            }
            return { data: [], error: null };
          },
          async download() {
            return { data: new Blob([sourceBytes]), error: null };
          },
        };
      },
    },
  };
  const s3 = {
    async send(command) {
      const name = command.constructor.name;
      if (name === "HeadObjectCommand") {
        const error = new Error("missing");
        error.$metadata = { httpStatusCode: 404 };
        throw error;
      }
      if (name === "PutObjectCommand") {
        stored.set(command.input.Key, Buffer.from(command.input.Body));
        return {};
      }
      if (name === "ListObjectsV2Command") {
        return {
          Contents: [...stored.keys()]
            .filter((key) => key.startsWith("manifests/"))
            .map((Key) => ({ Key })),
          IsTruncated: false,
        };
      }
      if (name === "GetObjectCommand") {
        return { Body: new Uint8Array(stored.get(command.input.Key)) };
      }
      throw new Error(`Unexpected command ${name}`);
    },
  };

  const backedUp = await backupSupabaseStorage({
    config,
    supabase,
    s3,
    now: new Date("2026-08-10T12:00:00Z"),
  });
  assert.equal(backedUp.fileCount, 1);
  assert.equal(backedUp.totalBytes, sourceBytes.byteLength);
  assert.equal([...stored.keys()].some((key) => key.includes("private-file")), false);

  const verified = await verifyLatestStorageBackup({ config, s3 });
  assert.equal(verified.fileCount, 1);
  assert.equal(verified.restoredBytes, sourceBytes.byteLength);
});

test("rejects a manifest whose totals or content-addressed keys were altered", async () => {
  const config = loadStorageBackupConfig(baseEnv);
  const digest = sha256Hex(Buffer.from("synthetic evidence only"));
  const manifest = {
    format: "custody_folio_supabase_storage_backup_v1",
    generatedAt: "2026-08-10T12:00:00.000Z",
    sourceProjectRef: config.expectedProjectRef,
    sourceBucket: config.sourceBucket,
    fileCount: 1,
    totalBytes: 23,
    entries: [
      {
        sourcePath: "user-1/private-file.txt",
        backupKey: "objects/sha256/00/tampered",
        sha256: digest,
        size: 23,
      },
    ],
  };
  const s3 = {
    async send(command) {
      if (command.constructor.name === "ListObjectsV2Command") {
        return { Contents: [{ Key: "manifests/2026-08-10/test.json" }], IsTruncated: false };
      }
      if (command.constructor.name === "GetObjectCommand") {
        return { Body: Buffer.from(JSON.stringify(manifest)) };
      }
      throw new Error(`Unexpected command ${command.constructor.name}`);
    },
  };

  await assert.rejects(
    verifyLatestStorageBackup({ config, s3 }),
    /contains an invalid entry/,
  );
});
