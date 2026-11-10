import type { SupabaseClient } from '@supabase/supabase-js';
import { UsersRequestFailure, UsersSetupRequired, userCreationFailure, validateCoachAccount } from '../clubUsers';
import type { ClubUser, CoachAccountDraft, CoachAccountResult } from '../clubUsers';

export interface UsersRepository {
  isAdmin(): Promise<boolean>;
  load(): Promise<{ users: ClubUser[]; teams: { id: string; name: string }[] }>;
  create(draft: CoachAccountDraft): Promise<CoachAccountResult>;
  createTeam(id: string, name: string): Promise<{ id: string; name: string }>;
}
export const demoUsersRepository: UsersRepository = {
  async isAdmin() { return false; },
  async load() { throw new Error('La demo no gestiona cuentas reales.'); },
  async create() { throw new Error('La demo no gestiona cuentas reales.'); },
  async createTeam() { throw new Error('La demo no gestiona cuentas reales.'); },
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
      const teams = await client.from('teams').select('id,name').order('name'); check(teams.error);
      const users: ClubUser[] = [];
      for (let offset = 0; ; offset += 100) {
        const result = await client.rpc('admin_list_users', { p_offset: offset, p_limit: 100 }); check(result.error);
        const rows = (result.data ?? []) as { user_id: string; email: string; display_name: string; role: 'coach' | 'admin'; enabled: boolean; team_ids: string[] }[];
        users.push(...rows.map(row => ({ id: row.user_id, email: row.email, name: row.display_name, role: row.role, enabled: row.enabled, teamIds: row.team_ids })));
        if (rows.length < 100) return { users, teams: teams.data ?? [] };
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
    async createTeam(id, name) {
      const result = await client.rpc('admin_create_team', { p_id: id, p_name: name.trim().replace(/\s+/g, ' ') });
      check(result.error);
      if (result.data?.id !== id) throw new Error('No se pudo confirmar el equipo. Reintenta con el mismo nombre.');
      return result.data;
    },
  };
}
