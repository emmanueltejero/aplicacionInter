import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { exerciseImageBucket, exerciseImageBytes, imageDataUrl, validExerciseImagePath } from '../exerciseMedia';
import type { TrainingPlan } from '../trainingPlans';

export const demoImageKey = (path: string) => '@inter-playa-honda/demo-image/v1/' + path;
export async function loadExerciseImage(path: string): Promise<string> {
  if (!validExerciseImagePath(path)) throw new Error('Referencia de imagen inválida.');
  if (path.startsWith('demo:')) {
    const data = await AsyncStorage.getItem(demoImageKey(path));
    if (!data) throw new Error('No se encontró la imagen de demostración.');
    exerciseImageBytes(data); return data;
  }
  if (!supabase) throw new Error('La conexión del club no está disponible.');
  const result = await supabase.storage.from(exerciseImageBucket).download(path);
  if (result.error || !result.data) throw new Error('No se pudo cargar la imagen. Revisa la conexión y tu acceso al club.');
  return imageDataUrl(new Uint8Array(await result.data.arrayBuffer()));
}
export async function trainingImages(plan: TrainingPlan): Promise<Record<string, string>> {
  const paths = [...new Set(plan.entries.map(entry => entry.imagePath).filter((path): path is string => !!path))];
  const images: Record<string, string> = {}; let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, paths.length) }, async () => {
    while (next < paths.length) { const path = paths[next++]; images[path] = await loadExerciseImage(path); }
  }));
  return images;
}
