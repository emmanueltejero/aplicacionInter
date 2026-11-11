import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { TeamCategoriesSetupRequired } from '../teams';
import type { Team } from '../teams';
import { TeamCategoryPicker, TeamCategoriesSetup } from './TeamCategoryPicker';
import { trainingStyles as s } from './trainingStyles';

export function TeamCategoryEditor({ team, busy, onSave, onClose }: { team: Team; busy: boolean; onSave: (category: Team['category']) => Promise<void>; onClose: () => void }) {
  const [category, setCategory] = useState(team.category ?? null);
  const [error, setError] = useState('');
  const [setup, setSetup] = useState(false);
  async function save() {
    if (busy) return;
    setError(''); setSetup(false);
    try { await onSave(category); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la categoría.'); setSetup(cause instanceof TeamCategoriesSetupRequired); }
  }
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}><View style={s.overlay}><View style={s.modal}><ScrollView contentContainerStyle={s.modalContent}>
    <Text style={s.title}>Categoría del equipo</Text><Text style={s.subtitle}>{team.name}</Text>
    <Text style={s.text}>Al preparar sus entrenamientos se mostrarán primero los ejercicios recomendados para esta categoría. Los demás seguirán disponibles.</Text>
    <TeamCategoryPicker value={category} onChange={setCategory} disabled={busy} />
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}{setup && <TeamCategoriesSetup />}
    <Pressable accessibilityRole="button" style={s.primary} disabled={busy} onPress={() => void save()}><Text style={s.white}>{busy ? 'Guardando…' : 'Guardar categoría'}</Text></Pressable>
    <Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={onClose}><Text style={s.blue}>Cancelar</Text></Pressable>
  </ScrollView></View></View></Modal>;
}
