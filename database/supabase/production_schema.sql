-- Custody Folio production schema baseline.
--
-- Keep this file aligned with the applied Supabase migrations documented in
-- PRODUCTION_PREPAREDNESS.md and DEPLOYMENT_NOTES.md.
--
-- 2026 Supabase note: records data is intentionally server-mediated through
-- Next.js API routes and the Supabase service role. Do not grant direct `anon`
-- or `authenticated` table access unless a specific browser-side data path is
-- designed and reviewed.

create extension if not exists pgcrypto;

create table if not exists public.records_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  timezone text not null default 'UTC',
  credential_version text
    check (credential_version is null or char_length(credential_version) = 43),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.records_matters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_name text not null,
  court_or_order_nickname text,
  court_name text,
  order_date date,
  effective_start_date date,
  effective_end_date date,
  child_display_labels jsonb not null default '[]'::jsonb,
  user_role_label text not null,
  other_parent_label text not null,
  default_exchange_location text,
  timezone text not null default 'UTC',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.records_exchange_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.records_matters(id) on delete cascade,
  rule_name text not null,
  day_of_week integer not null check (day_of_week between 0 and 6),
  ordered_exchange_time time not null,
  direction text not null check (direction in ('other_parent_to_me', 'me_to_other_parent')),
  location text,
  effective_start_date date not null,
  effective_end_date date,
  order_provision_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.records_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.records_matters(id) on delete cascade,
  custody_exchange_rule_id uuid references public.records_exchange_rules(id) on delete set null,
  exception_date date not null,
  ordered_exchange_time time,
  status text not null check (status in ('rescheduled', 'canceled', 'added')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.records_custody_day_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.records_matters(id) on delete cascade,
  custody_date date not null,
  caregiver_label text not null,
  color text not null,
  starts_at time,
  ends_at time,
  exchange_time time,
  exchange_direction text check (exchange_direction in ('other_parent_to_me', 'me_to_other_parent')),
  exchange_location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, case_id, custody_date)
);

