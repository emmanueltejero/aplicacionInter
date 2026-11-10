import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneTrainingPlan, entryFromExercise, filterTrainingPlans, parseTrainingPlans, trainingDraft, trainingTotals, validateTraining, validateTrainingCopy } from '../src/trainingPlans.ts';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const exercise = { id: id(1), createdBy: 'coach', revision: 2, archivedAt: null, title: 'Rondo', description: 'Conservar el balón', categories: ['Posesión'], duration: 12, minPlayers: 6, maxPlayers: 12, spaceLength: 20, spaceWidth: 30, materials: [{ name: 'Conos', quantity: 4 }, { name: 'Balones', quantity: 2 }] };
const a = entryFromExercise(exercise, id(10));
const b = entryFromExercise({ ...exercise, id: id(2), title: 'Finalización', duration: 18, minPlayers: 8, maxPlayers: 16, spaceLength: 30, spaceWidth: 20, materials: [{ name: 'conos', quantity: 8 }, { name: 'Balones', quantity: 6 }] }, id(20));
const input = { title: 'Entrenamiento del martes', date: '2026-11-10', playerCount: 10, notes: 'Primer toque', entries: [a, b] };
const plan = { ...input, id: id(100), teamId: 'demo-team', createdBy: 'coach', revision: 1, archivedAt: null };

test('sequential totals use sum of minutes, reusable material maxima and compatible player ranges', () => {
  const totals = trainingTotals(input.entries, 10);
  assert.equal(totals.minutes, 30);
  assert.deepEqual(totals.materials, [{ name: 'Balones', quantity: 6 }, { name: 'conos', quantity: 8 }]);
  assert.equal(totals.minPlayers, 8); assert.equal(totals.maxPlayers, 12);
  assert.equal(totals.spaceLength, 30); assert.equal(totals.spaceWidth, 30);
  assert.deepEqual(totals.timeline.map(({ start, end }) => [start, end]), [[0, 12], [12, 30]]);
  assert.equal(totals.mismatches.length, 0);
  assert.equal(trainingTotals([a, b, { ...a, id: id(30) }], 10).materials.find(item => item.name === 'Balones').quantity, 6);
});
test('player conflicts and incomplete duration previews are explicit', () => {
  const conflict = { ...b, minPlayers: 15, maxPlayers: 20 };
  const totals = trainingTotals([a, conflict], 10);
  assert.ok(totals.minPlayers > totals.maxPlayers);
  assert.deepEqual(totals.mismatches.map(item => item.id), [b.id]);
  const pending = trainingTotals([{ ...a, duration: '' }, { ...b, duration: '18' }], null);
  assert.equal(pending.minutes, null);
  assert.deepEqual(pending.timeline.map(({ start, end }) => [start, end]), [[0, null], [null, null]]);
  assert.equal(trainingTotals([], null).minutes, 0);
});
test('plan validation preserves sequence and allows repeating an exercise as different blocks', () => {
  assert.deepEqual(validateTraining(trainingDraft(input)), input);
  const repeated = { ...input, entries: [b, a, { ...a, id: id(30) }] };
  assert.deepEqual(validateTraining(trainingDraft(repeated)).entries.map(item => item.id), [b.id, a.id, id(30)]);
  for (const patch of [{ title: '' }, { date: '2026-02-30' }, { date: '0000-01-01' }, { playerCount: '' }, { playerCount: '101' }, { notes: 'x'.repeat(3001) }, { entries: [] }, { entries: [a, a].map(item => ({ ...item, duration: '12' })) }]) {
    assert.throws(() => validateTraining({ ...trainingDraft(input), ...patch }));
  }
  assert.throws(() => validateTraining({ ...trainingDraft(input), entries: [{ ...trainingDraft(input).entries[0], duration: '1.5' }] }));
  assert.throws(() => validateTraining(trainingDraft({ ...input, entries: [a, b, { ...a, id: id(30) }].map(item => ({ ...item, duration: 240 })) })));
});
test('snapshot creation does not retain mutable category or material references', () => {
  const mutable = structuredClone(exercise), snapshot = entryFromExercise(mutable, id(40));
  mutable.title = 'Nuevo nombre'; mutable.materials[0].quantity = 100; mutable.categories.push('Técnica');
  assert.equal(snapshot.title, 'Rondo'); assert.equal(snapshot.materials[0].quantity, 4); assert.deepEqual(snapshot.categories, ['Posesión']);
});
test('date filters include boundaries and future plans and keep archived plans optional', () => {
  const future = { ...plan, id: id(101), date: '2026-12-01' }, archived = { ...plan, id: id(102), archivedAt: '2026-11-10T12:00:00Z' };
  assert.equal(filterTrainingPlans([plan, future, archived], '2026-11-10', '2026-11-10', false).length, 1);
  assert.equal(filterTrainingPlans([plan, future, archived], '', '', true).length, 3);
  assert.equal(filterTrainingPlans([plan, future], '2026-11-10', '', false)[0].id, future.id);
  assert.throws(() => filterTrainingPlans([plan], '2026-11-11', '2026-11-10', false));
  assert.throws(() => filterTrainingPlans([plan], '2026-11-31', '', false));
});
test('saved plans roundtrip without losing order; corrupt storage is rejected', () => {
  assert.deepEqual(parseTrainingPlans(JSON.stringify([plan])), [plan]);
  assert.deepEqual(parseTrainingPlans(null), []);
  for (const value of ['null', '{}', '{', JSON.stringify([plan, plan]), JSON.stringify([{ ...plan, revision: 0 }]), JSON.stringify([{ ...plan, entries: [{ ...a, duration: 0 }] }])]) assert.throws(() => parseTrainingPlans(value));
});
test('duplicates are independent active plans with fresh block IDs and historical snapshots', () => {
  const original = { ...structuredClone(plan), archivedAt: '2026-11-10T12:00:00Z' };
  const request = { id: id(200), sourceId: original.id, sourceRevision: 1, date: '2026-11-17', title: '  Otra   sesión ' };
  let next = 300;
  const copy = cloneTrainingPlan(original, request, 'new-coach', () => id(next++));
  assert.equal(copy.title, 'Otra sesión'); assert.equal(copy.date, '2026-11-17'); assert.equal(copy.archivedAt, null);
  assert.equal(copy.revision, 1); assert.equal(copy.createdBy, 'new-coach'); assert.equal(copy.copiedFrom, original.id);
  assert.deepEqual(copy.entries.map(item => item.id), [id(300), id(301)]);
  assert.equal(trainingTotals(copy.entries, copy.playerCount).minutes, 30);
  copy.entries[0].materials[0].quantity = 99; copy.entries[0].categories.push('Técnica'); copy.notes = 'Nuevas notas';
  assert.equal(original.entries[0].materials[0].quantity, 4); assert.deepEqual(original.entries[0].categories, ['Posesión']); assert.equal(original.notes, 'Primer toque');
  assert.throws(() => cloneTrainingPlan({ ...original, revision: 2 }, request, 'coach', () => id(400)));
  for (const patch of [{ id: original.id }, { date: '2026-02-30' }, { date: '0000-01-01' }, { title: '' }, { sourceRevision: 0 }]) assert.throws(() => validateTrainingCopy({ ...request, ...patch }));
});
