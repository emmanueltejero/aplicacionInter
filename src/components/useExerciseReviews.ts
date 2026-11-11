import { useEffect, useRef, useState } from 'react';
import type { Exercise } from '../exercises';
import { ExerciseReviewsSetupRequired } from '../exerciseReviews';
import type { ExerciseReview } from '../exerciseReviews';
import type { ExerciseReviewsRepository } from '../data/exerciseReviewsRepository';

export function useExerciseReviews(repository: ExerciseReviewsRepository) {
  const [byId, setById] = useState<Map<string, ExerciseReview>>(new Map());
  const [status, setStatus] = useState<'loading' | 'ready' | 'setup' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ exerciseId: string; message: string } | null>(null);
  const mounted = useRef(false), locked = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    repository.load().then(rows => { if (active) { setById(new Map(rows.map(row => [row.exerciseId, row]))); setStatus('ready'); } })
      .catch(cause => { if (active) { setStatus(cause instanceof ExerciseReviewsSetupRequired ? 'setup' : 'error'); setLoadError(cause instanceof Error ? cause.message : 'No se pudieron consultar las revisiones del club.'); } });
    return () => { active = false; };
  }, [repository, attempt]);
  function refresh() {
    if (locked.current) return;
    setStatus('loading'); setLoadError(''); setFailure(null); setAttempt(value => value + 1);
  }
  async function setReview(exercise: Exercise, reviewed: boolean) {
    if (locked.current || status !== 'ready') return;
    locked.current = true; setPendingId(exercise.id); setFailure(null);
    try {
      const result = await repository.set({ exerciseId: exercise.id, exerciseRevision: exercise.revision, reviewed, expectedReviewedAt: byId.get(exercise.id)?.reviewedAt ?? null });
      if (mounted.current) setById(current => { const next = new Map(current); if (result) next.set(exercise.id, result); else next.delete(exercise.id); return next; });
    } catch (cause) {
      if (mounted.current) { setFailure({ exerciseId: exercise.id, message: cause instanceof Error ? cause.message : 'No se pudo confirmar la revisión. Reintenta.' }); if (cause instanceof ExerciseReviewsSetupRequired) setStatus('setup'); }
    } finally { locked.current = false; if (mounted.current) setPendingId(null); }
  }
  return { byId, status, loadError, pendingId, failure, refresh, setReview };
}
export type ExerciseReviews = ReturnType<typeof useExerciseReviews>;
