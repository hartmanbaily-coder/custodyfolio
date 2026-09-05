# Aggregate growth report

The production image includes the reporting command and its strict validator.

Set `GROWTH_EXCLUDED_USER_IDS` in `/srv/losttofound/config/app.env` to the comma-separated UUIDs of verified internal owner/test accounts. Keep identifiers out of source, tickets, marketing artifacts, and command output. Maintain this list when internal accounts change. Do not classify an unfamiliar account as internal by its appearance or activity. An empty, missing, or malformed exclusion list stops the report before a query.

After changing the environment, recreate the app container through the normal deployment workflow. Then run on the production host:

```sh
cd /srv/losttofound/app
docker compose --env-file /srv/losttofound/config/app.env -f deploy/production/compose.yml exec -T losttofound node scripts/report-growth-scorecard.mjs
```

This command only calls `custody_folio_growth_scorecard_v2`. It validates the fixed aggregate response, suppression thresholds and trial mapping before printing. It never queries customer record tables or resolves account identities. The campaign defaults to August 31, 2026 at 08:00 UTC through execution time; use `docker compose exec -e GROWTH_WINDOW_START=... -e GROWTH_WINDOW_END=...` for another authorized window.

Initial repair on September 5, 2026 resolved the known owner/support identities and the exact synthetic account naming patterns present in the test scripts against Auth. Only matching internal UUIDs were retained in protected server configuration. This is an evidence-based initial list, not a guarantee that every historical internal account was identified.

Visits without a linked account cannot be retroactively removed using account exclusions. The three guides currently share `factual_checklist`; the walkthrough does not emit video completion events. Do not interpret these aggregates as article-specific traffic or walkthrough completion.
