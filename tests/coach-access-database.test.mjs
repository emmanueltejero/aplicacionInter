import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
test('admin access edits are atomic and immediately enforce team and club data permissions', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
      create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}'::jsonb,raw_user_meta_data jsonb default '{}'::jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon;alter default privileges in schema public grant execute on functions to anon,authenticated;`);
    const files = ['202611050001_club.sql','202611090002_matches.sql','202611090003_clear_attendance.sql','202611100001_exercises.sql','202611100002_training_plans.sql','202611100003_copy_training_plans.sql','202611100004_web_users.sql','202611100005_coach_access.sql'];
    for (const file of files) await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.exec(`insert into auth.users(id,email) values ('${id(1)}','admin@example.invalid'),('${id(2)}','coach@example.invalid'),('${id(3)}','other@example.invalid'),('${id(4)}','disabled@example.invalid'),('${id(5)}','outsider@example.invalid'),('${id(6)}','admin2@example.invalid');
      insert into public.club_members values ('${id(1)}','admin',true),('${id(2)}','coach',true),('${id(3)}','coach',true),('${id(4)}','admin',false),('${id(6)}','admin',true);
      insert into public.teams values ('${id(10)}','A'),('${id(20)}','B'),('${id(30)}','C');
      insert into public.team_coaches values ('${id(10)}','${id(2)}'),('${id(20)}','${id(2)}'),('${id(30)}','${id(3)}');
      insert into public.players(id,team_id,name,number) values ('${id(100)}','${id(10)}','Jugador',7);
      insert into public.attendance values ('${id(10)}','${id(100)}','2026-11-10','present');
      insert into public.exercises(id,created_by,title,description,categories,duration,min_players,max_players,space_length,space_width,materials)
        values ('${id(700)}','${id(2)}','Rondo','Conservar',array['Posesión'],12,6,12,15,20,'[]');
      insert into public.matches(id,team_id,match_date,opponent,duration,venue,played) values ('${id(500)}','${id(10)}','2026-11-10','Rival',60,'home',true);
      insert into public.training_plans(id,team_id,created_by,training_date,title,player_count,entries) values ('${id(600)}','${id(10)}','${id(2)}','2026-11-10','Plan',10,'[{"title":"Ficha histórica"}]');`);
    async function user(n) { await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',false)`); }
    async function update({ target = 2, enabled = true, teams = [10,20], expectedEnabled = true, expectedTeams = [10,20] } = {}) {
      return (await db.query('select public.admin_update_coach_access($1::uuid,$2::boolean,$3::uuid[],$4::boolean,$5::uuid[]) as access', [id(target),enabled,teams.map(id),expectedEnabled,expectedTeams.map(id)])).rows[0].access;
    }
    await t.test('only an active admin can edit a coach; admins and the operator cannot be changed', async () => {
      for (const n of [2,3,4,5]) { await user(n); await assert.rejects(update(), /Solo administradores activos/); }
      await user(1);
      for (const n of [1,4,6]) await assert.rejects(update({ target: n, expectedTeams: [] }), /Solo se puede gestionar/);
      await db.exec('reset role;set role anon');await assert.rejects(update(), /permission denied/);
    });
    await t.test('disabled status blocks new reads/writes in an existing session without deleting history', async () => {
      await user(1);const result = await update({ enabled: false });
      assert.equal(result.enabled,false);assert.deepEqual(result.team_ids,[id(10),id(20)]);
      await user(2);
      for (const table of ['teams','players','attendance','matches','exercises','training_plans']) assert.equal((await db.query('select * from public.'+table)).rows.length,0);
      await assert.rejects(db.query(`insert into public.attendance values ('${id(10)}','${id(100)}','2026-11-11','present')`), /row-level security/);
      await user(1);
      for (const table of ['players','attendance','matches','exercises','training_plans']) assert.equal((await db.query('select * from public.'+table)).rows.length,1);
      assert.equal((await db.query('select * from public.club_members where user_id=$1',[id(2)])).rows[0].enabled,false);
      const retried = await update({ enabled: false });assert.deepEqual(retried,result);
    });
    await t.test('reactivation restores selected teams; withdrawals take effect immediately and leave other coaches unchanged', async () => {
      await user(1);await update({ enabled:true,teams:[30],expectedEnabled:false });
      await user(2);assert.deepEqual((await db.query('select name from public.teams')).rows,[{ name:'C' }]);
      assert.equal((await db.query('select * from public.players')).rows.length,0);assert.equal((await db.query('select * from public.exercises')).rows.length,1);
      await user(1);assert.deepEqual((await db.query('select team_id from public.team_coaches where user_id=$1',[id(3)])).rows.map(x=>x.team_id),[id(30)]);
      await update({ teams:[],expectedTeams:[30] });
      await user(2);assert.equal((await db.query('select * from public.teams')).rows.length,0);assert.equal((await db.query('select * from public.exercises')).rows.length,1);
    });
    await t.test('stale changes and invalid selections cannot partially overwrite access', async () => {
      await user(1);
      await assert.rejects(update({ teams:[10],expectedTeams:[30] }), /acceso ha cambiado/);
      for (const teams of [[999],[10,10],Array.from({length:21},(_,i)=>i+10)]) await assert.rejects(update({ teams,expectedTeams:[] }));
      assert.deepEqual((await db.query('select team_id from public.team_coaches where user_id=$1',[id(2)])).rows,[]);
      assert.equal((await db.query('select enabled from public.club_members where user_id=$1',[id(2)])).rows[0].enabled,true);
      await update({ teams:[20,10],expectedTeams:[] });
      await user(6);await assert.rejects(update({ teams:[30],expectedTeams:[] }), /acceso ha cambiado/);
      await assert.rejects(db.exec(`update public.club_members set role='admin' where user_id='${id(2)}'`),/permission denied/);
      await assert.rejects(db.exec(`delete from public.team_coaches where user_id='${id(2)}'`),/permission denied/);
      await db.exec('reset role');await db.exec(readFileSync(new URL('../supabase/migrations/202611100005_coach_access.sql',import.meta.url),'utf8'));
      await user(1);assert.deepEqual((await update({ teams:[10,20] })).team_ids,[id(10),id(20)]);
    });
  } finally { await db.close(); }
});
