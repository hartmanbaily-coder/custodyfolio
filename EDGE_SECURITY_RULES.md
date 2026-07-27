# Edge Security Rules

Use these as the starting production rule set for the hosting/CDN/WAF provider. Apply them at `custodyfolio.com` before setting `EDGE_RATE_LIMITING_ENABLED=true` or `EDGE_WAF_ENABLED=true`.

Current status from 2026-07-25: `custodyfolio.com` is active on Cloudflare, and its proxied apex and `www` records route through the healthy Custody Folio production tunnel. Keep the WAF and rate-limit readiness flags evidence-backed; do not enable them until the corresponding rules are applied and verified.

## Route Groups

| Group | Routes | Risk |
| --- | --- | --- |
| Auth | `/api/records/auth/login`, `/api/records/auth/mfa/*`, `/api/records/auth/logout`, `/api/records/auth/session` | Credential abuse, MFA brute force |
| Dataset | `/api/records/dataset` | Private records read/write |
| Evidence | `/api/records/evidence/preflight`, `/api/records/evidence/upload`, `/api/records/evidence/download`, `/api/records/evidence/delete` | Private files, malware scanning, storage abuse |
| Edge probe | `/api/records/edge-control-probe` | Synthetic WAF/rate-limit verification only; no user data |
| Readiness | `/api/records/readiness`, `/launch-readiness` | Operational status, should not expose secrets |
| App | `/`, `/records`, `/privacy`, `/terms` | Normal app access |

## Required Controls

- HTTPS only.
- Redirect HTTP to HTTPS.
- HSTS enabled after validating all required subdomains.
- Block known malicious IP reputation lists.
- Bot/challenge mode for abnormal auth and evidence request patterns.
- Request body size cap no higher than `EVIDENCE_MAX_FILE_BYTES` plus multipart overhead.
- No public cache for records API responses.
- Log request id, route, status, country/region, and WAF action without logging request bodies.

## Suggested Rate Limits

| Route group | Suggested rule | Action |
| --- | --- | --- |
| Auth login | 10 requests per IP per 10 minutes and 10 per email hash per 10 minutes when provider supports request attributes | Challenge or block |
| MFA verify | 8 requests per IP per 10 minutes | Challenge or block |
| Dataset write | 60 requests per authenticated user per 10 minutes | Throttle |
| Evidence preflight | 30 requests per authenticated user per 10 minutes | Throttle |
| Evidence upload | 10 uploads per authenticated user per 10 minutes | Throttle |
| Evidence download | 60 downloads per authenticated user per 10 minutes | Alert after threshold; throttle if anomalous |
| Evidence delete | 20 deletes per authenticated user per 10 minutes | Alert and throttle |
| Edge probe | 3 requests per IP per 10 seconds | Block with HTTP 429 |
| Readiness | 60 requests per IP per 10 minutes | Throttle |

Keep the app-level fallback limiter enabled even after provider limits are configured.

## Cloudflare-Style Match Targets

Use equivalent expressions for your provider.

```text
http.host eq "custodyfolio.com"
and http.request.uri.path starts_with "/api/records/auth/"
```

```text
http.host eq "custodyfolio.com"
and http.request.uri.path starts_with "/api/records/evidence/"
```

```text
http.host eq "custodyfolio.com"
and http.request.uri.path eq "/api/records/dataset"
```

```text
http.host eq "custodyfolio.com"
and (
  http.request.uri.path eq "/api/records/readiness"
  or http.request.uri.path eq "/launch-readiness"
)
```

## Cloudflare Validation Rules

Add these rules first so `npm run verify:edge-controls` can prove the provider is active without touching real records.

WAF custom rule:

```text
http.host eq "custodyfolio.com"
and http.request.uri.path eq "/api/records/edge-control-probe"
and http.request.uri.query contains "edge_waf_probe"
```

Action: block. The verifier expects HTTP `403`.

Rate limiting rule:

```text
http.host eq "custodyfolio.com"
and http.request.uri.path eq "/api/records/edge-control-probe"
```

Threshold: 3 requests per IP per 10 seconds. Action: block/throttle with HTTP `429`.

Then run:

```bash
RECORDS_APP_BASE_URL=https://custodyfolio.com npm run verify:edge-controls
```

If the command prints `EDGE_CONTROLS_TESTED_AT=<date>`, record the date, provider, and rule IDs before setting the production readiness flags.

## Launch Evidence

Before setting edge readiness flags, record:

- provider name
- rule ids or dashboard links
- creation date
- thresholds
- action type for each route group
- reviewer
- test results showing legitimate login, dataset save, evidence upload, evidence download, and readiness calls still work

Then set:

```bash
EDGE_RATE_LIMITING_ENABLED=true
EDGE_RATE_LIMITING_PROVIDER=<provider>
EDGE_WAF_ENABLED=true
EDGE_WAF_PROVIDER=<provider>
```
