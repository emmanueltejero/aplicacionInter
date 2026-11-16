import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const migrations = new URL('../supabase/migrations/', import.meta.url);
const filename = '202611160001_training_entry_notes.sql';
const migration = readFileSync(new URL(filename, migrations), 'utf8');
const entry = (n, sessionNotes) => ({ id: id(n), exerciseId: id(100), exerciseRevision: 1, duration: 12, ...(sessionNotes === undefined ? {} : { sessionNotes }) });

test('training block notes persist safely through edits, legacy clients, copies and team authorization', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create role authenticator;create role supabase_auth_admin;
      create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}'::jsonb,raw_user_meta_data jsonb default '{}'::jsonb);
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
      grant usage on schema auth to authenticated,anon;alter default privileges in schema public grant execute on functions to anon,authenticated;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));
      alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert on storage.objects to authenticated;`);
    for (const file of readdirSync(migrations).filter(file => file.endsWith('.sql') && file < filename).sort()) await db.exec(readFileSync(new URL(file, migrations), 'utf8'));
    await db.exec(`insert into auth.users(id) values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}'),('${id(5)}');
      insert into public.club_members(user_id,role,enabled) values('${id(1)}','admin',true),('${id(2)}','coach',true),('${id(3)}','coach',true),('${id(4)}','coach',false);
      insert into public.teams(id,name) values('${id(10)}','Alevín B ficticio'),('${id(20)}','Cadete ficticio');
      insert into public.team_coaches values('${id(10)}','${id(2)}'),('${id(20)}','${id(3)}'),('${id(10)}','${id(4)}');
      insert into public.exercises(id,created_by,title,description,categories,duration,min_players,max_players,space_length,space_width,materials,video_url)
      values('${id(100)}','${id(3)}','2 contra 1','Desarrollo compartido',array['Técnica'],12,3,18,20,30,'[{"name":"Conos","quantity":4}]','https://youtu.be/fake-demo');`);
    async function user(n, role = 'authenticated') {
      await db.exec('reset role'); await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: id(n), role })]); await db.exec('set role ' + role);
    }
    async function save({ plan = 500, team = 10, revision = 0, entries = [entry(1000)], legacy = false } = {}) {
      return (await db.query(`select public.${legacy ? 'save_training_plan' : 'save_training_plan_with_entry_notes'}($1::uuid,$2::uuid,$3::integer,'2026-11-16'::date,'Sesión',12,'Notas generales',$4::jsonb,false) as plan`, [id(team), id(plan), revision, JSON.stringify(entries)])).rows[0].plan;
    }
    const read = async (plan = 500) => (await db.query('select to_jsonb(p) as plan from public.training_plans p where id=$1', [id(plan)])).rows[0]?.plan;
    const copy = async (revision, target) => (await db.query("select public.copy_training_plan($1::uuid,$2::uuid,$3::integer,$4::uuid,'2026-11-17'::date,'Copia') as plan", [id(10), id(500), revision, id(target)])).rows[0].plan;
    await user(2); const oldPlan = await save({ legacy: true });
    await db.exec('reset role'); const library = (await db.query('select * from public.exercises')).rows;
    await t.test('migration preserves old plans exactly and is repeatable', async () => {
      await db.exec(migration); await db.exec(migration);
      await user(2); assert.deepEqual(await read(), oldPlan);
    });
    await t.test('notes stay with repeated blocks and trusted snapshots; equal retries do not create a new revision', async () => {
      await user(2);
      const entries = [{ ...entry(1000, '  Azul: dos grupos\nRotar cada 2 minutos.  '), title: 'Falsificado', videoUrl: 'https://evil.invalid' }, entry(1001, 'Negro: tandas de 3 minutos.')];
      const saved = await save({ revision: 1, entries });
      assert.equal(saved.revision, 2); assert.equal(saved.entries[0].sessionNotes, 'Azul: dos grupos\nRotar cada 2 minutos.');
      assert.equal(saved.entries[1].sessionNotes, 'Negro: tandas de 3 minutos.');
      assert.equal(saved.entries[0].title, '2 contra 1'); assert.equal(saved.entries[1].videoUrl, 'https://youtu.be/fake-demo');
      assert.deepEqual(await save({ revision: 1, entries }), saved);
      await assert.rejects(save({ revision: 1, entries: [entry(1000, 'Edición antigua')] }), /ha cambiado/);
      const next = await save({ revision: 2, entries: [entry(1001, 'Negro: tandas de 3 minutos.'), entry(1000, '')] });
      assert.equal(next.entries[0].id, id(1001)); assert.equal(next.entries[0].sessionNotes, 'Negro: tandas de 3 minutos.'); assert.equal(next.entries[1].sessionNotes, '');
    });
    await t.test('old clients preserve saved notes when omitted, while current clients can clear them', async () => {
      await user(2);
      const saved = await save({ revision: 3, legacy: true, entries: [entry(1001), entry(1000)] });
      assert.equal(saved.entries[0].sessionNotes, 'Negro: tandas de 3 minutos.'); assert.equal(saved.entries[1].sessionNotes, '');
      const fresh = await save({ plan: 501, entries: [entry(1002, 'Otra sesión: equipo rojo')] });
      assert.equal(fresh.entries[0].sessionNotes, 'Otra sesión: equipo rojo');
      assert.equal((await read()).entries[0].sessionNotes, 'Negro: tandas de 3 minutos.');
      await db.exec('reset role'); assert.deepEqual((await db.query('select * from public.exercises')).rows, library);
    });
    await t.test('duplicating retains notes independently, and saved historical blocks remain editable after library archive', async () => {
      await user(2); const original = await read(); const copied = await copy(original.revision, 600);
      assert.notEqual(copied.entries[0].id, original.entries[0].id); assert.equal(copied.entries[0].sessionNotes, original.entries[0].sessionNotes);
      await save({ plan: 600, revision: 1, entries: copied.entries.map(e => ({ ...e, sessionNotes: 'Notas solo para la copia' })) });
      assert.deepEqual(await read(), original);
      await db.exec(`reset role;update public.exercises set archived_at=now(),description='Desarrollo nuevo',revision=2 where id='${id(100)}'`);
      await user(2); const saved = await save({ revision: original.revision, entries: original.entries.map(e => ({ ...e, sessionNotes: e.sessionNotes || 'Añadida tras archivar' })) });
      assert.equal(saved.entries[1].sessionNotes, 'Añadida tras archivar'); assert.equal(saved.entries[1].description, 'Desarrollo compartido');
      await db.exec('reset role'); await db.exec(migration); await user(2); assert.deepEqual(await read(), saved);
    });
    await t.test('bad note types and lengths fail atomically; limits, empty notes and new-block resets work', async () => {
      await user(2); const before = await read();
      for (const sessionNotes of [null, 7, {}, [], 'x'.repeat(2001)]) await assert.rejects(save({ revision: before.revision, entries: [entry(1001, sessionNotes)] }), /notas/);
      assert.deepEqual(await read(), before);
      const saved = await save({ revision: before.revision, entries: [entry(1001, 'x'.repeat(2000))] }); assert.equal(saved.entries[0].sessionNotes.length, 2000);
      await assert.rejects(save({ revision: saved.revision, entries: [entry(1003, 'Nueva nota')] }), /no está disponible/);
    });
    await t.test('team isolation, archived teams, direct writes and read-only MCP permissions remain enforced', async () => {
      for (const n of [3, 4, 5]) { await user(n); await assert.rejects(save(), /Equipo no autorizado/); }
      await user(3); await assert.rejects(save({ team: 20, revision: 1 }), /Entrenamiento no autorizado/);
      await user(2); await assert.rejects(db.exec("update public.training_plans set notes='Bypass'"), /permission denied/);
      await db.exec(`reset role;update public.teams set archived_at=now() where id='${id(10)}'`);
      await user(1); const existing = await read(); await assert.rejects(save({ revision: existing.revision, entries: existing.entries }), /archivado/);
      for (const role of ['anon', 'club_mcp_reader']) {
        await user(1, role); await assert.rejects(save(), /permission denied/); await assert.rejects(save({ legacy: true }), /permission denied/);
      }
    });
  } finally { await db.close(); }
});
