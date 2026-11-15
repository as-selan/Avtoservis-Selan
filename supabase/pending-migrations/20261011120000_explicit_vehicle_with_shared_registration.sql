-- Forward-only intake fix. Hosted application requires separate approval.
-- A repeated registration remains ambiguous unless staff explicitly select the
-- same customer's uniquely matching VIN and that vehicle occurs in the candidates.
do $migration$
declare target regprocedure; definition text; needle text := $old$    if coalesce(array_length(v_reg_vehicle_ids, 1), 0) > 1 then
      return jsonb_build_object('ok', false, 'error_code', 'ambiguous_vehicle');
    end if;$old$;
replacement text := $new$    if coalesce(array_length(v_reg_vehicle_ids, 1), 0) > 1
       and not coalesce(p_selected_vehicle_id is not null
         and p_selected_customer_id is not null
         and v_vin is not null
         and v_auto_vehicle_id = p_selected_vehicle_id
         and v_auto_vehicle_customer_id = p_selected_customer_id
         and p_selected_vehicle_id = any(v_reg_vehicle_ids), false) then
      return jsonb_build_object('ok', false, 'error_code', 'ambiguous_vehicle');
    end if;$new$;
begin
 select p.oid::regprocedure into strict target from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='create_manual_service_request_intake';
 definition:=replace(pg_get_functiondef(target),E'\r\n',E'\n');
 if position(needle in definition)=0 then raise exception 'Unexpected intake implementation: migration stopped'; end if;
 execute replace(definition,needle,replacement);
end $migration$;
notify pgrst,'reload schema';
