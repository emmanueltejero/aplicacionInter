import { useEffect, useRef, useState } from 'react';
import { ExerciseFavoritesSetupRequired } from '../data/exerciseFavoritesRepository';
import type { ExerciseFavoritesRepository } from '../data/exerciseFavoritesRepository';

export function useExerciseFavorites(repository: ExerciseFavoritesRepository) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<'loading' | 'ready' | 'setup' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const locked = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    let active = true;
    repository.load().then(value => { if (active) { setIds(new Set(value)); setStatus('ready'); } })
      .catch(cause => {
        if (active) { setStatus(cause instanceof ExerciseFavoritesSetupRequired ? 'setup' : 'error'); setLoadError(cause instanceof Error ? cause.message : 'No se pudieron cargar tus favoritos.'); }
      });
    return () => { active = false; };
  }, [repository, attempt]);
  async function toggle(id: string) {
    if (locked.current || status !== 'ready') return;
    const favorite = !ids.has(id);
    locked.current = true; setPendingId(id); setFailure(null);
    try {
      await repository.set(id, favorite);
      if (mounted.current) setIds(current => { const next = new Set(current); if (favorite) next.add(id); else next.delete(id); return next; });
    } catch (cause) {
      if (mounted.current) {
        if (cause instanceof ExerciseFavoritesSetupRequired) setStatus('setup');
        setFailure({ id, message: cause instanceof Error ? cause.message : 'No se pudo confirmar el favorito. Pulsa de nuevo para reintentar.' });
      }
    } finally { locked.current = false; if (mounted.current) setPendingId(null); }
  }
  function refresh() {
    if (locked.current) return;
    setStatus('loading'); setLoadError(''); setFailure(null); setAttempt(value => value + 1);
  }
  return { ids, status, loadError, pendingId, failure, toggle, refresh };
}
export type ExerciseFavorites = ReturnType<typeof useExerciseFavorites>;
