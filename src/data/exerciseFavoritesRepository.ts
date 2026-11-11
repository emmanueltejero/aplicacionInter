import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ExerciseFavoritesRepository {
  load(): Promise<string[]>;
  set(exerciseId: string, favorite: boolean): Promise<void>;
}
export class ExerciseFavoritesSetupRequired extends Error {
  constructor() { super('Falta activar los favoritos personales en Supabase.'); this.name = 'ExerciseFavoritesSetupRequired'; }
}
const demoKey = '@inter-playa-honda/demo-exercise-favorites/v1';
export const demoExerciseFavoritesRepository: ExerciseFavoritesRepository = {
  async load() {
    const value: unknown = JSON.parse(await AsyncStorage.getItem(demoKey) ?? '[]');
    if (!Array.isArray(value) || !value.every(id => typeof id === 'string')) throw new Error('No se pudieron leer los favoritos de la demo.');
    return [...new Set<string>(value)];
  },
  async set(exerciseId, favorite) {
    const ids = new Set(await this.load());
    if (favorite) ids.add(exerciseId); else ids.delete(exerciseId);
    await AsyncStorage.setItem(demoKey, JSON.stringify([...ids]));
  },
};
function check(error: { code?: string } | null) {
  if (!error) return;
  if (['PGRST205', 'PGRST202', '42P01', '42883'].includes(error.code ?? '')) throw new ExerciseFavoritesSetupRequired();
  if (error.code === '42501') throw new Error('Tu cuenta no tiene acceso activo a los favoritos del club.');
  if (['22023', '23503'].includes(error.code ?? '')) throw new Error('El ejercicio ya no está disponible. Actualiza la biblioteca.');
  throw new Error('No se pudo confirmar el cambio de favoritos. Revisa la conexión y pulsa de nuevo; repetir la acción es seguro.');
}
export function remoteExerciseFavoritesRepository(client: SupabaseClient): ExerciseFavoritesRepository {
  return {
    async load() {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) throw new Error('Vuelve a iniciar sesión para consultar tus favoritos.');
      const ids: string[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await client.from('exercise_favorites').select('exercise_id').eq('user_id', data.session.user.id).order('exercise_id').range(offset, offset + 499);
        if (result.error) {
          if (['PGRST205', '42P01'].includes(result.error.code)) throw new ExerciseFavoritesSetupRequired();
          throw new Error('No se pudieron cargar tus favoritos. Revisa la conexión y vuelve a intentarlo.');
        }
        const rows = result.data ?? [];
        ids.push(...rows.map(row => String(row.exercise_id)));
        if (rows.length < 500) return ids;
      }
    },
    async set(exerciseId, favorite) {
      const result = await client.rpc('set_exercise_favorite', { p_exercise_id: exerciseId, p_favorite: favorite });
      check(result.error);
      if (result.data !== favorite) throw new Error('No se pudo confirmar el cambio de favoritos. Pulsa de nuevo para reintentar.');
    },
  };
}
