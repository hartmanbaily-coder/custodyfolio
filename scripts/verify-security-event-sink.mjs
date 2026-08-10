import { randomUUID } from "node:crypto";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function isHttpsUrl(value) {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const sink = String(process.env.SECURITY_EVENT_SINK || "").trim().toLowerCase();
const event = {
  event: "custody_folio_security_event",
  type: "readiness_monitoring_sink_test",
  severity: "info",
  at: new Date().toISOString(),
  environment: process.env.NODE_ENV || "verification",
  requestId: randomUUID(),
  route: "/launch-readiness",
  detail: "Synthetic monitoring sink test. Contains no user, case, child, court, payment, or evidence content.",
};

if (!["platform", "siem", "webhook"].includes(sink)) {
  fail("Set SECURITY_EVENT_SINK to platform, siem, or webhook before running this check.");
}

if (sink === "webhook") {
  const webhookUrl = process.env.SECURITY_EVENT_WEBHOOK_URL;
  if (!isHttpsUrl(webhookUrl)) {
    fail("SECURITY_EVENT_WEBHOOK_URL must be an https:// URL when SECURITY_EVENT_SINK=webhook.");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.SECURITY_EVENT_WEBHOOK_TOKEN
        ? { Authorization: `Bearer ${process.env.SECURITY_EVENT_WEBHOOK_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    fail(`Security event webhook check failed with HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  console.log(`Security event webhook verification passed at ${event.at}.`);
  console.log(`SECURITY_EVENT_SINK_TESTED_AT=${event.at.slice(0, 10)}`);
  process.exit(0);
}

console.info(JSON.stringify(event));
console.log(
  "Synthetic security event emitted. Confirm it appears in the configured platform/SIEM before marking monitoring complete."
);
console.log(`SECURITY_EVENT_SINK_EMITTED_AT=${event.at.slice(0, 10)}`);
