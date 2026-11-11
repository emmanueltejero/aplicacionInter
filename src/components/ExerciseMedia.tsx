import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, Text, View } from 'react-native';
import { loadExerciseImage } from '../data/exerciseImages';
import { exerciseVideoUrl } from '../exerciseMedia';
import { trainingStyles as s } from './trainingStyles';
function StoredImage({ path }: { path: string }) {
  const [data, setData] = useState(''), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    loadExerciseImage(path).then(value => { if (active) { setData(value); setError(''); } }).catch(() => { if (active) setError('No se pudo cargar la imagen. Comprueba tu conexión y vuelve a intentarlo.'); });
    return () => { active = false; };
  }, [path, attempt]);
  if (error) return <View style={s.container}><Text accessibilityRole="alert" style={s.error}>{error}</Text><Pressable accessibilityRole="button" style={s.secondary} onPress={() => { setError(''); setAttempt(value => value + 1); }}><Text style={s.blue}>Reintentar imagen</Text></Pressable></View>;
  return data ? <Image accessibilityLabel="Imagen o esquema del ejercicio" source={{ uri: data }} resizeMode="contain" style={{ width: '100%', height: 220, backgroundColor: '#FFF' }} /> : <ActivityIndicator accessibilityLabel="Cargando imagen del ejercicio" />;
}
export function ExerciseMedia({ imagePath, videoUrl, preview }: { imagePath?: string | null; videoUrl?: string | null; preview?: string }) {
  const [error, setError] = useState('');
  if (!preview && !imagePath && !videoUrl) return null;
  return <View style={s.container}>
    {preview ? <Image accessibilityLabel="Vista previa de la imagen" source={{ uri: preview }} resizeMode="contain" style={{ width: '100%', height: 220, backgroundColor: '#FFF' }} /> : imagePath ? <StoredImage key={imagePath} path={imagePath} /> : null}
    {!!videoUrl && <Pressable accessibilityRole="link" style={s.secondary} onPress={() => { setError(''); try { const url = exerciseVideoUrl(videoUrl); if (url) void Linking.openURL(url).catch(() => setError('No se pudo abrir el vídeo.')); } catch { setError('El enlace de vídeo no es válido.'); } }}><Text style={s.blue}>Ver vídeo del ejercicio</Text></Pressable>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>;
}
