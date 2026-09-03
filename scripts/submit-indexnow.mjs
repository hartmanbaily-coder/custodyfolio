import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_HOST = "custodyfolio.com";
export const INDEXNOW_KEY = "1bc855fae72ce5cc3ab02e3dcd51a7bb";
export const INDEXNOW_KEY_LOCATION = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;
export const INDEXNOW_KEY_FILE = new URL(
  `../public/${INDEXNOW_KEY}.txt`,
  import.meta.url,
);
export const APPROVED_INDEXNOW_URLS = Object.freeze([
  "https://custodyfolio.com/",
  "https://custodyfolio.com/guides/factual-custody-record-checklist",
  "https://custodyfolio.com/guides/weekly",
]);

const EXPECTED_PAYLOAD_KEYS = Object.freeze([
  "host",
  "key",
  "keyLocation",
  "urlList",
]);

export function buildIndexNowPayload() {
  return {
    host: INDEXNOW_HOST,
    key: INDEXNOW_KEY,
    keyLocation: INDEXNOW_KEY_LOCATION,
    urlList: [...APPROVED_INDEXNOW_URLS],
  };
}

export function validateIndexNowPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("IndexNow payload must be an object.");
  }

  if (JSON.stringify(Object.keys(payload)) !== JSON.stringify(EXPECTED_PAYLOAD_KEYS)) {
    throw new Error("IndexNow payload fields do not match the approved contract.");
  }

  if (payload.host !== INDEXNOW_HOST) {
    throw new Error("IndexNow host does not match the approved host.");
  }

  if (payload.key !== INDEXNOW_KEY || !/^[a-f0-9]{32}$/.test(payload.key)) {
    throw new Error("IndexNow key does not match the approved key format.");
  }

  if (payload.keyLocation !== INDEXNOW_KEY_LOCATION) {
    throw new Error("IndexNow key location does not match the approved location.");
  }

  if (
    !Array.isArray(payload.urlList) ||
    JSON.stringify(payload.urlList) !== JSON.stringify(APPROVED_INDEXNOW_URLS)
  ) {
    throw new Error("IndexNow URLs do not match the approved allowlist.");
  }

  return payload;
}

export async function verifyLocalIndexNowKeyFile() {
  const keyFileContents = await readFile(INDEXNOW_KEY_FILE, "utf8");
  if (keyFileContents.trim() !== INDEXNOW_KEY) {
    throw new Error("IndexNow key file does not contain the approved key.");
  }

  if (keyFileContents.replace(/\n$/, "") !== INDEXNOW_KEY) {
    throw new Error("IndexNow key file contains content beyond the approved key.");
  }

  return true;
}

export function resolveIndexNowMode(args) {
  if (args.length !== 1) {
    throw new Error("Choose exactly one mode: --dry-run or --submit.");
  }

  if (args[0] === "--dry-run") {
    return "dry-run";
  }

  if (args[0] === "--submit") {
    return "submit";
  }

  throw new Error("Unsupported mode. Use --dry-run or --submit.");
}

export async function executeIndexNow({
  mode,
  fetchImpl = globalThis.fetch,
  output = console.log,
} = {}) {
  if (mode !== "dry-run" && mode !== "submit") {
    throw new Error("IndexNow execution mode must be dry-run or submit.");
  }

  await verifyLocalIndexNowKeyFile();
  const payload = validateIndexNowPayload(buildIndexNowPayload());
  const request = {
    endpoint: INDEXNOW_ENDPOINT,
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    payload,
  };

  if (mode === "dry-run") {
    output(JSON.stringify({ mode, submitted: false, request }, null, 2));
    return { mode, submitted: false, request };
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for submission.");
  }

  const response = await fetchImpl(INDEXNOW_ENDPOINT, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(payload),
    redirect: "error",
  });
  const responseBody = (await response.text()).slice(0, 2000);

  if (response.status !== 200 && response.status !== 202) {
    throw new Error(
      `IndexNow stopped after response ${response.status}. No retry was attempted. ${responseBody}`.trim(),
    );
  }

  const result = {
    mode,
    submitted: true,
    status: response.status,
    accepted: response.status === 200 ? "received" : "key validation pending",
    urlCount: payload.urlList.length,
    responseBody,
  };
  output(JSON.stringify(result, null, 2));
  return result;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  try {
    const mode = resolveIndexNowMode(process.argv.slice(2));
    await executeIndexNow({ mode });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export const INDEXNOW_SCRIPT_PATH = fileURLToPath(import.meta.url);
