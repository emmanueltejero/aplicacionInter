import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { dateKey, formatDateInput } from '../domain';
import type { TrainingPlan, TrainingSave } from '../trainingPlans';
import { filterTrainingPlans, trainingTotals } from '../trainingPlans';
import type { TrainingRepository } from '../data/trainingRepository';
import { TrainingSetupRequired } from '../data/trainingRepository';
import type { ExercisesRepository } from '../data/exercisesRepository';
import { TrainingEditor } from './TrainingEditor';
import { TrainingTotals } from './TrainingTotals';
import { trainingStyles as s } from './trainingStyles';

const setupUrl = 'https://github.com/emmanueltejero/aplicacionInter/blob/main/supabase/migrations/202611100002_training_plans.sql';
export function TrainingPlansPanel({ teamId, initialPlayers, repository, exercisesRepository, onBusyChange }: {
  teamId: string; initialPlayers: number; repository: TrainingRepository; exercisesRepository: ExercisesRepository; onBusyChange: (busy: boolean) => void;
}) {
  const [plans, setPlans] = useState<TrainingPlan[] | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [editor, setEditor] = useState<{ plan?: TrainingPlan } | null>(null);
  const [detail, setDetail] = useState<TrainingPlan | null>(null);
  const [filters, setFilters] = useState(() => ({ from: dateKey(new Date()), to: '', includeArchived: false }));
  useEffect(() => {
    let active = true;
    repository.load(teamId).then(data => { if (active) { setPlans(data); setLoadError(null); } })
      .catch(cause => { if (active) setLoadError(cause instanceof Error ? cause : new Error('No se pudieron cargar los entrenamientos.')); });
    return () => { active = false; };
  }, [repository, teamId, attempt]);
  async function save(request: TrainingSave) {
    if (locked.current) throw new Error('Espera a que termine el guardado.');
    locked.current = true; setBusy(true); onBusyChange(true); setError('');
    try {
      const saved = await repository.save(teamId, request);
      setPlans(current => current?.some(item => item.id === saved.id) ? current.map(item => item.id === saved.id ? saved : item) : [...(current ?? []), saved]);
      setEditor(null); setDetail(null);
    } catch (cause) { const message = cause instanceof Error ? cause.message : 'No se pudo guardar el entrenamiento.'; setError(message); throw new Error(message); }
    finally { locked.current = false; setBusy(false); onBusyChange(false); }
  }
  function refresh() { setPlans(null); setLoadError(null); setError(''); setAttempt(value => value + 1); }
  if (loadError) return <View style={s.container}>
    <Text style={s.title}>Entrenamientos del equipo</Text><Text accessibilityRole="alert" style={s.error}>{loadError.message}</Text>
    {loadError instanceof TrainingSetupRequired && <><Text style={s.text}>El administrador debe ejecutar el SQL de planificación en Supabase. La biblioteca y las otras pestañas siguen disponibles.</Text><Pressable accessibilityRole="link" style={s.secondary} onPress={() => { void Linking.openURL(setupUrl).catch(() => setError('No se pudo abrir GitHub. Busca supabase/migrations/202611100002_training_plans.sql en el repositorio.')); }}><Text style={s.blue}>Abrir SQL de entrenamientos en GitHub</Text></Pressable></>}
    <Pressable accessibilityRole="button" style={s.primary} onPress={refresh}><Text style={s.white}>Reintentar entrenamientos</Text></Pressable>{!!error && <Text style={s.error}>{error}</Text>}
  </View>;
  if (!plans) return <ActivityIndicator accessibilityLabel="Cargando entrenamientos" color="#176BA0" />;
  let selected: TrainingPlan[] | null = null, filterError = '';
  try { selected = filterTrainingPlans(plans, filters.from, filters.to, filters.includeArchived); }
  catch (cause) { filterError = cause instanceof Error ? cause.message : 'Revisa las fechas.'; }
  return <View style={s.container}>
    <Text style={s.title}>Entrenamientos del equipo</Text>
    <Text style={s.text}>Prepara el plan del día con ejercicios de la biblioteca compartida. Los entrenadores de este equipo y los administradores pueden consultarlo y editarlo.</Text>
    <Pressable accessibilityRole="button" style={s.primary} disabled={busy} onPress={() => { setError(''); setEditor({}); }}><Text style={s.white}>Crear entrenamiento</Text></Pressable>
    <View style={s.controls}><Pressable accessibilityRole="button" style={s.secondary} onPress={() => setFilters({ ...filters, from: dateKey(new Date()), to: dateKey(new Date()) })}><Text style={s.blue}>Hoy</Text></Pressable><Pressable accessibilityRole="button" style={s.secondary} onPress={() => setFilters({ ...filters, from: dateKey(new Date()), to: '' })}><Text style={s.blue}>Próximos</Text></Pressable><Pressable accessibilityRole="button" style={s.secondary} onPress={() => setFilters({ ...filters, from: '', to: '' })}><Text style={s.blue}>Todos</Text></Pressable></View>
    <View style={s.fields}><View style={s.field}><Text style={s.label}>Desde</Text><TextInput accessibilityLabel="Entrenamientos desde" style={s.input} value={filters.from} onChangeText={value => setFilters({ ...filters, from: formatDateInput(value) })} placeholder="AAAA-MM-DD" keyboardType="number-pad" maxLength={10} /></View><View style={s.field}><Text style={s.label}>Hasta</Text><TextInput accessibilityLabel="Entrenamientos hasta" style={s.input} value={filters.to} onChangeText={value => setFilters({ ...filters, to: formatDateInput(value) })} placeholder="AAAA-MM-DD" keyboardType="number-pad" maxLength={10} /></View></View>
    <Pressable accessibilityRole="checkbox" accessibilityLabel="Incluir entrenamientos archivados" accessibilityState={{ checked: filters.includeArchived }} style={s.secondary} onPress={() => setFilters({ ...filters, includeArchived: !filters.includeArchived })}><Text style={s.blue}>{filters.includeArchived ? '☑' : '☐'} Incluir archivados</Text></Pressable>
    <Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={refresh}><Text style={s.blue}>Actualizar entrenamientos</Text></Pressable>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!filterError && <Text accessibilityRole="alert" style={s.error}>{filterError}</Text>}
    {selected && <><Text accessibilityLiveRegion="polite" style={s.small}>{selected.length} {selected.length === 1 ? 'entrenamiento' : 'entrenamientos'}</Text>{selected.length === 0 && <Text style={s.text}>{plans.length ? 'No hay entrenamientos con estos filtros.' : 'Todavía no hay planes. Crea el primero con los ejercicios de la biblioteca.'}</Text>}
      {selected.map(plan => {
        const totals = trainingTotals(plan.entries, plan.playerCount);
        return <View key={plan.id} style={s.card} accessibilityLabel={`Entrenamiento ${plan.title}`}>
          <Text style={s.subtitle}>{plan.title}</Text><Text style={s.blue}>{plan.date}{plan.archivedAt ? ' · Archivado' : ''}</Text>
          <Text style={s.text}>{totals.minutes} min · {plan.entries.length} {plan.entries.length === 1 ? 'ejercicio' : 'ejercicios'} · {plan.playerCount} jugadores previstos</Text><Text style={s.small}>Espacio común: {totals.spaceLength} × {totals.spaceWidth} m</Text>
          {!!totals.mismatches.length && <Text style={s.warningText}>Revisa los grupos de {totals.mismatches.length} {totals.mismatches.length === 1 ? 'ejercicio' : 'ejercicios'}.</Text>}
          <View style={s.controls}><Pressable accessibilityRole="button" accessibilityLabel={`Ver plan ${plan.title}`} style={s.secondary} disabled={busy} onPress={() => setDetail(plan)}><Text style={s.blue}>Ver plan</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Editar entrenamiento ${plan.title}`} style={s.secondary} disabled={busy} onPress={() => { setError(''); setEditor({ plan }); }}><Text style={s.blue}>Editar</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`${plan.archivedAt ? 'Restaurar' : 'Archivar'} entrenamiento ${plan.title}`} style={s.secondary} disabled={busy} onPress={() => { void save({ ...plan, archived: !plan.archivedAt }).catch(() => {}); }}><Text style={s.blue}>{plan.archivedAt ? 'Restaurar' : 'Archivar'}</Text></Pressable></View>
        </View>;
      })}
    </>}
    {editor && <TrainingEditor key={editor.plan?.id ?? 'new'} plan={editor.plan} initialPlayers={initialPlayers} exercisesRepository={exercisesRepository} busy={busy} onSave={async request => { await save(request); setFilters({ from: request.date, to: request.date, includeArchived: request.archived }); }} onClose={() => setEditor(null)} />}
    {detail && <Modal visible transparent animationType="fade" onRequestClose={() => setDetail(null)}><View style={s.overlay}><View style={s.modal}><ScrollView contentContainerStyle={s.modalContent}>
      <Text style={s.title}>{detail.title}</Text><Text style={s.blue}>{detail.date}{detail.archivedAt ? ' · Archivado' : ''}</Text><TrainingTotals entries={detail.entries} playerCount={detail.playerCount} />
      {!!detail.notes && <><Text style={s.label}>Notas</Text><Text style={s.text}>{detail.notes}</Text></>}
      {trainingTotals(detail.entries, detail.playerCount).timeline.map((time, index) => {
        const entry = detail.entries[index];
        return <View key={entry.id} style={s.card}><Text style={s.subtitle}>{index + 1}. {entry.title}</Text><Text style={s.blue}>Minuto {time.start}–{time.end} · {entry.duration} min</Text><Text style={s.small}>{entry.categories.join(' · ')} · {entry.minPlayers}–{entry.maxPlayers} jugadores · {entry.spaceLength} × {entry.spaceWidth} m</Text><Text style={s.text}>{entry.description}</Text><Text style={s.text}>Material: {entry.materials.map(item => `${item.quantity} ${item.name}`).join(' · ') || 'Sin material'}</Text></View>;
      })}
      <Text style={s.small}>Las fichas de este plan se conservan como se guardaron, aunque cambie la biblioteca.</Text><Pressable accessibilityRole="button" style={s.primary} onPress={() => setDetail(null)}><Text style={s.white}>Cerrar plan</Text></Pressable>
    </ScrollView></View></View></Modal>}
  </View>;
}
