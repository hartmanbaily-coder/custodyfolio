# Incident Response Runbook

This runbook covers security and privacy incidents involving Custody Folio. It follows the practical structure of NIST SP 800-61 Rev. 3 and FTC breach-response guidance: prepare, detect, analyze, contain, eradicate, recover, communicate, and learn.

This is an operational runbook, not legal advice. Involve qualified counsel for breach notification, law enforcement, court-related records, subpoenas, and state-law analysis.

## Incident Definition

An incident is any confirmed or suspected event that threatens confidentiality, integrity, or availability of records data, evidence files, auth credentials, service credentials, backups, or logs.

Examples:

- Cross-user access to records or evidence
- Public evidence bucket or public evidence URL
- Stolen or exposed service-role key
- Stolen user session token
- Malware scanner bypass or outage during evidence intake
- Unauthorized database/storage access
- Evidence file tampering or deletion
- Production deploy that disables readiness controls
- Logs containing sensitive record content
- Unplanned data loss or failed restore

## Severity Levels

| Severity | Definition | Initial Response |
| --- | --- | --- |
| Critical | Confirmed or likely exposure, deletion, tampering, or unauthorized access to sensitive records, evidence, auth secrets, or service keys | Immediate containment and executive/legal escalation |
| High | Strong indicators of attempted unauthorized access, scanner bypass, storage misconfiguration, or repeated denied evidence access | Same day investigation and containment |
| Medium | Limited suspicious behavior or control degradation without confirmed exposure | Triage within one business day |
| Low | Non-sensitive operational issue or false-positive likely | Track and review |

## Roles

Assign named owners before launch:

- Incident commander
- Engineering lead
- Supabase/admin owner
- Hosting/CDN/WAF owner
- Communications owner
- Legal/privacy counsel
- Customer support owner
- Forensics/vendor contact

## First 15 Minutes

1. Open an incident ticket with timestamp, reporter, environment, affected systems, and severity.
2. Preserve evidence. Do not delete logs, storage objects, database rows, CI logs, or deployment artifacts.
3. Stop obvious ongoing harm:
   - disable public bucket/public URL exposure
   - revoke exposed keys
   - disable compromised accounts
   - pause evidence upload if malware scanning is unreliable
   - block abusive IPs or routes at the WAF
4. Notify the incident commander and legal/privacy counsel for High or Critical incidents.
5. Record every action taken, by whom, and when.

## First Hour

1. Determine whether sensitive data may be involved:
   - custody records
   - child-related records
   - court/school/health-adjacent notes
   - child support/payment data
   - evidence files
   - report exports
   - auth/session/service credentials
2. Identify likely blast radius:
   - users affected
   - cases affected
   - routes affected
   - storage objects affected
   - time window
3. Preserve relevant logs from:
   - Supabase Auth
   - Supabase Postgres
   - Supabase Storage
   - app server
   - hosting/CDN/WAF
   - malware scanner
   - CI/deployment
4. Rotate any credential that may be exposed:
   - Supabase service role key
   - anon/publishable key if needed
   - AUTH_SECRET
   - malware scanner credentials
   - deployment keys
   - monitoring/logging keys
5. Decide containment:
   - maintenance mode
   - disable evidence upload/download temporarily
   - block suspicious users/IPs
   - revoke sessions
   - roll back deployment

## Investigation Checklist

- What happened?
- When did it start and end?
- Which systems were involved?
- Which users and cases may be affected?
- Was data viewed, copied, modified, deleted, or made public?
- Were evidence files involved?
- Were credentials or tokens involved?
- Were backups affected?
- Did logs contain sensitive content?
- Was the issue caused by code, configuration, vendor, deployment, or abuse?
- What fixed the issue?
- What still needs monitoring?

## Notification Decision

Counsel must review notification duties. For each incident, assess:

- Applicable state breach-notification laws
- Whether data qualifies as personal information or sensitive personal information
- Whether child-related, court, payment, health-adjacent, or evidence content was involved
- Whether law enforcement notification is appropriate
- Whether a vendor or subprocessor must be notified
- Whether user notification could impede law enforcement or containment
- Whether identity-theft guidance is needed

Do not delay internal containment while legal notification analysis is underway.

## User Communications

Communications must be accurate, plain-language, and not speculative.

Do not include:

- note bodies
- evidence file contents
- other users' details
- raw storage paths
- internal secrets
- exploit instructions

Include when appropriate:

- what happened
- what data may be involved
- what was done to contain it
- what users can do
- whether passwords/sessions were reset
- where to ask questions
- when the next update will be provided

## Recovery

Before returning to normal operations:

1. Confirm the vulnerability or misconfiguration is fixed.
2. Confirm affected credentials are rotated.
3. Confirm sessions are revoked where needed.
4. Confirm evidence bucket is private.
5. Confirm cross-user isolation still passes.
6. Confirm malware scanning is available.
7. Confirm backups are intact and restorable.
8. Confirm readiness endpoint is ready.
9. Increase monitoring for at least 72 hours.

## Post-Incident Review

Complete within five business days:

- root cause
- timeline
- impact
- containment actions
- communication actions
- control failures
- code/config changes
- monitoring improvements
- policy/runbook updates
- owner and due date for every follow-up

## Critical Contacts

Current operational contacts:

- Incident commander: assigned on-call operator, reachable through `security@custodyfolio.com`
- Engineering lead: assigned engineering operator
- Supabase owner: assigned database operator
- Hosting/CDN owner: assigned infrastructure operator (Hetzner and Cloudflare)
- DNS/domain owner: assigned domain operator (Cloudflare)
- Malware scanner: self-hosted ClamAV on the dedicated CustodyFolio host
- Monitoring sources: Hetzner/Docker platform logs, Cloudflare, and the scheduled GitHub `live-monitor` workflow
- Security contact email: `security@custodyfolio.com`, hosted through the iCloud+ Custom Email Domain configured in Cloudflare DNS

Still required before legal approval:

- Legal/privacy counsel: not yet recorded
- Backup/restore escalation contact: not yet recorded
