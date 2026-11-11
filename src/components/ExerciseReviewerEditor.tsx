import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { ClubUser } from '../clubUsers';
import { ExerciseReviewsSetupRequired } from '../exerciseReviews';
import { ExerciseReviewsSetup } from './ExerciseReviews';
import { trainingStyles as s } from './trainingStyles';

export function ExerciseReviewerEditor({ user, busy, onSave, onClose }: { user: ClubUser; busy: boolean; onSave: (allowed: boolean) => Promise<void>; onClose: () => void }) {
  const [allowed, setAllowed] = useState(user.canReviewExercises === true), [error, setError] = useState(''), [setup, setSetup] = useState(false);
  async function save() {
    if (busy) return;
    setError(''); setSetup(false);
    try { await onSave(allowed); } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el permiso.'); setSetup(cause instanceof ExerciseReviewsSetupRequired); }
  }
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}><View style={s.overlay}><View style={s.modal}><ScrollView contentContainerStyle={s.modalContent}>
    <Text style={s.title}>Revisión metodológica</Text><Text style={s.subtitle}>{user.name || user.email}</Text><Text style={s.text}>{user.email}</Text>
    <Text style={s.text}>Permite poner y quitar la marca de revisión del club. Los permisos para editar fichas y gestionar usuarios se mantienen.</Text>
    <Pressable accessibilityRole="checkbox" accessibilityLabel="Autorizar como revisor de ejercicios" aria-checked={allowed} disabled={busy} style={[s.secondary, allowed && s.selected]} onPress={() => setAllowed(value => !value)}><Text style={s.blue}>{allowed ? '☑' : '☐'} Autorizar como revisor</Text></Pressable>
    {!user.enabled && <Text style={s.warningText}>La cuenta está desactivada. No podrá revisar ejercicios mientras su acceso siga desactivado.</Text>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}{setup && <ExerciseReviewsSetup />}
    <Pressable accessibilityRole="button" style={s.primary} disabled={busy} onPress={() => void save()}><Text style={s.white}>{busy ? 'Guardando…' : 'Guardar permiso de revisión'}</Text></Pressable>
    <Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={onClose}><Text style={s.blue}>Cancelar</Text></Pressable>
  </ScrollView></View></View></Modal>;
}
