import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,image=`${id(2)}/${id(900)}.jpg`,replacement=`${id(1)}/${id(901)}.jpg`;
const migration=readFileSync(new URL('../supabase/migrations/202611110001_exercise_media.sql',import.meta.url),'utf8');
test('private immutable exercise images enforce club access, validate references and survive library changes in plan snapshots',async t=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;alter default privileges in schema public grant execute on functions to anon,authenticated;
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated,anon;`);
  for(const file of ['202611050001_club.sql','202611100001_exercises.sql','202611100002_training_plans.sql','202611100003_copy_training_plans.sql','202611100006_exercise_team_categories.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  await db.exec(`insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}'),('${id(5)}');insert into public.club_members values('${id(1)}','admin',true),('${id(2)}','coach',true),('${id(3)}','coach',true),('${id(4)}','coach',false);insert into public.teams values('${id(10)}','A'),('${id(20)}','B');insert into public.team_coaches values('${id(10)}','${id(2)}'),('${id(20)}','${id(3)}');`);
  await db.exec(migration);
  async function user(n){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',false)`);}
  async function upload(path,size=20000,mime='image/jpeg'){return db.query("insert into storage.objects(bucket_id,name,metadata) values('exercise-images',$1,$2::jsonb)",[path,JSON.stringify({size,mimetype:mime})]);}
  async function save({revision=0,path=image,video='https://youtu.be/demo',title='Rondo con esquema',legacy=false}={}){
   const args=[id(100),revision,title,'Pase y control',['Posesión'],12,6,12,15,20,'[]',false,['Benjamín']];if(!legacy)args.push(path,video);
   return(await db.query(`select public.${legacy?'save_exercise_with_team_categories':'save_exercise_with_media'}($1::uuid,$2::integer,$3,$4,$5::text[],$6::integer,$7::integer,$8::integer,$9::integer,$10::integer,$11::jsonb,$12::boolean,$13::text[]${legacy?'':',$14::text,$15::text'}) as exercise`,args)).rows[0].exercise;
  }
  await t.test('bucket is private and bounded; only active members upload to their own immutable image paths',async()=>{
   const bucket=(await db.query('select * from storage.buckets')).rows[0];assert.equal(bucket.public,false);assert.equal(bucket.file_size_limit,204800);assert.deepEqual(bucket.allowed_mime_types,['image/jpeg']);
   await user(2);await upload(image);await assert.rejects(upload(replacement),/row-level security/);await assert.rejects(upload('../bad.jpg'),/row-level security/);
   for(const n of [4,5]){await user(n);assert.equal((await db.query('select * from storage.objects')).rows.length,0);await assert.rejects(upload(`${id(n)}/${id(902)}.jpg`),/row-level security/);}
   await db.exec('reset role;set role anon');assert.equal((await db.query('select * from storage.objects')).rows.length,0);await assert.rejects(upload(image));
  });
  await t.test('media saves and retries are atomic and reject other authors, absent files and unsupported videos',async()=>{
   await user(2);const saved=await save();assert.equal(saved.image_path,image);assert.equal(saved.revision,1);assert.deepEqual(await save(),saved);
   await assert.rejects(save({revision:0,video:'https://vimeo.com/new'}),/ha cambiado/);await assert.rejects(save({revision:1,path:`${id(2)}/${id(999)}.jpg`}),/no está subida/);
   for(const video of ['javascript:alert(1)','http://youtu.be/demo','https://youtu.be.evil.invalid/demo','https://user@youtu.be/demo'])await assert.rejects(save({revision:1,video}),/inválidos/);
   await user(3);assert.equal((await db.query('select * from storage.objects')).rows.length,1);await assert.rejects(save({revision:1}),/Solo el autor/);
   await user(1);await upload(replacement);await user(2);await assert.rejects(save({revision:1,path:replacement}),/pertenecer/);
   assert.equal((await db.query("update storage.objects set metadata='{}' returning id")).rows.length,0);
   assert.equal((await db.query('delete from storage.objects returning id')).rows.length,0);assert.equal((await db.query('select * from storage.objects')).rows.length,2);
  });
  let original;
  await t.test('server snapshots trusted media, copies retain it and legacy edits cannot erase it',async()=>{
   await user(2);const entries=[{id:id(1000),exerciseId:id(100),exerciseRevision:1,duration:12,imagePath:'forged',videoUrl:'javascript:bad'}];
   await db.query('select public.save_training_plan($1::uuid,$2::uuid,0,$3::date,$4,8,$5,$6::jsonb,false)',[id(10),id(500),'2026-11-11','Plan con imagen','',JSON.stringify(entries)]);
   original=(await db.query('select entries from public.training_plans')).rows[0].entries;assert.equal(original[0].imagePath,image);assert.equal(original[0].videoUrl,'https://youtu.be/demo');
   const old=await save({revision:1,legacy:true,title:'Edición antigua'});assert.equal(old.image_path,image);assert.equal(old.video_url,'https://youtu.be/demo');
   await user(1);const edited=await save({revision:2,path:replacement,video:'https://vimeo.com/new'});assert.equal(edited.created_by,id(2));assert.equal(edited.image_path,replacement);
   await user(2);assert.deepEqual((await db.query('select entries from public.training_plans')).rows[0].entries,original);
   await db.query('select public.copy_training_plan($1::uuid,$2::uuid,1,$3::uuid,$4::date,$5)',[id(10),id(500),id(501),'2026-11-12','Copia con imagen']);const copy=(await db.query('select entries from public.training_plans where id=$1',[id(501)])).rows[0].entries;assert.equal(copy[0].imagePath,image);
   await save({revision:3,path:null,video:null});assert.equal((await db.query('select * from storage.objects')).rows.length,2);assert.deepEqual((await db.query('select entries from public.training_plans where id=$1',[id(500)])).rows[0].entries,original);
  });
  await t.test('metadata bounds, club revocation and repeated migration preserve references and block bypasses',async()=>{
   await user(2);for(const [n,size,mime] of [[910,204801,'image/jpeg'],[911,10,'image/png'],[912,0,'image/jpeg']]){const path=`${id(2)}/${id(n)}.jpg`;await upload(path,size,mime);await assert.rejects(save({revision:4,path}),/no está subida/);}
   await assert.rejects(db.exec("update public.exercises set image_path='https://evil.invalid/image.jpg'"),/permission denied/);
   await db.exec(`reset role;update public.club_members set enabled=false where user_id='${id(2)}'`);await user(2);assert.equal((await db.query('select * from storage.objects')).rows.length,0);await assert.rejects(save({revision:4,path:null,video:null}),/no autorizado/);
   await db.exec('reset role;set role anon');await assert.rejects(save(),/permission denied/);await db.exec('reset role');await db.exec(migration);assert.deepEqual((await db.query('select entries from public.training_plans where id=$1',[id(500)])).rows[0].entries,original);assert.equal((await db.query('select revision from public.exercises')).rows[0].revision,4);
  });
 }finally{await db.close();}
});
