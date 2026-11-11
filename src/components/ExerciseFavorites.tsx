import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import type { Exercise } from '../exercises';
import type { ExerciseFavorites } from './useExerciseFavorites';
import { trainingStyles as s } from './trainingStyles';

export function ExerciseFavoritesFilter({ favorites, onlyFavorites, onChange, disabled = false }: {
  favorites: ExerciseFavorites; onlyFavorites: boolean; onChange: (value: boolean) => void; disabled?: boolean;
}) {
  const [linkError, setLinkError] = useState('');
  return <View style={s.container}>
    <View style={s.controls}>
      <Pressable accessibilityRole="radio" accessibilityLabel="Todos los ejercicios" aria-checked={!onlyFavorites} disabled={disabled} style={[s.secondary, !onlyFavorites && s.selected]} onPress={() => onChange(false)}><Text style={s.blue}>Todos</Text></Pressable>
      <Pressable accessibilityRole="radio" accessibilityLabel="Mis favoritos" aria-checked={onlyFavorites} disabled={disabled || favorites.status !== 'ready'} style={[s.secondary, onlyFavorites && s.selected]} onPress={() => onChange(true)}><Text style={s.blue}>★ Mis favoritos</Text></Pressable>
    </View>
    <Text style={s.small}>Tu selección es personal; la biblioteca sigue siendo compartida.</Text>
    {favorites.status === 'loading' && <Text accessibilityLiveRegion="polite" style={s.small}>Cargando tus favoritos…</Text>}
    {favorites.status === 'setup' && <>
      <Text style={s.warningText}>Para activar los favoritos personales, el administrador debe ejecutar el SQL de esta ampliación en Supabase. Después, pulsa «Actualizar favoritos».</Text>
      <Pressable accessibilityRole="link" style={s.secondary} onPress={() => { void Linking.openURL('https://github.com/emmanueltejero/aplicacionInter/blob/main/supabase/migrations/202611110002_exercise_favorites.sql').catch(() => setLinkError('Busca supabase/migrations/202611110002_exercise_favorites.sql en GitHub.')); }}><Text style={s.blue}>Abrir SQL de favoritos</Text></Pressable>
    </>}
    {favorites.status === 'error' && <Text accessibilityRole="alert" style={s.error}>{favorites.loadError}</Text>}
    {!!linkError && <Text accessibilityRole="alert" style={s.error}>{linkError}</Text>}
    {(favorites.status === 'setup' || favorites.status === 'error') && <Pressable accessibilityRole="button" disabled={disabled || !!favorites.pendingId} style={s.secondary} onPress={favorites.refresh}><Text style={s.blue}>Actualizar favoritos</Text></Pressable>}
  </View>;
}
export function ExerciseFavoriteButton({ exercise, favorites, disabled = false }: { exercise: Exercise; favorites: ExerciseFavorites; disabled?: boolean }) {
  if (favorites.status !== 'ready') return null;
  const selected = favorites.ids.has(exercise.id), pending = favorites.pendingId === exercise.id;
  return <View style={s.container}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${selected ? 'Quitar' : 'Añadir'} ${exercise.title} ${selected ? 'de' : 'a'} mis favoritos`} aria-pressed={selected} disabled={disabled || !!favorites.pendingId} style={[s.secondary, selected && s.selected]} onPress={() => { void favorites.toggle(exercise.id); }}>
      <Text accessibilityLiveRegion="polite" style={s.blue}>{pending ? 'Guardando favorito…' : selected ? '★ En mis favoritos' : '☆ Guardar favorito'}</Text>
    </Pressable>
    {favorites.failure?.id === exercise.id && <Text accessibilityRole="alert" style={s.error}>{favorites.failure.message}</Text>}
  </View>;
}
