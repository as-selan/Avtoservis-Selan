-- Private photo storage. Forward-only; hosted apply requires separate approval.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('selan-work-order-photos','selan-work-order-photos',false,786432,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
do $ begin if exists(select 1 from storage.buckets where id='selan-work-order-photos' and public) then raise exception 'Work-order photo bucket must be private'; end if; end $;
create table public.work_order_photos (
 id uuid primary key,organization_id uuid not null,work_order_id uuid not null,storage_path text not null unique,
 caption text not null check(char_length(btrim(caption)) between 4 and 300),created_by_profile_id uuid not null,created_at timestamptz not null default now(),
 foreign key(organization_id,work_order_id) references public.work_orders(organization_id,id),
 foreign key(organization_id,created_by_profile_id) references public.organization_memberships(organization_id,profile_id),
 check(storage_path like organization_id::text||'/'||work_order_id::text||'/%')
);
alter table public.work_order_photos enable row level security;
revoke all on public.work_order_photos from public,anon,authenticated;
grant select on public.work_order_photos to authenticated;
create policy work_order_photos_read on public.work_order_photos for select to authenticated using(private.has_org_role(organization_id,array['owner','admin','reception']::text[]));
create policy selan_work_order_photo_read on storage.objects for select to authenticated using(bucket_id='selan-work-order-photos' and exists(
 select 1 from public.work_orders w where w.organization_id::text=(storage.foldername(name))[1] and w.id::text=(storage.foldername(name))[2]
 and private.has_org_role(w.organization_id,array['owner','admin','reception']::text[])));
create policy selan_work_order_photo_upload on storage.objects for insert to authenticated with check(bucket_id='selan-work-order-photos' and exists(
 select 1 from public.work_orders w where w.organization_id::text=(storage.foldername(name))[1] and w.id::text=(storage.foldername(name))[2] and w.status<>'closed'
 and private.has_org_role(w.organization_id,array['owner','admin','reception']::text[])));
create function public.register_work_order_photo(p_order_id uuid,p_photo_id uuid,p_storage_path text,p_caption text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.work_orders%rowtype;
begin
 select * into w from public.work_orders where id=p_order_id for update;
 if not found or not private.has_org_role(w.organization_id,array['owner','admin','reception']::text[]) then return jsonb_build_object('ok',false,'error_code','forbidden'); end if;
 if w.status='closed' or p_caption is null or char_length(btrim(p_caption)) not between 4 and 300 or p_photo_id is null
 or p_storage_path is null or p_storage_path not in (w.organization_id::text||'/'||w.id::text||'/'||p_photo_id::text||'.jpg',w.organization_id::text||'/'||w.id::text||'/'||p_photo_id::text||'.png',w.organization_id::text||'/'||w.id::text||'/'||p_photo_id::text||'.webp')
 or not exists(select 1 from storage.objects where bucket_id='selan-work-order-photos' and name=p_storage_path)
 then return jsonb_build_object('ok',false,'error_code','invalid_photo'); end if;
 insert into public.work_order_photos(id,organization_id,work_order_id,storage_path,caption,created_by_profile_id)
 values(p_photo_id,w.organization_id,w.id,p_storage_path,btrim(p_caption),auth.uid());
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.register_work_order_photo(uuid,uuid,text,text) from public,anon;
grant execute on function public.register_work_order_photo(uuid,uuid,text,text) to authenticated;
notify pgrst,'reload schema';
