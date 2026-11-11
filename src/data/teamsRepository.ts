import type { SupabaseClient } from '@supabase/supabase-js';
import { validateTeamCategory } from '../teams';
import type { Team } from '../teams';
type RemoteTeam = { id: string; name: string; category?: unknown; archived_at?: string | null; revision?: number };
export function teamFromRemote(row: RemoteTeam): Team {
  return { id: row.id, name: row.name, ...(row.category !== undefined ? { category: validateTeamCategory(row.category) } : {}),
    ...(row.archived_at !== undefined ? { archivedAt: row.archived_at } : {}), ...(row.revision !== undefined ? { revision: row.revision } : {}) };
}

export async function loadTeams(client: SupabaseClient): Promise<{ teams: Team[]; teamCategoriesReady: boolean; teamManagementReady: boolean }> {
  const teams: Team[] = [];
  let teamCategoriesReady = true;
  let teamManagementReady = true;
  for (let offset = 0; ; offset += 500) {
    let result = await client.from('teams').select(`id,name${teamCategoriesReady ? ',category' : ''}${teamManagementReady ? ',archived_at,revision' : ''}`).order('name').order('id').range(offset, offset + 499).returns<RemoteTeam[]>();
    if (teamManagementReady && result.error && ['42703', 'PGRST204'].includes(result.error.code)) {
      teamManagementReady = false;
      result = await client.from('teams').select(teamCategoriesReady ? 'id,name,category' : 'id,name').order('name').order('id').range(offset, offset + 499).returns<RemoteTeam[]>();
    }
    if (teamCategoriesReady && result.error && ['42703', 'PGRST204'].includes(result.error.code)) {
      teamCategoriesReady = false;
      result = await client.from('teams').select('id,name').order('name').order('id').range(offset, offset + 499).returns<RemoteTeam[]>();
    }
    if (result.error) throw new Error('No se pudieron consultar los equipos. Revisa la conexión y tus permisos.');
    const rows = result.data ?? [];
    teams.push(...rows.map(teamFromRemote));
    if (rows.length < 500) return { teams, teamCategoriesReady, teamManagementReady };
  }
}
