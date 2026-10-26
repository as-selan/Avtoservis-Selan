-- Continue saved intake with one known contact; keep public submission and provenance guards.
create or replace function private.compute_request_intake_completeness(p_request_id uuid,p_phone text,p_email text,p_vin text,p_make text,p_model text)
returns jsonb language sql stable set search_path='' as $$
 select case when exists(select 1 from public.service_requests where id=p_request_id)
 then private.compute_manual_intake_completeness(p_phone,p_email,p_vin,p_make,p_model)
 else private.compute_intake_completeness(p_phone,p_email,p_vin,p_make,p_model) end;
$$;
-- Upgrade only untouched empty legacy drafts, never replace edited/priced rows.
do $migration$ declare definition text; original text := 'if j.auto_input=src and j.auto_state in (''ready'',''missing_price'',''ambiguous'',''needs_data'') then return null; end if;'; begin
 select pg_get_functiondef('public.automatic_offer_job(uuid,uuid,text,uuid,jsonb,text)'::regprocedure) into definition;
 if position(original in definition)=0 then raise exception 'UNEXPECTED_AUTOMATIC_OFFER_JOB';end if;
 definition:=replace(definition,original,'if j.auto_input=src and j.auto_state in (''ready'',''missing_price'',''ambiguous'',''needs_data'') and not (j.auto_state=''needs_data'' and j.auto_draft is not null and coalesce(jsonb_array_length(j.auto_draft->''rows''),0)=0 and (j.auto_draft->>''serviceSuggestionVersion'') is distinct from ''2'') then return null; end if;');
 execute definition;
end $migration$;
