import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
test('web account provisioning is atomic, coach-only and restricted to active admins', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create role supabase_auth_admin;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}'::jsonb,raw_user_meta_data jsonb default '{}'::jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated,anon,supabase_auth_admin;
      grant select,insert,update on auth.users to supabase_auth_admin;
      alter default privileges in schema public grant execute on functions to anon,authenticated;`);
    await db.exec(readFileSync(new URL('../supabase/migrations/202611050001_club.sql', import.meta.url), 'utf8'));
    const migration = readFileSync(new URL('../supabase/migrations/202611100004_web_users.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(`insert into auth.users(id,email) values ('${id(1)}','admin@example.invalid'),('${id(2)}','coach@example.invalid'),('${id(3)}','disabled@example.invalid'),('${id(4)}','outsider@example.invalid');
      insert into public.club_members values ('${id(1)}','admin',true),('${id(2)}','coach',true),('${id(3)}','admin',false);
      insert into public.teams values ('${id(10)}','A'),('${id(20)}','B'); insert into public.team_coaches values ('${id(10)}','${id(2)}');`);
    async function user(n) { await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',false)`); }
    const payload = (n, actor = 1, teams = [10, 20]) => ({ version: 1, request_id: id(n), actor_id: id(actor), name: 'Nuevo entrenador', team_ids: teams.map(id) });
    async function authCreate(n, metadata, update = false) {
      await db.exec('reset role;set role supabase_auth_admin;begin');
      try {
        if (update) {
          await db.query('insert into auth.users(id,email) values($1,$2)', [id(n), `coach${n}@example.invalid`]);
          await db.query('update auth.users set raw_app_meta_data=$1::jsonb where id=$2', [JSON.stringify({ club_provisioning: metadata }), id(n)]);
        } else await db.query('insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values($1,$2,$3::jsonb,$4::jsonb)', [id(n), `coach${n}@example.invalid`, JSON.stringify(metadata ? { club_provisioning: metadata } : {}), JSON.stringify({ display_name: 'Nuevo entrenador' })]);
        await db.exec('commit');
      } catch (error) { await db.exec('rollback'); throw error; }
    }
    await t.test('GoTrue INSERT and later metadata UPDATE provision membership and every team together', async () => {
      await authCreate(100, payload(100)); await authCreate(101, payload(101), true);
      await user(1);
      assert.equal((await db.query('select public.admin_user_setup_ready() as version')).rows[0].version, 1);
      for (const n of [100, 101]) {
        assert.deepEqual((await db.query('select role,enabled from public.club_members where user_id=$1', [id(n)])).rows, [{ role: 'coach', enabled: true }]);
        assert.deepEqual((await db.query('select team_id from public.team_coaches where user_id=$1 order by team_id', [id(n)])).rows.map(row => row.team_id), [id(10), id(20)]);
      }
      await db.exec('reset role'); await db.exec(migration);
      await user(1); assert.equal((await db.query('select * from public.admin_list_users(0,100)')).rows.length, 5);
    });
    await t.test('invalid actors, duplicate/missing teams and forged request IDs roll back the Auth account', async () => {
      const cases = [payload(110, 2), payload(110, 3), payload(110, 4), payload(110, 1, [10, 999]), payload(110, 1, [10, 10]), payload(110, 1, []), { ...payload(110), request_id: id(999) }];
      for (const metadata of cases) {
        await assert.rejects(authCreate(110, metadata, true));
        await db.exec('reset role'); assert.equal((await db.query('select * from auth.users where id=$1', [id(110)])).rows.length, 0);
        assert.equal((await db.query('select * from public.club_members where user_id=$1', [id(110)])).rows.length, 0);
      }
    });
    await t.test('public signup metadata cannot grant access, and later unchanged app metadata cannot reactivate a user', async () => {
      await db.exec('reset role');
      await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)', [id(120), 'signup@example.invalid', JSON.stringify({ club_provisioning: payload(120), role: 'admin' })]);
      assert.equal((await db.query('select * from public.club_members where user_id=$1', [id(120)])).rows.length, 0);
      await db.exec(`update public.club_members set enabled=false where user_id='${id(100)}'`);
      await db.query('update auth.users set raw_app_meta_data=raw_app_meta_data||$1::jsonb where id=$2', [JSON.stringify({ other: 'change' }), id(100)]);
      assert.equal((await db.query('select enabled from public.club_members where user_id=$1', [id(100)])).rows[0].enabled, false);
      await assert.rejects(db.query('update auth.users set raw_app_meta_data=$1::jsonb where id=$2', [JSON.stringify({ club_provisioning: { ...payload(100), name: 'Cambio' } }), id(100)]), /membresía ya existe/);
    });
    await t.test('directory and team creation reject coaches, disabled admins, outsiders and anonymous accounts', async () => {
      for (const n of [2, 3, 4]) {
        await user(n);
        await assert.rejects(db.query('select * from public.admin_list_users(0,100)'), /Solo administradores/);
        await assert.rejects(db.query('select public.admin_user_setup_ready()'), /Solo administradores/);
        await assert.rejects(db.query('select public.admin_create_team($1,$2)', [id(30), 'Equipo C']), /Solo administradores/);
        await assert.rejects(db.query('select email from auth.users'), /permission denied/);
      }
      await db.exec('reset role;set role anon'); await assert.rejects(db.query('select * from public.admin_list_users(0,100)'), /permission denied/);
    });
    await t.test('admin directory is paginated and teams use stable IDs with duplicate-name protection', async () => {
      await user(1);
      const rows = (await db.query('select * from public.admin_list_users(0,2)')).rows;
      assert.equal(rows.length, 2); assert.equal(rows[0].email, 'admin@example.invalid');
      const created = (await db.query('select public.admin_create_team($1,$2) as team', [id(30), '  Equipo   C  '])).rows[0].team;
      assert.equal(created.name, 'Equipo C');
      assert.deepEqual((await db.query('select public.admin_create_team($1,$2) as team', [id(30), 'Equipo C'])).rows[0].team, created);
      await assert.rejects(db.query('select public.admin_create_team($1,$2)', [id(31), 'equipo c']), /Ya existe/);
      await assert.rejects(db.query('select public.admin_create_team($1,$2)', [id(30), 'Otro nombre']), /ya existe/);
      await db.exec('reset role;alter table auth.users disable trigger club_web_coach_provision');
      await user(1); assert.equal((await db.query('select public.admin_user_setup_ready() as version')).rows[0].version, 0);
    });
  } finally { await db.close(); }
});
