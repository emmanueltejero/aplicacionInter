import type { Exercise } from './exercises.ts';

export type ExerciseReview = { exerciseId: string; exerciseRevision: number; reviewedBy: string | null; reviewedAt: string };
export type ExerciseReviewRequest = { exerciseId: string; exerciseRevision: number; reviewed: boolean; expectedReviewedAt: string | null };
export function currentExerciseReview(exercise: Exercise, reviews: ReadonlyMap<string, ExerciseReview>): ExerciseReview | null {
  const review = reviews.get(exercise.id);
  return review?.exerciseRevision === exercise.revision ? review : null;
}
export class ExerciseReviewsSetupRequired extends Error {
  constructor() { super('Falta activar la revisión metodológica en Supabase.'); this.name = 'ExerciseReviewsSetupRequired'; }
}
