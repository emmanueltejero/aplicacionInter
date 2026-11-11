import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { TeamManagementSetupRequired, validateTeamName } from '../teams';
import type { Team } from '../teams';
import { trainingStyles as s } from './trainingStyles';

export type TeamAction = 'rename' | 'archive' | 'restore' | 'delete';
export function TeamManagementSetup() {
  const [error, setError] = useState('');
  return <View style={s.container}><Text style={s.warningText}>El administrador debe activar la edición, archivo y eliminación de equipos en Supabase. Después, pulsa «Actualizar usuarios».</Text>
    <Pressable accessibilityRole="link" style={s.secondary} onPress={() => { void Linking.openURL('https://github.com/emmanueltejero/aplicacionInter/blob/main/supabase/migrations/202611110005_team_management.sql').catch(() => setError('Busca supabase/migrations/202611110005_team_management.sql en GitHub.')); }}><Text style={s.blue}>Abrir SQL de gestión de equipos</Text></Pressable>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>;
}
export function TeamManagementDialog({ team, action, busy, onSave, onClose }: { team: Team; action: TeamAction; busy: boolean; onSave: (name: string) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(team.name), [confirmation, setConfirmation] = useState(''), [error, setError] = useState(''), [setup, setSetup] = useState(false);
  const title = { rename: 'Cambiar nombre del equipo', archive: 'Archivar equipo', restore: 'Restaurar equipo', delete: 'Eliminar equipo vacío' }[action];
  async function save() {
    if (busy || (action === 'delete' && confirmation !== team.name)) return;
    setError(''); setSetup(false);
    try { await onSave(action === 'rename' ? validateTeamName(name) : team.name); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo confirmar el cambio.'); setSetup(cause instanceof TeamManagementSetupRequired); }
  }
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}><View style={s.overlay}><View style={s.modal}><ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
    <Text style={s.title}>{title}</Text><Text style={s.subtitle}>{team.name}</Text>
    {action === 'rename' ? <><Text style={s.text}>Se conserva el equipo con sus entrenadores, jugadores e historial.</Text><TextInput accessibilityLabel="Nuevo nombre del equipo" style={s.input} value={name} onChangeText={setName} editable={!busy} maxLength={80} /></>
      : action === 'archive' ? <Text style={s.text}>Se ocultará de la selección habitual y quedará en modo consulta. Se conservan los jugadores, la asistencia, los partidos, los entrenamientos y sus entrenadores. Podrás restaurarlo.</Text>
        : action === 'restore' ? <Text style={s.text}>Volverá a aparecer en la selección habitual y sus entrenadores podrán trabajar con sus datos.</Text>
          : <><Text style={s.warningText}>Solo se eliminará si no tiene jugadores ni historial, incluidos los datos archivados. Se quitarán sus asignaciones a entrenadores; las cuentas se conservan. Esta eliminación es definitiva.</Text><Text style={s.label}>Escribe el nombre exacto del equipo para confirmar</Text><TextInput accessibilityLabel="Confirmar nombre del equipo a eliminar" style={s.input} value={confirmation} onChangeText={setConfirmation} editable={!busy} autoCorrect={false} autoCapitalize="none" /></>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}{setup && <TeamManagementSetup />}
    <Pressable accessibilityRole="button" style={s.primary} disabled={busy || (action === 'delete' && confirmation !== team.name)} onPress={() => void save()}><Text style={s.white}>{busy ? 'Guardando…' : action === 'rename' ? 'Guardar nombre' : title}</Text></Pressable>
    <Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={onClose}><Text style={s.blue}>Cancelar</Text></Pressable>
  </ScrollView></View></View></Modal>;
}
