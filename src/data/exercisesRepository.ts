import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canEditExercise, exerciseDraft, parseExercises, validateExercise, validateExerciseTeamCategories } from '../exercises';
import type { Exercise, ExerciseInput, ExerciseViewer, ExerciseTeamCategory } from '../exercises';
import { exerciseImageBucket, exerciseImageBytes, exerciseMediaFields, validExerciseImagePath } from '../exerciseMedia';
import type { PreparedExerciseImage } from '../exerciseMedia';
import { demoImageKey } from './exerciseImages';
import { demoExerciseFavoritesRepository, remoteExerciseFavoritesRepository } from './exerciseFavoritesRepository';
import type { ExerciseFavoritesRepository } from './exerciseFavoritesRepository';

export type ExerciseSave = ExerciseInput & { id: string; revision: number; archived: boolean; teamCategories?: ExerciseTeamCategory[]; imageUpload?: PreparedExerciseImage };
export type ExerciseLibrary = { exercises: Exercise[]; viewer: ExerciseViewer; teamCategoriesReady?: boolean; mediaReady?: boolean };
export interface ExercisesRepository {
  readonly favorites: ExerciseFavoritesRepository;
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
  favorites: demoExerciseFavoritesRepository,
  async load() {
    const value = await AsyncStorage.getItem(demoKey);
    return { exercises: parseExercises(value ?? JSON.stringify(examples)), viewer: demoViewer, teamCategoriesReady: true, mediaReady: true };
  },
  async save(request) {
    const { exercises } = await this.load();
    const previous = exercises.find(item => item.id === request.id);
    if (previous && !canEditExercise(previous, demoViewer)) throw new Error('Solo el autor o un administrador puede modificar el ejercicio.');
    if ((previous?.revision ?? 0) !== request.revision) throw new Error('El ejercicio ha cambiado. Cierra la ficha y pulsa Actualizar biblioteca antes de editarlo.');
    const input = validateExercise(exerciseDraft({ ...request, createdBy: demoViewer.id, archivedAt: null }));
    if (request.imageUpload) {
      exerciseImageBytes(request.imageUpload.dataUrl);
      const path = `demo:${request.imageUpload.id}`; if (!validExerciseImagePath(path)) throw new Error('Identificador de imagen inválido.');
      await AsyncStorage.setItem(demoImageKey(path), request.imageUpload.dataUrl); input.imagePath = path;
    }
    const saved: Exercise = { ...input, teamCategories: validateExerciseTeamCategories(request.teamCategories), id: request.id, createdBy: previous?.createdBy ?? demoViewer.id,
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
  team_categories?: ExerciseTeamCategory[];
  image_path?: string | null; video_url?: string | null;
};
const columns = 'id,created_by,revision,archived_at,title,description,categories,duration,min_players,max_players,space_length,space_width,materials';
function fromRemote(row: RemoteExercise): Exercise {
  return { id: row.id, createdBy: row.created_by, revision: row.revision, archivedAt: row.archived_at,
    title: row.title, description: row.description, categories: row.categories, teamCategories: validateExerciseTeamCategories(row.team_categories), duration: row.duration,
    minPlayers: row.min_players, maxPlayers: row.max_players, spaceLength: row.space_length, spaceWidth: row.space_width, materials: row.materials,
    ...exerciseMediaFields({ imagePath: row.image_path, videoUrl: row.video_url }) };
}
export function remoteExercisesRepository(client: SupabaseClient): ExercisesRepository {
  return {
    favorites: remoteExerciseFavoritesRepository(client),
    async load() {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) throw new Error('Vuelve a iniciar sesión para consultar la biblioteca.');
      const member = await client.from('club_members').select('user_id,role,enabled').eq('user_id', data.session.user.id).maybeSingle();
      check(member.error);
      if (!member.data?.enabled) throw new Error('Tu cuenta no tiene acceso activo a la biblioteca del club.');
      const exercises: Exercise[] = [];
      let teamCategoriesReady = true;
      let mediaReady = true;
      for (let offset = 0; ; offset += 500) {
        let result = await client.from('exercises').select(`${columns}${teamCategoriesReady ? ',team_categories' : ''}${mediaReady ? ',image_path,video_url' : ''}`).order('title').order('id').range(offset, offset + 499).returns<RemoteExercise[]>();
        if (mediaReady && result.error && ['42703', 'PGRST204'].includes(result.error.code)) {
          mediaReady = false;
          result = await client.from('exercises').select(teamCategoriesReady ? `${columns},team_categories` : columns).order('title').order('id').range(offset, offset + 499).returns<RemoteExercise[]>();
        }
        if (teamCategoriesReady && result.error && ['42703', 'PGRST204'].includes(result.error.code)) {
          teamCategoriesReady = false;
          result = await client.from('exercises').select(columns).order('title').order('id').range(offset, offset + 499).returns<RemoteExercise[]>();
        }
        check(result.error);
        const rows = result.data ?? [];
        exercises.push(...rows.map(fromRemote));
        if (rows.length < 500) return { exercises, viewer: { id: data.session.user.id, admin: member.data.role === 'admin' }, teamCategoriesReady, mediaReady };
      }
    },
    async save(exercise) {
      const teamCategories = validateExerciseTeamCategories(exercise.teamCategories);
      const media = exerciseMediaFields(exercise);
      if (exercise.imageUpload) {
        const bytes = exerciseImageBytes(exercise.imageUpload.dataUrl);
        const { data } = await client.auth.getSession(); if (!data.session) throw new Error('Vuelve a iniciar sesión antes de subir la imagen.');
        const path = `${data.session.user.id}/${exercise.imageUpload.id}.jpg`;
        if (!validExerciseImagePath(path)) throw new Error('No se pudo preparar la referencia de la imagen.');
        const uploaded = await client.storage.from(exerciseImageBucket).upload(path, bytes, { contentType: 'image/jpeg', upsert: false, cacheControl: '300' });
        if (uploaded.error) {
          const failure = uploaded.error as { statusCode?: string | number; status?: number };
          const code = String(failure.statusCode ?? failure.status ?? '');
          if (code === '409') {
            const existing = await client.storage.from(exerciseImageBucket).download(path);
            if (existing.error || !existing.data) throw new Error('No se pudo comprobar la imagen del intento anterior. Reintenta con el mismo archivo.');
            const savedBytes = new Uint8Array(await existing.data.arrayBuffer());
            if (savedBytes.length !== bytes.length || !savedBytes.every((byte, index) => byte === bytes[index])) throw new Error('La imagen del intento ya existe con otro contenido. Selecciona de nuevo el archivo.');
          } else {
            if (code === '404' || uploaded.error.message.toLowerCase().includes('bucket not found')) throw new Error('Falta activar imágenes. Ejecuta 202611110001_exercise_media.sql en Supabase y reintenta.');
            if (code === '403') throw new Error('Tu cuenta no tiene permiso para subir imágenes. Revisa tu acceso al club.');
            throw new Error('No se pudo confirmar la subida de la imagen. Revisa la conexión y reintenta con el mismo archivo.');
          }
        }
        media.imagePath = path;
      }
      const body = { p_id: exercise.id, p_revision: exercise.revision, p_team_categories: teamCategories,
        p_title: exercise.title, p_description: exercise.description, p_categories: exercise.categories,
        p_duration: exercise.duration, p_min_players: exercise.minPlayers, p_max_players: exercise.maxPlayers,
        p_space_length: exercise.spaceLength, p_space_width: exercise.spaceWidth, p_materials: exercise.materials, p_archived: exercise.archived };
      let result = await client.rpc('save_exercise_with_media', { ...body, p_image_path: media.imagePath ?? null, p_video_url: media.videoUrl ?? null });
      if (result.error && ['PGRST202', '42883'].includes(result.error.code)) {
        if (media.imagePath || media.videoUrl || exercise.imageUpload) throw new Error('Falta activar imágenes y vídeos. Ejecuta 202611110001_exercise_media.sql en Supabase y reintenta.');
        result = await client.rpc('save_exercise_with_team_categories', body);
      }
      if (result.error && ['PGRST202', '42883', '42703', 'PGRST204'].includes(result.error.code)) throw new Error('Falta activar las categorías de equipo. Ejecuta el SQL 202611100006_exercise_team_categories.sql en Supabase y reintenta.');
      check(result.error);
      if (!result.data || result.data.id !== exercise.id) throw new Error('No se pudo confirmar el guardado del ejercicio.');
      if (!Array.isArray(result.data.team_categories) || JSON.stringify(validateExerciseTeamCategories(result.data.team_categories)) !== JSON.stringify(teamCategories)) throw new Error('No se pudo confirmar la clasificación. Actualiza la biblioteca antes de editar de nuevo.');
      if ((result.data.image_path ?? null) !== (media.imagePath ?? null) || (result.data.video_url ?? null) !== (media.videoUrl ?? null)) throw new Error('No se pudo confirmar la imagen o el vídeo. Actualiza la biblioteca antes de editar de nuevo.');
      return fromRemote(result.data as RemoteExercise);
    },
  };
}
