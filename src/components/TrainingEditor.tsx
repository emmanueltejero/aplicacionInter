import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { dateKey, formatDateInput } from '../domain';
import { exerciseCategories, filterExercises, recommendedExercisesFirst } from '../exercises';
import type { Exercise, ExerciseCategory, ExerciseTeamCategory, ExerciseTeamCategoryFilter as TeamFilter } from '../exercises';
import type { ExercisesRepository } from '../data/exercisesRepository';
import { entryFromExercise, trainingDraft, trainingTotals, validateTraining } from '../trainingPlans';
import type { TrainingDraft, TrainingPlan, TrainingSave } from '../trainingPlans';
import { newRecordId } from '../recordId';
import { TrainingTotals } from './TrainingTotals';
import { ExerciseTeamCategoryFilter, ExerciseTeamCategoriesSetup } from './ExerciseTeamCategoryFilter';
import { trainingStyles as s } from './trainingStyles';
import { ExerciseMedia } from './ExerciseMedia';
import { ExerciseFavoriteButton, ExerciseFavoritesFilter } from './ExerciseFavorites';
import { useExerciseFavorites } from './useExerciseFavorites';

export function TrainingEditor({ plan, initialDate, initialPlayers, recommendedCategory, exercisesRepository, busy, onSave, onClose }: {
  plan?: TrainingPlan; initialDate?: string; initialPlayers: number; recommendedCategory?: ExerciseTeamCategory | null; exercisesRepository: ExercisesRepository; busy: boolean;
  onSave: (plan: TrainingSave) => Promise<void>; onClose: () => void;
}) {
  const [id] = useState(() => plan?.id ?? newRecordId());
  const [draft, setDraft] = useState<TrainingDraft>(() => plan ? trainingDraft(plan) : { title: '', date: initialDate ?? dateKey(new Date()), playerCount: initialPlayers ? String(initialPlayers) : '', notes: '', entries: [] });
  const [error, setError] = useState('');
  const [library, setLibrary] = useState<Exercise[] | null>(null);
  const [libraryError, setLibraryError] = useState('');
  const [teamCategoriesReady, setTeamCategoriesReady] = useState(true);
  const [teamCategory, setTeamCategory] = useState<TeamFilter>('');
  const [attempt, setAttempt] = useState(0);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ExerciseCategory | ''>('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const favorites = useExerciseFavorites(exercisesRepository.favorites);
  const [expanded, setExpanded] = useState<string | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const sequenceY = useRef(0);
  const [previewExercise, setPreviewExercise] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    exercisesRepository.load().then(data => { if (active) { setLibrary(data.exercises); setTeamCategoriesReady(data.teamCategoriesReady !== false); setLibraryError(''); } })
      .catch(cause => { if (active) setLibraryError(cause instanceof Error ? cause.message : 'No se pudo consultar la biblioteca.'); });
    return () => { active = false; };
  }, [exercisesRepository, attempt]);
  function add(exercise: Exercise) {
    if (busy || draft.entries.length >= 50) return;
    const entry = entryFromExercise(exercise, newRecordId());
    setDraft(current => current.entries.length >= 50 ? current : { ...current, entries: [...current.entries, { ...entry, duration: String(entry.duration) }] });
  }
  function move(index: number, offset: number) {
    if (busy || index + offset < 0 || index + offset >= draft.entries.length) return;
    const entries = [...draft.entries];
    [entries[index], entries[index + offset]] = [entries[index + offset], entries[index]];
    setDraft({ ...draft, entries });
  }
  async function save() {
    if (busy) return;
    try { setError(''); await onSave({ ...validateTraining(draft), id, revision: plan?.revision ?? 0, archived: !!plan?.archivedAt }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el entrenamiento.'); }
  }
  const count = /^\d+$/.test(draft.playerCount) && Number(draft.playerCount) >= 1 && Number(draft.playerCount) <= 100 ? Number(draft.playerCount) : null;
  const totals = trainingTotals(draft.entries, count);
  const selectedExercises = recommendedExercisesFirst(filterExercises(library ?? [], query, category, false, teamCategoriesReady ? teamCategory : '').filter(item => !onlyFavorites || (favorites.status === 'ready' && favorites.ids.has(item.id))), teamCategoriesReady ? recommendedCategory : null);
  const occurrences = new Map<string, number>();
  for (const entry of draft.entries) occurrences.set(entry.exerciseId, (occurrences.get(entry.exerciseId) ?? 0) + 1);
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}><View style={s.overlay}><View style={s.modal}><ScrollView ref={scroll} contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
    <Text style={s.title}>{plan ? 'Editar entrenamiento' : 'Crear entrenamiento'}</Text>
    <Text style={s.text}>Elige ejercicios y organiza su secuencia. Cambiar su duración aquí no modifica la biblioteca.</Text>
    <Text style={s.label}>Nombre del entrenamiento</Text><TextInput accessibilityLabel="Nombre del entrenamiento" style={s.input} value={draft.title} onChangeText={title => setDraft({ ...draft, title })} maxLength={100} editable={!busy} />
    <View style={s.fields}><View style={s.field}><Text style={s.label}>Fecha</Text><TextInput accessibilityLabel="Fecha del entrenamiento" style={s.input} value={draft.date} onChangeText={date => setDraft({ ...draft, date: formatDateInput(date) })} placeholder="AAAA-MM-DD" keyboardType="number-pad" maxLength={10} editable={!busy} /></View><View style={s.field}><Text style={s.label}>Jugadores previstos</Text><TextInput accessibilityLabel="Jugadores previstos" style={s.input} value={draft.playerCount} onChangeText={playerCount => setDraft({ ...draft, playerCount })} keyboardType="number-pad" maxLength={3} editable={!busy} /></View></View>
    <Text style={s.label}>Notas del entrenamiento</Text><TextInput accessibilityLabel="Notas del entrenamiento" style={[s.input, s.notes]} multiline value={draft.notes} onChangeText={notes => setDraft({ ...draft, notes })} maxLength={3000} editable={!busy} />
    <Text onLayout={event => { sequenceY.current = event.nativeEvent.layout.y; }} accessibilityLiveRegion="polite" style={s.subtitle}>Secuencia · {draft.entries.length} {draft.entries.length === 1 ? 'ejercicio' : 'ejercicios'}</Text>
    {!draft.entries.length && <Text style={s.text}>Añade el primer ejercicio desde la biblioteca.</Text>}
    {draft.entries.map((entry, index) => {
      const time = totals.timeline[index];
      return <View key={entry.id} style={s.card} accessibilityLabel={`Bloque ${index + 1}: ${entry.title}`}>
        <Text style={s.subtitle}>{index + 1}. {entry.title}</Text><Text style={s.blue}>{time.start !== null && time.end !== null ? `Minuto ${time.start}–${time.end}` : 'Duración pendiente'}</Text>
        <Text style={s.small}>{entry.minPlayers}–{entry.maxPlayers} jugadores · {entry.spaceLength} × {entry.spaceWidth} m</Text>
        <Text style={s.label}>Duración de este bloque (minutos)</Text><TextInput accessibilityLabel={`Duración del ejercicio ${index + 1}`} style={s.input} value={entry.duration} onChangeText={duration => setDraft({ ...draft, entries: draft.entries.map(item => item.id === entry.id ? { ...item, duration } : item) })} keyboardType="number-pad" maxLength={3} editable={!busy} />
        <View style={s.controls}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Subir ejercicio ${index + 1}`} disabled={busy || index === 0} style={s.secondary} onPress={() => move(index, -1)}><Text style={s.blue}>Subir</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Bajar ejercicio ${index + 1}`} disabled={busy || index === draft.entries.length - 1} style={s.secondary} onPress={() => move(index, 1)}><Text style={s.blue}>Bajar</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ejercicio ${index + 1}`} disabled={busy} style={s.secondary} onPress={() => setDraft({ ...draft, entries: draft.entries.filter(item => item.id !== entry.id) })}><Text style={s.blue}>Quitar</Text></Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Ver desarrollo del ejercicio ${index + 1}`} accessibilityState={{ expanded: expanded === entry.id }} style={s.secondary} onPress={() => setExpanded(expanded === entry.id ? null : entry.id)}><Text style={s.blue}>{expanded === entry.id ? 'Ocultar desarrollo' : 'Ver desarrollo'}</Text></Pressable>
        {expanded === entry.id && <><Text style={s.text}>{entry.description}</Text><ExerciseMedia imagePath={entry.imagePath} videoUrl={entry.videoUrl} /><Text style={s.small}>Material: {entry.materials.map(item => `${item.quantity} ${item.name}`).join(' · ') || 'Sin material'}</Text></>}
      </View>;
    })}
    <TrainingTotals entries={draft.entries} playerCount={count} />
    <Pressable accessibilityRole="button" disabled={busy} style={s.secondary} onPress={() => setPicker(value => !value)}><Text style={s.blue}>{picker ? 'Cerrar biblioteca' : 'Añadir ejercicios de la biblioteca'}</Text></Pressable>
    {picker && <View style={s.container}>
      <Text style={s.subtitle}>Biblioteca compartida</Text>
      {!library && !libraryError && <ActivityIndicator accessibilityLabel="Cargando ejercicios para el entrenamiento" />}
      {!!libraryError && <Text accessibilityRole="alert" style={s.error}>{libraryError} Puedes seguir editando los bloques ya guardados.</Text>}
      <Pressable accessibilityRole="button" disabled={busy || (!library && !libraryError)} style={s.secondary} onPress={() => { setLibrary(null); setLibraryError(''); setAttempt(value => value + 1); favorites.refresh(); }}><Text style={s.blue}>Actualizar ejercicios</Text></Pressable>
      {library && <>
        <TextInput accessibilityLabel="Buscar ejercicios para el entrenamiento" style={s.input} value={query} onChangeText={setQuery} placeholder="Buscar por nombre, descripción o material" placeholderTextColor="#718096" />
        <ExerciseFavoritesFilter favorites={favorites} onlyFavorites={onlyFavorites} onChange={setOnlyFavorites} disabled={busy} />
        {recommendedCategory && teamCategoriesReady ? <Text style={s.blue}>Primero los recomendados para {recommendedCategory}. Los demás ejercicios siguen disponibles.</Text> : recommendedCategory === null && <Text style={s.small}>Este equipo aún no tiene categoría. Un administrador puede asignarla desde «Usuarios del club → Categorías de equipos».</Text>}
        {!teamCategoriesReady && <ExerciseTeamCategoriesSetup />}
        <ExerciseTeamCategoryFilter value={teamCategory} onChange={setTeamCategory} disabled={!teamCategoriesReady || busy} />
        <Text style={s.label}>Contenido del ejercicio</Text>
        <View style={s.controls}><Pressable accessibilityRole="radio" accessibilityLabel="Todas las categorías para entrenamiento" accessibilityState={{ checked: !category }} style={[s.secondary, !category && s.selected]} onPress={() => setCategory('')}><Text style={s.blue}>Todas</Text></Pressable>{exerciseCategories.map(item => <Pressable key={item} accessibilityRole="radio" accessibilityLabel={`Categoría para entrenamiento ${item}`} accessibilityState={{ checked: category === item }} style={[s.secondary, category === item && s.selected]} onPress={() => setCategory(item)}><Text style={s.blue}>{item}</Text></Pressable>)}</View>
        {!selectedExercises.length && (!onlyFavorites || favorites.status === 'ready') && <Text style={s.text}>{onlyFavorites && !favorites.ids.size ? 'Todavía no tienes favoritos. Pulsa «Todos» y guarda los ejercicios que uses más.' : library.some(item => !item.archivedAt) ? 'No hay ejercicios con estos filtros.' : 'Añade ejercicios en la pestaña Ejercicios para empezar a planificar.'}</Text>}
        {selectedExercises.map(exercise => {
          const added = occurrences.get(exercise.id) ?? 0;
          return <View key={exercise.id} accessibilityLabel={`Ficha para añadir: ${exercise.title}`} style={[s.card, added > 0 && s.selected]}>
            <Text style={s.subtitle}>{exercise.title}</Text><Text style={s.small}>{exercise.duration} min · {exercise.minPlayers}–{exercise.maxPlayers} jugadores · {exercise.spaceLength} × {exercise.spaceWidth} m</Text>
            {recommendedCategory && teamCategoriesReady && exercise.teamCategories?.includes(recommendedCategory) && <Text style={s.blue}>Recomendado para {recommendedCategory}</Text>}
            <ExerciseFavoriteButton exercise={exercise} favorites={favorites} disabled={busy} />
            <Text style={s.small}>Categorías de equipo: {exercise.teamCategories?.length ? exercise.teamCategories.join(' · ') : 'Sin clasificar'}</Text>
            <Text accessibilityLiveRegion="polite" style={added ? s.blue : s.small}>{added ? `✓ Añadido a esta sesión: ${added} ${added === 1 ? 'vez' : 'veces'}` : 'Todavía no está en esta sesión'}</Text>
            {(exercise.imagePath || exercise.videoUrl) && <Pressable accessibilityRole="button" accessibilityLabel={`Ver imagen o vídeo de ${exercise.title}`} style={s.secondary} onPress={() => setPreviewExercise(value => value === exercise.id ? null : exercise.id)}><Text style={s.blue}>{previewExercise === exercise.id ? 'Ocultar imagen y vídeo' : 'Ver imagen y vídeo'}</Text></Pressable>}
            {previewExercise === exercise.id && <ExerciseMedia imagePath={exercise.imagePath} videoUrl={exercise.videoUrl} />}
            <Pressable accessibilityRole="button" accessibilityLabel={`${added ? 'Añadir otra vez' : 'Añadir'} ${exercise.title} al entrenamiento`} disabled={busy || draft.entries.length >= 50} style={s.secondary} onPress={() => add(exercise)}><Text style={s.blue}>{added ? 'Añadir otra vez' : 'Añadir al entrenamiento'}</Text></Pressable>
          </View>;
        })}
      </>}
    </View>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Pressable accessibilityRole="button" disabled={busy} style={s.primary} onPress={() => void save()}><Text style={s.white}>{busy ? 'Guardando…' : 'Guardar entrenamiento'}</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy} style={s.secondary} onPress={onClose}><Text style={s.blue}>Cancelar</Text></Pressable>
  </ScrollView>
  {picker && <View style={s.pickerFooter} accessibilityLabel="Resumen de la sesión en preparación">
    <View style={s.pickerFooterCopy}>
      <Text accessibilityLiveRegion="polite" style={s.blue}>En esta sesión: {draft.entries.length} {draft.entries.length === 1 ? 'ejercicio' : 'ejercicios'} · {totals.minutes === null ? 'Duración pendiente' : `${totals.minutes} min`}</Text>
      <Text style={s.small}>{draft.entries.length >= 50 ? 'Has llegado al máximo de 50 ejercicios.' : 'Pendiente de guardar el entrenamiento'}</Text>
    </View>
    <Pressable accessibilityRole="button" disabled={busy} style={s.primary} onPress={() => { setPicker(false); scroll.current?.scrollTo({ y: sequenceY.current, animated: true }); }}><Text style={s.white}>Ver sesión</Text></Pressable>
  </View>}
  </View></View></Modal>;
}
