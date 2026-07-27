const baseUrl = String(process.env.RECORDS_APP_BASE_URL || "https://custodyfolio.com").replace(/\/$/, "");
const provider = String(process.env.EDGE_CONTROL_PROVIDER || "cloudflare").trim().toLowerCase();
const probePath = String(process.env.EDGE_CONTROL_PROBE_PATH || "/api/records/edge-control-probe");
const rateAttempts = Number(process.env.EDGE_RATE_LIMIT_TEST_ATTEMPTS || 8);
const resetWaitMs = Number(process.env.EDGE_RATE_LIMIT_RESET_WAIT_MS || 11000);
const expectedWafStatuses = new Set(
  String(process.env.EDGE_WAF_EXPECTED_STATUSES || "403")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter(Number.isFinite)
);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function hasCloudflareMarker(headers) {
  return Boolean(
    headers.get("cf-ray") ||
      headers.get("cf-cache-status") ||
      String(headers.get("server") || "")
        .toLowerCase()
        .includes("cloudflare")
  );
}

function hasExpectedProviderMarker(headers) {
  if (provider === "cloudflare") return hasCloudflareMarker(headers);
  return Boolean(headers.get("server") || headers.get("via") || headers.get("x-cache"));
}

async function request(url, init = {}) {
  const response = await fetch(url, {
    redirect: "manual",
    cache: "no-store",
    ...init,
    headers: {
      "Cache-Control": "no-cache",
      "X-LostToFound-Edge-Probe": "true",
      ...(init.headers || {}),
    },
  });
  return response;
}

if (!isHttpsUrl(baseUrl)) fail("RECORDS_APP_BASE_URL must be an https:// production URL.");
if (!Number.isFinite(rateAttempts) || rateAttempts < 4) {
  fail("EDGE_RATE_LIMIT_TEST_ATTEMPTS must be at least 4.");
}

const probeUrl = new URL(probePath, `${baseUrl}/`);
const baseline = await request(probeUrl);
if (![200, 204].includes(baseline.status)) {
  fail(`Edge-control probe endpoint returned HTTP ${baseline.status}; expected 200 or 204.`);
}
if (!hasExpectedProviderMarker(baseline.headers)) {
  fail(`No ${provider} marker was found on the probe response. Put custodyfolio.com behind the edge provider first.`);
}

const wafUrl = new URL(probeUrl);
wafUrl.searchParams.set("edge_waf_probe", "<script>alert(1)</script>");
const wafResponse = await request(wafUrl, { headers: { "X-LostToFound-Edge-Probe-Type": "waf" } });
if (!expectedWafStatuses.has(wafResponse.status)) {
  fail(
    `WAF probe returned HTTP ${wafResponse.status}; expected one of ${[...expectedWafStatuses].join(
      ", "
    )}. Configure a WAF rule to block edge_waf_probe test payloads.`
  );
}

await sleep(resetWaitMs);

let rateLimited = false;
for (let index = 0; index < rateAttempts; index += 1) {
  const response = await request(probeUrl, {
    method: "POST",
    headers: { "X-LostToFound-Edge-Probe-Type": "rate-limit" },
  });

  if (response.status === 429) {
    rateLimited = true;
    break;
  }

  if (![200, 204].includes(response.status)) {
    fail(`Rate-limit probe returned unexpected HTTP ${response.status}; expected 200, 204, or 429.`);
  }
}

if (!rateLimited) {
  fail(`Rate-limit probe did not receive HTTP 429 after ${rateAttempts} requests.`);
}

console.log(`Edge WAF and rate-limit controls verified for ${baseUrl}.`);
console.log(`EDGE_CONTROLS_TESTED_AT=${new Date().toISOString().slice(0, 10)}`);