create table if not exists public.records_exchange_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.records_matters(id) on delete cascade,
  custody_exchange_rule_id uuid references public.records_exchange_rules(id) on delete set null,
  ordered_exchange_at timestamptz not null,
  actual_exchange_at timestamptz,
  direction text not null check (direction in ('other_parent_to_me', 'me_to_other_parent')),
  status text not null,
  location text,
  reason_given text,
  notes text,
  tags jsonb not null default '[]'::jsonb,
  witnesses text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.records_date_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.records_matters(id) on delete cascade,
  note_date date not null,
  note_time time,
  category text not null,
  title text not null,
  body text not null,
  tags jsonb not null default '[]'::jsonb,
  include_in_reports boolean not null default true,
  related_exchange_id uuid references public.records_exchange_logs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.records_evidence_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.records_matters(id) on delete cascade,
  related_exchange_id uuid references public.records_exchange_logs(id) on delete set null,
  related_note_id uuid references public.records_date_notes(id) on delete set null,
  original_file_name text not null,
  stored_file_name text not null,
  file_type text not null,
  file_size bigint not null check (file_size > 0),
  uploaded_at timestamptz not null default now(),
  evidence_date date,
  description text,
  tags jsonb not null default '[]'::jsonb,
  include_in_reports boolean not null default true,
  malware_scan_status text not null default 'pending'
    check (malware_scan_status in ('pending', 'clean', 'blocked', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.records_child_support_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.records_matters(id) on delete cascade,
  order_nickname text not null,
  ordered_amount numeric(12,2) not null check (ordered_amount >= 0),
  currency char(3) not null default 'USD',
  payment_frequency text not null,
  due_day_or_schedule text not null,
  effective_start_date date not null,
  effective_end_date date,
  payer_label text not null,
  recipient_label text not null,
  payment_method_expected text,
  agency_or_case_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.records_child_support_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.records_matters(id) on delete cascade,
  child_support_order_id uuid not null references public.records_child_support_orders(id) on delete cascade,
  due_date date not null,
  amount_due numeric(12,2) not null check (amount_due >= 0),
  amount_paid numeric(12,2) not null check (amount_paid >= 0),
  payment_date date,
  payment_status text not null,
  payment_method text not null,
  reference_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.records_expense_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.records_matters(id) on delete cascade,
  expense_date date not null,
  category text not null,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency char(3) not null default 'USD',
  paid_by_label text not null,
  reimbursement_requested boolean not null default false,
  reimbursement_due_date date,
  amount_reimbursed numeric(12,2) check (amount_reimbursed >= 0),
  reimbursement_date date,
  reimbursement_status text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.records_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references public.records_matters(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  metadata_summary text not null,
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.records_case_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_key text not null,
  dataset jsonb not null,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, case_key)
);

create index if not exists records_matters_user_idx on public.records_matters(user_id);
create index if not exists records_exchange_rules_user_idx on public.records_exchange_rules(user_id);
create index if not exists records_exchange_rules_case_idx on public.records_exchange_rules(case_id);
create index if not exists records_schedule_exceptions_user_idx on public.records_schedule_exceptions(user_id);
create index if not exists records_schedule_exceptions_case_idx on public.records_schedule_exceptions(case_id);
create index if not exists records_schedule_exceptions_rule_idx on public.records_schedule_exceptions(custody_exchange_rule_id);
create index if not exists records_custody_days_case_idx on public.records_custody_day_assignments(case_id);
create index if not exists records_exchange_logs_case_date_idx on public.records_exchange_logs(case_id, ordered_exchange_at);
create index if not exists records_exchange_logs_user_idx on public.records_exchange_logs(user_id);
create index if not exists records_exchange_logs_rule_idx on public.records_exchange_logs(custody_exchange_rule_id);
create index if not exists records_notes_case_date_idx on public.records_date_notes(case_id, note_date);
create index if not exists records_notes_user_idx on public.records_date_notes(user_id);
create index if not exists records_notes_related_exchange_idx on public.records_date_notes(related_exchange_id);
create index if not exists records_evidence_case_date_idx on public.records_evidence_items(case_id, evidence_date);
create index if not exists records_evidence_user_idx on public.records_evidence_items(user_id);
create index if not exists records_evidence_related_exchange_idx on public.records_evidence_items(related_exchange_id);
create index if not exists records_evidence_related_note_idx on public.records_evidence_items(related_note_id);
create index if not exists records_support_orders_user_idx on public.records_child_support_orders(user_id);
create index if not exists records_support_orders_case_idx on public.records_child_support_orders(case_id);
create index if not exists records_support_payments_case_due_idx on public.records_child_support_payments(case_id, due_date);
create index if not exists records_support_payments_user_idx on public.records_child_support_payments(user_id);
create index if not exists records_support_payments_order_idx on public.records_child_support_payments(child_support_order_id);
create index if not exists records_expenses_case_date_idx on public.records_expense_items(case_id, expense_date);
create index if not exists records_expenses_user_idx on public.records_expense_items(user_id);
create index if not exists records_audit_case_created_idx on public.records_audit_logs(case_id, created_at desc);
create index if not exists records_audit_user_idx on public.records_audit_logs(user_id);
create index if not exists records_case_snapshots_user_idx on public.records_case_snapshots(user_id);

alter table public.records_profiles enable row level security;
alter table public.records_matters enable row level security;
alter table public.records_exchange_rules enable row level security;
alter table public.records_schedule_exceptions enable row level security;
alter table public.records_custody_day_assignments enable row level security;
alter table public.records_exchange_logs enable row level security;
alter table public.records_date_notes enable row level security;
alter table public.records_evidence_items enable row level security;
alter table public.records_child_support_orders enable row level security;
alter table public.records_child_support_payments enable row level security;
alter table public.records_expense_items enable row level security;
alter table public.records_audit_logs enable row level security;
alter table public.records_case_snapshots enable row level security;

revoke all on
  public.records_profiles,
  public.records_matters,
  public.records_exchange_rules,
  public.records_schedule_exceptions,
  public.records_custody_day_assignments,
  public.records_exchange_logs,
  public.records_date_notes,
  public.records_evidence_items,
  public.records_child_support_orders,
  public.records_child_support_payments,
  public.records_expense_items,
  public.records_case_snapshots
from anon, authenticated;

revoke all on public.records_audit_logs from anon, authenticated;

drop policy if exists "owners_select_profiles" on public.records_profiles;
drop policy if exists "owners_write_profiles" on public.records_profiles;
drop policy if exists "owners_insert_profiles" on public.records_profiles;
drop policy if exists "owners_update_profiles" on public.records_profiles;
drop policy if exists "owners_delete_profiles" on public.records_profiles;
drop policy if exists "owners_write_matters" on public.records_matters;
drop policy if exists "owners_write_exchange_rules" on public.records_exchange_rules;
drop policy if exists "owners_write_schedule_exceptions" on public.records_schedule_exceptions;
drop policy if exists "owners_write_custody_days" on public.records_custody_day_assignments;
drop policy if exists "owners_write_exchange_logs" on public.records_exchange_logs;
drop policy if exists "owners_write_date_notes" on public.records_date_notes;
drop policy if exists "owners_write_evidence_items" on public.records_evidence_items;
drop policy if exists "owners_write_support_orders" on public.records_child_support_orders;
drop policy if exists "owners_write_support_payments" on public.records_child_support_payments;
drop policy if exists "owners_write_expenses" on public.records_expense_items;
drop policy if exists "owners_select_audit_logs" on public.records_audit_logs;
drop policy if exists "owners_insert_audit_logs" on public.records_audit_logs;
drop policy if exists "owners_write_case_snapshots" on public.records_case_snapshots;

create policy "owners_select_profiles" on public.records_profiles
  for select to authenticated using ((select auth.uid()) is not null and user_id = (select auth.uid()));
create policy "owners_insert_profiles" on public.records_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owners_update_profiles" on public.records_profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owners_delete_profiles" on public.records_profiles
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "owners_write_matters" on public.records_matters
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "owners_write_exchange_rules" on public.records_exchange_rules
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.records_matters m
      where m.id = case_id and m.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.records_matters m
      where m.id = case_id and m.user_id = (select auth.uid())
    )
  );

