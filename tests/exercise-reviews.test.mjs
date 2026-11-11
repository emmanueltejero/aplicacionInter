import test from 'node:test';
import assert from 'node:assert/strict';
import { currentExerciseReview } from '../src/exerciseReviews.ts';
import { canEditExercise } from '../src/exercises.ts';
test('a club review applies only to the exact loaded exercise revision and is independent of favorites or team recommendations', () => {
  const exercise = { id: 'exercise-a', createdBy: 'author', revision: 3, archivedAt: null, teamCategories: ['Alevín'] };
  const review = { exerciseId: exercise.id, exerciseRevision: 3, reviewedBy: 'reviewer', reviewedAt: '2026-11-11T12:00:00Z' };
  const reviews = new Map([[exercise.id, review]]);
  assert.deepEqual(currentExerciseReview(exercise, reviews), review);
  assert.equal(currentExerciseReview({ ...exercise, revision: 4 }, reviews), null);
  assert.equal(currentExerciseReview({ ...exercise, id: 'other' }, reviews), null);
  assert.equal(currentExerciseReview(exercise, new Map()), null);
  assert.equal(canEditExercise(exercise, { id: 'reviewer', admin: false, canReview: true }), false);
  assert.equal(canEditExercise(exercise, { id: 'author', admin: false, canReview: false }), true);
});
