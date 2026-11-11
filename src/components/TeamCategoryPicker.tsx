import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { exerciseTeamCategories } from '../exercises';
import type { ExerciseTeamCategory } from '../exercises';
import { trainingStyles as s } from './trainingStyles';

export function TeamCategoryPicker({ value, onChange, disabled = false }: { value: ExerciseTeamCategory | null; onChange: (category: ExerciseTeamCategory | null) => void; disabled?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const options = [null, ...exerciseTeamCategories];
  return <View style={s.container}>
    <Pressable accessibilityRole="button" accessibilityLabel="Asignar categoría al equipo" aria-expanded={expanded} style={s.secondary} disabled={disabled} onPress={() => setExpanded(current => !current)}><Text style={s.blue}>Categoría: {value ?? 'Sin categoría'} {expanded ? '▴' : '▾'}</Text></Pressable>
    {expanded && <View style={s.controls}>{options.map(item => <Pressable key={item ?? 'none'} accessibilityRole="radio" accessibilityLabel={`Asignar categoría ${item ?? 'Sin categoría'}`} aria-checked={value === item} style={[s.secondary, value === item && s.selected]} disabled={disabled} onPress={() => { onChange(item); setExpanded(false); }}><Text style={s.blue}>{item ?? 'Sin categoría'}</Text></Pressable>)}</View>}
  </View>;
}
export function TeamCategoriesSetup() {
  const [error, setError] = useState('');
  return <View style={s.container}>
    <Text style={s.warningText}>Para asociar categorías a los equipos, el administrador debe activar esta ampliación en Supabase. Después, pulsa «Actualizar usuarios».</Text>
    <Pressable accessibilityRole="link" style={s.secondary} onPress={() => { void Linking.openURL('https://github.com/emmanueltejero/aplicacionInter/blob/main/supabase/migrations/202611110003_team_categories.sql').catch(() => setError('Busca supabase/migrations/202611110003_team_categories.sql en GitHub.')); }}><Text style={s.blue}>Abrir SQL de categorías de equipos</Text></Pressable>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>;
}
