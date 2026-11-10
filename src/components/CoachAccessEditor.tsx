import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { ClubUser, CoachAccessUpdate } from '../clubUsers';
import { validateCoachAccess } from '../clubUsers';
import { trainingStyles as s } from './trainingStyles';

const sqlUrl = 'https://github.com/emmanueltejero/aplicacionInter/blob/main/supabase/migrations/202611100005_coach_access.sql';
export function CoachAccessEditor({ user, teams, busy, onSave, onClose }: {
  user: ClubUser; teams: { id: string; name: string }[]; busy: boolean;
  onSave: (request: CoachAccessUpdate) => Promise<void>; onClose: () => void;
}) {
  const [enabled, setEnabled] = useState(user.enabled);
  const [teamIds, setTeamIds] = useState(() => [...user.teamIds]);
  const [error, setError] = useState('');
  async function save() {
    if (busy) return;
    try {
      setError('');
      await onSave(validateCoachAccess({ id: user.id, enabled, teamIds, expectedEnabled: user.enabled, expectedTeamIds: user.teamIds }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el acceso.'); }
  }
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}><View style={s.overlay}><View style={s.modal}><ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
    <Text style={s.title}>Equipos y acceso</Text><Text style={s.subtitle}>{user.name || user.email}</Text><Text style={s.text}>{user.email}</Text>
    <Pressable accessibilityRole="checkbox" accessibilityLabel="Acceso del entrenador activado" aria-checked={enabled} disabled={busy} style={s.secondary} onPress={() => setEnabled(value => !value)}><Text style={s.blue}>{enabled ? '☑' : '☐'} Acceso activado</Text></Pressable>
    <Text style={enabled ? s.text : s.warningText}>{enabled ? 'El entrenador podrá acceder a sus equipos y a la biblioteca compartida.' : 'Al guardar, el entrenador perderá el acceso a los datos del club. Su cuenta e historial se conservan y podrás reactivarlo.'}</Text>
    <Text style={s.subtitle}>Equipos asignados</Text>
    {!teams.length && <Text style={s.text}>Todavía no hay equipos creados.</Text>}
    {teams.map(team => <Pressable key={team.id} accessibilityRole="checkbox" accessibilityLabel={`Equipo asignado ${team.name}`} aria-checked={teamIds.includes(team.id)} disabled={busy} style={s.secondary} onPress={() => setTeamIds(current => current.includes(team.id) ? current.filter(id => id !== team.id) : [...current, team.id])}><Text style={s.blue}>{teamIds.includes(team.id) ? '☑' : '☐'} {team.name}</Text></Pressable>)}
    {!teamIds.length && <Text style={s.warningText}>Sin equipos asignados: si el acceso está activado, solo podrá utilizar la biblioteca compartida.</Text>}
    <Text style={s.small}>Los cambios se aplican al guardar. El entrenador verá sus equipos actualizados al recargar la aplicación.</Text>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {error.includes('202611100005_coach_access.sql') && <Pressable accessibilityRole="link" style={s.secondary} onPress={() => { void Linking.openURL(sqlUrl).catch(() => setError('No se pudo abrir GitHub. Busca supabase/migrations/202611100005_coach_access.sql en el repositorio.')); }}><Text style={s.blue}>Abrir SQL de edición de acceso</Text></Pressable>}
    <Pressable accessibilityRole="button" style={s.primary} disabled={busy} onPress={() => void save()}><Text style={s.white}>{busy ? 'Guardando…' : 'Guardar acceso'}</Text></Pressable>
    <Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={onClose}><Text style={s.blue}>Cancelar</Text></Pressable>
  </ScrollView></View></View></Modal>;
}
