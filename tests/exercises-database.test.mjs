import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
test('shared library preserves authors, validates content and enforces author/admin writes', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;`);
    for (const file of ['202611050001_club.sql', '202611090002_matches.sql', '202611090003_clear_attendance.sql', '202611100001_exercises.sql']) {
      if (file === '202611100001_exercises.sql') await db.exec('alter default privileges in schema public grant execute on functions to anon, authenticated');
      await db.exec(readFileSync(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
    }
    await db.exec(`insert into auth.users values ('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}'),('${id(5)}'),('${id(6)}');
      insert into public.club_members values ('${id(1)}','admin',true),('${id(2)}','coach',true),('${id(3)}','coach',true),('${id(4)}','coach',false),('${id(6)}','coach',true);
      insert into public.teams values ('${id(10)}','A'),('${id(20)}','B');
      insert into public.team_coaches values ('${id(10)}','${id(2)}'),('${id(20)}','${id(3)}');`);
    async function user(n) { await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id(n)}',false)`); }
    async function save({ exercise = 100, revision = 0, title = 'Rondo', description = 'Conservar el balón', categories = ['Técnica', 'Posesión'], duration = 12, minPlayers = 6, maxPlayers = 8, length = 15, width = 20, materials = [{ name: 'Conos', quantity: 4 }], archived = false } = {}) {
      const result = await db.query('select public.save_exercise($1::uuid,$2::integer,$3,$4,$5::text[],$6::integer,$7::integer,$8::integer,$9::integer,$10::integer,$11::jsonb,$12::boolean) as exercise',
        [id(exercise), revision, title, description, categories, duration, minPlayers, maxPlayers, length, width, JSON.stringify(materials), archived]);
      return result.rows[0].exercise;
    }
    await t.test('create attributes the authenticated author; a lost response can be retried', async () => {
      await user(2);
      const saved = await save();
      assert.equal(saved.created_by, id(2));
      assert.equal(saved.revision, 1);
      assert.deepEqual(saved.materials, [{ name: 'Conos', quantity: 4 }]);
      assert.equal((await save()).revision, 1);
      assert.equal((await db.query('select * from public.exercises')).rows.length, 1);
      await db.exec('reset role');
      await db.exec(readFileSync(new URL('../supabase/migrations/202611100001_exercises.sql', import.meta.url), 'utf8'));
      await user(2);
      assert.equal((await db.query('select * from public.exercises')).rows.length, 1);
    });
    await t.test('coaches in other teams and active members without a team share the library', async () => {
      for (const n of [3, 6]) { await user(n); assert.equal((await db.query('select * from public.exercises')).rows.length, 1); }
      await user(3);
      assert.equal((await save({ exercise: 200 })).created_by, id(3));
      await assert.rejects(save({ revision: 1, title: 'No autorizado' }), /Solo el autor/);
      await assert.rejects(save({ revision: 1, archived: true }), /Solo el autor/);
      await assert.rejects(db.exec('update public.exercises set title=\'Bypass\''), /permission denied/);
      await assert.rejects(db.exec('delete from public.exercises'), /permission denied/);
      await assert.rejects(db.exec(`insert into public.exercises(id,created_by) values ('${id(300)}','${id(2)}')`), /permission denied/);
    });
    await t.test('author edits and admin archives/restores without changing authorship', async () => {
      await user(2);
      const edited = await save({ revision: 1, duration: 15 });
      assert.equal(edited.revision, 2);
      assert.equal((await save({ revision: 1, duration: 15 })).revision, 2);
      await assert.rejects(save({ revision: 1, duration: 20 }), /ha cambiado/);
      await user(1);
      const archived = await save({ revision: 2, duration: 15, archived: true });
      assert.equal(archived.created_by, id(2));
      assert.ok(archived.archived_at);
      await user(3);
      assert.equal((await db.query('select * from public.exercises where archived_at is not null')).rows.length, 1);
      await assert.rejects(save({ revision: 3, duration: 15, archived: false }), /Solo el autor/);
      await user(1);
      const restored = await save({ revision: 3, duration: 15 });
      assert.equal(restored.archived_at, null);
      assert.equal(restored.created_by, id(2));
      assert.equal(restored.revision, 4);
    });
    await t.test('server rejects invalid ranges, categories and material without changing data', async () => {
      await user(2);
      for (const patch of [{ duration: 0 }, { duration: 241 }, { minPlayers: 9 }, { width: 151 }, { title: ' ' }, { description: '' }, { categories: [] }, { categories: ['Otra'] }, { categories: ['Técnica', 'Técnica'] }, { categories: [null] }, { materials: null }, { materials: {} }, { materials: [{ name: 'Conos', quantity: 0 }] }, { materials: [{ name: 'Conos', quantity: '2' }] }, { materials: [{ name: 'Conos', quantity: 1001 }] }, { materials: [{ name: ' ', quantity: 2 }] }, { materials: [{ name: 'Conos', quantity: 2 }, { name: 'conos', quantity: 3 }] }]) {
        await assert.rejects(save({ revision: 4, duration: 15, ...patch }));
      }
      const row = (await db.query(`select * from public.exercises where id='${id(100)}'`)).rows[0];
      assert.equal(row.revision, 4);
      assert.equal(row.duration, 15);
    });
    await t.test('deleting an author preserves the shared exercise for admin maintenance', async () => {
      await db.exec(`reset role; delete from auth.users where id='${id(3)}'`);
      await user(2);
      assert.equal((await db.query(`select created_by from public.exercises where id='${id(200)}'`)).rows[0].created_by, null);
      await assert.rejects(save({ exercise: 200, revision: 1, duration: 15 }), /Solo el autor/);
      await user(1);
      assert.equal((await save({ exercise: 200, revision: 1, duration: 15 })).created_by, null);
    });
    await t.test('disabled and non-members cannot read or write; anonymous cannot call functions', async () => {
      await db.exec(`reset role; update public.club_members set enabled=false where user_id='${id(2)}'`);
      await user(2);
      assert.equal((await db.query('select * from public.exercises')).rows.length, 0);
      await assert.rejects(save({ revision: 4, duration: 15 }), /Acceso al club no autorizado/);
      for (const n of [4, 5]) {
        await user(n);
        assert.equal((await db.query('select * from public.exercises')).rows.length, 0);
        await assert.rejects(save({ exercise: 400 }), /Acceso al club no autorizado/);
      }
      await db.exec('reset role; set role anon');
      await assert.rejects(db.query('select * from public.exercises'), /permission denied/);
      await assert.rejects(db.query('select public.is_active_club_member()'), /permission denied/);
      await assert.rejects(save(), /permission denied/);
    });
  } finally { await db.close(); }
});
