import { exerciseTeamCategories } from './exercises.ts';
import type { ExerciseTeamCategory } from './exercises.ts';

// Undefined indicates the category extension is not yet available; null is unassigned.
export type Team = { id: string; name: string; category?: ExerciseTeamCategory | null; archivedAt?: string | null; revision?: number };
export function validateTeamName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 80) throw new Error('Escribe un nombre de entre 1 y 80 caracteres.');
  return name;
}
export class TeamManagementSetupRequired extends Error {
  constructor() { super('Falta activar la edición y archivo de equipos en Supabase.'); this.name = 'TeamManagementSetupRequired'; }
}
export function validateTeamCategory(value: unknown): ExerciseTeamCategory | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !exerciseTeamCategories.includes(value as ExerciseTeamCategory)) throw new Error('Elige una categoría válida para el equipo.');
  return value as ExerciseTeamCategory;
}
export class TeamCategoriesSetupRequired extends Error {
  constructor() { super('Falta activar las categorías de los equipos. Ejecuta 202611110003_team_categories.sql en Supabase y actualiza los usuarios.'); this.name = 'TeamCategoriesSetupRequired'; }
}
