import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
test('PostgreSQL schema enforces club permissions and preserves history', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;`);
    await db.exec(readFileSync(new URL('../supabase/migrations/202611050001_club.sql', import.meta.url), 'utf8'));
    const clearAttendance = readFileSync(new URL('../supabase/migrations/202611090003_clear_attendance.sql', import.meta.url), 'utf8');
    await db.exec(clearAttendance);
    await db.exec(`insert into auth.users values ('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}'),('${id(5)}');
      insert into public.club_members values ('${id(1)}','admin',true),('${id(2)}','coach',true),('${id(3)}','coach',true),('${id(4)}','coach',false);
      insert into public.teams values ('${id(10)}','Equipo A'),('${id(20)}','Equipo B');
      insert into public.team_coaches values ('${id(10)}','${id(2)}'),('${id(20)}','${id(3)}'),('${id(10)}','${id(4)}');
      insert into public.players(id,team_id,name,number) values ('${id(100)}','${id(10)}','Jugador A',7),('${id(200)}','${id(20)}','Jugador B',7);
      insert into public.attendance values ('${id(10)}','${id(100)}','2026-11-05','present');`);
    await db.exec(clearAttendance); // Reapplying must preserve populated data and permissions.
    async function asUser(user) {
      await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id(user)}',false)`);
    }
    await t.test('coach sees only assigned teams, players and attendance', async () => {
      await asUser(2);
      assert.deepEqual((await db.query('select name from public.teams')).rows, [{ name: 'Equipo A' }]);
      assert.deepEqual((await db.query('select name from public.players')).rows, [{ name: 'Jugador A' }]);
      assert.equal((await db.query('select * from public.attendance')).rows.length, 1);
      await asUser(3);
      assert.equal((await db.query('select * from public.attendance')).rows.length, 0);
    });
    await t.test('coach cannot insert into another team or promote themselves', async () => {
      await asUser(2);
      await assert.rejects(db.exec(`insert into public.players(team_id,name,number) values ('${id(20)}','Intruso',9)`), /row-level security/);
      await assert.rejects(db.exec("update public.club_members set role='admin'"), /permission denied/);
      await assert.rejects(db.exec(`update public.players set team_id='${id(20)}' where id='${id(100)}'`), /permission denied/);
      assert.equal((await db.query(`update public.players set name='Intruso' where id='${id(200)}' returning id`)).rows.length, 0);
    });
    await t.test('duplicate active dorsal is rejected and edits keep history identifiers', async () => {
      await asUser(2);
      await assert.rejects(db.exec(`insert into public.players(team_id,name,number) values ('${id(10)}','Duplicado',7)`), /unique constraint/);
      await db.exec(`update public.players set name='Nombre corregido',number=8 where id='${id(100)}'`);
      assert.equal((await db.query('select status from public.attendance')).rows[0].status, 'present');
      await assert.rejects(db.exec(`update public.attendance set player_id='${id(200)}'`), /permission denied/);
    });
    await t.test('archiving preserves history, blocks new attendance, and can be undone', async () => {
      await asUser(2);
      await db.exec(`update public.players set archived_at=now() where id='${id(100)}'`);
      assert.equal((await db.query('select * from public.attendance')).rows.length, 1);
      await assert.rejects(db.exec(`insert into public.attendance values ('${id(10)}','${id(100)}','2026-11-06','present')`), /row-level security/);
      await assert.rejects(db.exec(`delete from public.players where id='${id(100)}'`), /permission denied/);
      await db.exec(`insert into public.players(id,team_id,name,number) values ('${id(101)}','${id(10)}','Sustituto',8)`);
      await assert.rejects(db.exec(`update public.players set archived_at=null where id='${id(100)}'`), /unique constraint/);
      await db.exec(`update public.players set archived_at=now() where id='${id(101)}'`);
      await db.exec(`update public.players set archived_at=null where id='${id(100)}'`);
      await db.exec(`insert into public.attendance values ('${id(10)}','${id(100)}','2026-11-06','absent')`);
      await db.exec(`update public.attendance set status='excused' where training_date='2026-11-06'`);
    });
    await t.test('admin sees all teams while disabled and non-members see none', async () => {
      await asUser(1);
      assert.equal((await db.query('select * from public.teams')).rows.length, 2);
      for (const user of [4, 5]) {
        await asUser(user);
        assert.equal((await db.query('select * from public.players')).rows.length, 0);
        assert.equal((await db.query('select * from public.attendance')).rows.length, 0);
      }
    });
    await t.test('clearing a mark affects only its player and date and respects team access', async () => {
      await db.exec(`reset role;
        insert into public.players(id,team_id,name,number) values ('${id(102)}','${id(10)}','Otro jugador',9);
        insert into public.attendance values ('${id(10)}','${id(102)}','2026-11-06','present'),('${id(20)}','${id(200)}','2026-11-05','absent');`);
      for (const user of [3, 4, 5]) {
        await asUser(user);
        assert.equal((await db.query(`delete from public.attendance where player_id='${id(100)}' returning player_id`)).rows.length, 0);
      }
      await asUser(2);
      assert.equal((await db.query(`delete from public.attendance where player_id='${id(200)}' returning player_id`)).rows.length, 0);
      assert.equal((await db.query(`delete from public.attendance where team_id='${id(10)}' and player_id='${id(100)}' and training_date='2026-11-06' returning player_id`)).rows.length, 1);
      assert.deepEqual((await db.query('select player_id,training_date::text,status from public.attendance order by training_date')).rows, [
        { player_id: id(100), training_date: '2026-11-05', status: 'present' },
        { player_id: id(102), training_date: '2026-11-06', status: 'present' },
      ]);
      await db.exec(`update public.players set archived_at=now() where id='${id(100)}'`);
      assert.equal((await db.query(`delete from public.attendance where player_id='${id(100)}' returning player_id`)).rows.length, 0);
      await asUser(1);
      assert.equal((await db.query(`delete from public.attendance where player_id='${id(200)}' returning player_id`)).rows.length, 1);
      await assert.rejects(db.exec(`delete from public.players where id='${id(102)}'`), /permission denied/);
    });
    await t.test('anonymous users cannot read rosters or call permission helpers', async () => {
      await db.exec('reset role; set role anon;');
      await assert.rejects(db.query('select * from public.players'), /permission denied/);
      await assert.rejects(db.query('delete from public.attendance'), /permission denied/);
      await assert.rejects(db.query(`select public.can_access_team('${id(10)}')`), /permission denied/);
    });
  } finally { await db.close(); }
});
