import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Player } from '../domain';
import { dateKey, formatDateInput, initialReportFilters } from '../domain';
import { matchTotals } from '../matches';
import type { Match } from '../matches';
import { MatchesSetupRequired } from '../data/matchesRepository';
import type { MatchesRepository } from '../data/matchesRepository';
import { MatchEditor } from './MatchEditor';
import { calendarDate } from '../teamCalendar';

const setupUrl = 'https://github.com/emmanueltejero/aplicacionInter/blob/main/supabase/migrations/202611090002_matches.sql';
export function MatchesPanel({ teamId, roster, repository, onBusyChange }: { teamId: string; roster: Player[]; repository: MatchesRepository; onBusyChange?: (busy: boolean) => void }) {
  const { match_view, match_id, create_match, calendar_date } = useLocalSearchParams<{ match_view?: string; match_id?: string; create_match?: string; calendar_date?: string }>();
  const initialDate = calendarDate(calendar_date);
  const totalsView = match_view === 'totals';
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [saveError, setSaveError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [editorState, setEditor] = useState<{ match?: Match } | null>(null);
  const linkedMatch = matches?.find(item => item.id === match_id);
  const editor = editorState ?? (linkedMatch ? { match: linkedMatch } : create_match === '1' ? {} : null);
  const [filters, setFilters] = useState(() => initialReportFilters());
  useEffect(() => {
    let active = true;
    repository.load(teamId).then(data => { if (active) { setMatches(data); setLoadError(null); } })
      .catch(cause => { if (active) setLoadError(cause instanceof Error ? cause : new Error('No se pudieron cargar los partidos.')); });
    return () => { active = false; };
  }, [teamId, repository, attempt]);
  function closeEditor() { setEditor(null); router.setParams({ match_id: undefined, create_match: undefined }); }
  async function save(match: Match) {
    if (locked.current) throw new Error('Espera a que termine el guardado.');
    locked.current = true; setBusy(true); onBusyChange?.(true); setSaveError('');
    try {
      const saved = await repository.save(teamId, match);
      setMatches(current => (current ?? []).some(item => item.id === saved.id) ? current!.map(item => item.id === saved.id ? saved : item) : [...(current ?? []), saved]);
      closeEditor();
    } catch (cause) { const message = cause instanceof Error ? cause.message : 'No se pudo guardar el partido.'; setSaveError(message); throw new Error(message); }
    finally { locked.current = false; setBusy(false); onBusyChange?.(false); }
  }
  const today = dateKey(new Date());
  const totals = useMemo(() => {
    try { return { data: matchTotals(roster.filter(player => filters.includeArchived || !player.archivedAt), matches ?? [], filters.from, filters.to, today), error: '' }; }
    catch (cause) { return { data: null, error: cause instanceof Error ? cause.message : 'Revisa las fechas.' }; }
  }, [roster, matches, filters, today]);
  if (loadError) return <View style={s.container}>
    <Text style={s.title}>Partidos y minutos</Text><Text accessibilityRole="alert" style={s.error}>{loadError.message}</Text>
    {loadError instanceof MatchesSetupRequired && <><Text style={s.text}>Para activar esta parte, ejecuta la ampliación de partidos una vez en el SQL Editor de Supabase. La plantilla y la asistencia siguen disponibles.</Text><Pressable accessibilityRole="link" style={s.secondary} onPress={() => { void Linking.openURL(setupUrl).catch(() => setSaveError('No se pudo abrir GitHub. Busca supabase/migrations/202611090002_matches.sql en el repositorio.')); }}><Text style={s.blue}>Abrir SQL de activación en GitHub</Text></Pressable></>}
    <Pressable accessibilityRole="button" style={s.primary} onPress={() => { setMatches(null); setLoadError(null); setAttempt(value => value + 1); }}><Text style={s.white}>Reintentar carga</Text></Pressable>
    {!!saveError && <Text style={s.error}>{saveError}</Text>}
  </View>;
  if (matches === null) return <ActivityIndicator accessibilityLabel="Cargando partidos" color="#176BA0" />;
  return <View style={s.container}>
    <Text style={s.title}>Partidos y minutos</Text>
    <View style={s.controls}>{[{ value: 'list', label: 'Listado' }, { value: 'totals', label: 'Totales por jugador' }].map(item => <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected: totalsView === (item.value === 'totals') }} style={s.secondary} onPress={() => router.setParams({ match_view: item.value })}><Text style={s.blue}>{item.label}</Text></Pressable>)}</View>
    {!!saveError && <Text accessibilityRole="alert" style={s.error}>{saveError}</Text>}
    {!!match_id && !linkedMatch && <Text accessibilityRole="alert" style={s.error}>Este partido ya no está disponible en este equipo. Vuelve al calendario y actualízalo.</Text>}
    {totalsView ? <>
      <Text style={s.text}>Solo se suman partidos marcados como disputados y con fecha hasta hoy. Los minutos vacíos quedan pendientes, no se consideran cero.</Text>
      <View style={s.controls}><Pressable accessibilityRole="button" style={s.secondary} onPress={() => setFilters(initialReportFilters())}><Text style={s.blue}>Este mes</Text></Pressable><Pressable accessibilityRole="button" style={s.secondary} onPress={() => setFilters({ ...filters, from: '', to: '' })}><Text style={s.blue}>Todo el historial</Text></Pressable></View>
      <View style={s.controls}><View style={s.field}><Text style={s.small}>Desde</Text><TextInput accessibilityLabel="Minutos desde" style={s.input} value={filters.from} onChangeText={value => setFilters({ ...filters, from: formatDateInput(value) })} keyboardType="number-pad" placeholder="AAAA-MM-DD" maxLength={10} /></View><View style={s.field}><Text style={s.small}>Hasta</Text><TextInput accessibilityLabel="Minutos hasta" style={s.input} value={filters.to} onChangeText={value => setFilters({ ...filters, to: formatDateInput(value) })} keyboardType="number-pad" placeholder="AAAA-MM-DD" maxLength={10} /></View></View>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: filters.includeArchived }} style={s.secondary} onPress={() => setFilters({ ...filters, includeArchived: !filters.includeArchived })}><Text style={s.blue}>{filters.includeArchived ? '☑' : '☐'} Incluir archivados</Text></Pressable>
      {!!totals.error && <Text accessibilityRole="alert" style={s.error}>{totals.error}</Text>}
      {totals.data && <><Text style={s.text}>{totals.data.matches} partidos disputados en el período</Text>{totals.data.rows.map(row => <View key={row.player.id} style={s.card} accessibilityLabel={`Minutos de ${row.player.name}`}><View style={s.heading}><Text style={s.name}>#{row.player.number} {row.player.name}</Text><Text style={s.minutes}>{row.called === 0 ? 'Sin datos' : row.called === row.pending ? 'Pendiente' : `${row.minutes} min`}</Text></View>{!!row.player.archivedAt && <Text style={s.small}>Archivado · historial conservado</Text>}<Text style={s.text}>Convocado: {row.called} · Jugó: {row.played} · Pendientes: {row.pending}</Text></View>)}</>}
    </> : <>
      <Pressable accessibilityRole="button" style={s.primary} disabled={busy} onPress={() => setEditor({})}><Text style={s.white}>Crear partido</Text></Pressable>
      {matches.length === 0 && <Text style={s.text}>Todavía no hay partidos. Crea el primero y prepara su convocatoria.</Text>}
      {[...matches].sort((a, b) => b.date.localeCompare(a.date)).map(match => <View key={match.id} style={s.card}>
        <Text style={s.name}>Inter Playa Honda · {match.opponent}</Text><Text style={s.text}>{match.date} · {match.venue === 'home' ? 'Local' : 'Visitante'} · {match.duration} min</Text>
        <Text style={s.small}>{match.played ? 'Disputado' : 'Pendiente de disputar'} · {match.players.length} convocados{match.played ? ` · ${match.players.filter(entry => entry.minutes === null).length} con minutos pendientes` : ''}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Editar partido contra ${match.opponent}`} style={s.secondary} disabled={busy} onPress={() => setEditor({ match })}><Text style={s.blue}>Convocatoria y minutos</Text></Pressable>
      </View>)}
    </>}
    {editor && <MatchEditor match={editor.match} initialDate={initialDate ? dateKey(initialDate) : undefined} roster={roster} busy={busy} onSave={save} onClose={closeEditor} />}
  </View>;
}
const s = StyleSheet.create({ container: { gap: 12 }, title: { color: '#17212D', fontSize: 21, fontWeight: '700' }, controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, field: { flex: 1, minWidth: 100, gap: 4 }, input: { minHeight: 48, borderWidth: 1, borderColor: '#DAE2EB', borderRadius: 8, padding: 10, backgroundColor: '#FFF', color: '#17212D', fontSize: 14 }, primary: { minHeight: 48, borderRadius: 8, backgroundColor: '#176BA0', alignItems: 'center', justifyContent: 'center', padding: 12 }, white: { color: '#FFF', fontWeight: '700' }, secondary: { minHeight: 44, padding: 10, borderWidth: 1, borderColor: '#DAE2EB', backgroundColor: '#FFF', borderRadius: 8, justifyContent: 'center', alignItems: 'center' }, blue: { color: '#176BA0', fontWeight: '600', fontSize: 13 }, text: { color: '#5D6D7E', fontSize: 13, lineHeight: 21 }, small: { color: '#718096', fontSize: 11, lineHeight: 18 }, card: { borderWidth: 1, borderColor: '#DFE5EC', backgroundColor: '#FFF', borderRadius: 14, padding: 16, gap: 8 }, name: { flex: 1, color: '#17212D', fontSize: 16, fontWeight: '600' }, heading: { flexDirection: 'row', gap: 10, alignItems: 'center' }, minutes: { color: '#176BA0', fontSize: 19, fontWeight: '700' }, error: { color: '#A52D38', fontSize: 13, lineHeight: 20 } });
