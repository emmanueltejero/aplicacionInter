import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cloneTrainingPlan, entryFromExercise, parseTrainingPlans, trainingDraft, validateTraining, validateTrainingCopy } from '../trainingPlans';
import type { TrainingCopy, TrainingPlan, TrainingSave } from '../trainingPlans';
import { newRecordId } from '../recordId';
import { demoExercisesRepository } from './exercisesRepository';

export interface TrainingRepository {
  load(teamId: string): Promise<TrainingPlan[]>;
  save(teamId: string, request: TrainingSave): Promise<TrainingPlan>;
  copy(teamId: string, request: TrainingCopy): Promise<TrainingPlan>;
}
export class TrainingSetupRequired extends Error {
  constructor() { super('Falta activar la planificación de entrenamientos en Supabase.'); this.name = 'TrainingSetupRequired'; }
}
export class TrainingCopySetupRequired extends Error {
  constructor() { super('Falta activar la duplicación de entrenamientos en Supabase.'); this.name = 'TrainingCopySetupRequired'; }
}
const storageKey = '@inter-playa-honda/demo-training-plans/v1';
function requireDemoTeam(teamId: string) { if (teamId !== 'demo-team') throw new Error('Equipo no disponible.'); }
export const demoTrainingRepository: TrainingRepository = {
  async load(teamId) {
    requireDemoTeam(teamId);
    return parseTrainingPlans(await AsyncStorage.getItem(storageKey));
  },
  async save(teamId, request) {
    requireDemoTeam(teamId);
    const plans = await this.load(teamId);
    const previous = plans.find(plan => plan.id === request.id);
    if ((previous?.revision ?? 0) !== request.revision) throw new Error('El entrenamiento ha cambiado. Cierra el editor y actualiza los entrenamientos antes de editarlo.');
    const { exercises } = await demoExercisesRepository.load();
    const entries = request.entries.map(entry => {
      const old = previous?.entries.find(item => item.id === entry.id);
      if (old) {
        if (old.exerciseId !== entry.exerciseId || old.exerciseRevision !== entry.exerciseRevision) throw new Error('No se puede cambiar el origen de un bloque guardado.');
        return { ...old, duration: entry.duration };
      }
      const source = exercises.find(item => item.id === entry.exerciseId && !item.archivedAt);
      if (!source) throw new Error('El ejercicio ya no está disponible en la biblioteca.');
      if (source.revision !== entry.exerciseRevision) throw new Error('Una ficha ha cambiado. Actualiza la biblioteca y quita y vuelve a añadir ese ejercicio.');
      return { ...entryFromExercise(source, entry.id), duration: entry.duration };
    });
    const input = validateTraining(trainingDraft({ ...request, entries }));
    const saved: TrainingPlan = { ...previous, ...input, id: request.id, teamId, createdBy: previous?.createdBy ?? 'demo-coach', revision: request.revision + 1,
      archivedAt: request.archived ? previous?.archivedAt ?? new Date().toISOString() : null };
    await AsyncStorage.setItem(storageKey, JSON.stringify(previous ? plans.map(item => item.id === saved.id ? saved : item) : [...plans, saved]));
    return saved;
  },
  async copy(teamId, request) {
    const clean = validateTrainingCopy(request), plans = await this.load(teamId);
    const target = plans.find(plan => plan.id === clean.id);
    if (target) {
      if (target.copiedFrom === clean.sourceId && target.copiedFromRevision === clean.sourceRevision && target.revision === 1 && target.title === clean.title && target.date === clean.date) return target;
      throw new Error('La copia ya ha cambiado. Actualiza los entrenamientos antes de duplicar.');
    }
    const source = plans.find(plan => plan.id === clean.sourceId);
    if (!source) throw new Error('No se encontró el entrenamiento original. Actualiza la lista.');
    const saved = cloneTrainingPlan(source, clean, 'demo-coach', newRecordId);
    await AsyncStorage.setItem(storageKey, JSON.stringify([...plans, saved]));
    return saved;
  },
};
function check(error: { code?: string } | null) {
  if (error && ['PGRST205', 'PGRST202', '42P01', '42883'].includes(error.code ?? '')) throw new TrainingSetupRequired();
  if (error?.code === '40001') throw new Error('El entrenamiento ha cambiado. Cierra el editor y actualiza los entrenamientos antes de editarlo.');
  if (error?.code === 'P0002') throw new Error('Una ficha ha cambiado. Actualiza la biblioteca y quita y vuelve a añadir ese ejercicio.');
  if (error?.code === '42501') throw new Error('Tu cuenta no tiene permiso para gestionar los entrenamientos de este equipo.');
  if (error && ['22023', '23514', '23502', '22P02', '22003'].includes(error.code ?? '')) throw new Error('Revisa la fecha, los jugadores y las duraciones. Los ejercicios nuevos deben seguir activos en la biblioteca.');
  if (error) throw new Error('No se pudo guardar o consultar el entrenamiento. Revisa la conexión e inténtalo de nuevo.');
}
type RemotePlan = { id: string; team_id: string; created_by: string | null; revision: number; archived_at: string | null;
  training_date: string; title: string; player_count: number; notes: string; entries: TrainingPlan['entries'] };
function fromRemote(row: RemotePlan): TrainingPlan {
  return { id: row.id, teamId: row.team_id, createdBy: row.created_by, revision: row.revision, archivedAt: row.archived_at,
    date: row.training_date, title: row.title, playerCount: row.player_count, notes: row.notes, entries: row.entries };
}
export function remoteTrainingRepository(client: SupabaseClient): TrainingRepository {
  return {
    async load(teamId) {
      const plans: TrainingPlan[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await client.from('training_plans').select('id,team_id,created_by,revision,archived_at,training_date,title,player_count,notes,entries')
          .eq('team_id', teamId).order('training_date', { ascending: false }).order('id').range(offset, offset + 499);
        check(result.error);
        const rows = (result.data ?? []) as RemotePlan[];
        plans.push(...rows.map(fromRemote));
        if (rows.length < 500) return plans;
      }
    },
    async save(teamId, request) {
      const result = await client.rpc('save_training_plan', { p_team: teamId, p_id: request.id, p_revision: request.revision,
        p_date: request.date, p_title: request.title, p_player_count: request.playerCount, p_notes: request.notes,
        p_archived: request.archived, p_entries: request.entries.map(entry => ({ id: entry.id, exerciseId: entry.exerciseId, exerciseRevision: entry.exerciseRevision, duration: entry.duration })) });
      check(result.error);
      if (!result.data || result.data.id !== request.id || result.data.team_id !== teamId) throw new Error('No se pudo confirmar el guardado del entrenamiento.');
      return fromRemote(result.data as RemotePlan);
    },
    async copy(teamId, request) {
      const clean = validateTrainingCopy(request);
      const result = await client.rpc('copy_training_plan', { p_team: teamId, p_source: clean.sourceId,
        p_source_revision: clean.sourceRevision, p_id: clean.id, p_date: clean.date, p_title: clean.title });
      if (result.error && ['PGRST202', '42883', '42703'].includes(result.error.code ?? '')) throw new TrainingCopySetupRequired();
      if (result.error?.code === '40001') throw new Error('El entrenamiento original o la copia ha cambiado. Cierra esta ventana y actualiza los entrenamientos antes de duplicar.');
      check(result.error);
      if (!result.data || result.data.id !== clean.id || result.data.team_id !== teamId) throw new Error('No se pudo confirmar la copia del entrenamiento.');
      return fromRemote(result.data as RemotePlan);
    },
  };
}