create policy "owners_write_schedule_exceptions" on public.records_schedule_exceptions
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.records_matters m
      where m.id = case_id and m.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.records_matters m
      where m.id = case_id and m.user_id = (select auth.uid())
    )
  );

create policy "owners_write_custody_days" on public.records_custody_day_assignments
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.records_matters m
      where m.id = case_id and m.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.records_matters m
      where m.id = case_id and m.user_id = (select auth.uid())
    )
  );

create policy "owners_write_exchange_logs" on public.records_exchange_logs
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.records_matters m
      where m.id = case_id and m.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.records_matters m
      where m.id = case_id and m.user_id = (select auth.uid())
    )
  );

create policy "owners_write_date_notes" on public.records_date_notes
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.records_matters m
      where m.id = case_id and m.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.records_matters m
      where m.id = case_id and m.user_id = (select auth.uid())
    )
  );

create policy "owners_write_evidence_items" on public.records_evidence_items
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.records_matters m
      where m.id = case_id and m.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.records_matters m
      where m.id = case_id and m.user_id = (select auth.uid())
    )
  );

create policy "owners_write_support_orders" on public.records_child_support_orders
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.records_matters m
      where m.id = case_id and m.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.records_matters m
      where m.id = case_id and m.user_id = (select auth.uid())
    )
  );

create policy "owners_write_support_payments" on public.records_child_support_payments
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.records_matters m
      where m.id = case_id and m.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.records_child_support_orders o
      where
        o.id = records_child_support_payments.child_support_order_id
        and o.user_id = (select auth.uid())
        and o.case_id = records_child_support_payments.case_id
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.records_matters m
      where m.id = case_id and m.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.records_child_support_orders o
      where
        o.id = records_child_support_payments.child_support_order_id
        and o.user_id = (select auth.uid())
        and o.case_id = records_child_support_payments.case_id
    )
  );

create policy "owners_write_expenses" on public.records_expense_items
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.records_matters m
      where m.id = case_id and m.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.records_matters m
      where m.id = case_id and m.user_id = (select auth.uid())
    )
  );

create policy "owners_select_audit_logs" on public.records_audit_logs
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and (
      case_id is null
      or exists (
        select 1 from public.records_matters m
        where m.id = case_id and m.user_id = (select auth.uid())
      )
    )
  );
create policy "owners_insert_audit_logs" on public.records_audit_logs
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      case_id is null
      or exists (
        select 1 from public.records_matters m
        where m.id = case_id and m.user_id = (select auth.uid())
      )
    )
  );

create policy "owners_write_case_snapshots" on public.records_case_snapshots
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'records-evidence',
  'records-evidence',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'image/heic',
    'image/heif',
    'text/plain',
    'text/csv',
    'text/html'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "records evidence owner read" on storage.objects;
drop policy if exists "records evidence owner insert" on storage.objects;
drop policy if exists "records evidence owner update" on storage.objects;
drop policy if exists "records evidence owner delete" on storage.objects;

