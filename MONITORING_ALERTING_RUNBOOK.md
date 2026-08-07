# Monitoring and Alerting Runbook

Custody Folio must be monitored as a high-sensitivity records system. Alerts should detect unauthorized access attempts, evidence access anomalies, failed storage/security controls, and production readiness regressions without logging sensitive record contents.

## Monitoring Goals

- Detect authentication abuse, credential attacks, and account takeover signals.
- Detect unauthorized or unusual evidence download/delete attempts.
- Detect storage, malware-scanner, and Supabase API failures.
- Detect readiness drift before production traffic is accepted.
- Preserve useful audit evidence without collecting note bodies, file contents, raw storage paths, child names, court details, payment references, or generated report bodies.

## Required Sources

- Hosting/CDN/WAF logs
- Next.js application logs
- App security events emitted by `src/lib/security/securityEvents.ts`
- Supabase Auth logs
- Supabase Postgres logs
- Supabase Storage logs
- Malware scanner logs
- Deployment/CI logs
- Domain/DNS change logs

## Alert Channels

Configure at least two monitored channels:

- Primary: security operations mailbox or paging channel
- Secondary: founder/operator SMS or backup paging channel

Do not route sensitive payloads into chat tools. Alerts should include event type, environment, route, status, timestamp, request id, user id hash when available, and investigation link.

Set `SECURITY_EVENT_SINK` to `platform`, `siem`, or `webhook` before launch. If `webhook` is used, `SECURITY_EVENT_WEBHOOK_URL` must be HTTPS and the receiver must treat payloads as security telemetry.

After configuring the sink, run:

```bash
npm run verify:security-events
```

For webhook sinks, the script requires a successful HTTPS response. For platform or SIEM sinks, confirm the synthetic sanitized event appears in the monitoring tool before setting `SECURITY_MONITORING_ENABLED=true`.

## Current Automated Monitor

`.github/workflows/live-monitor.yml` runs every 30 minutes and can also be started manually. It checks:

- `https://custodyfolio.com/records` responds successfully.
- Required security headers are present.
- `/api/records/readiness` responds with JSON.
- Any readiness blockers are limited to the known unresolved launch gates. Those gates are logged as warnings during beta testing rather than reported as a service outage.

If the workflow fails, it opens or comments on a GitHub issue labeled `live-monitor`. A later successful run comments on and closes that issue. This provides a basic live drift alert, but it does not replace the required production monitoring channels above. Keep `SECURITY_MONITORING_ENABLED=false` until the owner has confirmed the alert channel is watched and the platform/SIEM/webhook event sink is visible in production logs.

Current verified routing as of 2026-07-26:

- `security@custodyfolio.com` is hosted through the iCloud+ Custom Email Domain and opens in the Custody Folio iCloud mailbox.
- The required iCloud Mail MX, SPF, DKIM, and ownership-verification records are managed in the `custodyfolio.com` Cloudflare zone.
- The scheduled GitHub `live-monitor` workflow is active and its recent runs are passing.
- A synthetic failed login produced a sanitized `auth_login_failed` event in the production Docker platform logs.

This makes the published security contact usable and verifies the platform event sink. The monitoring readiness flag remains false until internal security-event thresholds also create an external alert instead of existing only in platform logs.

## Required Alerts

| Signal | Suggested Threshold | Severity |
| --- | --- | --- |
| Failed records logins | 10 failures for one account or IP in 10 minutes | Medium |
| Failed logins across many accounts | 25 failures in 10 minutes | High |
| Readiness endpoint gains an unexpected blocker, becomes malformed, or stops responding | Any transition | High |
| Evidence download denied | 5 denied attempts by same user/IP in 15 minutes | High |
| Evidence delete denied | Any repeated denial after one retry | High |
| Evidence upload malware blocked | Any confirmed scanner block | High |
| Malware scanner unavailable | Any production scanner outage over 5 minutes | High |
| Storage download/upload/delete failure spike | 5 failures in 10 minutes | High |
| 5xx error spike on records routes | 10 errors in 10 minutes | High |
| Supabase Auth configuration drift | Any required control disabled | Critical |
| Public evidence bucket or public evidence URL detected | Any event | Critical |
| Service role key exposure suspected | Any event | Critical |
| Deployment to production without readiness pass | Any event | Critical |
| DNS or hosting target changed | Any unplanned event | High |

## Daily Review

Review:

- Production readiness status
- Failed login trends
- Evidence download/delete volume
- New Supabase security advisor findings
- New WAF blocks
- 5xx route errors
- Malware scanner status
- Backup job status

## Weekly Review

Review:

- Supabase security and performance advisors
- Dependency and secret-scanning results
- Open incident tickets
- Access changes in Supabase, hosting, DNS, GitHub, monitoring, and scanner vendor
- Evidence storage bucket public/private state
- Logs for accidental sensitive data leakage

## Monthly Review

Review:

- Two-user isolation test status
- Backup restore test schedule
- Vendor security changes
- Data retention/deletion queue
- Privacy/security readiness gates
- Incident response contact list

## Privacy Rules for Logs

Never log:

- Note bodies
- Evidence file contents
- Raw storage object paths
- Child names
- Other parent names
- Court details
- Agency case numbers
- Payment reference numbers
- Full report exports
- Session tokens, refresh tokens, service-role keys, API keys, malware scanner keys

Allowed operational fields:

- Request id
- Route
- Method
- Status code
- Timestamp
- Environment
- User id hash or internal id
- Case id hash or internal id
- Evidence id
- Event category
- Generic error code

## Escalation

Critical events require immediate containment and incident response:

- Public exposure of evidence files
- Service-role key or auth token exposure
- Confirmed cross-user access
- Malware scanner bypass
- Unauthorized production database or storage access
- Breach involving custody, child, court, financial, school, health-adjacent, or evidence data

Use `INCIDENT_RESPONSE_RUNBOOK.md` for containment, investigation, notification, and recovery.
