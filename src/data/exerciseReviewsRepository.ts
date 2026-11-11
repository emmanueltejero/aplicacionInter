import type { SupabaseClient } from '@supabase/supabase-js';
import { ExerciseReviewsSetupRequired } from '../exerciseReviews';
import type { ExerciseReview, ExerciseReviewRequest } from '../exerciseReviews';

export interface ExerciseReviewsRepository {
  load(): Promise<ExerciseReview[]>;
  set(request: ExerciseReviewRequest): Promise<ExerciseReview | null>;
}
export const demoExerciseReviewsRepository: ExerciseReviewsRepository = {
  async load() { return []; },
  async set() { throw new Error('La demo no gestiona revisiones del club.'); },
};
type RemoteReview = { exercise_id: string; exercise_revision: number; reviewed_by: string | null; reviewed_at: string };
function fromRemote(row: RemoteReview): ExerciseReview {
  if (!row || typeof row.exercise_id !== 'string' || !Number.isInteger(row.exercise_revision) || row.exercise_revision < 1 || !Number.isFinite(Date.parse(row.reviewed_at))
    || (row.reviewed_by !== null && typeof row.reviewed_by !== 'string')) throw new Error('No se pudo confirmar la revisión. Actualiza la biblioteca.');
  return { exerciseId: row.exercise_id, exerciseRevision: row.exercise_revision, reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at };
}
function check(error: { code?: string } | null) {
  if (!error) return;
  if (['PGRST205', 'PGRST202', '42P01', '42883'].includes(error.code ?? '')) throw new ExerciseReviewsSetupRequired();
  if (error.code === '42501') throw new Error('Solo los administradores y revisores autorizados activos pueden cambiar la revisión metodológica.');
  if (error.code === '40001') throw new Error('El ejercicio o su revisión han cambiado. Cierra la ficha y pulsa Actualizar biblioteca antes de revisarlo.');
  throw new Error('No se pudo confirmar la revisión. Revisa la conexión y reintenta con la misma acción.');
}
export function remoteExerciseReviewsRepository(client: SupabaseClient): ExerciseReviewsRepository {
  return {
    async load() {
      const reviews: ExerciseReview[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await client.from('exercise_reviews').select('exercise_id,exercise_revision,reviewed_by,reviewed_at').order('exercise_id').range(offset, offset + 499).returns<RemoteReview[]>();
        check(result.error);
        const rows = result.data ?? [];
        reviews.push(...rows.map(fromRemote));
        if (rows.length < 500) return reviews;
      }
    },
    async set(request) {
      const result = await client.rpc('set_exercise_review', { p_exercise: request.exerciseId, p_revision: request.exerciseRevision, p_reviewed: request.reviewed, p_expected_reviewed_at: request.expectedReviewedAt });
      check(result.error);
      if (!request.reviewed && result.data === null) return null;
      const review = fromRemote(result.data as RemoteReview);
      if (!request.reviewed || review.exerciseId !== request.exerciseId || review.exerciseRevision !== request.exerciseRevision) throw new Error('No se pudo confirmar la revisión. Actualiza la biblioteca.');
      return review;
    },
  };
}
