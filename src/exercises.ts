import { exerciseMediaFields } from './exerciseMedia.ts';
export const exerciseCategories = ['Calentamiento', 'Técnica', 'Táctica', 'Posesión', 'Finalización', 'Defensa', 'Preparación física', 'Porteros'] as const;
export type ExerciseCategory = typeof exerciseCategories[number];
export const exerciseTeamCategories = ['Minis', 'Prebenjamín', 'Benjamín', 'Alevín', 'Infantil', 'Cadete', 'Juvenil', 'Femenino', 'Regional'] as const;
export type ExerciseTeamCategory = typeof exerciseTeamCategories[number];
export type ExerciseTeamCategoryFilter = ExerciseTeamCategory | '' | 'unclassified';
export type Material = { name: string; quantity: number };
export type ExerciseInput = {
  title: string; description: string; categories: ExerciseCategory[]; duration: number;
  minPlayers: number; maxPlayers: number; spaceLength: number; spaceWidth: number; materials: Material[];
  imagePath?: string | null; videoUrl?: string | null;
};
export type Exercise = ExerciseInput & {
  id: string; createdBy: string | null; revision: number; archivedAt: string | null; teamCategories?: ExerciseTeamCategory[];
};
export type ExerciseViewer = { id: string; admin: boolean };
export type ExerciseDraft = Omit<ExerciseInput, 'duration' | 'minPlayers' | 'maxPlayers' | 'spaceLength' | 'spaceWidth' | 'materials'> & {
  duration: string; minPlayers: string; maxPlayers: string; spaceLength: string; spaceWidth: string;
  materials: { name: string; quantity: string }[];
  teamCategories?: ExerciseTeamCategory[];
};
export function validateExerciseTeamCategories(value: unknown): ExerciseTeamCategory[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > exerciseTeamCategories.length || new Set(value).size !== value.length
    || value.some(item => !exerciseTeamCategories.includes(item))) throw new Error('Revisa las categorías de equipo: elige categorías válidas sin repetir.');
  return exerciseTeamCategories.filter(item => value.includes(item));
}
export function canEditExercise(exercise: Exercise, viewer: ExerciseViewer) {
  return viewer.admin || exercise.createdBy === viewer.id;
}
export function exerciseDraft(exercise?: Exercise): ExerciseDraft {
  return exercise ? { ...exercise, teamCategories: exercise.teamCategories === undefined ? [] : [...validateExerciseTeamCategories(exercise.teamCategories)], duration: String(exercise.duration), minPlayers: String(exercise.minPlayers), maxPlayers: String(exercise.maxPlayers), spaceLength: String(exercise.spaceLength), spaceWidth: String(exercise.spaceWidth), materials: exercise.materials.map(item => ({ ...item, quantity: String(item.quantity) })) }
    : { title: '', description: '', categories: [], teamCategories: [], imagePath: null, videoUrl: '', duration: '', minPlayers: '', maxPlayers: '', spaceLength: '', spaceWidth: '', materials: [] };
}
const clean = (value: string) => value.trim().replace(/\s+/g, ' ');
function integer(value: string, max: number, label: string) {
  if (!/^\d+$/.test(value.trim()) || Number(value) < 1 || Number(value) > max) throw new Error(`${label}: escribe un número entero entre 1 y ${max}.`);
  return Number(value);
}
export function validateExercise(draft: ExerciseDraft): ExerciseInput {
  const title = clean(draft.title), description = draft.description.trim();
  if (!title || title.length > 100) throw new Error('Escribe un nombre de entre 1 y 100 caracteres.');
  if (!description || description.length > 5000) throw new Error('Describe el ejercicio en un máximo de 5000 caracteres.');
  if (!draft.categories.length || new Set(draft.categories).size !== draft.categories.length || draft.categories.some(value => !exerciseCategories.includes(value))) throw new Error('Elige al menos una categoría válida sin repetir.');
  validateExerciseTeamCategories(draft.teamCategories);
  const duration = integer(draft.duration, 240, 'Duración en minutos');
  const minPlayers = integer(draft.minPlayers, 100, 'Mínimo de jugadores');
  const maxPlayers = integer(draft.maxPlayers, 100, 'Máximo de jugadores');
  if (minPlayers > maxPlayers) throw new Error('El máximo de jugadores debe ser igual o mayor que el mínimo.');
  const spaceLength = integer(draft.spaceLength, 150, 'Largo del espacio en metros');
  const spaceWidth = integer(draft.spaceWidth, 150, 'Ancho del espacio en metros');
  if (draft.materials.length > 30) throw new Error('Puedes añadir hasta 30 tipos de material.');
  const names = new Set<string>();
  const materials = draft.materials.map(item => {
    const name = clean(item.name), key = name.toLocaleLowerCase('es');
    if (!name || name.length > 60) throw new Error('Escribe el nombre de cada material (máximo 60 caracteres).');
    if (names.has(key)) throw new Error('Agrupa las cantidades de un mismo material en una sola fila.');
    names.add(key);
    return { name, quantity: integer(item.quantity, 1000, `Cantidad de ${name}`) };
  });
  return { title, description, categories: [...draft.categories], duration, minPlayers, maxPlayers, spaceLength, spaceWidth, materials, ...exerciseMediaFields(draft) };
}
export const normalizeExerciseSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
export function filterExercises(exercises: Exercise[], query: string, category: ExerciseCategory | '', includeArchived: boolean, teamCategory: ExerciseTeamCategoryFilter = '') {
  const terms = normalizeExerciseSearch(query).trim().split(/\s+/).filter(Boolean);
  return exercises.filter(exercise => {
    if ((!includeArchived && exercise.archivedAt) || (category && !exercise.categories.includes(category))) return false;
    const recommended = exercise.teamCategories ?? [];
    if (teamCategory === 'unclassified' ? recommended.length > 0 : teamCategory && !recommended.includes(teamCategory)) return false;
    const text = normalizeExerciseSearch([exercise.title, exercise.description, ...exercise.categories, ...recommended, ...exercise.materials.map(item => item.name)].join(' '));
    return terms.every(term => text.includes(term));
  }).sort((a, b) => a.title.localeCompare(b.title, 'es') || a.id.localeCompare(b.id));
}
export function recommendedExercisesFirst(exercises: Exercise[], category?: ExerciseTeamCategory | null): Exercise[] {
  if (!category) return exercises;
  return [...exercises].sort((a, b) => Number(b.teamCategories?.includes(category) ?? false) - Number(a.teamCategories?.includes(category) ?? false));
}
export function parseExercises(value: string | null): Exercise[] {
  if (value === null) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('No se pudieron leer los ejercicios guardados.');
  const ids = new Set<string>();
  for (const item of parsed) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)
      || (item.createdBy !== null && typeof item.createdBy !== 'string') || !Number.isInteger(item.revision) || item.revision < 1
      || (item.archivedAt !== null && (typeof item.archivedAt !== 'string' || !Number.isFinite(Date.parse(item.archivedAt))))
      || typeof item.title !== 'string' || typeof item.description !== 'string' || !Array.isArray(item.categories)
      || !Array.isArray(item.materials) || item.materials.some((material: Material) => !material || typeof material.name !== 'string' || !Number.isInteger(material.quantity))
      || ['duration', 'minPlayers', 'maxPlayers', 'spaceLength', 'spaceWidth'].some(key => !Number.isInteger(item[key]))) throw new Error('No se pudieron leer los ejercicios guardados.');
    validateExercise(exerciseDraft(item));
    ids.add(item.id);
  }
  return parsed as Exercise[];
}
