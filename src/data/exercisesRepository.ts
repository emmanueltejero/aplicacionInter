import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canEditExercise, exerciseDraft, parseExercises, validateExercise } from '../exercises';
import type { Exercise, ExerciseInput, ExerciseViewer } from '../exercises';

export type ExerciseSave = ExerciseInput & { id: string; revision: number; archived: boolean };
export type ExerciseLibrary = { exercises: Exercise[]; viewer: ExerciseViewer };
export interface ExercisesRepository {
  load(): Promise<ExerciseLibrary>;
  save(exercise: ExerciseSave): Promise<Exercise>;
}
export class ExercisesSetupRequired extends Error {
  constructor() { super('Falta activar la biblioteca de ejercicios en Supabase.'); this.name = 'ExercisesSetupRequired'; }
}
const demoKey = '@inter-playa-honda/demo-exercises/v1';
const demoViewer = { id: 'demo-coach', admin: false };
const examples: Exercise[] = [
  { id: '00000000-0000-4000-8000-000000000001', createdBy: 'demo-coach', revision: 1, archivedAt: null,
    title: 'Rondo 4 contra 2', description: 'Cuatro jugadores conservan la posesión y dos intentan recuperar. Cambiar los defensores cada dos minutos. Ajustar el número de toques al nivel del grupo.', categories: ['Calentamiento', 'Posesión', 'Técnica'], duration: 12, minPlayers: 6, maxPlayers: 6, spaceLength: 12, spaceWidth: 12, materials: [{ name: 'Balones', quantity: 2 }, { name: 'Conos', quantity: 4 }] },
  { id: '00000000-0000-4000-8000-000000000002', createdBy: 'another-demo-coach', revision: 1, archivedAt: null,
    title: 'Finalización por parejas', description: 'Pase, control orientado y remate a portería por parejas. Alternar perfiles y rotar al pasador después de cada acción.', categories: ['Finalización', 'Técnica'], duration: 15, minPlayers: 6, maxPlayers: 12, spaceLength: 30, spaceWidth: 20, materials: [{ name: 'Balones', quantity: 6 }, { name: 'Conos', quantity: 4 }] },
];
export const demoExercisesRepository: ExercisesRepository = {
  async load() {
    const value = await AsyncStorage.getItem(demoKey);
    return { exercises: parseExercises(value ?? JSON.stringify(examples)), viewer: demoViewer };
  },
  async save(request) {
    const { exercises } = await this.load();
    const previous = exercises.find(item => item.id === request.id);
    if (previous && !canEditExercise(previous, demoViewer)) throw new Error('Solo el autor o un administrador puede modificar el ejercicio.');
    if ((previous?.revision ?? 0) !== request.revision) throw new Error('El ejercicio ha cambiado. Cierra la ficha y pulsa Actualizar biblioteca antes de editarlo.');
    const input = validateExercise(exerciseDraft({ ...request, createdBy: demoViewer.id, archivedAt: null }));
    const saved: Exercise = { ...input, id: request.id, createdBy: previous?.createdBy ?? demoViewer.id,
      revision: request.revision + 1, archivedAt: request.archived ? previous?.archivedAt ?? new Date().toISOString() : null };
    await AsyncStorage.setItem(demoKey, JSON.stringify(previous ? exercises.map(item => item.id === saved.id ? saved : item) : [...exercises, saved]));
    return saved;
  },
};
function check(error: { code?: string } | null) {
  if (error && ['PGRST205', 'PGRST202', '42P01', '42883'].includes(error.code ?? '')) throw new ExercisesSetupRequired();
  if (error?.code === '40001') throw new Error('El ejercicio ha cambiado. Cierra la ficha y pulsa Actualizar biblioteca antes de editarlo.');
  if (error?.code === '42501') throw new Error('Tu cuenta no tiene permiso para esta operación. Solo el autor o un administrador puede modificar el ejercicio.');
  if (error && ['22023', '23514', '23502', '22P02'].includes(error.code ?? '')) throw new Error('Revisa los campos del ejercicio, las categorías y las cantidades de material.');
  if (error) throw new Error('No se pudo guardar o consultar la biblioteca. Revisa la conexión e inténtalo de nuevo.');
}
type RemoteExercise = {
  id: string; created_by: string | null; revision: number; archived_at: string | null; title: string; description: string;
  categories: Exercise['categories']; duration: number; min_players: number; max_players: number;
  space_length: number; space_width: number; materials: Exercise['materials'];
};
const columns = 'id,created_by,revision,archived_at,title,description,categories,duration,min_players,max_players,space_length,space_width,materials';
function fromRemote(row: RemoteExercise): Exercise {
  return { id: row.id, createdBy: row.created_by, revision: row.revision, archivedAt: row.archived_at,
    title: row.title, description: row.description, categories: row.categories, duration: row.duration,
    minPlayers: row.min_players, maxPlayers: row.max_players, spaceLength: row.space_length, spaceWidth: row.space_width, materials: row.materials };
}
export function remoteExercisesRepository(client: SupabaseClient): ExercisesRepository {
  return {
    async load() {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) throw new Error('Vuelve a iniciar sesión para consultar la biblioteca.');
      const member = await client.from('club_members').select('user_id,role,enabled').eq('user_id', data.session.user.id).maybeSingle();
      check(member.error);
      if (!member.data?.enabled) throw new Error('Tu cuenta no tiene acceso activo a la biblioteca del club.');
      const exercises: Exercise[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await client.from('exercises').select(columns).order('title').order('id').range(offset, offset + 499);
        check(result.error);
        const rows = (result.data ?? []) as RemoteExercise[];
        exercises.push(...rows.map(fromRemote));
        if (rows.length < 500) return { exercises, viewer: { id: data.session.user.id, admin: member.data.role === 'admin' } };
      }
    },
    async save(exercise) {
      const result = await client.rpc('save_exercise', { p_id: exercise.id, p_revision: exercise.revision,
        p_title: exercise.title, p_description: exercise.description, p_categories: exercise.categories,
        p_duration: exercise.duration, p_min_players: exercise.minPlayers, p_max_players: exercise.maxPlayers,
        p_space_length: exercise.spaceLength, p_space_width: exercise.spaceWidth, p_materials: exercise.materials, p_archived: exercise.archived });
      check(result.error);
      if (!result.data || result.data.id !== exercise.id) throw new Error('No se pudo confirmar el guardado del ejercicio.');
      return fromRemote(result.data as RemoteExercise);
    },
  };
}
