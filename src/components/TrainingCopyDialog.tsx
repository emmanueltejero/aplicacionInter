import { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { dateKey, formatDateInput } from '../domain';
import { newRecordId } from '../recordId';
import { validateTrainingCopy } from '../trainingPlans';
import type { TrainingCopy, TrainingPlan } from '../trainingPlans';
import { TrainingCopySetupRequired } from '../data/trainingRepository';
import { trainingStyles as s } from './trainingStyles';

const setupUrl = 'https://github.com/emmanueltejero/aplicacionInter/blob/main/supabase/migrations/202611100003_copy_training_plans.sql';
export function TrainingCopyDialog({ source, busy, onCopy, onClose }: {
  source: TrainingPlan; busy: boolean; onCopy: (request: TrainingCopy) => Promise<void>; onClose: () => void;
}) {
  const [id] = useState(newRecordId);
  const [title, setTitle] = useState(() => `${source.title.slice(0, 92)} (copia)`);
  const [date, setDate] = useState(() => {
    const today = new Date();
    if (source.date === dateKey(today)) today.setDate(today.getDate() + 1);
    return dateKey(today);
  });
  const [error, setError] = useState('');
  const [setup, setSetup] = useState(false);
  async function copy() {
    if (busy) return;
    try { setError(''); setSetup(false); await onCopy(validateTrainingCopy({ id, sourceId: source.id, sourceRevision: source.revision, title, date })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo duplicar el entrenamiento.'); setSetup(cause instanceof TrainingCopySetupRequired); }
  }
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}><View style={s.overlay}><View style={s.modal}><ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
    <Text style={s.title}>Duplicar entrenamiento</Text><Text style={s.text}>Se creará un plan independiente con los ejercicios, tiempos, jugadores y notas de «{source.title}». También conserva las fichas que ya estén archivadas en la biblioteca.</Text>
    <Text style={s.label}>Nombre de la copia</Text><TextInput accessibilityLabel="Nombre de la copia" style={s.input} value={title} onChangeText={setTitle} maxLength={100} editable={!busy} />
    <Text style={s.label}>Nueva fecha</Text><TextInput accessibilityLabel="Fecha de la copia" style={s.input} value={date} onChangeText={value => setDate(formatDateInput(value))} keyboardType="number-pad" maxLength={10} placeholder="AAAA-MM-DD" editable={!busy} />
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {setup && <Pressable accessibilityRole="link" style={s.secondary} onPress={() => { void Linking.openURL(setupUrl).catch(() => setError('No se pudo abrir GitHub. Busca supabase/migrations/202611100003_copy_training_plans.sql en el repositorio.')); }}><Text style={s.blue}>Abrir SQL de duplicación en GitHub</Text></Pressable>}
    <Pressable accessibilityRole="button" style={s.primary} disabled={busy} onPress={() => void copy()}><Text style={s.white}>{busy ? 'Creando copia…' : 'Crear copia'}</Text></Pressable>
    <Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={onClose}><Text style={s.blue}>Cancelar</Text></Pressable>
  </ScrollView></View></View></Modal>;
}
