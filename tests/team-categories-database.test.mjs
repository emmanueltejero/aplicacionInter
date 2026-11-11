import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const migration = readFileSync(new URL('../supabase/migrations/202611110003_team_categories.sql', import.meta.url), 'utf8');
test('explicit team categories keep assignments and history intact, with admin-only writes and safe retries', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}'::jsonb,raw_user_meta_data jsonb default '{}'::jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon;
      alter default privileges in schema public grant execute on functions to anon,authenticated;`);
    for (const file of ['202611050001_club.sql', '202611100001_exercises.sql', '202611100002_training_plans.sql', '202611100004_web_users.sql', '202611110002_exercise_favorites.sql']) await db.exec(readFileSync(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
    await db.exec(`insert into auth.users(id) values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}'),('${id(5)}');
      insert into public.club_members values('${id(1)}','admin',true),('${id(2)}','coach',true),('${id(3)}','admin',false),('${id(5)}','coach',true);
      insert into public.teams values('${id(10)}','Alevín B'),('${id(20)}','Cadete A');
      insert into public.team_coaches values('${id(10)}','${id(2)}'),('${id(20)}','${id(5)}');
      insert into public.players(id,team_id,name,number) values('${id(50)}','${id(10)}','Jugador',7);
      insert into public.attendance values('${id(10)}','${id(50)}','2026-11-11','present');`);
    async function user(n) { await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id(n)}',false)`); }
    const create = (n, name, category) => db.query('select public.admin_create_team_with_category($1::uuid,$2,$3) as team', [id(n), name, category]).then(r => r.rows[0].team);
    const set = (n, category, expected) => db.query('select public.admin_set_team_category($1::uuid,$2,$3) as team', [id(n), category, expected]).then(r => r.rows[0].team);
    await user(2); await db.query(`select public.save_exercise($1::uuid,0,'Rondo','Pase y control',array['Posesión'],12,6,8,15,20,'[]'::jsonb,false)`, [id(100)]);
    await db.query('select public.save_training_plan($1::uuid,$2::uuid,0,$3::date,$4,8,$5,$6::jsonb,false)', [id(10), id(500), '2026-11-11', 'Sesión', '', JSON.stringify([{ id: id(1000), exerciseId: id(100), exerciseRevision: 1, duration: 12 }])]);
    await db.query('select public.set_exercise_favorite($1::uuid,true)', [id(100)]); await db.exec('reset role');
    const tables = ['team_coaches', 'players', 'attendance', 'exercises', 'training_plans', 'exercise_favorites'];
    const history = await Promise.all(tables.map(table => db.query('select * from public.' + table).then(r => r.rows)));
    await db.exec(migration);
    await t.test('existing teams start unassigned without guessing from names; admins assign and clear validated categories', async () => {
      await user(1); assert.deepEqual((await db.query('select category from public.teams')).rows, [{ category: null }, { category: null }]);
      const saved = await set(10, 'Alevín', null); assert.equal(saved.name, 'Alevín B'); assert.equal(saved.category, 'Alevín');
      assert.deepEqual(await set(10, 'Alevín', null), saved);
      await assert.rejects(set(10, 'Cadete', null), /ha cambiado/);
      assert.equal((await set(10, null, 'Alevín')).category, null);
      assert.equal((await set(10, 'Alevín', null)).category, 'Alevín');
      await set(20, 'Cadete', null);
      for (const category of ['', 'Alevin', 'Cadete A', 'Otra']) await assert.rejects(set(10, category, 'Alevín'), /inválid/);
      await assert.rejects(set(999, 'Cadete', null), /no está disponible/);
    });
    await t.test('new categorized teams are atomic and retry-safe; old API remains usable without clearing category', async () => {
      await user(1); const saved = await create(30, '  Infantil   A ', 'Infantil'); assert.equal(saved.name, 'Infantil A');
      assert.deepEqual(await create(30, 'Infantil A', 'Infantil'), saved);
      await assert.rejects(create(31, 'infantil a', null), /Ya existe/);
      await assert.rejects(create(30, 'Infantil A', 'Cadete'), /otros datos/);
      await assert.rejects(create(31, 'Inválido', 'Otra'), /inválida/);
      assert.equal((await db.query('select * from public.teams where id=$1', [id(31)])).rows.length, 0);
      await set(30, 'Cadete', 'Infantil'); await assert.rejects(create(30, 'Infantil A', 'Infantil'), /otros datos/);
      const old = (await db.query('select public.admin_create_team($1::uuid,$2) as team', [id(30), 'Infantil A'])).rows[0].team; assert.equal(old.category, 'Cadete');
      const unassigned = (await db.query('select public.admin_create_team($1::uuid,$2) as team', [id(40), 'Regional'])).rows[0].team; assert.equal(unassigned.category, null);
      assert.equal((await create(41, 'Otro equipo', null)).category, null);
    });
    await t.test('coaches read only assigned teams and cannot change categories; inactive/nonmembers/anonymous remain denied', async () => {
      await user(2); assert.deepEqual((await db.query('select id,category from public.teams')).rows, [{ id: id(10), category: 'Alevín' }]);
      for (const n of [2, 3, 4, 5]) {
        await user(n); await assert.rejects(set(10, 'Cadete', 'Alevín'), /Solo administradores/); await assert.rejects(create(90, 'No autorizado', 'Cadete'), /Solo administradores/);
        await assert.rejects(db.exec("update public.teams set category='Cadete'"), /permission denied/);
      }
      await user(3); assert.deepEqual((await db.query('select * from public.teams')).rows, []);
      await db.exec('reset role; set role anon'); await assert.rejects(set(10, 'Cadete', 'Alevín'), /permission denied/); await assert.rejects(create(90, 'Anon', null), /permission denied/);
    });
    await t.test('repeat migration retains chosen values; all existing records, favorite lists, assignments and training snapshots are unchanged', async () => {
      await db.exec('reset role'); await db.exec(migration);
      assert.equal((await db.query('select category from public.teams where id=$1', [id(10)])).rows[0].category, 'Alevín');
      for (const [index, table] of tables.entries()) assert.deepEqual((await db.query('select * from public.' + table)).rows, history[index]);
      await assert.rejects(db.exec("update public.teams set category='Desconocida'"), /check constraint/);
    });
  } finally { await db.close(); }
});
