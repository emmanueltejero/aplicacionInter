import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const migration = readFileSync(new URL('../supabase/migrations/202611110005_team_management.sql', import.meta.url), 'utf8');
test('admin team rename/archive/delete-empty preserve history, prevent stale edits and enforce read-only archived data for every API', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}'::jsonb,raw_user_meta_data jsonb default '{}'::jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon;alter default privileges in schema public grant execute on functions to anon,authenticated;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert on storage.objects to authenticated;`);
    for (const file of ['202611050001_club.sql','202611090002_matches.sql','202611090003_clear_attendance.sql','202611100001_exercises.sql','202611100002_training_plans.sql','202611100003_copy_training_plans.sql','202611100004_web_users.sql','202611100005_coach_access.sql','202611100006_exercise_team_categories.sql','202611110001_exercise_media.sql','202611110002_exercise_favorites.sql','202611110003_team_categories.sql','202611110004_exercise_reviews.sql']) await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.exec(`insert into auth.users(id) values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}'),('${id(5)}');
      insert into public.club_members(user_id,role,enabled) values('${id(1)}','admin',true),('${id(2)}','coach',true),('${id(3)}','admin',false),('${id(5)}','coach',true);
      insert into public.teams(id,name,category) values('${id(10)}','Alevín B','Alevín'),('${id(20)}','Equipo vacío',null),('${id(30)}','Cadete A','Cadete');
      insert into public.team_coaches values('${id(10)}','${id(2)}'),('${id(20)}','${id(2)}');
      insert into public.players(id,team_id,name,number) values('${id(50)}','${id(10)}','Jugador ficticio',7);
      insert into public.attendance values('${id(10)}','${id(50)}','2026-11-11','present');`);
    async function user(n) { await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',false)`); }
    const team = async n => (await db.query('select * from public.teams where id=$1',[id(n)])).rows[0];
    const rename = async (n,name,revision) => (await db.query('select public.admin_rename_team($1::uuid,$2,$3::integer) as team',[id(n),name,revision])).rows[0].team;
    const archive = async (n,value,revision) => (await db.query('select public.admin_archive_team($1::uuid,$2::boolean,$3::integer) as team',[id(n),value,revision])).rows[0].team;
    const remove = async (n,name,revision) => (await db.query('select public.admin_delete_empty_team($1::uuid,$2::integer,$3) as id',[id(n),revision,name])).rows[0].id;
    await user(2);
    await db.query(`select public.save_exercise($1::uuid,0,'Rondo','Pase y control',array['Posesión'],12,6,12,15,20,'[]'::jsonb,false)`,[id(100)]);
    await db.query('select public.save_training_plan($1::uuid,$2::uuid,0,$3::date,$4,8,$5,$6::jsonb,false)',[id(10),id(500),'2026-11-11','Sesión','',JSON.stringify([{id:id(1000),exerciseId:id(100),exerciseRevision:1,duration:12}])]);
    const matchArgs=[id(10),id(200),'2026-11-10','Rival',60,'home',true,JSON.stringify([{player_id:id(50),minutes:30}])];
    await db.query('select public.save_match($1::uuid,$2::uuid,$3::date,$4,$5::integer,$6,$7::boolean,$8::jsonb)',matchArgs);
    await db.query('select public.set_exercise_favorite($1::uuid,true)',[id(100)]);
    await db.exec('reset role'); const tables=['team_coaches','players','attendance','matches','match_players','training_plans','exercises','exercise_favorites'];
    const history=await Promise.all(tables.map(table=>db.query('select * from public.'+table).then(r=>r.rows)));
    await db.exec(migration);
    await t.test('rename keeps identity/category/history, normalizes names, rejects duplicates and safe retry never overwrites later changes',async()=>{
      await user(1);const saved=await rename(10,'  Alevín   C ',1);assert.equal(saved.id,id(10));assert.equal(saved.category,'Alevín');assert.equal(saved.revision,2);assert.equal(saved.archived_at,null);
      assert.deepEqual(await rename(10,'Alevín C',1),saved);await assert.rejects(rename(10,'Otro',1),/ha cambiado/);
      await assert.rejects(rename(10,'cadete a',2),/repetido/);for(const name of ['', 'x'.repeat(81)])await assert.rejects(rename(10,name,2),/inválido/);
      await db.exec('reset role');for(const [i,table] of tables.entries())assert.deepEqual((await db.query('select * from public.'+table)).rows,history[i]);await user(1);
      await db.query("select public.admin_set_team_category($1::uuid,'Benjamín','Alevín')",[id(10)]);assert.equal((await team(10)).revision,3);
      await assert.rejects(rename(10,'Cambio desactualizado',2),/ha cambiado/);
    });
    let archived;
    await t.test('archive is retry-safe; coaches keep history access while new assignments and all writes are denied',async()=>{
      await user(1);archived=await archive(10,true,3);assert.equal(archived.revision,4);assert.ok(archived.archived_at);assert.deepEqual(await archive(10,true,3),archived);
      await user(2);assert.equal((await team(10)).name,'Alevín C');assert.equal((await db.query('select * from public.players')).rows.length,1);
      await assert.rejects(db.query('update public.players set name=$1 where id=$2',['Otro',id(50)]),/archivado/);
      await assert.rejects(db.query('insert into public.players(team_id,name,number) values($1,$2,8)',[id(10),'Nuevo']),/archivado/);
      await assert.rejects(db.query('update public.attendance set status=$1 where team_id=$2',['absent',id(10)]),/archivado/);
      await assert.rejects(db.query('delete from public.attendance where team_id=$1',[id(10)]),/archivado/);
      await assert.rejects(db.query('select public.save_match($1::uuid,$2::uuid,$3::date,$4,$5::integer,$6,$7::boolean,$8::jsonb)',[...matchArgs.slice(0,3),'Cambio',...matchArgs.slice(4)]),/archivado/);
      await assert.rejects(db.query('select public.copy_training_plan($1::uuid,$2::uuid,1,$3::uuid,$4::date,$5)',[id(10),id(500),id(501),'2026-11-12','Copia']),/archivado/);
      await user(1);await assert.rejects(db.query('select public.admin_update_coach_access($1::uuid,true,$2::uuid[],true,$3::uuid[])',[id(5),[id(10)],[]]),/archivado/);
      // Existing assignments can be retained while updating another access setting.
      await db.query('select public.admin_update_coach_access($1::uuid,false,$2::uuid[],true,$3::uuid[])',[id(2),[id(10),id(20)],[id(10),id(20)]]);
      await db.query('select public.admin_update_coach_access($1::uuid,true,$2::uuid[],false,$3::uuid[])',[id(2),[id(10),id(20)],[id(10),id(20)]]);
      await user(5);assert.equal(await team(10),undefined);
    });
    await t.test('delete refuses any history, including archived players, matches or plans; confirmation cannot use stale name or revision',async()=>{
      await user(1);await assert.rejects(remove(10,'Alevín C',4),/historial/);await assert.rejects(remove(20,'Otro nombre',1),/ha cambiado/);
      await rename(20,'Vacío renombrado',1);await assert.rejects(remove(20,'Equipo vacío',1),/ha cambiado/);
      assert.equal(await remove(20,'Vacío renombrado',2),id(20));assert.equal(await remove(20,'Vacío renombrado',2),id(20));assert.equal(await team(20),undefined);
      assert.equal((await db.query('select * from public.team_coaches where team_id=$1',[id(20)])).rows.length,0);assert.equal((await db.query('select * from public.club_members')).rows.length,4);
      // A training-only team is protected even with an empty roster.
      await db.exec('reset role');await db.query('insert into public.training_plans(id,team_id,created_by,training_date,title,player_count,notes,entries) select $1,$2,created_by,training_date,title,player_count,notes,entries from public.training_plans where id=$3',[id(502),id(30),id(500)]);
      await user(1);await assert.rejects(remove(30,'Cadete A',1),/historial/);
    });
    await t.test('only active admins can rename/archive/restore/delete; direct metadata writes remain forbidden',async()=>{
      for(const n of [2,3,4,5]){await user(n);await assert.rejects(rename(10,'Otro',4),/administradores/);await assert.rejects(archive(10,false,4),/administradores/);await assert.rejects(remove(10,'Alevín C',4),/administradores/);await assert.rejects(db.exec("update public.teams set name='Hack'"),/permission denied/);}
      await db.exec('reset role;set role anon');await assert.rejects(archive(10,false,4),/permission denied/);
    });
    await t.test('restoring reenables writes with the same IDs; repeating migration preserves current states and full history',async()=>{
      await user(1);const restored=await archive(10,false,4);assert.equal(restored.revision,5);assert.equal(restored.archived_at,null);assert.deepEqual(await archive(10,false,4),restored);
      await assert.rejects(archive(10,true,3),/ha cambiado/);
      await user(2);await db.query('update public.players set name=$1 where id=$2',['Jugador restaurado',id(50)]);
      assert.equal((await db.query('select entries from public.training_plans where id=$1',[id(500)])).rows[0].entries[0].title,'Rondo');
      await db.exec('reset role');await db.exec(migration);await user(1);assert.equal((await team(10)).revision,5);assert.equal((await team(10)).name,'Alevín C');assert.equal((await db.query('select * from public.attendance')).rows.length,1);assert.equal((await db.query('select * from public.match_players')).rows[0].minutes,30);
    });
  } finally { await db.close(); }
});
