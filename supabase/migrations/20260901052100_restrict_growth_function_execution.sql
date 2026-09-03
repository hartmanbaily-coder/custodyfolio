revoke all on function public.custody_folio_cleanup_expired_growth_events()
  from public, anon, authenticated;
grant execute on function public.custody_folio_cleanup_expired_growth_events()
  to service_role;

revoke all on function public.custody_folio_record_feedback_choice(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.custody_folio_record_feedback_choice(uuid, text, timestamptz)
  to service_role;
