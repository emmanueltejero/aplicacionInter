import type { SupabaseClient } from '@supabase/supabase-js';
import { ExerciseReviewsSetupRequired } from '../exerciseReviews';

export async function loadExerciseReviewers(client: SupabaseClient) {
  const reviewers = new Map<string, boolean>();
  for (let offset = 0; ; offset += 500) {
    const result = await client.from('club_members').select('user_id,can_review_exercises').order('user_id').range(offset, offset + 499);
    if (result.error && ['42703', 'PGRST204'].includes(result.error.code)) return { reviewers, exerciseReviewersReady: false };
    if (result.error) throw new Error('No se pudieron consultar los permisos de revisión. Revisa la conexión y actualiza los usuarios.');
    const rows = result.data ?? [];
    for (const row of rows) reviewers.set(row.user_id, row.can_review_exercises === true);
    if (rows.length < 500) return { reviewers, exerciseReviewersReady: true };
  }
}
export async function setExerciseReviewer(client: SupabaseClient, id: string, allowed: boolean, expected: boolean) {
  const result = await client.rpc('admin_set_exercise_reviewer', { p_user: id, p_allowed: allowed, p_expected_allowed: expected });
  if (result.error && ['PGRST202', '42883'].includes(result.error.code)) throw new ExerciseReviewsSetupRequired();
  if (result.error?.code === '40001') throw new Error('El permiso ha cambiado. Cierra el formulario y actualiza los usuarios.');
  if (result.error?.code === '42501') throw new Error('Solo un administrador activo puede autorizar revisores.');
  if (result.error || result.data?.user_id !== id || result.data?.can_review_exercises !== allowed) throw new Error('No se pudo confirmar el permiso de revisión. Reintenta con los mismos datos o actualiza los usuarios.');
}
