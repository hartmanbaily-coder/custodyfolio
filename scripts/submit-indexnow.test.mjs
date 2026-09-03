import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  APPROVED_INDEXNOW_URLS,
  INDEXNOW_ENDPOINT,
  INDEXNOW_HOST,
  INDEXNOW_KEY,
  INDEXNOW_KEY_FILE,
  INDEXNOW_KEY_LOCATION,
  buildIndexNowPayload,
  executeIndexNow,
  resolveIndexNowMode,
  validateIndexNowPayload,
  verifyLocalIndexNowKeyFile,
} from "./submit-indexnow.mjs";

test("uses only the approved IndexNow endpoint, host, key, and URLs", () => {
  assert.equal(INDEXNOW_ENDPOINT, "https://api.indexnow.org/indexnow");
  assert.equal(INDEXNOW_HOST, "custodyfolio.com");
  assert.match(INDEXNOW_KEY, /^[a-f0-9]{32}$/);
  assert.equal(
    INDEXNOW_KEY_LOCATION,
    `https://custodyfolio.com/${INDEXNOW_KEY}.txt`,
  );
  assert.deepEqual(APPROVED_INDEXNOW_URLS, [
    "https://custodyfolio.com/",
    "https://custodyfolio.com/guides/factual-custody-record-checklist",
    "https://custodyfolio.com/guides/weekly",
  ]);
});

test("serves a local key file containing only the approved key", async () => {
  assert.equal(await verifyLocalIndexNowKeyFile(), true);
  const keyFileContents = await readFile(INDEXNOW_KEY_FILE, "utf8");
  assert.equal(keyFileContents.replace(/\n$/, ""), INDEXNOW_KEY);
});

test("builds and validates the exact approved payload", () => {
  assert.deepEqual(validateIndexNowPayload(buildIndexNowPayload()), {
    host: "custodyfolio.com",
    key: INDEXNOW_KEY,
    keyLocation: INDEXNOW_KEY_LOCATION,
    urlList: [...APPROVED_INDEXNOW_URLS],
  });
});

test("rejects an extra URL", () => {
  const payload = buildIndexNowPayload();
  payload.urlList.push("https://custodyfolio.com/not-approved");
  assert.throws(
    () => validateIndexNowPayload(payload),
    /approved allowlist/,
  );
});

test("dry run prints the bounded request without using fetch", async () => {
  let fetchCount = 0;
  const output = [];
  const result = await executeIndexNow({
    mode: "dry-run",
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("fetch must not run during a dry run");
    },
    output: (value) => output.push(value),
  });

  assert.equal(fetchCount, 0);
  assert.equal(result.submitted, false);
  assert.equal(result.request.endpoint, INDEXNOW_ENDPOINT);
  assert.deepEqual(result.request.payload.urlList, APPROVED_INDEXNOW_URLS);
  assert.equal(output.length, 1);
});

for (const status of [200, 202]) {
  test(`submits exactly once and accepts response ${status}`, async () => {
    const requests = [];
    const result = await executeIndexNow({
      mode: "submit",
      fetchImpl: async (endpoint, options) => {
        requests.push({ endpoint, options });
        return new Response("", { status });
      },
      output: () => {},
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].endpoint, INDEXNOW_ENDPOINT);
    assert.equal(requests[0].options.method, "POST");
    assert.deepEqual(
      JSON.parse(requests[0].options.body),
      buildIndexNowPayload(),
    );
    assert.equal(result.status, status);
    assert.equal(result.urlCount, 3);
  });
}

test("stops after one rejected response and does not retry", async () => {
  let fetchCount = 0;
  await assert.rejects(
    executeIndexNow({
      mode: "submit",
      fetchImpl: async () => {
        fetchCount += 1;
        return new Response("invalid key", { status: 403 });
      },
      output: () => {},
    }),
    /No retry was attempted/,
  );
  assert.equal(fetchCount, 1);
});

test("accepts only one explicit execution mode", () => {
  assert.equal(resolveIndexNowMode(["--dry-run"]), "dry-run");
  assert.equal(resolveIndexNowMode(["--submit"]), "submit");
  assert.throws(() => resolveIndexNowMode([]), /exactly one mode/);
  assert.throws(() => resolveIndexNowMode(["--submit", "extra"]), /exactly one mode/);
  assert.throws(() => resolveIndexNowMode(["--other"]), /Unsupported mode/);
});
