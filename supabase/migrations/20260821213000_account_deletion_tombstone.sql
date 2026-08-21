-- Block evidence uploads as soon as permanent account deletion starts. The
-- tombstone deliberately has no Auth foreign key so the completed deletion
-- record survives removal of auth.users and closes in-flight upload races.

create table if not exists public.records_account_deletion_tombstones (
  user_id uuid primary key,
  status text not null check (status in ('active', 'completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (status = 'active' and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  )
);

alter table public.records_account_deletion_tombstones enable row level security;
alter table public.records_account_deletion_tombstones force row level security;

revoke all on table public.records_account_deletion_tombstones
  from public, anon, authenticated;
grant select, insert, update, delete on table public.records_account_deletion_tombstones
  to service_role;

create index if not exists records_account_deletion_tombstones_status_idx
  on public.records_account_deletion_tombstones(status, started_at desc);
