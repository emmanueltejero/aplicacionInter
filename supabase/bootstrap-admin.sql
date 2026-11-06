-- Execute AFTER the migration and after creating your first user in Authentication.
-- Replace only the email below with that user's email. Never paste a password here.
do $$
declare account uuid;
begin
  select id into account from auth.users where lower(email) = lower('CAMBIA_ESTE_CORREO');
  if account is null then
    raise exception 'Primero crea el usuario en Authentication y sustituye CAMBIA_ESTE_CORREO por su correo.';
  end if;
  insert into public.club_members(user_id, role, enabled) values (account, 'admin', true)
    on conflict (user_id) do update set role='admin', enabled=true;
  if not exists (select 1 from public.teams where name='Primer equipo') then
    insert into public.teams(name) values ('Primer equipo');
  end if;
end $$;
