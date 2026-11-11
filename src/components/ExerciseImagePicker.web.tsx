import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { exerciseImageLimit, imageDataUrl } from '../exerciseMedia';
import type { PreparedExerciseImage } from '../exerciseMedia';
import { newRecordId } from '../recordId';
import { trainingStyles as s } from './trainingStyles';
async function prepare(file: File): Promise<PreparedExerciseImage> {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Elige una imagen JPG, PNG o WebP de hasta 10 MB.');
  const url = URL.createObjectURL(file), image = new window.Image();
  try {
    image.src = url; await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 48_000_000) throw new Error('La imagen es demasiado grande. Usa una versión de hasta 48 megapíxeles.');
    let side = 1280;
    while (side >= 320) {
      const factor = Math.min(1, side / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * factor)); canvas.height = Math.max(1, Math.round(image.naturalHeight * factor));
      const context = canvas.getContext('2d'); if (!context) throw new Error('Este navegador no puede preparar la imagen.');
      context.fillStyle = '#FFF'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [.85,.72,.6,.48]) {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (blob && blob.size <= exerciseImageLimit) return { id: newRecordId(), bytes: blob.size, dataUrl: imageDataUrl(new Uint8Array(await blob.arrayBuffer())) };
      }
      side = Math.floor(side * .75);
    }
    throw new Error('No se pudo reducir la imagen a 200 KB. Prueba con un esquema más sencillo.');
  } finally { URL.revokeObjectURL(url); }
}
export function ExerciseImagePicker({ disabled, onPick, onProcessing }: { disabled: boolean; onPick: (image: PreparedExerciseImage) => void; onProcessing: (processing: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null), [error, setError] = useState('');
  return <View style={s.container}>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Archivo de imagen del ejercicio" disabled={disabled} style={{ display: 'none' }} onChange={async event => {
      const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (!file || disabled) return;
      onProcessing(true); setError('');
      try { onPick(await prepare(file)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo preparar la imagen.'); } finally { onProcessing(false); }
    }} />
    <Pressable accessibilityRole="button" style={s.secondary} disabled={disabled} onPress={() => input.current?.click()}><Text style={s.blue}>Seleccionar imagen o esquema</Text></Pressable>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>;
}
