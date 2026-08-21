import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const skippedPathFragments = [
  "package-lock.json",
  ".next/",
  "node_modules/",
  "public/l2f-logo.png",
];

const secretPatterns = [
  {
    name: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PRIVATE )?PRIVATE KEY-----/,
  },
  {
    name: "Supabase service role JWT",
    pattern: /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/,
  },
  {
    name: "Supabase secret key",
    pattern: /sb_secret_[a-zA-Z0-9_-]{20,}/,
  },
  {
    name: "OpenAI project API key",
    pattern: /sk-proj-[a-zA-Z0-9_-]{20,}/,
  },
  {
    name: "Stripe live secret key",
    pattern: /sk_live_[a-zA-Z0-9]{16,}/,
  },
  {
    name: "Stripe live restricted key",
    pattern: /rk_live_[a-zA-Z0-9]{16,}/,
  },
  {
    name: "Stripe webhook signing secret",
    pattern: /whsec_[a-zA-Z0-9]{16,}/,
  },
  {
    name: "base64-encoded private key",
    pattern: /LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t[a-zA-Z0-9+/=_-]{20,}/,
  },
  {
    name: "encoded production approval manifest",
    pattern: /PRODUCTION_APPROVAL_MANIFEST_BASE64=[a-zA-Z0-9_-]{40,}/,
  },
  {
    name: "GitHub token",
    pattern: /gh[pousr]_[a-zA-Z0-9_]{36,}/,
  },
  {
    name: "AWS access key",
    pattern: /AKIA[0-9A-Z]{16}/,
  },
];

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => !skippedPathFragments.some((fragment) => file.includes(fragment)));
}

const findings = [];

for (const file of trackedFiles()) {
  let body;
  try {
    body = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const rule of secretPatterns) {
    if (rule.pattern.test(body)) {
      findings.push(`${file}: matched ${rule.name}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Potential committed secrets found:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("Secret pattern scan passed.");
