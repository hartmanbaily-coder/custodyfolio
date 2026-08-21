-- Cover the billing-account foreign key used for account deletion and
-- reconciliation history lookups. Partial indexing avoids entries for the
-- intentionally retained, de-identified runs whose account link is null.

create index if not exists custody_folio_reconciliation_account_started_idx
  on public.custody_folio_reconciliation_runs(
    billing_account_id, started_at desc
  )
  where billing_account_id is not null;
