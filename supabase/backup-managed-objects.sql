-- Apply AFTER restoring roles.sql, schema.sql and data.sql into a NEW Supabase project.
-- Public functions are in schema.sql; these custom objects belong to managed schemas.
begin;
drop trigger if exists club_web_coach_provision on auth.users;
create trigger club_web_coach_provision after insert or update of raw_app_meta_data on auth.users
  for each row execute function public.provision_web_coach();
drop policy if exists club_exercise_images_read on storage.objects;
create policy club_exercise_images_read on storage.objects for select to authenticated
  using(bucket_id='exercise-images' and public.is_active_club_member());
drop policy if exists club_exercise_images_upload on storage.objects;
create policy club_exercise_images_upload on storage.objects for insert to authenticated
  with check(bucket_id='exercise-images' and public.is_active_club_member()
    and split_part(name,'/',1)=(select auth.uid())::text and public.valid_exercise_image_path(name));
commit;
