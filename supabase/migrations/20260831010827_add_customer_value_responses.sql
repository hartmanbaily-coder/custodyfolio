create table public.custody_folio_customer_value_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt_key text not null,
  score smallint not null,
  responded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custody_folio_customer_value_responses_prompt_key_check
    check (prompt_key in ('organization_value_v1')),
  constraint custody_folio_customer_value_responses_score_check
    check (score between 1 and 5),
  constraint custody_folio_customer_value_responses_user_prompt_key
    unique (user_id, prompt_key)
);

create index custody_folio_customer_value_responses_responded_at_idx
  on public.custody_folio_customer_value_responses(responded_at desc);

alter table public.custody_folio_customer_value_responses enable row level security;
alter table public.custody_folio_customer_value_responses force row level security;

revoke all on public.custody_folio_customer_value_responses from public, anon, authenticated;
grant all on public.custody_folio_customer_value_responses to service_role;
