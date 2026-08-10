import { pathToFileURL } from "node:url";
import {
  backupSupabaseStorage,
  createStorageBackupClients,
  loadStorageBackupConfig,
} from "./storage-backup-lib.mjs";

export async function main() {
  const config = loadStorageBackupConfig();
  const clients = createStorageBackupClients(config);
  const result = await backupSupabaseStorage({ config, ...clients });
  console.log(
    `Off-site evidence backup completed: ${result.fileCount} files, ${result.totalBytes} bytes; retained through ${result.retainUntil.toISOString().slice(0, 10)}.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(`Off-site evidence backup failed: ${error.message}`);
    process.exitCode = 1;
  });
}
