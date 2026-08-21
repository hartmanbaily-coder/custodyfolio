-- Restore the attorney authorization profile write that was lost when the
-- permanent-grant migration replaced this function in production. Invitation
-- acceptance remains single-use, email-bound, read-only, and service-role-only.

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
set search_path = pg_catalog
as $$
declare
  invitation public.records_attorney_invitations%rowtype;
  created_grant public.records_attorney_grants%rowtype;
begin
  select *
  into invitation
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
      update public.records_attorney_invitations
      set status = 'expired'
      where id = invitation.id and status = 'pending';
    end if;
    return;
  end if;

  if exists (
    select 1
    from public.records_attorney_grants g
    where g.owner_user_id = invitation.owner_user_id
      and g.revoked_at is null
      and g.left_at is null
  ) then
    return;
  end if;

  insert into public.records_attorney_grants (
    owner_user_id,
    attorney_user_id,
    invitation_id,
    case_key,
    case_id,
    permission_scope,
    granted_at,
    expires_at
  )
  values (
    invitation.owner_user_id,
    p_attorney_user_id,
    invitation.id,
    invitation.case_key,
    invitation.case_id,
    'read_only',
    now(),
    null
  )
  returning * into created_grant;

  update public.records_attorney_invitations
  set
    status = 'accepted',
    accepted_at = now(),
    accepted_by_user_id = p_attorney_user_id
  where id = invitation.id and status = 'pending';

  insert into public.records_attorney_profiles (
    user_id,
    email_hash,
    updated_at
  )
  values (p_attorney_user_id, p_invited_email_hash, now())
  on conflict (user_id) do update
  set
    email_hash = excluded.email_hash,
    updated_at = excluded.updated_at;

  insert into public.records_attorney_access_events (
    owner_user_id,
    actor_user_id,
    case_id,
    invitation_id,
    grant_id,
    event_type
  )
  values (
    invitation.owner_user_id,
    p_attorney_user_id,
    invitation.case_id,
    invitation.id,
    created_grant.id,
    'invitation_accepted'
  );

  return query
  select
    created_grant.id,
    created_grant.owner_user_id,
    created_grant.case_key,
    created_grant.case_id,
    created_grant.expires_at;
end;
$$;

revoke all on function public.accept_records_attorney_invitation(text, uuid, text)
from public, anon, authenticated;
grant execute on function public.accept_records_attorney_invitation(text, uuid, text)
to service_role;
