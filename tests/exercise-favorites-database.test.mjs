import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const migration = readFileSync(new URL('../supabase/migrations/202611110002_exercise_favorites.sql', import.meta.url), 'utf8');
test('favorites are personal to each active account, including administrators; retries and migrations preserve club data', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon;
      alter default privileges in schema public grant execute on functions to anon,authenticated;`);
    for (const file of ['202611050001_club.sql', '202611100001_exercises.sql', '202611100002_training_plans.sql']) {
      await db.exec(readFileSync(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
    }
    await db.exec(`insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}'),('${id(5)}');
      insert into public.club_members values('${id(1)}','admin',true),('${id(2)}','coach',true),('${id(3)}','coach',true),('${id(4)}','coach',false);
      insert into public.teams values('${id(10)}','Equipo A'),('${id(20)}','Equipo B');
      insert into public.team_coaches values('${id(10)}','${id(2)}'),('${id(20)}','${id(3)}');`);
    async function user(n) { await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id(n)}',false);`); }
    async function favorite(exercise = 100, value = true) {
      return (await db.query('select public.set_exercise_favorite($1::uuid,$2::boolean) as favorite', [exercise === null ? null : id(exercise), value])).rows[0].favorite;
    }
    const ownIds = async () => (await db.query('select exercise_id from public.exercise_favorites order by exercise_id')).rows.map(row => row.exercise_id);
    await user(2);
    await db.query(`select public.save_exercise($1::uuid,0,'Rondo','Pase y control',array['Posesión'],12,6,8,15,20,'[]'::jsonb,false)`, [id(100)]);
    await db.query('select public.save_training_plan($1::uuid,$2::uuid,0,$3::date,$4,8,$5,$6::jsonb,false)', [id(10), id(500), '2026-11-11', 'Entrenamiento', '', JSON.stringify([{ id: id(1000), exerciseId: id(100), exerciseRevision: 1, duration: 12 }])]);
    const exerciseBefore = (await db.query('select * from public.exercises')).rows;
    const trainingBefore = (await db.query('select * from public.training_plans')).rows;
    await db.exec('reset role'); await db.exec(migration);
    await t.test('coaches can favorite another author’s exercise and keep independent lists across teams', async () => {
      await user(3); assert.deepEqual(await ownIds(), []); assert.equal(await favorite(), true);
      assert.deepEqual(await ownIds(), [id(100)]);
      await user(2); assert.deepEqual(await ownIds(), []); assert.equal(await favorite(), true);
      assert.deepEqual(await ownIds(), [id(100)]);
      assert.equal(await favorite(100, false), false); assert.deepEqual(await ownIds(), []);
      await user(3); assert.deepEqual(await ownIds(), [id(100)]);
    });
    await t.test('even active admins only read and modify their own favorites; forged direct writes are denied', async () => {
      await user(1); assert.deepEqual(await ownIds(), []); await favorite();
      assert.equal((await db.query('select user_id from public.exercise_favorites')).rows[0].user_id, id(1));
      assert.equal((await db.query('select * from public.exercise_favorites where user_id=$1', [id(3)])).rows.length, 0);
      for (const sql of [
        `insert into public.exercise_favorites(user_id,exercise_id) values('${id(2)}','${id(100)}')`,
        `update public.exercise_favorites set user_id='${id(3)}'`,
        `delete from public.exercise_favorites where user_id='${id(3)}'`,
      ]) await assert.rejects(db.exec(sql), /permission denied/);
      await favorite(100, false); await user(3); assert.deepEqual(await ownIds(), [id(100)]);
    });
    await t.test('explicit add/remove requests are idempotent and invalid or missing exercises fail atomically', async () => {
      await user(2); await favorite(); await favorite(); assert.deepEqual(await ownIds(), [id(100)]);
      await favorite(100, false); await favorite(100, false); assert.deepEqual(await ownIds(), []);
      assert.equal(await favorite(999, false), false);
      await assert.rejects(favorite(999), /ya no está disponible/);
      await assert.rejects(favorite(null), /inválido/); await assert.rejects(favorite(100, null), /inválido/);
      assert.deepEqual(await ownIds(), []);
    });
    await t.test('disabled accounts, nonmembers and anonymous callers cannot read or mutate favorites', async () => {
      await db.exec(`reset role; update public.club_members set enabled=false where user_id='${id(3)}'`);
      for (const n of [3, 4, 5]) {
        await user(n); assert.deepEqual(await ownIds(), []);
        await assert.rejects(favorite(), /Acceso al club/); await assert.rejects(favorite(100, false), /Acceso al club/);
      }
      await db.exec('reset role; set role anon'); await assert.rejects(ownIds(), /permission denied/); await assert.rejects(favorite(), /permission denied/);
      await db.exec(`reset role; update public.club_members set enabled=true where user_id='${id(3)}'`);
      await user(3); assert.deepEqual(await ownIds(), [id(100)]);
    });
    await t.test('migration can be repeated; favorites preserve exercise revisions, existing plans, and archive/restore behavior', async () => {
      await user(2); assert.deepEqual((await db.query('select * from public.exercises')).rows, exerciseBefore);
      assert.deepEqual((await db.query('select * from public.training_plans')).rows, trainingBefore);
      await db.exec('reset role'); await db.exec(migration); await user(3); assert.deepEqual(await ownIds(), [id(100)]);
      await db.exec(`reset role; update public.exercises set archived_at=now() where id='${id(100)}'`);
      await user(3); assert.deepEqual(await ownIds(), [id(100)]);
      await db.exec(`reset role; update public.exercises set archived_at=null where id='${id(100)}'`);
      await user(3); assert.deepEqual(await ownIds(), [id(100)]);
    });
    await t.test('removing an account or exercise cleans its references without changing historical training snapshots', async () => {
      await user(2); await favorite(); await db.exec(`reset role; delete from auth.users where id='${id(3)}'`);
      assert.deepEqual((await db.query('select user_id from public.exercise_favorites')).rows, [{ user_id: id(2) }]);
      await db.exec(`delete from public.exercises where id='${id(100)}'`);
      assert.deepEqual((await db.query('select * from public.exercise_favorites')).rows, []);
      assert.deepEqual((await db.query('select * from public.training_plans')).rows, trainingBefore);
    });
  } finally { await db.close(); }
});
