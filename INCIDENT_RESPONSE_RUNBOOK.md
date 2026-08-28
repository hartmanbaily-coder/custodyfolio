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

## Roles and operating model

The approval manifest must identify either a staffed-team model or a solo-operator model. Names and private contact details belong only in the ignored, access-restricted production approval manifest.

For a staffed team, assign:

- primary incident commander
- backup incident commander
- engineering lead
- Supabase/admin owner
- hosting/CDN/WAF owner
- communications/support owner
- forensics/vendor contact
- backup/restore owner
- legal/privacy counsel

Every staffed-team role must have a named person or contracted service, a tested primary channel, and a tested independent backup channel.

For a solo-operated service, one named operator may own incident command, engineering, service administration, communications, and recovery. A personal telephone number is not required. The protected approval must instead:

- identify the named operator and a monitored business email;
- explicitly record that no alternate human responder is designated and that response may be delayed if the operator is unavailable;
- record current, tested authenticated support or account portals for Supabase, hosting, edge-network/DNS, backup storage, and business email;
- disclose when qualified legal counsel or a forensics provider is not retained; and
- require professional legal or forensics support when a High or Critical incident needs expertise the operator does not have.

Validate the operator contact and provider escalation routes at least every 90 days and conduct a tabletop exercise at least every 180 days. Reassess the solo-operator model before adding staff, materially increasing production volume, or accepting an insurer, customer, or regulator requirement for an alternate human responder.

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
- Whether the event may be a breach of unsecured, individually identifiable health information under the FTC Health Breach Notification Rule, including unauthorized disclosure or acquisition through an access-control failure
- Whether Washington consumer health data was involved and whether Washington My Health My Data Act duties or state breach-notification duties apply
- Whether law enforcement notification is appropriate
- Whether a vendor or subprocessor must be notified
- Whether user notification could impede law enforcement or containment
- Whether identity-theft guidance is needed

Do not delay internal containment while legal notification analysis is underway.

If the FTC Health Breach Notification Rule may apply, preserve the facts needed to determine the date of discovery, affected people, information involved, acquisition or disclosure, encryption status, and notification deadlines. Obtain counsel promptly; covered notices generally must be made without unreasonable delay and no later than the applicable federal deadline. Do not assume that an app falls outside the rule merely because it is not covered by HIPAA.

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

Public routing information:

- Security intake: `security@custodyfolio.com`, hosted through the iCloud+ Custom Email Domain configured in Cloudflare DNS
- Supabase service: production project owner and Supabase support route
- Hosting/CDN/DNS: Hetzner and Cloudflare operator/support routes
- Malware scanner: self-hosted ClamAV on the dedicated CustodyFolio host
- Monitoring sources: Hetzner/Docker platform logs, Cloudflare, and the scheduled GitHub `live-monitor` workflow

Protected contact evidence is required before approval:

- Run `npm run approval:prepare` to generate the ignored `ops/production-approval-manifest.json` template bound to exact policy digests.
- Select the staffed-team or solo-operator model; do not commit the completed manifest.
- For a staffed team, fill every required role with real names and independent channels.
- For a solo operator, record the named operator, monitored business email, accepted availability limitation, and tested provider escalation portals. Do not add a personal phone number unless the operator explicitly chooses to do so.
- Test the applicable contact and escalation routes, run a tabletop, and record the real dates.
- Run `npm run verify:approvals -- --incident` before producing the deployment secret.

`INCIDENT_RESPONSE_PLAN_APPROVED=true` is valid only when the matching incident section in `PRODUCTION_APPROVAL_MANIFEST_BASE64` also passes. The readiness gate fails closed on an incomplete operating model, placeholder contacts, missing solo-operator limitations, stale channel or provider-route tests, stale tabletops, expired approval, or a changed runbook digest.
