import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { dateKey, formatDateInput } from '../domain';
import type { Player } from '../domain';
import { newMatchId, validateMatch } from '../matches';
import type { Match, MatchDraft } from '../matches';

export function MatchEditor({ match, initialDate, roster, busy, onSave, onClose }: {
  match?: Match; initialDate?: string; roster: Player[]; busy: boolean; onSave: (match: Match) => Promise<void>; onClose: () => void;
}) {
  const [draft, setDraft] = useState<MatchDraft>(() => match ? { ...match, duration: String(match.duration), players: Object.fromEntries(match.players.map(item => [item.playerId, item.minutes === null ? '' : String(item.minutes)])) }
    : { id: newMatchId(), date: initialDate ?? dateKey(new Date()), opponent: '', duration: '60', venue: 'home', played: false, players: {} });
  const [error, setError] = useState('');
  const candidates = roster.filter(player => !player.archivedAt || match?.players.some(entry => entry.playerId === player.id));
  function toggle(playerId: string) {
    const players = { ...draft.players };
    if (Object.hasOwn(players, playerId)) delete players[playerId]; else players[playerId] = '';
    setDraft({ ...draft, players });
  }
  async function save() {
    if (busy) return;
    try { setError(''); await onSave(validateMatch(draft, roster, match, dateKey(new Date()))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el partido.'); }
  }
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={s.overlay}><View style={s.card}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>{match ? 'Editar partido' : 'Crear partido'}</Text>
      <Text style={s.label}>Rival</Text><TextInput accessibilityLabel="Rival" style={s.input} value={draft.opponent} onChangeText={opponent => setDraft({ ...draft, opponent })} maxLength={100} editable={!busy} />
      <View style={s.fields}><View style={s.field}><Text style={s.label}>Fecha</Text><TextInput accessibilityLabel="Fecha del partido" style={s.input} value={draft.date} onChangeText={date => setDraft({ ...draft, date: formatDateInput(date) })} placeholder="AAAA-MM-DD" keyboardType="number-pad" maxLength={10} editable={!busy} /></View><View style={s.field}><Text style={s.label}>Duración (min)</Text><TextInput accessibilityLabel="Duración del partido" style={s.input} value={draft.duration} onChangeText={duration => setDraft({ ...draft, duration })} keyboardType="number-pad" maxLength={3} editable={!busy} /></View></View>
      <View style={s.fields}>{([{ value: 'home', label: 'Local' }, { value: 'away', label: 'Visitante' }] as const).map(item => <Pressable key={item.value} accessibilityRole="radio" accessibilityLabel={item.label} accessibilityState={{ checked: draft.venue === item.value }} style={s.secondary} disabled={busy} onPress={() => setDraft({ ...draft, venue: item.value })}><Text style={s.blue}>{draft.venue === item.value ? '● ' : '○ '}{item.label}</Text></Pressable>)}</View>
      <Pressable accessibilityRole="checkbox" accessibilityLabel="Partido disputado" accessibilityState={{ checked: draft.played }} style={s.secondary} disabled={busy} onPress={() => setDraft({ ...draft, played: !draft.played })}><Text style={s.blue}>{draft.played ? '☑' : '☐'} Partido disputado</Text></Pressable>
      <Text style={s.text}>Selecciona los convocados. Los minutos se contabilizan al marcar el partido como disputado. Un campo vacío queda pendiente; 0 indica que no jugó.</Text>
      <Text style={s.subtitle}>Convocatoria · {Object.keys(draft.players).length} jugadores</Text>
      {candidates.length === 0 && <Text style={s.text}>Añade jugadores a la plantilla antes de preparar la convocatoria.</Text>}
      {candidates.map(player => {
        const selected = Object.hasOwn(draft.players, player.id);
        return <View key={player.id} style={s.player}>
          <Pressable accessibilityRole="checkbox" accessibilityLabel={`Convocar a ${player.name}`} accessibilityState={{ checked: selected, disabled: !!player.archivedAt || busy }} style={s.playerToggle} disabled={busy || !!player.archivedAt} onPress={() => toggle(player.id)}><Text style={s.blue}>{selected ? '☑' : '☐'} #{player.number} {player.name}</Text></Pressable>
          {!!player.archivedAt && <Text style={s.small}>Archivado · se conserva su participación</Text>}
          {selected && <><Text style={s.small}>Minutos {draft.played ? '(vacío = pendiente)' : '(se conservan, aún no cuentan)'}</Text><TextInput accessibilityLabel={`Minutos de ${player.name}`} style={s.input} value={draft.players[player.id]} onChangeText={minutes => setDraft({ ...draft, players: { ...draft.players, [player.id]: minutes } })} placeholder="Pendiente" keyboardType="number-pad" maxLength={3} editable={!busy && draft.played} /></>}
        </View>;
      })}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={busy} style={s.primary} onPress={() => void save()}><Text style={s.white}>{busy ? 'Guardando…' : 'Guardar partido'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} style={s.secondary} onPress={onClose}><Text style={s.blue}>Cancelar</Text></Pressable>
    </ScrollView></View></View>
  </Modal>;
}
const s = StyleSheet.create({ overlay: { flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#10151D99' }, card: { maxHeight: '94%', width: '100%', maxWidth: 640, backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden' }, content: { padding: 20, gap: 12 }, title: { fontSize: 22, color: '#17212D', fontWeight: '700' }, subtitle: { fontSize: 16, color: '#17212D', fontWeight: '700' }, label: { color: '#4F6880', fontSize: 13, marginBottom: 4 }, input: { minHeight: 48, borderWidth: 1, borderColor: '#DAE2EB', borderRadius: 8, padding: 10, color: '#17212D', fontSize: 14 }, fields: { flexDirection: 'row', gap: 10 }, field: { flex: 1 }, secondary: { minHeight: 44, padding: 10, borderWidth: 1, borderColor: '#DAE2EB', borderRadius: 8, justifyContent: 'center', alignItems: 'center' }, primary: { minHeight: 48, backgroundColor: '#176BA0', borderRadius: 8, alignItems: 'center', justifyContent: 'center', padding: 12 }, blue: { color: '#176BA0', fontSize: 13, fontWeight: '600' }, white: { color: '#FFF', fontWeight: '700' }, player: { borderWidth: 1, borderColor: '#DFE5EC', borderRadius: 10, padding: 12, gap: 8 }, playerToggle: { minHeight: 44, justifyContent: 'center' }, text: { color: '#5D6D7E', fontSize: 13, lineHeight: 20 }, small: { color: '#718096', fontSize: 11, lineHeight: 17 }, error: { color: '#A52D38', fontSize: 13, lineHeight: 20 } });
