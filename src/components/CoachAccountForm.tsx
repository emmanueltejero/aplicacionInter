import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { CoachAccountDraft } from '../clubUsers';
import { UsersRequestFailure, UsersSetupRequired, validateCoachAccount } from '../clubUsers';
import { newRecordId } from '../recordId';
import { trainingStyles as s } from './trainingStyles';

export function CoachAccountForm({ teams, busy, onCreate, onClose, onSetup }: {
  teams: { id: string; name: string }[]; busy: boolean; onCreate: (draft: CoachAccountDraft) => Promise<void>;
  onClose: () => void; onSetup: () => void;
}) {
  const [draft, setDraft] = useState<CoachAccountDraft>(() => ({ id: newRecordId(), name: '', email: '', password: '', teamIds: teams.length === 1 ? [teams[0].id] : [] }));
  const [confirmation, setConfirmation] = useState('');
  const [retry, setRetry] = useState<CoachAccountDraft | null>(null);
  const [error, setError] = useState('');
  const [setup, setSetup] = useState(false);
  const locked = busy || !!retry;
  async function create() {
    if (busy) return;
    let request: CoachAccountDraft | undefined;
    try {
      setError(''); setSetup(false);
      if (!retry && draft.password !== confirmation) throw new Error('Las contraseñas no coinciden.');
      request = retry ?? validateCoachAccount(draft);
      await onCreate(request);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar el alta.');
      setRetry(cause instanceof UsersRequestFailure && cause.retryable && request ? request : null);
      setSetup(cause instanceof UsersSetupRequired);
    }
  }
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}><View style={s.overlay}><View style={s.modal}><ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
    <Text style={s.title}>Añadir entrenador</Text>
    <Text style={s.text}>La cuenta tendrá acceso a los equipos seleccionados y a la biblioteca compartida. El entrenador entrará con el correo y la contraseña que indiques.</Text>
    <Text style={s.label}>Nombre</Text><TextInput accessibilityLabel="Nombre del entrenador" style={s.input} value={draft.name} onChangeText={name => setDraft({ ...draft, name })} editable={!locked} maxLength={80} />
    <Text style={s.label}>Correo electrónico</Text><TextInput accessibilityLabel="Correo del entrenador" style={s.input} value={draft.email} onChangeText={email => setDraft({ ...draft, email })} editable={!locked} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254} />
    <Text style={s.label}>Contraseña inicial</Text><TextInput accessibilityLabel="Contraseña del entrenador" style={s.input} value={draft.password} onChangeText={password => setDraft({ ...draft, password })} editable={!locked} secureTextEntry autoComplete="new-password" autoCapitalize="none" autoCorrect={false} maxLength={72} />
    <Text style={s.small}>Al menos 8 caracteres. Comparte las credenciales con el entrenador por un canal privado.</Text>
    <Text style={s.label}>Repetir contraseña</Text><TextInput accessibilityLabel="Confirmar contraseña del entrenador" style={s.input} value={confirmation} onChangeText={setConfirmation} editable={!locked} secureTextEntry autoComplete="new-password" autoCapitalize="none" autoCorrect={false} maxLength={72} />
    <Text style={s.subtitle}>Equipos asignados</Text>
    {teams.map(team => <Pressable key={team.id} accessibilityRole="checkbox" accessibilityLabel={`Asignar equipo ${team.name}`} accessibilityState={{ checked: draft.teamIds.includes(team.id) }} style={s.secondary} disabled={locked} onPress={() => setDraft({ ...draft, teamIds: draft.teamIds.includes(team.id) ? draft.teamIds.filter(id => id !== team.id) : [...draft.teamIds, team.id] })}><Text style={s.blue}>{draft.teamIds.includes(team.id) ? '☑' : '☐'} {team.name}</Text></Pressable>)}
    {!!retry && <Text style={s.warningText}>Los datos se conservan para reintentar el mismo alta. También puedes cerrar y actualizar la lista para comprobar si se creó.</Text>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {setup && <Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={onSetup}><Text style={s.blue}>Ver instrucciones de activación</Text></Pressable>}
    <Pressable accessibilityRole="button" style={s.primary} disabled={busy} onPress={() => void create()}><Text style={s.white}>{busy ? 'Creando cuenta…' : retry ? 'Reintentar alta' : 'Crear entrenador'}</Text></Pressable>
    <Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={onClose}><Text style={s.blue}>Cancelar</Text></Pressable>
  </ScrollView></View></View></Modal>;
}
