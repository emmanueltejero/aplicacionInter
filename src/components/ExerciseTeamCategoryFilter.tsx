import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { exerciseTeamCategories } from '../exercises';
import type { ExerciseTeamCategoryFilter as Filter } from '../exercises';
import { trainingStyles as s } from './trainingStyles';

export function ExerciseTeamCategoryFilter({ value, onChange, disabled = false }: { value: Filter; onChange: (value: Filter) => void; disabled?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const options: { value: Filter; label: string }[] = [{ value: '', label: 'Todas' }, ...exerciseTeamCategories.map(item => ({ value: item, label: item })), { value: 'unclassified', label: 'Sin clasificar' }];
  return <View style={s.container}>
    <Pressable accessibilityRole="button" accessibilityLabel="Elegir categoría del equipo" aria-expanded={expanded} disabled={disabled} style={s.secondary} onPress={() => setExpanded(current => !current)}><Text style={s.blue}>Categoría del equipo: {options.find(item => item.value === value)?.label ?? 'Todas'} {expanded ? '▴' : '▾'}</Text></Pressable>
    {expanded && <View style={s.controls}>{options.map(item => <Pressable key={item.value} accessibilityRole="radio" accessibilityLabel={`Categoría de equipo ${item.label}`} aria-checked={value === item.value} disabled={disabled} style={[s.secondary, value === item.value && s.selected]} onPress={() => { onChange(item.value); setExpanded(false); }}><Text style={s.blue}>{item.label}</Text></Pressable>)}</View>}
  </View>;
}
export function ExerciseTeamCategoriesSetup() {
  const [error, setError] = useState('');
  return <View style={s.container}>
    <Text style={s.warningText}>Falta activar las categorías de equipo en Supabase. Los ejercicios actuales siguen disponibles. Después de ejecutar el SQL, actualiza la biblioteca.</Text>
    <Pressable accessibilityRole="link" style={s.secondary} onPress={() => { void Linking.openURL('https://github.com/emmanueltejero/aplicacionInter/blob/main/supabase/migrations/202611100006_exercise_team_categories.sql').catch(() => setError('Busca supabase/migrations/202611100006_exercise_team_categories.sql en GitHub.')); }}><Text style={s.blue}>Abrir SQL de categorías de equipo</Text></Pressable>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>;
}
