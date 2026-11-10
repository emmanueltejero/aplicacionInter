import { isCalendarDate } from './attendanceReport.ts';
import { exerciseDraft, validateExercise } from './exercises.ts';
import type { Exercise, ExerciseInput, Material } from './exercises';

export type TrainingEntry = ExerciseInput & { id: string; exerciseId: string; exerciseRevision: number };
export type TrainingInput = { title: string; date: string; playerCount: number; notes: string; entries: TrainingEntry[] };
export type TrainingPlan = TrainingInput & { id: string; teamId: string; createdBy: string | null; revision: number; archivedAt: string | null; copiedFrom?: string; copiedFromRevision?: number };
export type TrainingDraft = Omit<TrainingInput, 'playerCount' | 'entries'> & { playerCount: string; entries: (Omit<TrainingEntry, 'duration'> & { duration: string })[] };
export type TrainingSave = TrainingInput & { id: string; revision: number; archived: boolean };
export type TrainingCopy = { id: string; sourceId: string; sourceRevision: number; date: string; title: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateTrainingCopy(request: TrainingCopy): TrainingCopy {
  const title = request.title.trim().replace(/\s+/g, ' ');
  if (!uuid.test(request.id) || !uuid.test(request.sourceId) || request.id === request.sourceId || !Number.isInteger(request.sourceRevision) || request.sourceRevision < 1) throw new Error('Revisa el entrenamiento que quieres duplicar.');
  if (!title || title.length > 100) throw new Error('Escribe un nombre de entre 1 y 100 caracteres para la copia.');
  if (!isCalendarDate(request.date) || request.date.startsWith('0000')) throw new Error('Introduce una fecha válida con el formato AAAA-MM-DD.');
  return { ...request, title };
}
export function cloneTrainingPlan(source: TrainingPlan, request: TrainingCopy, createdBy: string, nextId: () => string): TrainingPlan {
  const clean = validateTrainingCopy(request);
  if (source.id !== clean.sourceId || source.revision !== clean.sourceRevision) throw new Error('El entrenamiento ha cambiado. Actualiza los entrenamientos antes de duplicarlo.');
  return { ...source, id: clean.id, title: clean.title, date: clean.date, createdBy, revision: 1, archivedAt: null,
    copiedFrom: source.id, copiedFromRevision: source.revision,
    entries: source.entries.map(entry => ({ ...entry, id: nextId(), categories: [...entry.categories], materials: entry.materials.map(item => ({ ...item })) })),
  };
}
export function entryFromExercise(exercise: Exercise, id: string): TrainingEntry {
  return { ...validateExercise(exerciseDraft(exercise)), id, exerciseId: exercise.id, exerciseRevision: exercise.revision };
}
export function trainingDraft(plan: TrainingInput): TrainingDraft {
  return { ...plan, playerCount: String(plan.playerCount), entries: plan.entries.map(entry => ({ ...entry, duration: String(entry.duration) })) };
}
export function validateTraining(draft: TrainingDraft): TrainingInput {
  const title = draft.title.trim().replace(/\s+/g, ' '), notes = draft.notes.trim();
  if (!title || title.length > 100) throw new Error('Escribe un nombre de entre 1 y 100 caracteres para el entrenamiento.');
  if (!isCalendarDate(draft.date) || draft.date.startsWith('0000')) throw new Error('Introduce una fecha válida con el formato AAAA-MM-DD.');
  if (!/^\d+$/.test(draft.playerCount.trim()) || Number(draft.playerCount) < 1 || Number(draft.playerCount) > 100) throw new Error('Indica entre 1 y 100 jugadores previstos.');
  if (notes.length > 3000) throw new Error('Las notas pueden tener hasta 3000 caracteres.');
  if (!draft.entries.length || draft.entries.length > 50) throw new Error('Añade entre 1 y 50 ejercicios al entrenamiento.');
  const ids = new Set<string>();
  const entries = draft.entries.map(entry => {
    if (!uuid.test(entry.id) || !uuid.test(entry.exerciseId) || ids.has(entry.id) || !Number.isInteger(entry.exerciseRevision) || entry.exerciseRevision < 1) throw new Error('Revisa los ejercicios seleccionados.');
    ids.add(entry.id);
    const input = validateExercise(exerciseDraft({ ...entry, duration: 1, id: entry.exerciseId, createdBy: null, revision: entry.exerciseRevision, archivedAt: null }));
    if (!/^\d+$/.test(entry.duration.trim()) || Number(entry.duration) < 1 || Number(entry.duration) > 240) throw new Error(`Duración de ${input.title}: indica entre 1 y 240 minutos.`);
    return { ...input, duration: Number(entry.duration), id: entry.id, exerciseId: entry.exerciseId, exerciseRevision: entry.exerciseRevision };
  });
  if (entries.reduce((sum, entry) => sum + entry.duration, 0) > 600) throw new Error('El entrenamiento no puede superar los 600 minutos.');
  return { title, date: draft.date, playerCount: Number(draft.playerCount), notes, entries };
}
export function trainingTotals(entries: TrainingInput['entries'] | TrainingDraft['entries'], playerCount: number | null) {
  let elapsed: number | null = 0;
  const materials = new Map<string, Material>();
  const timeline = entries.map(entry => {
    const start = elapsed, duration = Number(entry.duration);
    const valid = /^\d+$/.test(String(entry.duration).trim()) && duration >= 1 && duration <= 240;
    elapsed = elapsed !== null && valid ? elapsed + duration : null;
    for (const material of entry.materials) {
      const key = material.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
      const previous = materials.get(key);
      if (!previous || previous.quantity < material.quantity) materials.set(key, { ...material });
    }
    return { id: entry.id, title: entry.title, start, end: elapsed };
  });
  const minPlayers = entries.length ? Math.max(...entries.map(entry => entry.minPlayers)) : null;
  const maxPlayers = entries.length ? Math.min(...entries.map(entry => entry.maxPlayers)) : null;
  const spaceLength = entries.length ? Math.max(...entries.map(entry => entry.spaceLength)) : 0;
  const spaceWidth = entries.length ? Math.max(...entries.map(entry => entry.spaceWidth)) : 0;
  return { minutes: elapsed, minPlayers, maxPlayers, spaceLength, spaceWidth, timeline,
    materials: [...materials.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    mismatches: playerCount === null ? [] : entries.filter(entry => playerCount < entry.minPlayers || playerCount > entry.maxPlayers).map(entry => ({ id: entry.id, title: entry.title, minPlayers: entry.minPlayers, maxPlayers: entry.maxPlayers })),
  };
}
export function filterTrainingPlans(plans: TrainingPlan[], from: string, to: string, includeArchived: boolean) {
  if ((from && !isCalendarDate(from)) || (to && !isCalendarDate(to))) throw new Error('Introduce fechas válidas con el formato AAAA-MM-DD.');
  if (from && to && from > to) throw new Error('La fecha inicial debe ser anterior o igual a la final.');
  return plans.filter(plan => (includeArchived || !plan.archivedAt) && (!from || plan.date >= from) && (!to || plan.date <= to))
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'es') || a.id.localeCompare(b.id));
}
export function parseTrainingPlans(value: string | null): TrainingPlan[] {
  if (value === null) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('No se pudieron leer los entrenamientos guardados.');
  const ids = new Set<string>();
  for (const plan of parsed) {
    if (!plan || typeof plan.id !== 'string' || !uuid.test(plan.id) || ids.has(plan.id) || typeof plan.teamId !== 'string'
      || (plan.createdBy !== null && typeof plan.createdBy !== 'string') || !Number.isInteger(plan.revision) || plan.revision < 1
      || (plan.archivedAt !== null && (typeof plan.archivedAt !== 'string' || !Number.isFinite(Date.parse(plan.archivedAt))))
      || typeof plan.title !== 'string' || typeof plan.date !== 'string' || typeof plan.notes !== 'string' || !Number.isInteger(plan.playerCount)
      || !Array.isArray(plan.entries) || plan.entries.some((entry: TrainingEntry) => !entry || !Number.isInteger(entry.duration))) throw new Error('No se pudieron leer los entrenamientos guardados.');
    validateTraining(trainingDraft(plan));
    ids.add(plan.id);
  }
  return parsed as TrainingPlan[];
}