-- Evidence object access is intentionally server-mediated through the Next.js
-- routes and Supabase service role so uploads cannot bypass malware scanning.
-- Do not add direct anon/authenticated Storage object policies for this bucket
-- unless the replacement path preserves scanner and authorization guarantees.

-- Secure read-only attorney portal tables. Invitations use encrypted email
-- storage and hashed single-use tokens; all access remains server-mediated.
create table if not exists public.records_attorney_invitations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  case_key text not null check (char_length(case_key) between 1 and 120),
  case_id text not null check (char_length(case_id) between 1 and 180),
  invited_email_hash text not null check (char_length(invited_email_hash) = 64),
  invited_email_ciphertext text not null,
  invited_email_nonce text not null,
  invited_email_tag text not null,
  token_hash text not null unique check (char_length(token_hash) = 64),
  onboarding_token_hash text
    check (onboarding_token_hash is null or char_length(onboarding_token_hash) = 64),
  onboarding_expires_at timestamptz,
  onboarding_password_required boolean not null default false,
  onboarding_password_established_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired', 'replaced')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_sent_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  replaced_at timestamptz,
  replaced_by_invitation_id uuid references public.records_attorney_invitations(id) on delete set null,
  check (expires_at > created_at)
);

create table if not exists public.records_attorney_grants (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  attorney_user_id uuid not null references auth.users(id) on delete cascade,
  invitation_id uuid not null unique references public.records_attorney_invitations(id) on delete cascade,
  case_key text not null check (char_length(case_key) between 1 and 120),
  case_id text not null check (char_length(case_id) between 1 and 180),
  permission_scope text not null default 'read_only' check (permission_scope = 'read_only'),
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  left_at timestamptz,
  revocation_reason text,
  check (owner_user_id <> attorney_user_id),
  check (expires_at > granted_at)
);

