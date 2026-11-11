import test from 'node:test';
import assert from 'node:assert/strict';
import { filterExercises, recommendedExercisesFirst } from '../src/exercises.ts';
import { validateTeamCategory } from '../src/teams.ts';

const exercise = { createdBy: 'coach', revision: 1, archivedAt: null, description: 'Pase y control', categories: ['Posesión'], duration: 12, minPlayers: 6, maxPlayers: 12, spaceLength: 15, spaceWidth: 20, materials: [] };
const items = [
  { ...exercise, id: 'cadet', title: 'A defensa', teamCategories: ['Cadete'] },
  { ...exercise, id: 'legacy', title: 'B sin clasificar' },
  { ...exercise, id: 'recommended-a', title: 'C rondo', teamCategories: ['Alevín', 'Benjamín'] },
  { ...exercise, id: 'recommended-b', title: 'D posesión', teamCategories: ['Alevín'] },
  { ...exercise, id: 'archived', title: 'E archivado', teamCategories: ['Alevín'], archivedAt: '2026-11-11T12:00:00Z' },
];
test('recommendations sort eligible exercises first, retaining other categories and stable alphabetical order without mutation', () => {
  const selected = filterExercises(items, '', '', false), before = JSON.stringify(selected);
  assert.deepEqual(recommendedExercisesFirst(selected, 'Alevín').map(x => x.id), ['recommended-a', 'recommended-b', 'cadet', 'legacy']);
  assert.equal(JSON.stringify(selected), before);
  assert.deepEqual(recommendedExercisesFirst(selected, 'Benjamín').map(x => x.id), ['recommended-a', 'cadet', 'legacy', 'recommended-b']);
  assert.deepEqual(recommendedExercisesFirst(selected, 'Cadete').map(x => x.id), ['cadet', 'legacy', 'recommended-a', 'recommended-b']);
  for (const category of [null, undefined, 'Minis']) assert.deepEqual(recommendedExercisesFirst(selected, category), selected);
});
test('manual filters and favorites remain authoritative; archived and unclassified exercises never become recommendations', () => {
  assert.deepEqual(recommendedExercisesFirst(filterExercises(items, '', '', false, 'Cadete'), 'Alevín').map(x => x.id), ['cadet']);
  assert.deepEqual(recommendedExercisesFirst(filterExercises(items, 'sin clasificar', '', false), 'Alevín').map(x => x.id), ['legacy']);
  const favorites = new Set(['cadet', 'recommended-b']);
  assert.deepEqual(recommendedExercisesFirst(filterExercises(items, '', '', false).filter(x => favorites.has(x.id)), 'Alevín').map(x => x.id), ['recommended-b', 'cadet']);
  assert.deepEqual(recommendedExercisesFirst(filterExercises(items, '', 'Defensa', false), 'Alevín'), []);
});
test('team category is an explicit club value or unassigned; names and unknown values cannot silently assign one', () => {
  assert.equal(validateTeamCategory('Alevín'), 'Alevín'); assert.equal(validateTeamCategory(null), null);
  for (const value of [undefined, '', 'Alevin', 'Alevín B', 'Cadete A', 'Senior', ['Alevín'], {}, 1]) assert.throws(() => validateTeamCategory(value));
});
