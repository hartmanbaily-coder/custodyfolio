# Custody Folio Capacity Review — 2026-08-15

Status: adequate for TestFlight, prelaunch, and a small monitored initial cohort. Keep `STARTER_RESOURCE_PROFILE=true`; this review does not justify clearing the starter-capacity warning.

Snapshot time: approximately 2026-08-15 22:09 UTC. The figures are point-in-time observations, not a load test or a traffic forecast.

## Current utilization

| Resource | Snapshot | Assessment |
| --- | --- | --- |
| Host load | 0.01 / 0.02 / 0.03; uptime 33 days | No CPU pressure observed. |
| Host memory | 3,819 MiB total; 2,489 MiB used; 1,329 MiB available; no swap | Adequate current headroom, but ClamAV makes this a deliberately small starter host. |
| Root disk | 75 GB total; 53 GB used; 19 GB available; 74% used | First likely constraint. Alert and investigate at 80%; upgrade/expand or remove safe-to-delete cache before 85%. |
| App container | 88.07 MiB of 768 MiB; 0.00% CPU | Healthy at snapshot. |
| ClamAV container | 972.4 MiB of 2.5 GiB; 0.01% CPU | Healthy and within limit; signature reloads and concurrent scans remain the main memory risk. |
| Caddy | 46.85 MiB of 128 MiB; 2.77% CPU | Healthy at snapshot. |
| Cloudflare Tunnel | 29.95 MiB of 128 MiB; 0.18% CPU | Healthy at snapshot. |
| Supabase database | 14 MB; 12 of 60 connections at snapshot | Very small dataset. Connection usage includes platform/internal activity and should be trended rather than interpreted as 20% customer load. |
| Supabase usage | 8 Auth users; 2 billing accounts; 8 provider-subscription rows; 7 storage objects totaling about 9.7 MiB | Low-volume prelaunch state. Billing rows include test/historical lifecycle data and are not eight paying customers. |

## Guardrails

- Keep the existing 25 MB evidence upload limit and the ClamAV queue/thread limits.
- Upgrade the host no later than 100 customer accounts, or earlier if any threshold below is reached.
- Warn when available host memory stays below 768 MiB for 15 minutes, the app exceeds 70% of its memory limit, ClamAV exceeds 75% of its limit outside a short signature reload, or any OOM event occurs.
- Warn at 80% disk and treat 85% as an upgrade/cleanup action threshold. Review Docker build cache, release images, and rotated logs without deleting the tagged rollback release.
- Warn when database connections stay above 70% of the project limit, p95 API latency materially regresses, evidence uploads retry or time out, scanner queue saturation occurs, or webhook/reconciliation jobs fall behind.
- Re-run clean/EICAR malware verification after every host-size or scanner-memory change.
- Run a staged concurrency/load test before a public marketing push or any forecast that could add more than 25 active users in a week.

## Decision

No capacity blocker exists for continued testing or a small monitored launch cohort. The 4 GiB profile remains a visible warning because the evidence is a quiet-system snapshot and disk is already at 74%. The next review is due before 100 customer accounts, after a material traffic change, or within 30 days of billing activation—whichever comes first.

Supabase's current guidance is to start with measured compute, monitor CPU/memory/connections, load test outside production, and upgrade based on observed demand: [manage compute usage](https://supabase.com/docs/guides/platform/manage-your-usage/compute), [compute and disk](https://supabase.com/docs/guides/platform/compute-and-disk), and [shared responsibility](https://supabase.com/docs/guides/deployment/shared-responsibility-model).
