import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { canEditExercise, exerciseCategories, filterExercises } from '../exercises';
import type { Exercise, ExerciseCategory } from '../exercises';
import { ExercisesSetupRequired } from '../data/exercisesRepository';
import type { ExerciseLibrary, ExerciseSave, ExercisesRepository } from '../data/exercisesRepository';
import { ExerciseEditor } from './ExerciseEditor';

const setupUrl = 'https://github.com/emmanueltejero/aplicacionInter/blob/main/supabase/migrations/202611100001_exercises.sql';
export function ExercisesLibrary({ repository, onBusyChange }: { repository: ExercisesRepository; onBusyChange?: (busy: boolean) => void }) {
  const [library, setLibrary] = useState<ExerciseLibrary | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ExerciseCategory | ''>('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [editor, setEditor] = useState<{ exercise?: Exercise } | null>(null);
  const [detail, setDetail] = useState<Exercise | null>(null);
  useEffect(() => {
    let active = true;
    repository.load().then(data => { if (active) { setLibrary(data); setLoadError(null); } })
      .catch(cause => { if (active) setLoadError(cause instanceof Error ? cause : new Error('No se pudo cargar la biblioteca.')); });
    return () => { active = false; };
  }, [repository, attempt]);
  const exercises = useMemo(() => filterExercises(library?.exercises ?? [], query, category, includeArchived), [library, query, category, includeArchived]);
  async function save(request: ExerciseSave) {
    if (locked.current) throw new Error('Espera a que termine el guardado.');
    locked.current = true; setBusy(true); onBusyChange?.(true); setError('');
    try {
      const saved = await repository.save(request);
      setLibrary(current => current ? { ...current, exercises: current.exercises.some(item => item.id === saved.id) ? current.exercises.map(item => item.id === saved.id ? saved : item) : [...current.exercises, saved] } : current);
      setEditor(null); setDetail(null);
    } catch (cause) { const message = cause instanceof Error ? cause.message : 'No se pudo guardar el ejercicio.'; setError(message); throw new Error(message); }
    finally { locked.current = false; setBusy(false); onBusyChange?.(false); }
  }
  function refresh() { setLibrary(null); setLoadError(null); setError(''); setAttempt(value => value + 1); }
  if (loadError) return <View style={s.container}>
    <Text style={s.title}>Biblioteca de ejercicios</Text><Text accessibilityRole="alert" style={s.error}>{loadError.message}</Text>
    {loadError instanceof ExercisesSetupRequired && <><Text style={s.text}>Para activar la biblioteca compartida, el administrador debe ejecutar una vez su SQL de activación en Supabase. Las otras pestañas siguen disponibles.</Text><Pressable accessibilityRole="link" style={s.secondary} onPress={() => { void Linking.openURL(setupUrl).catch(() => setError('No se pudo abrir GitHub. Busca supabase/migrations/202611100001_exercises.sql en el repositorio.')); }}><Text style={s.blue}>Abrir SQL de la biblioteca en GitHub</Text></Pressable></>}
    <Pressable accessibilityRole="button" style={s.primary} onPress={refresh}><Text style={s.white}>Reintentar biblioteca</Text></Pressable>
    {!!error && <Text style={s.error}>{error}</Text>}
  </View>;
  if (!library) return <ActivityIndicator accessibilityLabel="Cargando biblioteca de ejercicios" color="#176BA0" />;
  return <View style={s.container}>
    <Text style={s.title}>Biblioteca de ejercicios</Text>
    <Text style={s.text}>Compartida por todos los entrenadores del Inter Playa Honda. Puedes añadir ejercicios; solo su autor y los administradores pueden modificarlos.</Text>
    <Pressable accessibilityRole="button" style={s.primary} disabled={busy} onPress={() => { setError(''); setEditor({}); }}><Text style={s.white}>Añadir ejercicio</Text></Pressable>
    <TextInput accessibilityLabel="Buscar ejercicios" placeholder="Buscar por nombre, descripción o material" placeholderTextColor="#718096" style={s.input} value={query} onChangeText={setQuery} />
    <Text style={s.label}>Filtrar por categoría</Text>
    <View style={s.controls}><Pressable accessibilityRole="radio" accessibilityLabel="Todas las categorías" accessibilityState={{ checked: category === '' }} style={[s.secondary, !category && s.selected]} onPress={() => setCategory('')}><Text style={s.blue}>Todas</Text></Pressable>{exerciseCategories.map(item => <Pressable key={item} accessibilityRole="radio" accessibilityLabel={`Filtrar ${item}`} accessibilityState={{ checked: category === item }} style={[s.secondary, category === item && s.selected]} onPress={() => setCategory(item)}><Text style={s.blue}>{item}</Text></Pressable>)}</View>
    <Pressable accessibilityRole="checkbox" accessibilityLabel="Incluir ejercicios archivados" accessibilityState={{ checked: includeArchived }} style={s.checkbox} onPress={() => setIncludeArchived(value => !value)}><Text style={s.blue}>{includeArchived ? '☑' : '☐'} Incluir archivados</Text></Pressable>
    <View style={s.controls}><Text accessibilityLiveRegion="polite" style={s.text}>{exercises.length} {exercises.length === 1 ? 'ejercicio' : 'ejercicios'}</Text><Pressable accessibilityRole="button" disabled={busy} style={s.secondary} onPress={refresh}><Text style={s.blue}>Actualizar biblioteca</Text></Pressable></View>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {exercises.length === 0 && <Text style={s.text}>{library.exercises.length ? 'No hay ejercicios con estos filtros. Prueba otra búsqueda o categoría.' : 'La biblioteca está vacía. Añade el primer ejercicio para compartirlo con el club.'}</Text>}
    {exercises.map(exercise => <View key={exercise.id} style={s.card} accessibilityLabel={`Ejercicio ${exercise.title}`}>
      <Text style={s.name}>{exercise.title}</Text>
      <Text style={s.author}>{exercise.createdBy === library.viewer.id ? 'Añadido por ti' : 'Compartido por otro entrenador'}{exercise.archivedAt ? ' · Archivado' : ''}</Text>
      <View style={s.controls}>{exercise.categories.map(item => <Text key={item} style={s.tag}>{item}</Text>)}</View>
      <Text style={s.text}>{exercise.duration} min · {exercise.minPlayers === exercise.maxPlayers ? exercise.minPlayers : `${exercise.minPlayers}–${exercise.maxPlayers}`} jugadores · {exercise.spaceLength} × {exercise.spaceWidth} m</Text>
      <Text style={s.text} numberOfLines={3}>{exercise.description}</Text>
      <Text style={s.text}>Material: {exercise.materials.length ? exercise.materials.map(item => `${item.quantity} ${item.name}`).join(' · ') : 'Sin material'}</Text>
      <View style={s.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Ver ficha de ${exercise.title}`} style={s.secondary} disabled={busy} onPress={() => setDetail(exercise)}><Text style={s.blue}>Ver ficha</Text></Pressable>
        {canEditExercise(exercise, library.viewer) && <>
          <Pressable accessibilityRole="button" accessibilityLabel={`Editar ejercicio ${exercise.title}`} style={s.secondary} disabled={busy} onPress={() => { setError(''); setEditor({ exercise }); }}><Text style={s.blue}>Editar</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`${exercise.archivedAt ? 'Restaurar' : 'Archivar'} ejercicio ${exercise.title}`} style={s.secondary} disabled={busy} onPress={() => { void save({ ...exercise, archived: !exercise.archivedAt }).catch(() => {}); }}><Text style={s.blue}>{exercise.archivedAt ? 'Restaurar' : 'Archivar'}</Text></Pressable>
        </>}
      </View>
    </View>)}
    <Text style={s.text}>Archivar oculta un ejercicio sin perder su ficha. Puedes encontrarlo de nuevo activando «Incluir archivados».</Text>
    {editor && <ExerciseEditor key={editor.exercise?.id ?? 'new'} exercise={editor.exercise} busy={busy} onSave={async request => { await save(request); setQuery(''); setCategory(''); if (request.archived) setIncludeArchived(true); }} onClose={() => setEditor(null)} />}
    {detail && <Modal visible transparent animationType="fade" onRequestClose={() => setDetail(null)}><View style={s.overlay}><View style={s.detail}><ScrollView contentContainerStyle={s.detailContent}>
      <Text style={s.title}>{detail.title}</Text><Text style={s.text}>{detail.categories.join(' · ')}{detail.archivedAt ? ' · Archivado' : ''}</Text>
      <Text style={s.text}>{detail.duration} minutos · {detail.minPlayers}–{detail.maxPlayers} jugadores</Text><Text style={s.text}>Espacio: {detail.spaceLength} × {detail.spaceWidth} m ({detail.spaceLength * detail.spaceWidth} m²)</Text>
      <Text style={s.label}>Descripción y desarrollo</Text><Text style={s.description}>{detail.description}</Text><Text style={s.label}>Material</Text>
      {detail.materials.length ? detail.materials.map(item => <Text key={item.name} style={s.text}>{item.quantity} × {item.name}</Text>) : <Text style={s.text}>Sin material</Text>}
      <Pressable accessibilityRole="button" style={s.primary} onPress={() => setDetail(null)}><Text style={s.white}>Cerrar ficha</Text></Pressable>
    </ScrollView></View></View></Modal>}
  </View>;
}
const s = StyleSheet.create({ container: { gap: 12 }, title: { color: '#17212D', fontSize: 21, fontWeight: '700' }, controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }, input: { minHeight: 48, borderWidth: 1, borderColor: '#DAE2EB', borderRadius: 8, padding: 10, backgroundColor: '#FFF', color: '#17212D', fontSize: 14 }, primary: { minHeight: 48, borderRadius: 8, backgroundColor: '#176BA0', alignItems: 'center', justifyContent: 'center', padding: 12 }, white: { color: '#FFF', fontWeight: '700' }, secondary: { minHeight: 44, padding: 10, borderWidth: 1, borderColor: '#DAE2EB', backgroundColor: '#FFF', borderRadius: 8, justifyContent: 'center', alignItems: 'center' }, selected: { backgroundColor: '#DEEEFB', borderColor: '#176BA0' }, blue: { color: '#176BA0', fontWeight: '600', fontSize: 13 }, text: { color: '#5D6D7E', fontSize: 13, lineHeight: 21 }, label: { color: '#4F6880', fontSize: 13, fontWeight: '700' }, description: { color: '#17212D', fontSize: 14, lineHeight: 23 }, author: { color: '#718096', fontSize: 11 }, card: { borderWidth: 1, borderColor: '#DFE5EC', backgroundColor: '#FFF', borderRadius: 14, padding: 16, gap: 10 }, name: { color: '#17212D', fontSize: 17, fontWeight: '700' }, tag: { color: '#176BA0', backgroundColor: '#E5EFF8', paddingHorizontal: 8, paddingVertical: 5, fontSize: 11, borderRadius: 6 }, checkbox: { minHeight: 44, justifyContent: 'center' }, error: { color: '#A52D38', fontSize: 13, lineHeight: 20 }, overlay: { flex: 1, padding: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#10151D99' }, detail: { maxHeight: '94%', width: '100%', maxWidth: 640, backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden' }, detailContent: { padding: 20, gap: 14 } });
