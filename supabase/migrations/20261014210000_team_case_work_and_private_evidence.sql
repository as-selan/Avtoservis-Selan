-- Forward only. No financial documents, copied prices or legacy work_orders dependency.
-- Hosted installation requires explicit approval.
begin;
create table public.team_invitations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 email text not null check(email=lower(email) and length(email)<=254), invited_by uuid not null references public.profiles(id),
 auth_user_id uuid references auth.users(id), state text not null default 'dispatching' check(state in ('dispatching','sent','uncertain','failed','cancelled','accepted')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days', accepted_at timestamptz
);
create unique index team_invitation_pending on public.team_invitations(organization_id,email) where state in ('dispatching','sent','uncertain');
create table public.service_case_assignments (
 case_id uuid primary key references public.service_requests(id), organization_id uuid not null references public.organizations(id),
 mechanic_id uuid not null references public.profiles(id), assigned_by uuid not null references public.profiles(id),
 quibi_work_order_id text not null check(quibi_work_order_id ~ '^[1-9][0-9]*$'), quibi_content_sha256 text not null check(quibi_content_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'assigned' check(status in ('assigned','in_progress','awaiting_parts','work_completed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index case_assignments_mechanic on public.service_case_assignments(organization_id,mechanic_id);
create table public.service_case_notes (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.service_case_assignments(case_id),
 author_id uuid not null references public.profiles(id), body text not null check(length(trim(body)) between 1 and 3000), created_at timestamptz not null default now()
);
create table public.service_case_photos (
 id uuid primary key, case_id uuid not null references public.service_case_assignments(case_id), author_id uuid not null references public.profiles(id),
 caption text not null check(length(trim(caption)) between 1 and 500), object_path text not null unique,
 state text not null default 'pending' check(state in ('pending','ready')), approved_for_customer boolean not null default false,
 created_at timestamptz not null default now()
);
create index case_notes_case on public.service_case_notes(case_id,created_at);
create index case_photos_case on public.service_case_photos(case_id,created_at);
create function public.team_has_role(p_org uuid,p_roles text[]) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organization_memberships m where m.organization_id=p_org and m.profile_id=auth.uid() and m.is_active and m.role=any(p_roles));$$;
create function public.can_read_case_work(p_case uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.service_case_assignments a join public.service_requests s on s.id=a.case_id and s.organization_id=a.organization_id
 join public.organization_memberships m on m.organization_id=a.organization_id and m.profile_id=auth.uid() and m.is_active
 where a.case_id=p_case and s.archived_at is null and (m.role in ('owner','admin') or (m.role='mechanic' and a.mechanic_id=auth.uid())));$$;
alter table public.team_invitations enable row level security;
alter table public.service_case_assignments enable row level security;
alter table public.service_case_notes enable row level security;
alter table public.service_case_photos enable row level security;
create policy team_invites_read on public.team_invitations for select to authenticated using(public.team_has_role(organization_id,array['owner']));
create policy case_assignment_read on public.service_case_assignments for select to authenticated using(public.can_read_case_work(case_id));
create policy case_notes_read on public.service_case_notes for select to authenticated using(public.can_read_case_work(case_id));
create policy case_photos_read on public.service_case_photos for select to authenticated using(public.can_read_case_work(case_id));
grant select on public.team_invitations,public.service_case_assignments,public.service_case_notes,public.service_case_photos to authenticated;
-- No direct writes: all transitions go through scoped RPCs.
create function public.team_members(p_org uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not public.team_has_role(p_org,array['owner','admin']) then raise exception 'FORBIDDEN';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',m.profile_id,'email',p.email,'name',p.full_name,'role',m.role,'active',m.is_active)) from public.organization_memberships m join public.profiles p on p.id=m.profile_id where m.organization_id=p_org),'[]');end;$$;
create function public.prepare_team_invitation(p_org uuid,p_email text) returns uuid language plpgsql security definer set search_path='' as $$declare v_id uuid;begin
 if not public.team_has_role(p_org,array['owner']) then raise exception 'FORBIDDEN';end if;
 if p_email<>lower(trim(p_email)) or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(p_email)>254 then raise exception 'INVALID_EMAIL';end if;
 if exists(select 1 from auth.users where lower(email)=p_email) then raise exception 'ACCOUNT_ALREADY_EXISTS';end if;
 insert into public.team_invitations(organization_id,email,invited_by) values(p_org,p_email,auth.uid()) returning id into v_id;return v_id;end;$$;
create function public.finish_team_invitation(p_id uuid,p_user uuid,p_state text) returns void language plpgsql security definer set search_path='' as $$begin
 if p_state not in ('sent','uncertain','failed') then raise exception 'INVALID_STATE';end if;
 if p_state='sent' and not exists(select 1 from public.team_invitations i join auth.users u on lower(u.email)=i.email where i.id=p_id and u.id=p_user) then raise exception 'IDENTITY_MISMATCH';end if;
 update public.team_invitations set state=p_state,auth_user_id=p_user where id=p_id and state='dispatching';
 if not found then raise exception 'INVITATION_CHANGED';end if;end;$$;
create function public.accept_team_invitation() returns boolean language plpgsql security definer set search_path='' as $$declare i public.team_invitations;begin
 select t.* into i from public.team_invitations t join auth.users u on u.id=auth.uid() and lower(u.email)=t.email and u.email_confirmed_at is not null
 where t.auth_user_id=auth.uid() and t.state='sent' and t.expires_at>now() order by t.created_at limit 1 for update of t;
 if not found then return false;end if;
 if exists(select 1 from public.organization_memberships where profile_id=auth.uid()) then raise exception 'MEMBERSHIP_ALREADY_EXISTS';end if;
 insert into public.organization_memberships(organization_id,profile_id,role,is_active) values(i.organization_id,auth.uid(),'mechanic',true);
 update public.team_invitations set state='accepted',accepted_at=now() where id=i.id;return true;end;$$;
create function public.change_team_access(p_org uuid,p_target uuid,p_cancel boolean) returns void language plpgsql security definer set search_path='' as $$begin
 if not public.team_has_role(p_org,array['owner']) then raise exception 'FORBIDDEN';end if;
 if p_cancel then update public.team_invitations set state='cancelled' where id=p_target and organization_id=p_org and state in ('dispatching','sent','uncertain');
 else update public.organization_memberships set is_active=false,disabled_at=now(),updated_at=now() where organization_id=p_org and profile_id=p_target and role='mechanic' and is_active;end if;
 if not found then raise exception 'TARGET_UNAVAILABLE';end if;end;$$;
create function public.assign_service_case(p_case uuid,p_mechanic uuid,p_document text,p_sha text) returns void language plpgsql security definer set search_path='' as $$declare s public.service_requests;begin
 select * into s from public.service_requests where id=p_case and archived_at is null for update;
 if not found or not public.team_has_role(s.organization_id,array['owner','admin']) then raise exception 'FORBIDDEN';end if;
 if not exists(select 1 from public.organization_memberships where organization_id=s.organization_id and profile_id=p_mechanic and is_active and role='mechanic') then raise exception 'MECHANIC_UNAVAILABLE';end if;
 if not exists(select 1 from public.quibi_dev_operation_journal j where j.organization_id=s.organization_id and j.service_request_id=p_case and j.kind in ('work_order','work_order_update') and j.state='verified' and j.quibi_id=p_document and j.quibi_content_sha256=p_sha) then raise exception 'QUIBI_REFERENCE_UNVERIFIED';end if;
 insert into public.service_case_assignments(case_id,organization_id,mechanic_id,assigned_by,quibi_work_order_id,quibi_content_sha256) values(p_case,s.organization_id,p_mechanic,auth.uid(),p_document,p_sha)
 on conflict(case_id) do update set mechanic_id=excluded.mechanic_id,assigned_by=auth.uid(),updated_at=now() where service_case_assignments.quibi_work_order_id=excluded.quibi_work_order_id and service_case_assignments.quibi_content_sha256=excluded.quibi_content_sha256;
 if not found then raise exception 'QUIBI_REFERENCE_CHANGED';end if;end;$$;
create function public.case_work_snapshot(p_case uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$begin
 return coalesce((select jsonb_agg(jsonb_build_object('caseId',a.case_id,'mechanicId',a.mechanic_id,'quibiId',a.quibi_work_order_id,'sha',a.quibi_content_sha256,'status',a.status,'problem',s.problem_description,'service',s.service_wanted,'vehicle',jsonb_build_object('vin',v.vin,'registration',v.registration_current,'make',v.make,'model',v.model),'customerQuibiId',l.quibi_customer_id,'vehicleQuibiId',l.quibi_vehicle_id)) from public.service_case_assignments a join public.service_requests s on s.id=a.case_id left join public.vehicles v on v.id=s.vehicle_id left join public.quibi_vehicle_links l on l.organization_id=a.organization_id and l.vehicle_id=s.vehicle_id and l.customer_id=s.customer_id and l.sync_status='ok' and l.quibi_environment='dev' where (p_case is null or a.case_id=p_case) and public.can_read_case_work(a.case_id)),'[]');end;$$;
create function public.update_case_work(p_case uuid,p_status text,p_note text default '') returns void language plpgsql security definer set search_path='' as $$begin
 if not public.can_read_case_work(p_case) then raise exception 'FORBIDDEN';end if;
 if p_status not in ('assigned','in_progress','awaiting_parts','work_completed') or length(p_note)>3000 then raise exception 'INVALID_INPUT';end if;
 update public.service_case_assignments set status=p_status,updated_at=now() where case_id=p_case;
 if length(trim(p_note))>0 then insert into public.service_case_notes(case_id,author_id,body) values(p_case,auth.uid(),trim(p_note));end if;end;$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('service-case-evidence','service-case-evidence',false,786432,array['image/jpeg','image/png','image/webp']);
create function public.prepare_case_photo(p_case uuid,p_id uuid,p_caption text,p_ext text) returns text language plpgsql security definer set search_path='' as $$declare v_path text;begin
 if not public.can_read_case_work(p_case) then raise exception 'FORBIDDEN';end if;
 if p_ext not in ('jpg','png','webp') or length(trim(p_caption)) not between 1 and 500 then raise exception 'INVALID_INPUT';end if;
 select organization_id::text||'/'||case_id::text||'/'||p_id::text||'.'||p_ext into v_path from public.service_case_assignments where case_id=p_case;
 insert into public.service_case_photos(id,case_id,author_id,caption,object_path) values(p_id,p_case,auth.uid(),trim(p_caption),v_path);return v_path;end;$$;
create function public.complete_case_photo(p_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 update public.service_case_photos p set state='ready' where p.id=p_id and p.author_id=auth.uid() and public.can_read_case_work(p.case_id) and exists(select 1 from storage.objects o where o.bucket_id='service-case-evidence' and o.name=p.object_path);
 if not found then raise exception 'PHOTO_UNAVAILABLE';end if;end;$$;
create function public.approve_case_photo(p_id uuid,p_approved boolean) returns void language plpgsql security definer set search_path='' as $$begin
 update public.service_case_photos p set approved_for_customer=p_approved from public.service_case_assignments a where a.case_id=p.case_id and p.id=p_id and p.state='ready' and public.team_has_role(a.organization_id,array['owner']);
 if not found then raise exception 'FORBIDDEN';end if;end;$$;
create policy case_evidence_read on storage.objects for select to authenticated using(bucket_id='service-case-evidence' and exists(select 1 from public.service_case_photos p where p.object_path=name and p.state='ready' and public.can_read_case_work(p.case_id)));
create policy case_evidence_upload on storage.objects for insert to authenticated with check(bucket_id='service-case-evidence' and exists(select 1 from public.service_case_photos p where p.object_path=name and p.author_id=auth.uid() and p.state='pending' and public.can_read_case_work(p.case_id)));
-- No update/delete/public policies. An owner approval does not grant any customer access or dispatch.
revoke all on function public.finish_team_invitation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_team_invitation(uuid,uuid,text) to service_role;
do $$declare f record;begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('team_has_role','can_read_case_work','team_members','prepare_team_invitation','accept_team_invitation','change_team_access','assign_service_case','case_work_snapshot','update_case_work','prepare_case_photo','complete_case_photo','approve_case_photo') loop execute format('revoke all on function %s from public,anon',f.signature);execute format('grant execute on function %s to authenticated',f.signature);end loop;end;$$;
commit;
