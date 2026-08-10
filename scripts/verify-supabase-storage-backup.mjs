import { pathToFileURL } from "node:url";
import {
  createStorageBackupClients,
  loadStorageBackupConfig,
  verifyLatestStorageBackup,
} from "./storage-backup-lib.mjs";

export async function main() {
  const config = loadStorageBackupConfig();
  const { s3 } = createStorageBackupClients(config);
  const result = await verifyLatestStorageBackup({ config, s3 });
  console.log(
    `Off-site evidence restore verified: ${result.fileCount} files, ${result.restoredBytes} bytes from ${result.generatedAt}.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(`Off-site evidence restore verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
