import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { exerciseCategories, exerciseTeamCategories, exerciseDraft, validateExercise, validateExerciseTeamCategories } from '../exercises';
import type { Exercise, ExerciseDraft } from '../exercises';
import type { ExerciseSave } from '../data/exercisesRepository';
import { newRecordId } from '../recordId';
import { ExerciseTeamCategoriesSetup } from './ExerciseTeamCategoryFilter';
import { ExerciseMedia } from './ExerciseMedia';
import { ExerciseImagePicker } from './ExerciseImagePicker';
import type { PreparedExerciseImage } from '../exerciseMedia';
import { ExerciseMediaSetup } from './ExerciseMediaSetup';

export function ExerciseEditor({ exercise, busy, onSave, onClose }: {
  exercise?: Exercise; busy: boolean; onSave: (exercise: ExerciseSave) => Promise<void>; onClose: () => void;
}) {
  const [id] = useState(() => exercise?.id ?? newRecordId());
  const [draft, setDraft] = useState(() => exerciseDraft(exercise));
  const [error, setError] = useState('');
  const [imageUpload, setImageUpload] = useState<PreparedExerciseImage | undefined>();
  const [imagePreparing, setImagePreparing] = useState(false);
  function field(key: keyof Pick<ExerciseDraft, 'duration' | 'minPlayers' | 'maxPlayers' | 'spaceLength' | 'spaceWidth'>, label: string) {
    return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} style={s.input} value={draft[key]} onChangeText={value => setDraft({ ...draft, [key]: value })} keyboardType="number-pad" maxLength={3} editable={!busy} /></View>;
  }
  async function save() {
    if (busy || imagePreparing) return;
    try { setError(''); await onSave({ ...validateExercise(draft), imageUpload, teamCategories: validateExerciseTeamCategories(draft.teamCategories), id, revision: exercise?.revision ?? 0, archived: !!exercise?.archivedAt }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el ejercicio.'); }
  }
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy && !imagePreparing) onClose(); }}>
    <View style={s.overlay}><View style={s.card}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>{exercise ? 'Editar ejercicio' : 'Añadir ejercicio'}</Text>
      <Text style={s.text}>Se compartirá con todos los entrenadores del club. Solo su autor y los administradores pueden modificarlo.</Text>
      <Text style={s.label}>Nombre del ejercicio</Text><TextInput accessibilityLabel="Nombre del ejercicio" style={s.input} value={draft.title} onChangeText={title => setDraft({ ...draft, title })} maxLength={100} editable={!busy} />
      <Text style={s.label}>Descripción y desarrollo</Text><TextInput accessibilityLabel="Descripción del ejercicio" style={[s.input, s.description]} multiline value={draft.description} onChangeText={description => setDraft({ ...draft, description })} maxLength={5000} editable={!busy} />
      <Text style={s.subtitle}>Imagen o esquema</Text><Text style={s.text}>Una imagen por ejercicio. La reducimos a un máximo de 200 KB antes de subirla; se conserva completa, sin recortar.</Text>
      <ExerciseMedia imagePath={draft.imagePath} preview={imageUpload?.dataUrl} />
      <ExerciseImagePicker disabled={busy || imagePreparing} onPick={setImageUpload} onProcessing={setImagePreparing} />
      {imagePreparing && <Text accessibilityLiveRegion="polite" style={s.blue}>Preparando imagen…</Text>}
      {imageUpload && <Text accessibilityLiveRegion="polite" style={s.blue}>Imagen preparada: {Math.ceil(imageUpload.bytes / 1024)} KB. Se subirá al guardar el ejercicio.</Text>}
      {(imageUpload || draft.imagePath) && <Pressable accessibilityRole="button" disabled={busy || imagePreparing} style={s.secondary} onPress={() => { setImageUpload(undefined); setDraft({ ...draft, imagePath: null }); }}><Text style={s.blue}>Quitar imagen de la ficha</Text></Pressable>}
      <Text style={s.label}>Enlace a vídeo · YouTube o Vimeo</Text><TextInput accessibilityLabel="Enlace al vídeo del ejercicio" style={s.input} value={draft.videoUrl ?? ''} onChangeText={videoUrl => setDraft({ ...draft, videoUrl })} autoCapitalize="none" keyboardType="url" maxLength={1000} editable={!busy} placeholder="https://…" />
      <Text style={s.text}>El vídeo se abre desde su enlace y no ocupa espacio de archivos del club.</Text>
      <Text style={s.label}>Contenido del ejercicio · elige uno o varios</Text>
      <View style={s.wrap}>{exerciseCategories.map(category => {
        const checked = draft.categories.includes(category);
        return <Pressable key={category} accessibilityRole="checkbox" accessibilityLabel={`Categoría ${category}`} accessibilityState={{ checked }} disabled={busy} style={[s.secondary, checked && s.selected]} onPress={() => setDraft({ ...draft, categories: checked ? draft.categories.filter(value => value !== category) : [...draft.categories, category] })}><Text style={s.blue}>{checked ? '☑ ' : '☐ '}{category}</Text></Pressable>;
      })}</View>
      <Text style={s.label}>Categorías de equipo recomendadas · elige una o varias</Text>
      <Text style={s.text}>Por ejemplo, un ejercicio puede servir para Benjamín y Alevín. Puedes combinar Femenino con una etapa. Sin selección quedará sin clasificar.</Text>
      <View style={s.wrap}>{exerciseTeamCategories.map(category => {
        const checked = (draft.teamCategories ?? []).includes(category);
        return <Pressable key={category} accessibilityRole="checkbox" accessibilityLabel={`Recomendado para ${category}`} aria-checked={checked} disabled={busy} style={[s.secondary, checked && s.selected]} onPress={() => setDraft({ ...draft, teamCategories: checked ? draft.teamCategories!.filter(value => value !== category) : [...(draft.teamCategories ?? []), category] })}><Text style={s.blue}>{checked ? '☑ ' : '☐ '}{category}</Text></Pressable>;
      })}</View>
      {field('duration', 'Duración (minutos)')}
      <View style={s.fields}>{field('minPlayers', 'Mínimo de jugadores')}{field('maxPlayers', 'Máximo de jugadores')}</View>
      <Text style={s.label}>Espacio necesario · metros</Text>
      <View style={s.fields}>{field('spaceLength', 'Largo (metros)')}{field('spaceWidth', 'Ancho (metros)')}</View>
      <Text style={s.subtitle}>Material</Text><Text style={s.text}>Añade cada tipo con su cantidad. Si no necesitas material, deja la lista vacía.</Text>
      {draft.materials.map((material, index) => <View key={index} style={s.material}>
        <Text style={s.label}>Material {index + 1}</Text>
        <TextInput accessibilityLabel={`Nombre del material ${index + 1}`} style={s.input} placeholder="Ej.: Conos" placeholderTextColor="#718096" value={material.name} onChangeText={name => setDraft({ ...draft, materials: draft.materials.map((item, i) => i === index ? { ...item, name } : item) })} maxLength={60} editable={!busy} />
        <TextInput accessibilityLabel={`Cantidad del material ${index + 1}`} style={s.input} placeholder="Cantidad" placeholderTextColor="#718096" value={material.quantity} onChangeText={quantity => setDraft({ ...draft, materials: draft.materials.map((item, i) => i === index ? { ...item, quantity } : item) })} keyboardType="number-pad" maxLength={4} editable={!busy} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Quitar material ${index + 1}`} disabled={busy} style={s.secondary} onPress={() => setDraft({ ...draft, materials: draft.materials.filter((_, i) => i !== index) })}><Text style={s.blue}>Quitar material</Text></Pressable>
      </View>)}
      <Pressable accessibilityRole="button" disabled={busy || draft.materials.length >= 30} style={s.secondary} onPress={() => setDraft({ ...draft, materials: [...draft.materials, { name: '', quantity: '1' }] })}><Text style={s.blue}>Añadir material</Text></Pressable>
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {error.includes('202611100006_exercise_team_categories.sql') && <ExerciseTeamCategoriesSetup />}
      {error.includes('202611110001_exercise_media.sql') && <ExerciseMediaSetup />}
      <Pressable accessibilityRole="button" disabled={busy || imagePreparing} style={s.primary} onPress={() => void save()}><Text style={s.white}>{busy ? 'Guardando…' : 'Guardar ejercicio'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy || imagePreparing} style={s.secondary} onPress={onClose}><Text style={s.blue}>Cancelar</Text></Pressable>
    </ScrollView></View></View>
  </Modal>;
}
const s = StyleSheet.create({ overlay: { flex: 1, padding: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#10151D99' }, card: { maxHeight: '94%', width: '100%', maxWidth: 640, backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden' }, content: { padding: 18, gap: 12 }, title: { fontSize: 22, color: '#17212D', fontWeight: '700' }, subtitle: { fontSize: 16, color: '#17212D', fontWeight: '700' }, label: { color: '#4F6880', fontSize: 13, lineHeight: 18 }, input: { minHeight: 48, borderWidth: 1, borderColor: '#DAE2EB', borderRadius: 8, padding: 10, color: '#17212D', fontSize: 14 }, description: { minHeight: 130, textAlignVertical: 'top' }, fields: { flexDirection: 'row', gap: 10 }, field: { flex: 1, minWidth: 0, gap: 6 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, selected: { backgroundColor: '#DEEEFB', borderColor: '#176BA0' }, secondary: { minHeight: 44, padding: 10, borderWidth: 1, borderColor: '#DAE2EB', borderRadius: 8, justifyContent: 'center', alignItems: 'center' }, primary: { minHeight: 48, backgroundColor: '#176BA0', borderRadius: 8, alignItems: 'center', justifyContent: 'center', padding: 12 }, blue: { color: '#176BA0', fontSize: 13, fontWeight: '600' }, white: { color: '#FFF', fontWeight: '700' }, material: { borderWidth: 1, borderColor: '#DFE5EC', borderRadius: 10, padding: 12, gap: 8 }, text: { color: '#5D6D7E', fontSize: 13, lineHeight: 20 }, error: { color: '#A52D38', fontSize: 13, lineHeight: 20 } });
