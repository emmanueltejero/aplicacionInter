import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const migration = readFileSync(new URL('../supabase/migrations/202611110004_exercise_reviews.sql', import.meta.url), 'utf8');
test('methodological reviews require explicit authority, bind to content, survive safe retries and preserve club history', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon; alter default privileges in schema public grant execute on functions to anon,authenticated;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));
      alter table storage.objects enable row level security; grant usage on schema storage to authenticated,anon; grant select,insert on storage.objects to authenticated;`);
    for (const file of ['202611050001_club.sql', '202611100001_exercises.sql', '202611100002_training_plans.sql', '202611100003_copy_training_plans.sql', '202611100006_exercise_team_categories.sql', '202611110001_exercise_media.sql', '202611110002_exercise_favorites.sql']) await db.exec(readFileSync(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
    await db.exec(`insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}'),('${id(5)}'),('${id(6)}');
      insert into public.club_members values('${id(1)}','admin',true),('${id(2)}','coach',true),('${id(3)}','coach',true),('${id(4)}','coach',false),('${id(6)}','admin',false);
      insert into public.teams values('${id(10)}','Alevín B'); insert into public.team_coaches values('${id(10)}','${id(2)}');`);
    async function user(n) { await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',false)`); }
    const revision = async () => (await db.query('select revision from public.exercises where id=$1', [id(100)])).rows[0].revision;
    const review = async (value, stamp = null, version = null) => (await db.query('select public.set_exercise_review($1::uuid,$2::integer,$3::boolean,$4::timestamptz) as review', [id(100), version ?? await revision(), value, stamp])).rows[0].review;
    const permit = async (n, allowed, expected) => (await db.query('select public.admin_set_exercise_reviewer($1::uuid,$2::boolean,$3::boolean) as member', [id(n), allowed, expected])).rows[0].member;
    async function save({ title = 'Rondo', archived = false, legacy = false, video = null, teamCategories = ['Alevín'], version } = {}) {
      const args = [id(100), version ?? await revision(), title, 'Pase y control', ['Posesión'], 12, 6, 12, 15, 20, '[]', archived];
      if (!legacy) args.push(teamCategories, null, video);
      return (await db.query(`select public.${legacy ? 'save_exercise' : 'save_exercise_with_media'}($1::uuid,$2::integer,$3,$4,$5::text[],$6::integer,$7::integer,$8::integer,$9::integer,$10::integer,$11::jsonb,$12::boolean${legacy ? '' : ',$13::text[],$14::text,$15::text'}) as exercise`, args)).rows[0].exercise;
    }
    await user(2); await save({ version: 0 });
    await db.query('select public.save_training_plan($1::uuid,$2::uuid,0,$3::date,$4,8,$5,$6::jsonb,false)', [id(10), id(500), '2026-11-11', 'Sesión', '', JSON.stringify([{ id: id(1000), exerciseId: id(100), exerciseRevision: 1, duration: 12 }])]);
    await db.query('select public.set_exercise_favorite($1::uuid,true)', [id(100)]);
    await db.exec('reset role'); const history = (await db.query('select * from public.training_plans')).rows, favorites = (await db.query('select * from public.exercise_favorites')).rows;
    await db.exec(migration);
    let stamp;
    await t.test('no automatic marks; authors cannot self-approve unless explicitly authorized; only admins delegate', async () => {
      await user(2); assert.deepEqual((await db.query('select * from public.exercise_reviews')).rows, []); await assert.rejects(review(true), /revisores autorizados/);
      await assert.rejects(permit(2, true, false), /Solo administradores/);
      await assert.rejects(db.exec('update public.club_members set can_review_exercises=true'), /permission denied/);
      await user(1); const permission = await permit(3, true, false); assert.equal(permission.can_review_exercises, true); assert.deepEqual(await permit(3, true, false), permission);
      await assert.rejects(permit(1, true, false), /ya no está disponible/); await assert.rejects(permit(5, true, false), /ya no está disponible/);
      await user(3); assert.equal((await db.query('select public.can_review_exercises() as allowed')).rows[0].allowed, true);
      const saved = await review(true); stamp = saved.reviewed_at; assert.equal(saved.reviewed_by, id(3)); assert.equal(saved.exercise_revision, 1);
      assert.deepEqual(await review(true), saved);
      await assert.rejects(save({ title: 'Intento de edición' }), /Solo el autor/);
      await assert.rejects(permit(2, true, false), /Solo administradores/);
      await assert.rejects(db.exec("update public.exercise_reviews set reviewed_by='" + id(3) + "'"), /permission denied/);
    });
    await t.test('active members can see the mark; disabled accounts, nonmembers and anonymous callers cannot read or review', async () => {
      await user(2); assert.equal((await db.query('select * from public.exercise_reviews')).rows.length, 1);
      for (const n of [4, 5, 6]) { await user(n); assert.deepEqual((await db.query('select * from public.exercise_reviews')).rows, []); await assert.rejects(review(true, null, 1), /revisores autorizados/); }
      await db.exec('reset role;set role anon'); await assert.rejects(db.query('select * from public.exercise_reviews'), /permission denied/); await assert.rejects(review(true, null, 1), /permission denied/);
    });
    await t.test('removal and lost-response retries preserve dates, reject stale approval/removal and leave exercise revisions unchanged', async () => {
      await user(1); const original = await review(true); assert.equal(original.reviewed_at, stamp); assert.equal(original.reviewed_by, id(3));
      await assert.rejects(review(false, null), /revisión ha cambiado/); assert.equal(await review(false, stamp), null); assert.equal(await review(false, stamp), null);
      const fresh = await review(true); assert.equal(fresh.reviewed_by, id(1)); await assert.rejects(review(false, stamp), /revisión ha cambiado/);
      assert.equal(await revision(), 1); await assert.rejects(review(true, null, 999), /ejercicio ha cambiado/);
    });
    await t.test('identical saves, archive and restore preserve date and authority; real content changes through new and legacy APIs remove marks', async () => {
      await user(1); const before = await review(true); await user(2); await save(); await save({ archived: true }); await save();
      const preserved = (await db.query('select to_jsonb(r) as review from public.exercise_reviews r')).rows[0].review;
      assert.equal(preserved.reviewed_at, before.reviewed_at); assert.equal(preserved.reviewed_by, id(1)); assert.equal(preserved.exercise_revision, await revision());
      await save({ title: 'Rondo editado', legacy: true }); assert.equal((await db.query('select * from public.exercise_reviews')).rows.length, 0);
      await user(3); await review(true); await user(2); await save({ video: 'https://youtu.be/demo' }); assert.equal((await db.query('select * from public.exercise_reviews')).rows.length, 0);
      await user(3); await review(true); await user(2); await save({ video: 'https://youtu.be/demo', teamCategories: ['Cadete'] }); assert.equal((await db.query('select * from public.exercise_reviews')).rows.length, 0);
    });
    await t.test('revoking reviewer access blocks future actions without altering past endorsements or unrelated account access', async () => {
      await user(3); await review(true); await user(1); await permit(3, false, true);
      await user(3); await assert.rejects(review(false, null), /revisores autorizados/); assert.equal((await db.query('select * from public.exercise_reviews')).rows.length, 1);
      await user(1); await permit(3, true, false); await db.exec(`reset role;update public.club_members set enabled=false where user_id='${id(3)}'`);
      await user(3); await assert.rejects(review(true, null, 7), /revisores autorizados/);
      await db.exec('reset role'); const member = (await db.query('select role,enabled,can_review_exercises from public.club_members where user_id=$1', [id(3)])).rows[0]; assert.deepEqual(member, { role: 'coach', enabled: false, can_review_exercises: true });
    });
    await t.test('repeat migration retains valid reviews and grants; snapshots, favorites and copies remain independent of current endorsement', async () => {
      await db.exec('reset role'); const before = (await db.query('select * from public.exercise_reviews')).rows; await db.exec(migration);
      assert.deepEqual((await db.query('select * from public.exercise_reviews')).rows, before); assert.deepEqual((await db.query('select * from public.training_plans')).rows, history); assert.deepEqual((await db.query('select * from public.exercise_favorites')).rows, favorites);
      await user(2); await db.query('select public.copy_training_plan($1::uuid,$2::uuid,1,$3::uuid,$4::date,$5)', [id(10), id(500), id(501), '2026-11-12', 'Copia']);
      const copy = (await db.query('select entries from public.training_plans where id=$1', [id(501)])).rows[0].entries; assert.equal(copy[0].title, 'Rondo');
      await db.exec(`reset role;delete from auth.users where id='${id(3)}'`); assert.equal((await db.query('select reviewed_by from public.exercise_reviews')).rows[0].reviewed_by, null);
    });
  } finally { await db.close(); }
});