create table if not exists public.records_attorney_access_events (
  id bigint generated always as identity primary key,
  owner_user_id uuid not null,
  actor_user_id uuid,
  case_id text,
  invitation_id uuid,
  grant_id uuid,
  event_type text not null check (
    event_type in (
      'invitation_created', 'invitation_resent', 'invitation_accepted',
      'invitation_revoked', 'attorney_left', 'portal_accessed',
      'report_generated', 'report_downloaded', 'evidence_downloaded',
      'access_denied', 'access_expired',
      'case_access_invalidated', 'account_access_invalidated'
    )
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (octet_length(metadata::text) <= 1024)
);

create index if not exists records_attorney_invitations_owner_created_idx
  on public.records_attorney_invitations(owner_user_id, created_at desc);
create index if not exists records_attorney_invitations_token_idx
  on public.records_attorney_invitations(token_hash);
create unique index if not exists records_attorney_invitations_onboarding_token_idx
  on public.records_attorney_invitations(onboarding_token_hash)
  where onboarding_token_hash is not null;
create index if not exists records_attorney_grants_attorney_idx
  on public.records_attorney_grants(attorney_user_id, expires_at desc);
create index if not exists records_attorney_grants_owner_idx
  on public.records_attorney_grants(owner_user_id, expires_at desc);
create unique index if not exists records_attorney_one_active_guest_per_owner_idx
  on public.records_attorney_grants(owner_user_id)
  where revoked_at is null and left_at is null;
create unique index if not exists records_attorney_one_pending_invite_per_owner_idx
  on public.records_attorney_invitations(owner_user_id)
  where status = 'pending';
create index if not exists records_attorney_events_owner_created_idx
  on public.records_attorney_access_events(owner_user_id, created_at desc);
create index if not exists records_attorney_events_grant_created_idx
  on public.records_attorney_access_events(grant_id, created_at desc);

alter table public.records_attorney_invitations enable row level security;
alter table public.records_attorney_grants enable row level security;
alter table public.records_attorney_access_events enable row level security;

revoke all on
  public.records_attorney_invitations,
  public.records_attorney_grants,
  public.records_attorney_access_events
from public, anon, authenticated;
revoke all on sequence public.records_attorney_access_events_id_seq
from public, anon, authenticated;

grant select, insert, update, delete on
  public.records_attorney_invitations,
  public.records_attorney_grants,
  public.records_attorney_access_events
to service_role;
grant usage, select on sequence public.records_attorney_access_events_id_seq to service_role;

create or replace function public.complete_records_attorney_onboarding(
  p_invitation_id uuid,
  p_onboarding_token_hash text,
  p_acceptance_token_hash text,
  p_attorney_user_id uuid,
  p_invited_email_hash text,
  p_email text,
  p_password_setup_required boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_password_setup_required then
    update public.records_attorney_invitations
    set onboarding_password_required = true
    where id = p_invitation_id
      and status = 'pending'
      and expires_at > now()
      and onboarding_token_hash = p_onboarding_token_hash
      and onboarding_expires_at > now()
      and invited_email_hash = p_invited_email_hash;
  else
    update public.records_attorney_invitations
    set token_hash = p_acceptance_token_hash,
      onboarding_token_hash = null,
      onboarding_expires_at = null,
      onboarding_password_required = false
    where id = p_invitation_id
      and status = 'pending'
      and expires_at > now()
      and onboarding_token_hash = p_onboarding_token_hash
      and onboarding_expires_at > now()
      and invited_email_hash = p_invited_email_hash;
  end if;

  if not found then
    return false;
  end if;

  -- A new identity is not approved for application login until its password has
  -- been replaced. Existing approved identities use the immediate branch.
  if not p_password_setup_required then
    insert into public.records_profiles (user_id, email, updated_at)
    values (p_attorney_user_id, lower(trim(p_email)), now())
    on conflict (user_id) do update
    set email = excluded.email, updated_at = excluded.updated_at;
  end if;

  return true;
end;
$$;

revoke all on function public.complete_records_attorney_onboarding(
  uuid, text, text, uuid, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.complete_records_attorney_onboarding(
  uuid, text, text, uuid, text, text, boolean
) to service_role;

create or replace function public.complete_records_attorney_password_setup(
  p_invitation_id uuid,
  p_onboarding_token_hash text,
  p_attorney_user_id uuid,
  p_invited_email_hash text,
  p_email text,
  p_credential_version text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_credential_version is null or char_length(p_credential_version) <> 43 then
    return false;
  end if;

  update public.records_attorney_invitations
  set token_hash = onboarding_token_hash,
    onboarding_token_hash = null,
    onboarding_expires_at = null,
    onboarding_password_required = false,
    onboarding_password_established_at = now()
  where id = p_invitation_id
    and status = 'pending'
    and expires_at > now()
    and onboarding_token_hash = p_onboarding_token_hash
    and onboarding_expires_at > now()
    and onboarding_password_required = true
    and invited_email_hash = p_invited_email_hash;

  if not found then
    return false;
  end if;

  insert into public.records_profiles (user_id, email, credential_version, updated_at)
  values (p_attorney_user_id, lower(trim(p_email)), p_credential_version, now())
  on conflict (user_id) do update
  set
    email = excluded.email,
    credential_version = excluded.credential_version,
    updated_at = excluded.updated_at;

  return true;
end;
$$;

revoke all on function public.complete_records_attorney_password_setup(uuid, text, uuid, text, text, text)
from public, anon, authenticated;
grant execute on function public.complete_records_attorney_password_setup(uuid, text, uuid, text, text, text)
to service_role;

create or replace function public.accept_records_attorney_invitation(
  p_token_hash text,
  p_attorney_user_id uuid,
  p_invited_email_hash text
)
returns table (
  grant_id uuid,
  owner_user_id uuid,
  case_key text,
  case_id text,
  access_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  invitation public.records_attorney_invitations%rowtype;
  created_grant public.records_attorney_grants%rowtype;
begin
  select * into invitation
  from public.records_attorney_invitations i
  where i.token_hash = p_token_hash
  for update;

  if not found
    or invitation.status <> 'pending'
    or invitation.expires_at <= now()
    or invitation.invited_email_hash <> p_invited_email_hash
    or invitation.owner_user_id = p_attorney_user_id
  then
    if found and invitation.status = 'pending' and invitation.expires_at <= now() then
      update public.records_attorney_invitations set status = 'expired'
      where id = invitation.id and status = 'pending';
    end if;
    return;
  end if;

  with expired_grants as (
    update public.records_attorney_grants as g
    set revoked_at = expires_at, revocation_reason = 'access_expired'
    where g.owner_user_id = invitation.owner_user_id
      and g.revoked_at is null
      and g.left_at is null
      and g.expires_at <= now()
    returning g.id, g.owner_user_id, g.case_id, g.invitation_id
  )
  insert into public.records_attorney_access_events (
    owner_user_id, case_id, invitation_id, grant_id, event_type, metadata
  )
  select expired_grants.owner_user_id, expired_grants.case_id,
    expired_grants.invitation_id, expired_grants.id, 'access_expired',
    jsonb_build_object('reason', 'access_period_ended')
  from expired_grants;

  if exists (
    select 1 from public.records_attorney_grants g
    where g.owner_user_id = invitation.owner_user_id
      and g.revoked_at is null and g.left_at is null
      and g.expires_at > now()
  ) then
    return;
  end if;

  insert into public.records_attorney_grants (
    owner_user_id, attorney_user_id, invitation_id, case_key, case_id,
    permission_scope, granted_at, expires_at
  ) values (
    invitation.owner_user_id, p_attorney_user_id, invitation.id,
    invitation.case_key, invitation.case_id, 'read_only',
    now(), now() + interval '30 days'
  ) returning * into created_grant;

  update public.records_attorney_invitations
  set status = 'accepted', accepted_at = now(), accepted_by_user_id = p_attorney_user_id
  where id = invitation.id and status = 'pending';

  insert into public.records_attorney_access_events (
    owner_user_id, actor_user_id, case_id, invitation_id, grant_id, event_type
  ) values (
    invitation.owner_user_id, p_attorney_user_id, invitation.case_id,
    invitation.id, created_grant.id, 'invitation_accepted'
  );

  return query select created_grant.id, created_grant.owner_user_id,
    created_grant.case_key, created_grant.case_id, created_grant.expires_at;
end;
$$;

revoke all on function public.accept_records_attorney_invitation(text, uuid, text)
from public, anon, authenticated;
grant execute on function public.accept_records_attorney_invitation(text, uuid, text)
to service_role;

create or replace function public.replace_records_attorney_invitation(
  p_owner_user_id uuid,
  p_invitation_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  prior public.records_attorney_invitations%rowtype;
  replacement_id uuid;
begin
  select * into prior
  from public.records_attorney_invitations i
  where i.id = p_invitation_id
    and i.owner_user_id = p_owner_user_id
    and i.status in ('pending', 'expired')
  for update;

  if not found then return null; end if;

  update public.records_attorney_invitations
  set status = 'replaced', replaced_at = now()
  where id = prior.id;

  insert into public.records_attorney_invitations (
    owner_user_id, case_key, case_id,
    invited_email_hash, invited_email_ciphertext, invited_email_nonce, invited_email_tag,
    token_hash, status, created_at, expires_at, last_sent_at
  ) values (
    prior.owner_user_id, prior.case_key, prior.case_id,
    prior.invited_email_hash, prior.invited_email_ciphertext, prior.invited_email_nonce,
    prior.invited_email_tag, p_token_hash, 'pending', now(), p_expires_at, now()
  ) returning id into replacement_id;

  update public.records_attorney_invitations
  set replaced_by_invitation_id = replacement_id
  where id = prior.id;

  return replacement_id;
end;
$$;

revoke all on function public.replace_records_attorney_invitation(uuid, uuid, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.replace_records_attorney_invitation(uuid, uuid, text, timestamptz)
to service_role;

create or replace function public.revoke_records_attorney_invitation(
  p_owner_user_id uuid,
  p_invitation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  invitation public.records_attorney_invitations%rowtype;
  revoked_grant_id uuid;
begin
  select * into invitation
  from public.records_attorney_invitations i
  where i.id = p_invitation_id
    and i.owner_user_id = p_owner_user_id
    and i.status in ('pending', 'accepted')
  for update;

  if not found then return false; end if;

  update public.records_attorney_invitations
  set status = 'revoked', revoked_at = now()
  where id = invitation.id;

  update public.records_attorney_grants
  set revoked_at = now(), revocation_reason = 'owner_revoked'
  where invitation_id = invitation.id
    and owner_user_id = p_owner_user_id
    and revoked_at is null
    and left_at is null
  returning id into revoked_grant_id;

  insert into public.records_attorney_access_events (
    owner_user_id, actor_user_id, case_id, invitation_id, grant_id, event_type
  ) values (
    p_owner_user_id, p_owner_user_id, invitation.case_id,
    invitation.id, revoked_grant_id, 'invitation_revoked'
  );

  return true;
end;
$$;

revoke all on function public.revoke_records_attorney_invitation(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.revoke_records_attorney_invitation(uuid, uuid)
to service_role;
