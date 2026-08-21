import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  encodeProductionApprovalManifest,
  evaluateProductionApprovalEvidence,
} from "../src/lib/production/approvalEvidence.mjs";

const manifestPath = path.resolve(
  process.cwd(),
  process.env.PRODUCTION_APPROVAL_MANIFEST_FILE || "ops/production-approval-manifest.json"
);
const requestedScope = process.argv.includes("--retention")
  ? ["retention"]
  : process.argv.includes("--incident")
    ? ["incident"]
    : process.argv.includes("--legal")
      ? ["legal"]
      : ["retention", "incident", "legal"];

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  console.error(`Unable to read approval manifest at ${manifestPath}: ${error.message}`);
  process.exit(1);
}

const encoded = encodeProductionApprovalManifest(manifest);
const result = evaluateProductionApprovalEvidence(encoded);
const failures = [];
for (const scope of requestedScope) {
  if (result[scope].ready) {
    console.log(`${scope} approval evidence verified.`);
  } else {
    failures.push(`${scope}: ${result[scope].errors.join("; ")}`);
  }
}

if (failures.length > 0) {
  console.error(`Production approval verification failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--print-env")) {
  console.error("--print-env is disabled because approval evidence may contain reviewer and incident-response data. Use --output-env-file PATH.");
  process.exit(1);
}

const outputIndex = process.argv.indexOf("--output-env-file");
if (outputIndex >= 0) {
  const outputPath = process.argv[outputIndex + 1];
  if (!outputPath || outputPath.startsWith("--")) {
    console.error("--output-env-file requires a path.");
    process.exit(1);
  }
  const resolvedOutput = path.resolve(process.cwd(), outputPath);
  await writeFile(
    resolvedOutput,
    `PRODUCTION_APPROVAL_MANIFEST_BASE64=${encoded}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 }
  );
  await chmod(resolvedOutput, 0o600);
  console.log(`Protected approval environment file written to ${resolvedOutput}.`);
}
