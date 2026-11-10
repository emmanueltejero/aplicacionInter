import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const entry = (n = 1000, exercise = 100, duration = 12, revision = 1) => ({ id: id(n), exerciseId: id(exercise), exerciseRevision: revision, duration });
test('team training plans authorize atomic saves and preserve exercise snapshots', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      alter default privileges in schema public grant execute on functions to anon, authenticated;`);
    for (const file of ['202611050001_club.sql', '202611090002_matches.sql', '202611090003_clear_attendance.sql', '202611100001_exercises.sql', '202611100002_training_plans.sql', '202611100003_copy_training_plans.sql']) {
      await db.exec(readFileSync(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
    }
    await db.exec(`insert into auth.users values ('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}'),('${id(5)}'),('${id(6)}');
      insert into public.club_members values ('${id(1)}','admin',true),('${id(2)}','coach',true),('${id(3)}','coach',true),('${id(4)}','coach',false),('${id(6)}','coach',true);
      insert into public.teams values ('${id(10)}','A'),('${id(20)}','B');
      insert into public.team_coaches values ('${id(10)}','${id(2)}'),('${id(20)}','${id(3)}'),('${id(10)}','${id(4)}'),('${id(10)}','${id(6)}');
      insert into public.exercises(id,created_by,title,description,categories,duration,min_players,max_players,space_length,space_width,materials)
      values ('${id(100)}','${id(3)}','Rondo','Conservar el balón',array['Posesión'],12,6,12,15,20,'[{"name":"Conos","quantity":4}]'),
      ('${id(200)}','${id(2)}','Finalización','Remate',array['Finalización'],18,8,16,30,20,'[{"name":"Conos","quantity":8}]');`);
    async function user(n) { await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id(n)}',false)`); }
    async function save({ plan = 500, team = 10, revision = 0, date = '2026-11-10', title = 'Plan diario', players = 10, notes = '', entries = [entry(), entry(2000, 200, 18)], archived = false } = {}) {
      const result = await db.query('select public.save_training_plan($1::uuid,$2::uuid,$3::integer,$4::date,$5,$6::integer,$7,$8::jsonb,$9::boolean) as plan',
        [id(team), id(plan), revision, date, title, players, notes, JSON.stringify(entries), archived]);
      return result.rows[0].plan;
    }
    async function copy({ team = 10, source = 500, revision = 6, target = 700, date = '2026-11-17', title = 'Plan duplicado' } = {}) {
      const result = await db.query('select public.copy_training_plan($1::uuid,$2::uuid,$3::integer,$4::uuid,$5::date,$6) as plan', [id(team), id(source), revision, id(target), date, title]);
      return result.rows[0].plan;
    }
    await t.test('server snapshots shared exercises, ignores forged content and retries one stable plan ID', async () => {
      await user(2);
      const result = await save({ entries: [{ ...entry(), title: 'Falsificado', materials: [] }, entry(2000, 200, 18)] });
      assert.equal(result.created_by, id(2)); assert.equal(result.revision, 1);
      assert.equal(result.entries[0].title, 'Rondo');
      assert.deepEqual(result.entries[0].materials, [{ name: 'Conos', quantity: 4 }]);
      assert.equal((await save()).revision, 1);
      assert.equal((await db.query('select * from public.training_plans')).rows.length, 1);
      await db.exec('reset role');
      await db.exec(readFileSync(new URL('../supabase/migrations/202611100002_training_plans.sql', import.meta.url), 'utf8'));
      await user(2); assert.equal((await db.query('select * from public.training_plans')).rows.length, 1);
    });
    await t.test('other teams cannot read, edit or steal plan IDs; direct writes are refused', async () => {
      await user(3); assert.equal((await db.query('select * from public.training_plans')).rows.length, 0);
      await assert.rejects(save({ revision: 1 }), /Equipo no autorizado/);
      await assert.rejects(save({ team: 20, revision: 1 }), /Entrenamiento no autorizado/);
      await save({ plan: 600, team: 20 });
      await user(2); assert.equal((await db.query('select * from public.training_plans')).rows.length, 1);
      await assert.rejects(db.exec('update public.training_plans set title=\'Bypass\''), /permission denied/);
      await assert.rejects(db.exec('delete from public.training_plans'), /permission denied/);
      await assert.rejects(db.exec(`insert into public.training_plans(id,team_id) values ('${id(900)}','${id(10)}')`), /permission denied/);
    });
    await t.test('a second assigned coach can reorder, repeat and change durations without overwriting newer plans', async () => {
      await user(6);
      const result = await save({ revision: 1, entries: [entry(2000, 200, 20), entry(1000, 100, 10), entry(3000, 100, 5)] });
      assert.equal(result.created_by, id(2)); assert.equal(result.revision, 2);
      assert.deepEqual(result.entries.map(item => item.duration), [20, 10, 5]);
      assert.equal((await save({ revision: 1, entries: [entry(2000, 200, 20), entry(1000, 100, 10), entry(3000, 100, 5)] })).revision, 2);
      await assert.rejects(save({ revision: 1, title: 'Edición antigua' }), /ha cambiado/);
    });
    await t.test('library changes and archives cannot rewrite saved snapshots or add archived sources', async () => {
      await db.exec(`reset role; update public.exercises set title='Nombre cambiado',materials='[{"name":"Conos","quantity":99}]',revision=2,archived_at=now() where id='${id(100)}'`);
      await user(2);
      const result = await save({ revision: 2, entries: [entry(1000, 100, 15), entry(2000, 200, 20)] });
      assert.equal(result.entries[0].title, 'Rondo'); assert.equal(result.entries[0].materials[0].quantity, 4);
      await assert.rejects(save({ revision: 3, entries: [entry(4000, 100, 10, 2)] }), /no está disponible/);
      await db.exec(`reset role; update public.exercises set archived_at=null where id='${id(100)}'`);
      await user(2);
      await assert.rejects(save({ revision: 3, entries: [entry(4000, 100)] }), /ha cambiado/);
      await assert.rejects(save({ revision: 3, entries: [entry(1000, 200)] }), /cambiar el origen/);
    });
    await t.test('invalid entries, duplicates, ranges and excessive durations fail atomically', async () => {
      await user(2);
      for (const patch of [{ date: '2026-02-30' }, { date: 'infinity' }, { date: '0001-01-01 BC' }, { date: '10000-01-01' }, { title: '' }, { players: 0 }, { players: 101 }, { notes: 'x'.repeat(3001) }, { entries: [] }, { entries: {} }, { entries: [entry(1000, 100), entry(1000, 100)] }, { entries: [entry(2000, 200, 0)] }, { entries: [entry(2000, 200, 241)] }, { entries: [entry(2000, 200, '12')] }, { entries: [entry(2000, 999)] }, { entries: [entry(5000, 200, 240), entry(5001, 200, 240), entry(5002, 200, 240)] }]) await assert.rejects(save({ revision: 3, ...patch }));
      assert.equal((await db.query(`select revision from public.training_plans where id='${id(500)}'`)).rows[0].revision, 3);
    });
    await t.test('admin can archive/restore plans while preserving snapshots and author', async () => {
      await user(1);
      const archived = await save({ revision: 3, archived: true });
      assert.ok(archived.archived_at); assert.equal(archived.created_by, id(2));
      const restored = await save({ revision: 4 });
      assert.equal(restored.archived_at, null); assert.equal(restored.entries[0].title, 'Rondo');
      assert.equal((await db.query('select * from public.training_plans')).rows.length, 2);
    });
    await t.test('copy retains archived historical snapshots, creates new blocks and retries after the source changes', async () => {
      await user(2);
      const original = await save({ revision: 5, archived: true, notes: 'Notas originales' });
      const duplicated = await copy();
      assert.equal(duplicated.archived_at, null); assert.equal(duplicated.revision, 1); assert.equal(duplicated.created_by, id(2));
      assert.equal(duplicated.notes, 'Notas originales'); assert.equal(duplicated.copied_from, id(500)); assert.equal(duplicated.training_date, '2026-11-17');
      assert.notEqual(duplicated.entries[0].id, original.entries[0].id);
      assert.deepEqual(duplicated.entries.map(({ id, ...rest }) => rest), original.entries.map(({ id, ...rest }) => rest));
      assert.equal(duplicated.entries[0].title, 'Rondo'); assert.equal(duplicated.entries[0].materials[0].quantity, 4);
      await save({ revision: 6, title: 'Origen cambiado', notes: 'Notas nuevas' });
      assert.equal((await copy()).id, duplicated.id);
      assert.equal((await copy()).notes, 'Notas originales');
      await db.exec('reset role'); await db.exec(readFileSync(new URL('../supabase/migrations/202611100003_copy_training_plans.sql', import.meta.url), 'utf8'));
      await user(2); assert.equal((await copy()).id, duplicated.id);
    });
    await t.test('copies cannot cross team boundaries or overwrite edited targets; admin copies keep their own author', async () => {
      await user(3);
      await assert.rejects(copy(), /Equipo no autorizado/);
      await assert.rejects(copy({ team: 20, target: 701 }), /original no autorizado/);
      await user(2);
      await assert.rejects(copy({ source: 600, target: 701 }), /original no autorizado/);
      await assert.rejects(copy({ target: 701, revision: 6 }), /ha cambiado/);
      const copiedEntries = (await db.query(`select entries from public.training_plans where id='${id(700)}'`)).rows[0].entries;
      await save({ plan: 700, revision: 1, title: 'Copia editada', entries: copiedEntries.map(({ id, exerciseId, exerciseRevision, duration }) => ({ id, exerciseId, exerciseRevision, duration })) });
      await assert.rejects(copy(), /ha cambiado/);
      for (const patch of [{ target: 500 }, { date: 'infinity' }, { title: '' }, { revision: 0 }]) await assert.rejects(copy({ target: 701, revision: 7, ...patch }));
      await user(1);
      const result = await copy({ target: 702, revision: 7 });
      assert.equal(result.created_by, id(1)); assert.equal(result.entries[0].title, 'Rondo');
      assert.equal((await db.query('select * from public.training_plans')).rows.length, 4);
    });
    await t.test('disabled/non-members and anonymous accounts have no access', async () => {
      for (const n of [4, 5]) {
        await user(n); assert.equal((await db.query('select * from public.training_plans')).rows.length, 0);
        await assert.rejects(save(), /Equipo no autorizado/);
        await assert.rejects(copy(), /Equipo no autorizado/);
      }
      await db.exec('reset role; set role anon');
      await assert.rejects(db.query('select * from public.training_plans'), /permission denied/);
      await assert.rejects(save(), /permission denied/);
      await assert.rejects(copy(), /permission denied/);
    });
  } finally { await db.close(); }
});
