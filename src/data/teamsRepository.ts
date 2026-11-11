import type { SupabaseClient } from '@supabase/supabase-js';
import { validateTeamCategory } from '../teams';
import type { Team } from '../teams';
type RemoteTeam = { id: string; name: string; category?: unknown };

export async function loadTeams(client: SupabaseClient): Promise<{ teams: Team[]; teamCategoriesReady: boolean }> {
  const teams: Team[] = [];
  let teamCategoriesReady = true;
  for (let offset = 0; ; offset += 500) {
    let result = await client.from('teams').select(teamCategoriesReady ? 'id,name,category' : 'id,name').order('name').order('id').range(offset, offset + 499).returns<RemoteTeam[]>();
    if (teamCategoriesReady && result.error && ['42703', 'PGRST204'].includes(result.error.code)) {
      teamCategoriesReady = false;
      result = await client.from('teams').select('id,name').order('name').order('id').range(offset, offset + 499).returns<RemoteTeam[]>();
    }
    if (result.error) throw new Error('No se pudieron consultar los equipos. Revisa la conexión y tus permisos.');
    const rows = result.data ?? [];
    teams.push(...rows.map(row => ({ id: row.id, name: row.name, ...(teamCategoriesReady && row.category !== undefined ? { category: validateTeamCategory(row.category) } : {}) })));
    if (rows.length < 500) return { teams, teamCategoriesReady };
  }
}
