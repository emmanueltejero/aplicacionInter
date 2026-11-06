import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Player } from '../domain';
import { validatePlayer } from '../domain';

export function PlayerEditor({ player, roster, busy, onClose, onSave }: {
  player?: Player; roster: Player[]; busy: boolean;
  onClose: () => void; onSave: (data: { name: string; number: number }, id?: string) => Promise<void>;
}) {
  const [name, setName] = useState(player?.name ?? '');
  const [number, setNumber] = useState(player ? String(player.number) : '');
  const [error, setError] = useState('');
  async function save() {
    try { setError(''); await onSave(validatePlayer(name, number, roster, player?.id), player?.id); }
    catch (error) { setError(error instanceof Error ? error.message : 'No se pudo guardar.'); }
  }
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={s.overlay}><View style={s.card} accessibilityViewIsModal>
      <Text style={s.title}>{player ? 'Editar jugador' : 'Añadir jugador'}</Text>
      <Text style={s.label}>Nombre del jugador</Text><TextInput accessibilityLabel="Nombre del jugador" style={s.input} value={name} onChangeText={setName} maxLength={80} editable={!busy} autoCapitalize="words" />
      <Text style={s.label}>Dorsal (0–99)</Text><TextInput accessibilityLabel="Dorsal" style={s.input} value={number} onChangeText={setNumber} keyboardType="number-pad" maxLength={2} editable={!busy} />
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={busy} style={[s.button, busy && s.disabled]} onPress={() => void save()}><Text style={s.white}>{busy ? 'Guardando…' : 'Guardar jugador'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} style={s.cancel} onPress={onClose}><Text style={s.label}>Cancelar</Text></Pressable>
    </View></View>
  </Modal>;
}
const s = StyleSheet.create({ overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#10151D99' }, card: { width: '100%', maxWidth: 440, borderRadius: 16, padding: 24, backgroundColor: '#FFF' }, title: { fontSize: 21, color: '#17212D', fontWeight: '700', marginBottom: 16 }, label: { fontSize: 14, color: '#4F6880', marginBottom: 6 }, input: { minHeight: 48, borderWidth: 1, borderColor: '#DAE2EB', borderRadius: 8, padding: 12, marginBottom: 16, color: '#17212D' }, button: { minHeight: 48, borderRadius: 8, backgroundColor: '#176BA0', justifyContent: 'center', alignItems: 'center', marginTop: 8 }, white: { color: '#FFF', fontWeight: '700' }, cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, error: { color: '#A52D38', lineHeight: 20 }, disabled: { opacity: 0.6 } });
