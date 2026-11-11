import type { SupabaseClient } from '@supabase/supabase-js';
import { UsersRequestFailure, UsersSetupRequired, userCreationFailure, validateCoachAccount, validateCoachAccess } from '../clubUsers';
import type { ClubUser, CoachAccountDraft, CoachAccountResult, CoachAccessResult, CoachAccessUpdate } from '../clubUsers';
import { TeamCategoriesSetupRequired, validateTeamCategory } from '../teams';
import type { Team } from '../teams';
import type { ExerciseTeamCategory } from '../exercises';
import { loadTeams } from './teamsRepository';
import { loadExerciseReviewers, setExerciseReviewer } from './exerciseReviewersRepository';

export interface UsersRepository {
  isAdmin(): Promise<boolean>;
  load(): Promise<{ users: ClubUser[]; teams: Team[]; teamCategoriesReady: boolean; exerciseReviewersReady: boolean }>;
  create(draft: CoachAccountDraft): Promise<CoachAccountResult>;
  createTeam(id: string, name: string, category?: ExerciseTeamCategory | null): Promise<Team>;
  setTeamCategory(team: Team, category: ExerciseTeamCategory | null): Promise<Team>;
  setExerciseReviewer(user: ClubUser, allowed: boolean): Promise<void>;
  updateAccess(request: CoachAccessUpdate): Promise<CoachAccessResult>;
}
export const demoUsersRepository: UsersRepository = {
  async isAdmin() { return false; },
  async load() { throw new Error('La demo no gestiona cuentas reales.'); },
  async create() { throw new Error('La demo no gestiona cuentas reales.'); },
  async createTeam() { throw new Error('La demo no gestiona cuentas reales.'); },
  async setTeamCategory() { throw new Error('La demo no gestiona cuentas reales.'); },
  async setExerciseReviewer() { throw new Error('La demo no gestiona cuentas reales.'); },
  async updateAccess() { throw new Error('La demo no gestiona cuentas reales.'); },
};
function check(error: { code?: string } | null) {
  if (error && ['PGRST202', '42883', '42P01'].includes(error.code ?? '')) throw new UsersSetupRequired('database');
  if (error?.code === '42501') throw userCreationFailure('FORBIDDEN');
  if (error?.code === '23505') throw new Error('Ya existe un equipo con ese nombre.');
  if (error) throw new Error('No se pudieron consultar o guardar los usuarios y equipos. Revisa la conexión y tus permisos.');
}
export function remoteUsersRepository(client: SupabaseClient): UsersRepository {
  return {
    async isAdmin() {
      const result = await client.rpc('is_club_admin');
      check(result.error); return result.data === true;
    },
    async load() {
      const ready = await client.rpc('admin_user_setup_ready'); check(ready.error);
      if (ready.data !== 1) throw new UsersSetupRequired('database');
      const { teams, teamCategoriesReady } = await loadTeams(client);
      const { reviewers, exerciseReviewersReady } = await loadExerciseReviewers(client);
      const users: ClubUser[] = [];
      for (let offset = 0; ; offset += 100) {
        const result = await client.rpc('admin_list_users', { p_offset: offset, p_limit: 100 }); check(result.error);
        const rows = (result.data ?? []) as { user_id: string; email: string; display_name: string; role: 'coach' | 'admin'; enabled: boolean; team_ids: string[] }[];
        users.push(...rows.map(row => ({ id: row.user_id, email: row.email, name: row.display_name, role: row.role, enabled: row.enabled, teamIds: row.team_ids, ...(exerciseReviewersReady ? { canReviewExercises: reviewers.get(row.user_id) ?? false } : {}) })));
        if (rows.length < 100) return { users, teams, teamCategoriesReady, exerciseReviewersReady };
      }
    },
    async create(draft) {
      const clean = validateCoachAccount(draft);
      let result;
      try { result = await client.functions.invoke('club-users', { body: { action: 'create', requestId: clean.id, email: clean.email, name: clean.name, password: clean.password, teamIds: clean.teamIds } }); }
      catch { throw userCreationFailure('NETWORK'); }
      if (result.error) {
        const response = result.error.context;
        if (response instanceof Response) {
          const data = await response.json().catch(() => null);
          if (response.status === 404) throw new UsersSetupRequired('function');
          if (response.status === 401) throw userCreationFailure('SESSION_INVALID');
          throw userCreationFailure(typeof data?.error?.code === 'string' ? data.error.code : 'NETWORK');
        }
        throw new UsersRequestFailure('No se pudo confirmar el alta. Reintenta con los mismos datos o actualiza la lista para comprobar si se creó.', true);
      }
      if (result.data?.id !== clean.id || result.data?.email !== clean.email || typeof result.data?.replayed !== 'boolean') throw userCreationFailure('NETWORK');
      return { id: result.data.id, email: result.data.email, replayed: result.data.replayed };
    },
    async createTeam(id, name, category) {
      const clean = name.trim().replace(/\s+/g, ' ');
      const result = category === undefined
        ? await client.rpc('admin_create_team', { p_id: id, p_name: clean })
        : await client.rpc('admin_create_team_with_category', { p_id: id, p_name: clean, p_category: validateTeamCategory(category) });
      if (category !== undefined && result.error && ['PGRST202', '42883'].includes(result.error.code ?? '')) throw new TeamCategoriesSetupRequired();
      if (result.error?.code === '40001') throw new Error('El equipo ya existe con otros datos. Actualiza los usuarios antes de editarlo.');
      check(result.error);
      if (result.data?.id !== id || result.data?.name !== clean || (category !== undefined && result.data?.category !== category)) throw new Error('No se pudo confirmar el equipo. Reintenta con los mismos datos.');
      return result.data;
    },
    async setTeamCategory(team, category) {
      const clean = validateTeamCategory(category);
      const result = await client.rpc('admin_set_team_category', { p_team: team.id, p_category: clean, p_expected_category: team.category ?? null });
      if (result.error && ['PGRST202', '42883'].includes(result.error.code ?? '')) throw new TeamCategoriesSetupRequired();
      if (result.error?.code === '40001') throw new Error('Otro administrador ha cambiado la categoría. Cierra el formulario y pulsa Actualizar usuarios antes de editarla.');
      if (result.error?.code === '42501') throw new Error('Solo un administrador activo puede cambiar la categoría de un equipo.');
      if (result.error && ['22023', '22P02', '23514'].includes(result.error.code ?? '')) throw new Error('Revisa el equipo y la categoría seleccionados.');
      if (result.error || result.data?.id !== team.id || result.data?.category !== clean) throw new Error('No se pudo confirmar la categoría. Revisa la conexión y reintenta con los mismos datos.');
      return result.data;
    },
    async setExerciseReviewer(user, allowed) { await setExerciseReviewer(client, user.id, allowed, user.canReviewExercises === true); },
    async updateAccess(request) {
      const clean = validateCoachAccess(request);
      const result = await client.rpc('admin_update_coach_access', { p_user: clean.id, p_enabled: clean.enabled,
        p_team_ids: clean.teamIds, p_expected_enabled: clean.expectedEnabled, p_expected_team_ids: clean.expectedTeamIds });
      if (result.error && ['PGRST202', '42883'].includes(result.error.code ?? '')) throw new Error('Falta activar la edición del acceso en Supabase. Ejecuta el SQL 202611100005_coach_access.sql.');
      if (result.error?.code === '40001') throw new Error('Otro administrador ha cambiado el acceso de este entrenador. Cierra el formulario y pulsa Actualizar usuarios antes de editarlo.');
      if (result.error?.code === '42501') throw new Error('Solo un administrador activo puede cambiar el acceso de las cuentas de entrenador.');
      if (result.error && ['22023', '22P02', '23503'].includes(result.error.code ?? '')) throw new Error('El entrenador o alguno de sus equipos ha cambiado. Actualiza los usuarios y revisa la selección.');
      if (result.error) throw new Error('No se pudo confirmar el cambio de acceso. Reintenta con los mismos datos o actualiza la lista.');
      if (result.data?.user_id !== clean.id || result.data?.enabled !== clean.enabled || !Array.isArray(result.data?.team_ids)
        || JSON.stringify([...result.data.team_ids].sort()) !== JSON.stringify(clean.teamIds)) throw new Error('No se pudo confirmar el cambio de acceso. Actualiza los usuarios.');
      return { id: result.data.user_id, enabled: result.data.enabled, teamIds: result.data.team_ids };
    },
  };
}
