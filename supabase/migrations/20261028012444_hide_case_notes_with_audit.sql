begin;
alter table public.service_case_notes add column deleted_at timestamptz, add column deleted_by uuid references public.profiles(id);
create function public.hide_case_note(p_case uuid,p_note uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.service_case_assignments; n public.service_case_notes;
begin
 select * into a from public.service_case_assignments where case_id=p_case for update;
 if not found or not public.can_read_case_work(p_case) then raise exception 'FORBIDDEN'; end if;
 select * into n from public.service_case_notes where id=p_note and case_id=p_case for update;
 if not found or (n.author_id is distinct from auth.uid() and not public.team_has_role(a.organization_id,array['owner','admin'])) then raise exception 'FORBIDDEN'; end if;
 if n.deleted_at is null then update public.service_case_notes set deleted_at=clock_timestamp(),deleted_by=auth.uid() where id=p_note; end if;
end; $$;
revoke all on function public.hide_case_note(uuid,uuid) from public,anon;
grant execute on function public.hide_case_note(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
