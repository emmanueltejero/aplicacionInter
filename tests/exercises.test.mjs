import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditExercise, exerciseDraft, filterExercises, parseExercises, validateExercise, validateExerciseTeamCategories } from '../src/exercises.ts';

const input = { title: 'Rondo técnico', description: 'Conservar el balón.', categories: ['Técnica', 'Posesión'], duration: 12, minPlayers: 6, maxPlayers: 8, spaceLength: 15, spaceWidth: 20, materials: [{ name: 'Conos', quantity: 4 }] };
const exercise = { ...input, id: 'exercise-a', createdBy: 'coach-a', revision: 1, archivedAt: null };
test('exercise validation normalizes names and preserves all planning quantities', () => {
  assert.deepEqual(validateExercise({ ...exerciseDraft(exercise), title: '  Rondo   técnico  ', materials: [{ name: ' Conos ', quantity: '4' }] }), input);
  assert.deepEqual(validateExercise({ ...exerciseDraft(exercise), materials: [] }).materials, []);
  assert.equal(validateExercise({ ...exerciseDraft(exercise), minPlayers: '8' }).minPlayers, 8);
});
test('invalid exercise fields cannot silently become zero, fractions or inconsistent ranges', () => {
  for (const patch of [
    { title: '' }, { description: ' ' }, { categories: [] }, { categories: ['Técnica', 'Técnica'] }, { categories: ['Otra'] },
    { duration: '' }, { duration: '0' }, { duration: '241' }, { duration: '1.5' },
    { minPlayers: '9' }, { maxPlayers: '101' }, { spaceLength: '0' }, { spaceWidth: '151' },
    { materials: [{ name: '', quantity: '1' }] }, { materials: [{ name: 'Balones', quantity: '1001' }] },
    { materials: [{ name: 'Conos', quantity: '1' }, { name: ' conos ', quantity: '2' }] },
  ]) assert.throws(() => validateExercise({ ...exerciseDraft(exercise), ...patch }));
});
test('library search ignores accents and combines words, category and archive filters', () => {
  const archived = { ...exercise, id: 'archived', archivedAt: '2026-11-10T12:00:00Z' };
  const other = { ...exercise, id: 'other', title: 'Finalización', categories: ['Finalización'], materials: [] };
  const exercises = [exercise, archived, other];
  assert.deepEqual(filterExercises(exercises, 'tecnico CONOS', 'Posesión', false).map(x => x.id), ['exercise-a']);
  assert.equal(filterExercises(exercises, 'tecnico', '', true).length, 2);
  assert.equal(filterExercises(exercises, 'tecnico', 'Finalización', true).length, 0);
  assert.deepEqual(filterExercises(exercises, '', '', false).map(x => x.id), ['other', 'exercise-a']);
});
test('authors and admins can edit; other coaches and orphaned authors cannot', () => {
  assert.equal(canEditExercise(exercise, { id: 'coach-a', admin: false }), true);
  assert.equal(canEditExercise(exercise, { id: 'coach-b', admin: false }), false);
  assert.equal(canEditExercise(exercise, { id: 'admin', admin: true }), true);
  assert.equal(canEditExercise({ ...exercise, createdBy: null }, { id: 'coach-a', admin: false }), false);
});
test('saved library roundtrips, keeps empty lists, and rejects corrupt records', () => {
  assert.deepEqual(parseExercises(JSON.stringify([exercise])), [exercise]);
  assert.deepEqual(parseExercises('[]'), []);
  for (const data of [null, {}, [exercise, exercise], [{ ...exercise, duration: 0 }], [{ ...exercise, revision: 0 }], [{ ...exercise, archivedAt: 'bad' }], [{ ...exercise, materials: [null] }]]) {
    assert.throws(() => parseExercises(JSON.stringify(data)));
  }
});
test('team recommendations combine with content, text and archive filters without treating legacy exercises as suitable for every team', () => {
  const shared = { ...exercise, teamCategories: ['Benjamín', 'Alevín'] };
  const cadet = { ...exercise, id: 'cadet', title: 'Trabajo cadete', categories: ['Defensa'], teamCategories: ['Cadete', 'Femenino'] };
  const archived = { ...shared, id: 'archived', archivedAt: '2026-11-10T12:00:00Z' };
  const items = [exercise,shared,cadet,archived];
  assert.deepEqual(filterExercises(items,'tecnico','Posesión',false,'Benjamín'),[shared]);
  assert.deepEqual(filterExercises(items,'','',false,'Alevín'),[shared]);
  assert.deepEqual(filterExercises(items,'','Defensa',false,'Benjamín'),[]);
  assert.deepEqual(filterExercises(items,'','',false,'unclassified'),[exercise]);
  assert.deepEqual(filterExercises(items,'femenino cadete','',false),[cadet]);
  assert.equal(filterExercises(items,'','',true,'Benjamín').length,2);
});
test('recommendations validate, canonicalize and clone while legacy records and training content remain compatible', () => {
  assert.deepEqual(validateExerciseTeamCategories(undefined),[]);
  assert.deepEqual(validateExerciseTeamCategories(['Alevín','Benjamín']),['Benjamín','Alevín']);
  for (const value of [null,'Cadete',['Otra'],['Benjamin'],['Cadete','Cadete'],[null],Array(10).fill('Cadete')]) assert.throws(()=>validateExerciseTeamCategories(value));
  const classified = { ...exercise, teamCategories:['Benjamín','Alevín'] };
  const draft = exerciseDraft(classified);draft.teamCategories.push('Cadete');assert.deepEqual(classified.teamCategories,['Benjamín','Alevín']);
  assert.deepEqual(validateExercise(draft),input);
  assert.deepEqual(parseExercises(JSON.stringify([classified])),[classified]);
  assert.deepEqual(parseExercises(JSON.stringify([exercise])),[exercise]);
  for (const teamCategories of [null,['Otra'],['Cadete','Cadete']]) assert.throws(()=>parseExercises(JSON.stringify([{...exercise,teamCategories}])));
});
