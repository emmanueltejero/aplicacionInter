import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const migration=readFileSync(new URL('../supabase/migrations/202611100006_exercise_team_categories.sql',import.meta.url),'utf8');
test('recommended team categories preserve the shared library, legacy clients and saved training history',async t=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated,anon;alter default privileges in schema public grant execute on functions to anon,authenticated;`);
  for(const file of ['202611050001_club.sql','202611100001_exercises.sql','202611100002_training_plans.sql','202611100003_copy_training_plans.sql']) await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  await db.exec(`insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}'),('${id(5)}');
   insert into public.club_members values('${id(1)}','admin',true),('${id(2)}','coach',true),('${id(3)}','coach',true),('${id(4)}','coach',false);
   insert into public.teams values('${id(10)}','A'),('${id(20)}','B');insert into public.team_coaches values('${id(10)}','${id(2)}'),('${id(20)}','${id(3)}');`);
  async function user(n){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',false)`);}
  async function save({exercise=100,revision=0,teamCategories=[],legacy=false,title='Rondo',archived=false}={}){
   const values=[id(exercise),revision,title,'Pase y control',['Posesión'],12,6,8,15,20,'[]',archived];
   if(!legacy)values.push(teamCategories);
   return (await db.query(`select public.${legacy?'save_exercise':'save_exercise_with_team_categories'}($1::uuid,$2::integer,$3,$4,$5::text[],$6::integer,$7::integer,$8::integer,$9::integer,$10::integer,$11::jsonb,$12::boolean${legacy?'':',$13::text[]'}) as exercise`,values)).rows[0].exercise;
  }
  await user(2);await save({legacy:true});
  const entries=[{id:id(1000),exerciseId:id(100),exerciseRevision:1,duration:12}];
  await db.query('select public.save_training_plan($1::uuid,$2::uuid,0,$3::date,$4,8,$5,$6::jsonb,false)',[id(10),id(500),'2026-11-10','Plan anterior','Notas',JSON.stringify(entries)]);
  const history=(await db.query('select entries from public.training_plans')).rows[0].entries;
  await db.exec('reset role');await db.exec(migration);
  await t.test('migration leaves old exercises unclassified, preserves content and repeatable saves include classification',async()=>{
   await user(2);const before=(await db.query('select * from public.exercises')).rows[0];assert.deepEqual(before.team_categories,[]);assert.equal(before.revision,1);
   const saved=await save({revision:1,teamCategories:['Alevín','Benjamín']});assert.deepEqual(saved.team_categories,['Benjamín','Alevín']);assert.deepEqual(saved.categories,['Posesión']);assert.equal(saved.created_by,id(2));assert.equal(saved.revision,2);
   assert.deepEqual(await save({revision:1,teamCategories:['Benjamín','Alevín']}),saved);
   await assert.rejects(save({revision:1,teamCategories:['Cadete']}),/ha cambiado/);
  });
  await t.test('older clients retain recommendations during edits, archive and lost-response retries',async()=>{
   await user(2);const saved=await save({legacy:true,revision:2,title:'Rondo editado',archived:true});assert.deepEqual(saved.team_categories,['Benjamín','Alevín']);assert.ok(saved.archived_at);assert.equal(saved.revision,3);
   assert.deepEqual(await save({legacy:true,revision:2,title:'Rondo editado',archived:true}),saved);
   await assert.rejects(save({legacy:true,revision:2,title:'Intento antiguo'}),/ha cambiado/);
   const cleared=await save({revision:3,teamCategories:[]});assert.deepEqual(cleared.team_categories,[]);assert.equal(cleared.archived_at,null);assert.equal(cleared.revision,4);
  });
  await t.test('shared reads and author/admin writes remain enforced for both APIs and direct writes stay denied',async()=>{
   await user(3);assert.equal((await db.query('select * from public.exercises')).rows.length,1);await assert.rejects(save({revision:4,teamCategories:['Cadete']}),/Solo el autor/);await assert.rejects(save({legacy:true,revision:4}),/Solo el autor/);
   await assert.rejects(db.exec(`update public.exercises set team_categories=array['Cadete']`),/permission denied/);
   await user(1);const saved=await save({revision:4,teamCategories:['Femenino','Cadete']});assert.deepEqual(saved.team_categories,['Cadete','Femenino']);assert.equal(saved.created_by,id(2));
   for(const n of [4,5]){await user(n);assert.equal((await db.query('select * from public.exercises')).rows.length,0);await assert.rejects(save({revision:5}),/Acceso al club/);}
   await db.exec('reset role;set role anon');await assert.rejects(save(),/permission denied/);await assert.rejects(save({legacy:true}),/permission denied/);await assert.rejects(db.query("select public.valid_exercise_team_categories('{}'::text[])"),/permission denied/);
  });
  await t.test('invalid recommendations fail atomically; training snapshots and copies survive migration and later reclassification',async()=>{
   await user(2);for(const teamCategories of [['Otra'],['Benjamin'],[null],['Cadete','Cadete'],Array(10).fill('Cadete')])await assert.rejects(save({revision:5,teamCategories}),/inválidas/);
   const saved=(await db.query('select * from public.exercises')).rows[0];assert.equal(saved.revision,5);assert.deepEqual(saved.team_categories,['Cadete','Femenino']);
   assert.deepEqual((await db.query('select entries from public.training_plans')).rows[0].entries,history);
   await db.query('select public.copy_training_plan($1::uuid,$2::uuid,1,$3::uuid,$4::date,$5)',[id(10),id(500),id(501),'2026-11-11','Copia']);
   const copy=(await db.query('select entries from public.training_plans where id=$1',[id(501)])).rows[0].entries;assert.equal(copy[0].title,history[0].title);assert.deepEqual(copy[0].categories,history[0].categories);
   await db.exec('reset role');await assert.rejects(db.exec("update public.exercises set team_categories=array['Otra']"),/check constraint/);await db.exec(migration);await user(1);
   assert.equal((await db.query('select revision from public.exercises')).rows[0].revision,5);assert.deepEqual((await db.query('select entries from public.training_plans where id=$1',[id(500)])).rows[0].entries,history);
  });
  await t.test('classified new exercises attribute the current author and a lost response cannot create a duplicate',async()=>{
   await user(2);const saved=await save({exercise:200,teamCategories:['Prebenjamín','Minis']});assert.equal(saved.revision,1);assert.equal(saved.created_by,id(2));assert.deepEqual(saved.team_categories,['Minis','Prebenjamín']);
   assert.deepEqual(await save({exercise:200,teamCategories:['Minis','Prebenjamín']}),saved);assert.equal((await db.query('select * from public.exercises')).rows.length,2);
  });
 }finally{await db.close();}
});
