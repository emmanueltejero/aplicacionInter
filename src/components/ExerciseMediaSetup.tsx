import { Linking, Pressable, Text, View } from 'react-native';
import { useState } from 'react';
import { trainingStyles as s } from './trainingStyles';
export function ExerciseMediaSetup() {
  const [error, setError] = useState('');
  return <View style={s.container}><Text style={s.warningText}>Para activar imágenes y vídeos, el administrador debe ejecutar el SQL de esta ampliación en Supabase. Las fichas existentes se conservan.</Text><Pressable accessibilityRole="link" style={s.secondary} onPress={() => { void Linking.openURL('https://github.com/emmanueltejero/aplicacionInter/blob/main/supabase/migrations/202611110001_exercise_media.sql').catch(() => setError('No se pudo abrir GitHub. Busca supabase/migrations/202611110001_exercise_media.sql en el repositorio.')); }}><Text style={s.blue}>Abrir SQL de imágenes y vídeos</Text></Pressable>{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}</View>;
}
