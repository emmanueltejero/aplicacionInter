import type { SupabaseClient } from '@supabase/supabase-js';
import { TeamManagementSetupRequired, validateTeamName } from '../teams';
import type { Team } from '../teams';
import { teamFromRemote } from './teamsRepository';
function check(error: { code?: string } | null) {
  if (!error) return;
  if (['PGRST202', '42883'].includes(error.code ?? '')) throw new TeamManagementSetupRequired();
  if (error.code==='40001') throw new Error('Otro administrador ha cambiado el equipo. Cierra el formulario y pulsa Actualizar usuarios antes de editarlo.');
  if (error.code==='42501') throw new Error('Solo los administradores activos pueden gestionar equipos.');
  if (error.code==='23505') throw new Error('Ya existe un equipo con ese nombre, incluidos los archivados.');
  if (error.code==='55000' || error.code==='23503') throw new Error('El equipo tiene jugadores o historial. Archívalo para conservar sus datos.');
  if (error.code==='22023') throw new Error('Revisa el nombre y actualiza los equipos.');
  throw new Error('No se pudo confirmar el cambio. Reintenta con los mismos datos o actualiza los usuarios.');
}
export async function renameTeam(client: SupabaseClient, team: Team, name: string) {
  const clean = validateTeamName(name);
  const result = await client.rpc('admin_rename_team', { p_team: team.id, p_name: clean, p_revision: team.revision }); check(result.error);
  if (result.data?.id !== team.id || result.data?.name !== clean) throw new Error('No se pudo confirmar el nuevo nombre. Actualiza los usuarios.');
  return teamFromRemote(result.data);
}
export async function archiveTeam(client: SupabaseClient, team: Team, archived: boolean) {
  const result = await client.rpc('admin_archive_team', { p_team: team.id, p_archived: archived, p_revision: team.revision }); check(result.error);
  if (result.data?.id !== team.id || Boolean(result.data?.archived_at) !== archived) throw new Error('No se pudo confirmar el estado del equipo. Actualiza los usuarios.');
  return teamFromRemote(result.data);
}
export async function deleteEmptyTeam(client: SupabaseClient, team: Team) {
  const result = await client.rpc('admin_delete_empty_team', { p_team: team.id, p_revision: team.revision, p_name: team.name }); check(result.error);
  if (result.data !== team.id) throw new Error('No se pudo confirmar la eliminación. Actualiza los usuarios antes de reintentar.');
}
