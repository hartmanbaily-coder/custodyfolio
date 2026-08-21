import { readFile } from "node:fs/promises";
import path from "node:path";
import { validatePrivacyRightsEvidence } from "./privacy-rights-evidence-lib.mjs";

const evidencePath = process.env.PRIVACY_RIGHTS_REQUEST_FILE || "ops/privacy-rights-request.json";
const absolutePath = path.resolve(process.cwd(), evidencePath);

if (path.basename(absolutePath).includes(".example.")) {
  console.error("Privacy-rights evidence must be a real request artifact, not the example template.");
  process.exit(1);
}

let evidence;
try {
  evidence = JSON.parse(await readFile(absolutePath, "utf8"));
} catch (error) {
  console.error(`Unable to read privacy-rights evidence at ${evidencePath}: ${error.message}`);
  process.exit(1);
}

const result = validatePrivacyRightsEvidence(evidence);
if (!result.valid) {
  console.error(`Privacy-rights evidence verification failed:\n- ${result.errors.join("\n- ")}`);
  process.exit(1);
}

console.log(`Privacy-rights request ${evidence.requestId} verified complete.`);
console.log(`Completed at ${evidence.completedAt}.`);
