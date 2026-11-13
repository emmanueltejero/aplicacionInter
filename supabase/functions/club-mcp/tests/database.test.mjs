import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const migrations=new URL('../../../migrations/',import.meta.url),resource='https://club.example/functions/v1/club-mcp';
test('real PostgreSQL RLS: reader is scoped, cannot write even as admin, revocation is live, and hook leaves web accounts unchanged',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create role authenticator;create role supabase_auth_admin;
   create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}'::jsonb,raw_user_meta_data jsonb default '{}'::jsonb);
   create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
   create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
   grant usage on schema auth to authenticated,anon;alter default privileges in schema public grant execute on functions to anon,authenticated;
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert on storage.objects to authenticated;`);
  for(const file of readdirSync(migrations).filter(f=>f.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(file,migrations),'utf8'));
  await db.exec(`insert into auth.users(id) values('${id(1)}'),('${id(2)}'),('${id(3)}');
   insert into public.club_members(user_id,role,enabled) values('${id(1)}','admin',true),('${id(2)}','coach',true),('${id(3)}','coach',false);
   insert into public.teams(id,name,category,archived_at) values('${id(10)}','Alevín ficticio','Alevín',null),('${id(20)}','Cadete ficticio','Cadete',null);
   insert into public.team_coaches values('${id(10)}','${id(2)}');
   insert into public.players(id,team_id,name,number) values('${id(50)}','${id(10)}','Jugador ficticio A',7),('${id(51)}','${id(20)}','Jugador ficticio B',8);
   insert into public.attendance values('${id(10)}','${id(50)}','2026-11-01','present');
   insert into public.matches values('${id(100)}','${id(10)}','2026-11-01','Rival ficticio',60,'home',true);
   insert into public.match_players values('${id(100)}','${id(10)}','${id(50)}',null);
   update public.teams set archived_at=now() where id='${id(20)}';
   insert into public.club_mcp_oauth_clients values('${id(90)}','${resource}',true);`);
  const claims=n=>({sub:id(n),role:'club_mcp_reader',aud:resource,client_id:id(90),club_mcp_read:true});
  async function reader(n){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims(n))]);await db.exec('set role club_mcp_reader');}
  const read=async team=>(await db.query('select public.club_mcp_read_team($1::uuid,null,null,$2::date,true,true,true) as data',[id(team),'2026-11-13'])).rows[0].data;
  await t.test('coach can read only assigned teams, exact snapshots keep pending minutes and no cross-team rows',async()=>{
   await reader(2);assert.equal((await db.query('select public.club_mcp_authorized() as allowed')).rows[0].allowed,true);
   assert.deepEqual((await db.query('select id from public.teams')).rows.map(x=>x.id),[id(10)]);const data=await read(10);assert.equal(data.roster.length,1);assert.equal(data.matches[0].players[0].minutes,null);assert.equal(data.attendance[0].date,'2026-11-01');
   await assert.rejects(read(20),/no autorizado/);assert.equal((await db.query('select * from public.players where team_id=$1',[id(20)])).rows.length,0);
  });
  await t.test('snapshot does not truncate at 1000 rows and SQL validates period/cutoff independently',async()=>{
   await db.exec('reset role');await db.query("insert into public.attendance(team_id,player_id,training_date,status) select $1::uuid,$2::uuid,'2020-01-01'::date+day,'present' from generate_series(0,1199) day",[id(10),id(50)]);
   await reader(2);assert.equal((await read(10)).attendance.length,1201);
   const bounded=(await db.query('select public.club_mcp_read_team($1::uuid,$2::date,$2::date,$2::date,true,true,false) as data',[id(10),'2026-11-01'])).rows[0].data;assert.equal(bounded.attendance.length,1);assert.equal(bounded.matches.length,0);
   await assert.rejects(db.query('select public.club_mcp_read_team($1::uuid,null,null,$2::date,true,true,true)',[id(10),'9999-12-31']),/no válido/);
  });
  await t.test('even admin reader cannot mutate tables, invoke write RPCs, use Auth administration, or read the OAuth allowlist',async()=>{
   await reader(1);assert.equal((await db.query('select id from public.teams')).rows.length,2);assert.equal((await read(20)).team.archived_at!==null,true);
   for(const statement of ["update public.players set name='x'",'delete from public.attendance',`insert into public.players(team_id,name,number) values('${id(10)}','x',99)`,'select * from public.club_mcp_oauth_clients','select * from auth.users'])await assert.rejects(db.exec(statement),/permission denied/);
   const mutators=(await db.query("select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ '^(save_|admin_|copy_|set_exercise_|review_|club_mcp_access_token_hook)' ")).rows;
   assert.ok(mutators.length>5);for(const f of mutators)assert.equal((await db.query("select has_function_privilege('club_mcp_reader',$1::oid,'EXECUTE') as allowed",[f.oid])).rows[0].allowed,false,f.proname);
  });
  await t.test('assignment removal, disabled membership and disabled OAuth client stop subsequent reads',async()=>{
   await reader(3);assert.equal((await db.query('select * from public.teams')).rows.length,0);await assert.rejects(read(10),/no autorizado/);
   await db.exec('reset role');await db.query('delete from public.team_coaches where user_id=$1',[id(2)]);await reader(2);await assert.rejects(read(10),/no autorizado/);
   await db.exec('reset role');await db.exec('update public.club_mcp_oauth_clients set enabled=false');await reader(1);assert.equal((await db.query('select * from public.teams')).rows.length,0);await assert.rejects(read(10),/no autorizado/);
   await db.exec('reset role');await db.exec('update public.club_mcp_oauth_clients set enabled=true');
  });
  await t.test('token hook restricts OAuth role/audience, rejects unapproved clients and leaves normal sign-ins/recovery untouched',async()=>{
   await db.exec('reset role;set role supabase_auth_admin');
   const hook=async event=>(await db.query('select public.club_mcp_access_token_hook($1::jsonb) as data',[JSON.stringify(event)])).rows[0].data;
   const web={claims:{sub:id(1),role:'authenticated',aud:'authenticated'},authentication_method:'password'};assert.deepEqual(await hook(web),web);
   const oauth=await hook({...web,claims:{...web.claims,client_id:id(90)},authentication_method:'oauth_provider/authorization_code'});assert.equal(oauth.claims.role,'club_mcp_reader');assert.equal(oauth.claims.aud,resource);assert.equal(oauth.claims.club_mcp_read,true);
   assert.ok((await hook({...web,claims:{...web.claims,client_id:id(91)}})).error);
  });
  await db.exec('reset role');await db.exec(readFileSync(new URL('202611130001_club_mcp.sql',migrations),'utf8'));await reader(1);assert.equal((await read(10)).roster[0].name,'Jugador ficticio A');
 }finally{await db.close()}
});
