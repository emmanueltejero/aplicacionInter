import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import type { Exercise } from '../exercises';
import { currentExerciseReview } from '../exerciseReviews';
import type { ExerciseReviews } from './useExerciseReviews';
import { trainingStyles as s } from './trainingStyles';

export function ExerciseReviewsSetup() {
  const [error, setError] = useState('');
  return <View style={s.container}>
    <Text style={s.warningText}>El administrador debe activar la revisión metodológica en Supabase. La biblioteca sigue disponible.</Text>
    <Pressable accessibilityRole="link" style={s.secondary} onPress={() => { void Linking.openURL('https://github.com/emmanueltejero/aplicacionInter/blob/main/supabase/migrations/202611110004_exercise_reviews.sql').catch(() => setError('Busca supabase/migrations/202611110004_exercise_reviews.sql en GitHub.')); }}><Text style={s.blue}>Abrir SQL de revisión metodológica</Text></Pressable>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>;
}
export function ExerciseReviewsFilter({ reviews, onlyReviewed, onChange, disabled = false }: { reviews: ExerciseReviews; onlyReviewed: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <View style={s.container}>
    <Pressable accessibilityRole="checkbox" accessibilityLabel="Solo revisados por el club" aria-checked={onlyReviewed} disabled={disabled || reviews.status !== 'ready'} style={[s.secondary, onlyReviewed && s.selected]} onPress={() => onChange(!onlyReviewed)}><Text style={s.blue}>{onlyReviewed ? '☑' : '☐'} Solo revisados por el club</Text></Pressable>
    {reviews.status === 'loading' && <Text accessibilityLiveRegion="polite" style={s.small}>Cargando revisiones del club…</Text>}
    {reviews.status === 'setup' && <ExerciseReviewsSetup />}
    {reviews.status === 'error' && <Text accessibilityRole="alert" style={s.error}>{reviews.loadError}</Text>}
    {(reviews.status === 'setup' || reviews.status === 'error') && <Pressable accessibilityRole="button" disabled={disabled} style={s.secondary} onPress={reviews.refresh}><Text style={s.blue}>Actualizar revisiones</Text></Pressable>}
    {onlyReviewed && reviews.status !== 'ready' && <Pressable accessibilityRole="button" disabled={disabled} style={s.secondary} onPress={() => onChange(false)}><Text style={s.blue}>Ver ejercicios sin el filtro de revisión</Text></Pressable>}
  </View>;
}
export function ExerciseReviewBadge({ exercise, reviews, showDate = false }: { exercise: Exercise; reviews: ExerciseReviews; showDate?: boolean }) {
  const review = reviews.status === 'ready' ? currentExerciseReview(exercise, reviews.byId) : null;
  if (!review) return null;
  return <View style={s.container}><Text style={s.blue}>✓ Revisado y recomendado por el club</Text>{showDate && <Text style={s.small}>Revisión metodológica · {new Date(review.reviewedAt).toLocaleDateString('es-ES')}</Text>}</View>;
}
