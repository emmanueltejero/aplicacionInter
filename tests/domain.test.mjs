import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, summary, parseRegister, players } from '../src/domain.ts';

test('attendance counts only current team members and keeps unmarked players pending', () => {
  assert.deepEqual(summary(players, { 'demo-1': 'present', 'demo-2': 'absent', 'demo-3': 'excused', other: 'present' }),
    { present: 1, absent: 1, excused: 1, pending: 5 });
});
test('local date keys handle year boundaries', () => {
  assert.equal(dateKey(new Date(2026, 11, 31)), '2026-12-31');
  assert.equal(dateKey(new Date(2026, 11, 32)), '2027-01-01');
});
test('saved attendance roundtrips without mixing dates', () => {
  const register = { '2026-11-04': { 'demo-1': 'present' }, '2026-11-05': { 'demo-1': 'absent' } };
  assert.deepEqual(parseRegister(JSON.stringify(register)), register);
  assert.deepEqual(parseRegister(null), {});
});
test('corrupt storage is rejected rather than silently replaced', () => {
  for (const value of ['null', '[]', '{', '{"2026-11-04":{"demo-1":"unknown"}}', '{"bad":{}}']) {
    assert.throws(() => parseRegister(value));
  }
});

const { validatePlayer, parseRoster } = await import('../src/domain.ts');
test('player validation normalizes names and rejects invalid or reused dorsals', () => {
  assert.deepEqual(validatePlayer('  Nuevo   Jugador  ', '22', players), { name: 'Nuevo Jugador', number: 22 });
  for (const number of ['', '-1', '1.5', '100', 'abc']) assert.throws(() => validatePlayer('Nombre', number, players));
  assert.throws(() => validatePlayer(' ', 22, players));
  assert.throws(() => validatePlayer('Duplicado', 7, players));
  assert.deepEqual(validatePlayer('Hugo editado', 7, players, 'demo-3'), { name: 'Hugo editado', number: 7 });
});
test('roster parser preserves empty rosters and archives, rejects corrupt records', () => {
  assert.deepEqual(parseRoster('[]'), []);
  assert.deepEqual(parseRoster(null), players);
  const archived = { ...players[0], archivedAt: '2026-11-05T12:00:00Z' };
  const replacement = { id: 'replacement', name: 'Sustituto', number: archived.number };
  assert.equal(parseRoster(JSON.stringify([archived, replacement])).length, 2);
  for (const roster of [[players[0],players[0]], [{ ...players[0], number: -1 }], [{ ...players[0], archivedAt: 'bad' }], [{ ...players[0], name: '' }]]) {
    assert.throws(() => parseRoster(JSON.stringify(roster)));
  }
});
