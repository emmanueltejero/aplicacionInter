import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Attendance, dateKey, initialReportFilters, Player, Register, summary } from '../domain';
import { ClubRepository, Team } from '../data/repository';
import { PlayerEditor } from '../components/PlayerEditor';
import { PlayerSummary } from '../components/PlayerSummary';
import { MatchesPanel } from '../components/MatchesPanel';
import { AttendanceDateSearch } from '../components/AttendanceDateSearch';
import { ExercisesLibrary } from '../components/ExercisesLibrary';
import { TrainingPlansPanel } from '../components/TrainingPlansPanel';
import { TeamCalendar } from '../components/TeamCalendar';
import { calendarDate } from '../teamCalendar';
import { trainingStyles as menuStyles } from '../components/trainingStyles';

const options: { value: Attendance; label: string; short: string; color: string; bg: string }[] = [
  { value: 'present', label: 'Presente', short: 'Sí', color: '#176BA0', bg: '#DEEEFB' },
  { value: 'absent', label: 'Ausente', short: 'No', color: '#A52D38', bg: '#FDE9EB' },
  { value: 'excused', label: 'Justificado', short: 'Just.', color: '#855A0D', bg: '#FFF2CE' },
];

export default function TeamScreen({ team, teams, repository, onLeave, isAdmin = false }: {
  team: Team; teams: Team[]; repository: ClubRepository; onLeave: () => Promise<void>; isAdmin?: boolean;
}) {
  const { view, calendar_date, attendance_date } = useLocalSearchParams<{ view?: string; calendar_date?: string; attendance_date?: string }>();
  const tab = view === 'team' ? 'team' : view === 'summary' ? 'summary' : view === 'matches' ? 'matches' : view === 'exercises' ? 'exercises' : view === 'training' ? 'training' : view === 'calendar' ? 'calendar' : 'attendance';
  const date = calendarDate(attendance_date) ?? new Date();
  const [register, setRegister] = useState<Register>({});
  const [roster, setRoster] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<{ player?: Player } | null>(null);
  const [reportFilters, setReportFilters] = useState(() => initialReportFilters());
  const [showArchived, setShowArchived] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showArchivedTeams, setShowArchivedTeams] = useState(false);
  const readOnly = !!team.archivedAt;
  const locked = useRef(false);
  const key = dateKey(date);
  const day = register[key] ?? {};
  const activePlayers = roster.filter(player => !player.archivedAt);
  const archivedPlayers = roster.filter(player => player.archivedAt);
  // Retain recorded history for archived players without marking new attendance.
  const attendancePlayers = roster.filter(player => !player.archivedAt || day[player.id]);
  const counts = summary(attendancePlayers, day);
  const calendarKey = dateKey(calendarDate(calendar_date) ?? new Date());
  function selectDate(value: Date) { router.setParams({ attendance_date: dateKey(value) }); }
  function changeTab(value: string) { router.setParams({ view: value, training_id: undefined, match_id: undefined, create_training: undefined, create_match: undefined }); }
  function chooseTeam(id: string) {
    setMenuOpen(false);
    router.setParams({ team: id, training_id: undefined, match_id: undefined, create_training: undefined, create_match: undefined });
  }

  async function load() {
    try {
      const data = await repository.load(team.id);
      setRegister(data.register); setRoster(data.roster); setLoadError(false);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    repository.load(team.id).then(data => {
      if (active) { setRegister(data.register); setRoster(data.roster); setLoading(false); }
    }).catch(() => { if (active) { setLoadError(true); setLoading(false); } });
    return () => { active = false; };
  }, [repository, team.id]);

  async function mutate(operation: () => Promise<unknown>) {
    if (readOnly) throw new Error('El equipo está archivado. Solo se permite consultar su historial.');
    if (locked.current) throw new Error('Espera a que termine el guardado.');
    locked.current = true; setSaving(true); setError('');
    try {
      await operation();
      const data = await repository.load(team.id);
      setRegister(data.register); setRoster(data.roster);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo guardar. Revisa la conexión e inténtalo de nuevo.';
      setError(message); throw new Error(message);
    } finally { locked.current = false; setSaving(false); }
  }
  async function mark(playerId: string, value: Attendance) {
    await mutate(() => repository.mark(team.id, key, playerId, value));
  }
  async function savePlayer(data: { name: string; number: number }, id?: string) {
    await mutate(() => repository.savePlayer(team.id, data, id));
    setEditor(null);
  }
  function archive(player: Player, archived: boolean) {
    void mutate(() => repository.archivePlayer(team.id, player.id, archived)).catch(() => {});
  }
  function moveDate(offset: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + offset);
    selectDate(next);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.header} accessibilityLabel="Cabecera del equipo">
        <View style={styles.headerInner}>
          <View style={styles.brand}><View style={styles.badge}><Image source={require('../../assets/club-crest.jpg')} style={styles.crest} resizeMode="contain" accessibilityLabel="Escudo del Inter Playa Honda" /></View><View style={styles.brandCopy}><Text numberOfLines={1} style={styles.club}>Inter Playa Honda</Text><Text numberOfLines={1} style={styles.headerTeam}>{repository.demo ? 'Demo · ' : ''}{team.name}</Text></View></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir menú del equipo" disabled={saving} style={styles.menuButton} onPress={() => setMenuOpen(true)}><Text style={styles.menuText}>Menú</Text></Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {readOnly && <View style={menuStyles.warning}><Text style={menuStyles.warningText}>Equipo archivado · Solo consulta. Un administrador puede restaurarlo desde «Usuarios del club → Gestionar equipos».</Text></View>}
        <View style={styles.teamCard}><View style={styles.teamCopy}><Text style={styles.teamName}>{team.name}</Text><Text style={styles.muted}>{activePlayers.length} jugadores activos{repository.demo ? ' · Datos ficticios' : ''}</Text></View>{teams.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel="Cambiar equipo" disabled={saving} style={styles.changeTeam} onPress={() => setMenuOpen(true)}><Text style={styles.today}>Cambiar equipo</Text></Pressable>}</View>
        <View style={styles.tabs}>
          {([{ id: 'attendance', label: 'Pasar lista' }, { id: 'team', label: 'Plantilla' }, { id: 'summary', label: 'Resumen' }, { id: 'matches', label: 'Partidos' }, { id: 'exercises', label: 'Ejercicios' }, { id: 'training', label: 'Entrenar' }, { id: 'calendar', label: 'Calendario' }] as const).map(item => (
            <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} disabled={saving} onPress={() => changeTab(item.id)} style={[styles.tab, tab === item.id && styles.tabActive]}><Text style={[styles.tabText, tab === item.id && styles.tabTextActive]}>{item.label}</Text></Pressable>
          ))}
        </View>
        {!!calendarDate(calendar_date) && ['attendance', 'training', 'matches'].includes(tab) && <Pressable accessibilityRole="button" style={styles.teamChoice} disabled={saving} onPress={() => changeTab('calendar')}><Text style={styles.today}>Volver al calendario</Text></Pressable>}
        {!!error && <View style={styles.error}><Text accessibilityRole="alert">{error}</Text></View>}
        {tab === 'attendance' ? <>
          <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Asistencia al entrenamiento</Text><Text style={styles.small}>REGISTRO DIARIO</Text></View>
          <View style={styles.dateBar}>
            <Pressable accessibilityRole="button" accessibilityLabel="Día anterior" style={styles.arrow} disabled={saving} onPress={() => moveDate(-1)}><Text style={styles.arrowText}>‹</Text></Pressable>
            <View style={styles.dateCenter}><Text style={styles.dateText}>{date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</Text><Pressable accessibilityRole="button" disabled={saving} onPress={() => selectDate(new Date())}><Text style={styles.today}>{key === dateKey(new Date()) ? 'Hoy' : 'Volver a hoy'} · {date.getFullYear()}</Text></Pressable></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Día siguiente" style={styles.arrow} disabled={saving} onPress={() => moveDate(1)}><Text style={styles.arrowText}>›</Text></Pressable>
          </View>
          <AttendanceDateSearch key={key} date={date} disabled={saving} onSelect={selectDate} />
          {loading ? <ActivityIndicator style={styles.loader} color="#176BA0" accessibilityLabel="Cargando asistencia" /> : loadError ? <View style={styles.error}><Text>No se pudo cargar el equipo. No se han sobrescrito los datos.</Text><Pressable accessibilityRole="button" onPress={() => { setLoading(true); void load(); }}><Text style={styles.today}>Reintentar</Text></Pressable></View> : <>
            <View style={styles.stats}>{[{ label: 'Presentes', count: counts.present, color: '#176BA0' }, { label: 'Ausentes', count: counts.absent, color: '#A52D38' }, { label: 'Justificados', count: counts.excused, color: '#855A0D' }].map(stat => <View key={stat.label} style={styles.stat}><Text style={[styles.statNumber, { color: stat.color }]}>{stat.count}</Text><Text style={styles.statLabel}>{stat.label}</Text></View>)}</View>
            <View style={styles.listHeading}><Text style={styles.muted}>{counts.pending ? `${counts.pending} pendientes de marcar` : 'Lista completada'}</Text><Text accessibilityLiveRegion="polite" style={styles.small}>{saving ? 'Guardando…' : error ? 'Revisa el aviso' : repository.demo ? 'Guardado local' : 'Datos del servidor'}</Text></View>
            <View style={styles.list}>{attendancePlayers.map(player => <View key={player.id} style={styles.playerRow}>
              <View style={styles.playerIdentity}><View style={styles.number}><Text style={styles.numberText}>{player.number}</Text></View><View><Text style={styles.playerName}>{player.name}</Text><Text style={styles.playerStatus}>{player.archivedAt ? 'Archivado · registro histórico' : options.find(option => option.value === day[player.id])?.label ?? 'Sin marcar'}</Text></View></View>
              <View style={styles.choices}>{options.map(option => { const selected = day[player.id] === option.value; return <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={`${player.name}: ${option.label}`} accessibilityState={{ selected }} disabled={saving || readOnly || !!player.archivedAt} onPress={() => { void mark(player.id, option.value).catch(() => {}); }} style={[styles.choice, selected && { backgroundColor: option.bg, borderColor: option.color }]}><Text style={[styles.choiceText, selected && { color: option.color, fontWeight: '800' }]}>{option.short}</Text></Pressable>; })}</View>
              {!!day[player.id] && !player.archivedAt && <Pressable accessibilityRole="button" accessibilityLabel={`Quitar marca de ${player.name}`} disabled={saving || readOnly} style={styles.clearMark} onPress={() => { void mutate(() => repository.clearAttendance(team.id, key, player.id)).catch(() => {}); }}><Text style={styles.today}>Quitar marca</Text></Pressable>}
            </View>)}</View>
          </>}
        </> : tab === 'calendar' ? <>
          {loading ? <ActivityIndicator accessibilityLabel="Cargando equipo" /> : loadError ? <View style={styles.error}><Text>No se pudo cargar la asistencia del equipo.</Text><Pressable accessibilityRole="button" onPress={() => { setLoading(true); void load(); }}><Text style={styles.today}>Reintentar</Text></Pressable></View> : <TeamCalendar readOnly={readOnly} teamId={team.id} date={calendarKey} register={register} matchesRepository={repository.matches} trainingRepository={repository.training}
            onDateChange={value => router.setParams({ calendar_date: value })}
            onAttendance={() => router.setParams({ view: 'attendance', calendar_date: calendarKey, attendance_date: calendarKey })}
            onTraining={id => router.setParams({ view: 'training', calendar_date: calendarKey, training_id: id, create_training: id ? undefined : '1' })}
            onMatch={id => router.setParams({ view: 'matches', match_view: 'list', calendar_date: calendarKey, match_id: id, create_match: id ? undefined : '1' })} />}
        </> : tab === 'training' ? <>
          {loading ? <ActivityIndicator accessibilityLabel="Cargando equipo" /> : loadError ? <View style={styles.error}><Text>No se pudo cargar la plantilla.</Text><Pressable accessibilityRole="button" onPress={() => { setLoading(true); void load(); }}><Text style={styles.today}>Reintentar</Text></Pressable></View> : <TrainingPlansPanel readOnly={readOnly} teamId={team.id} teamName={team.name} teamCategory={team.category} initialPlayers={activePlayers.length} repository={repository.training} exercisesRepository={repository.exercises} onBusyChange={setSaving} />}
        </> : tab === 'exercises' ? <ExercisesLibrary repository={repository.exercises} onBusyChange={setSaving} /> : tab === 'matches' ? <>
          {loading ? <ActivityIndicator accessibilityLabel="Cargando equipo" /> : loadError ? <View style={styles.error}><Text>No se pudo cargar la plantilla.</Text><Pressable accessibilityRole="button" onPress={() => { setLoading(true); void load(); }}><Text style={styles.today}>Reintentar</Text></Pressable></View> : <MatchesPanel readOnly={readOnly} teamId={team.id} roster={roster} repository={repository.matches} onBusyChange={setSaving} />}
        </> : tab === 'summary' ? <>
          {loading ? <ActivityIndicator accessibilityLabel="Cargando resumen" /> : loadError ? <View style={styles.error}><Text>No se pudo cargar el resumen.</Text><Pressable accessibilityRole="button" onPress={() => { setLoading(true); void load(); }}><Text style={styles.today}>Reintentar</Text></Pressable></View> : <PlayerSummary teamId={team.id} teamName={team.name} roster={roster} register={register} filters={reportFilters} onChange={setReportFilters} repository={repository.matches} />}
        </> : <>
          <Text style={styles.sectionTitle}>Plantilla del equipo</Text><Text style={styles.rosterDescription}>{repository.demo ? 'Usa solo nombres ficticios para probar.' : 'Añade jugadores y mantén al día el equipo.'} Archivar conserva las asistencias anteriores.</Text>
          {loading ? <ActivityIndicator accessibilityLabel="Cargando plantilla" /> : loadError ? <View style={styles.error}><Text>No se pudo cargar la plantilla.</Text><Pressable accessibilityRole="button" onPress={() => { setLoading(true); void load(); }}><Text style={styles.today}>Reintentar</Text></Pressable></View> : <>
            <Pressable accessibilityRole="button" style={styles.primary} disabled={saving || readOnly} onPress={() => setEditor({})}><Text style={styles.primaryText}>Añadir jugador</Text></Pressable>
            {activePlayers.length === 0 && <Text style={styles.rosterDescription}>Todavía no hay jugadores activos. Añade el primero.</Text>}
            <View style={styles.list}>{activePlayers.map(player => <View key={player.id} style={styles.playerRow}><View style={styles.playerIdentity}><View style={styles.number}><Text style={styles.numberText}>{player.number}</Text></View><Text style={styles.playerName}>{player.name}</Text></View><View style={styles.actions}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Editar a ${player.name}`} style={styles.action} disabled={saving || readOnly} onPress={() => setEditor({ player })}><Text style={styles.today}>Editar</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Archivar a ${player.name}`} style={styles.action} disabled={saving || readOnly} onPress={() => archive(player, true)}><Text style={styles.today}>Archivar</Text></Pressable>
            </View></View>)}</View>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showArchived }} onPress={() => setShowArchived(value => !value)} style={styles.action}><Text style={styles.today}>{showArchived ? 'Ocultar' : 'Ver'} archivados ({archivedPlayers.length})</Text></Pressable>
            {showArchived && <View style={styles.list}>{archivedPlayers.map(player => <View key={player.id} style={styles.playerRow}><Text style={styles.playerName}>{player.name} · #{player.number}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Restaurar a ${player.name}`} disabled={saving || readOnly} style={styles.action} onPress={() => archive(player, false)}><Text style={styles.today}>Restaurar jugador</Text></Pressable></View>)}</View>}
          </>}
        </>}
        <View style={styles.next}><Text style={styles.nextTitle}>Del plan al campo</Text><Text style={styles.nextText}>Consulta el entrenamiento del día en «Entrenar» y registra la asistencia en «Pasar lista».</Text></View>
        <Text style={styles.footer}>{repository.demo ? 'Demo con datos ficticios. Los cambios se guardan solo en este dispositivo.' : 'Acceso privado del club. Los cambios se guardan en el servidor; hace falta conexión.'}</Text>
      </ScrollView>
      {menuOpen && <Modal visible transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}><View style={menuStyles.overlay}><View style={menuStyles.modal}>
        <ScrollView contentContainerStyle={menuStyles.modalContent}>
          <Text style={menuStyles.title}>Menú del equipo</Text><Text style={menuStyles.subtitle}>{team.name}</Text><Text style={menuStyles.small}>{repository.demo ? 'Demostración · Datos ficticios' : 'Acceso del club · Inter Playa Honda'}</Text>
          {isAdmin && <Pressable accessibilityRole="button" accessibilityLabel="Gestionar usuarios" disabled={saving} style={menuStyles.secondary} onPress={() => { setMenuOpen(false); router.setParams({ view: 'users' }); }}><Text style={menuStyles.blue}>Usuarios del club</Text></Pressable>}
          <Pressable accessibilityRole="button" disabled={saving} style={menuStyles.secondary} onPress={() => { setMenuOpen(false); void onLeave().catch(() => setError('No se pudo cerrar la sesión. Inténtalo de nuevo.')); }}><Text style={menuStyles.blue}>{repository.demo ? 'Salir de la demo' : 'Cerrar sesión'}</Text></Pressable>
          {teams.length > 1 && <><Text style={menuStyles.subtitle}>Cambiar de equipo</Text>{teams.some(item => item.archivedAt) && <Pressable accessibilityRole="checkbox" accessibilityLabel="Mostrar equipos archivados" aria-checked={showArchivedTeams} style={menuStyles.secondary} onPress={() => setShowArchivedTeams(value => !value)}><Text style={menuStyles.blue}>{showArchivedTeams ? '☑' : '☐'} Mostrar equipos archivados</Text></Pressable>}{teams.filter(item => showArchivedTeams || !item.archivedAt).map(item => <Pressable key={item.id} accessibilityRole="button" aria-pressed={item.id === team.id} disabled={saving} style={[menuStyles.secondary, item.id === team.id && menuStyles.selected]} onPress={() => chooseTeam(item.id)}><Text style={menuStyles.blue}>{item.name}{item.archivedAt ? ' · Archivado (consulta)' : ''}</Text></Pressable>)}</>}
        </ScrollView>
        <View style={styles.menuFooter}><Pressable accessibilityRole="button" style={menuStyles.primary} onPress={() => setMenuOpen(false)}><Text style={menuStyles.white}>Cerrar menú</Text></Pressable></View>
      </View></View></Modal>}
      {editor && <PlayerEditor key={editor.player?.id ?? 'new'} player={editor.player} roster={roster} busy={saving} onSave={savePlayer} onClose={() => setEditor(null)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  clearMark: { minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center', paddingHorizontal: 12 },
  primary: { minHeight: 48, backgroundColor: '#176BA0', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }, primaryText: { color: '#FFF', fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 12 }, action: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  teamChoice: { borderWidth: 1, borderColor: '#DAE2EB', borderRadius: 8, padding: 4 },
  safe: { flex: 1, backgroundColor: '#F4F6F9' },
  header: { backgroundColor: '#10151D', paddingHorizontal: 12, paddingVertical: 8 },
  headerInner: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 8, flexDirection: 'row', alignItems: 'center' },
  brand: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 10, alignItems: 'center' },
  badge: { width: 40, height: 40, backgroundColor: '#FFF', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  crest: { width: 34, height: 34 }, brandCopy: { flex: 1, minWidth: 0 },
  club: { color: '#FFF', fontSize: 16, fontWeight: '800' }, headerTeam: { color: '#AAC3D7', fontSize: 12, marginTop: 2 },
  menuButton: { minHeight: 44, minWidth: 60, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#35516A', borderRadius: 8 },
  menuText: { color: '#FFF', fontSize: 13, fontWeight: '700' }, menuFooter: { padding: 12, borderTopWidth: 1, borderColor: '#DFE5EC' },
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', padding: 12, paddingBottom: 32 },
  teamCard: { padding: 12, backgroundColor: '#FFF', borderRadius: 10, marginBottom: 10, gap: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#DFE5EC' },
  teamCopy: { flex: 1, minWidth: 0 }, changeTeam: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  teamName: { color: '#17212D', fontSize: 16, fontWeight: '700', marginBottom: 3 }, muted: { color: '#5D6D7E', fontSize: 12 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', borderBottomWidth: 1, borderColor: '#D7E0EA', marginBottom: 12 },
  tab: { flex: 1, minWidth: 72, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 8, borderBottomWidth: 3, borderColor: 'transparent' },
  tabActive: { borderColor: '#176BA0' }, tabText: { fontSize: 13, fontWeight: '600', color: '#607184' }, tabTextActive: { color: '#176BA0' },
  sectionHeading: { gap: 8, marginBottom: 16 }, sectionTitle: { fontSize: 19, fontWeight: '700', color: '#17212D' },
  small: { fontSize: 10, color: '#61758A', fontWeight: '600', letterSpacing: 0.5 },
  dateBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#E5EFF8', borderRadius: 12, padding: 5, marginBottom: 16 },
  arrow: { width: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, arrowText: { fontSize: 30, color: '#176BA0' },
  dateCenter: { flex: 1, alignItems: 'center' }, dateText: { fontSize: 13, fontWeight: '700', color: '#17212D', textAlign: 'center' }, today: { color: '#176BA0', fontSize: 12, paddingVertical: 8, fontWeight: '600' },
  stats: { flexDirection: 'row', gap: 8, marginBottom: 22 }, stat: { flex: 1, backgroundColor: '#FFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }, statNumber: { fontSize: 26, fontWeight: '800' }, statLabel: { color: '#5D6D7E', fontSize: 10, marginTop: 5 },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 12 },
  list: { backgroundColor: '#FFF', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#DFE5EC' },
  playerRow: { padding: 12, borderBottomWidth: 1, borderColor: '#EDF1F6', gap: 12 },
  playerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12 }, number: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EBF2F9', justifyContent: 'center', alignItems: 'center' }, numberText: { color: '#176BA0', fontWeight: '700', fontSize: 14 },
  playerName: { fontSize: 15, fontWeight: '600', color: '#17212D' }, playerStatus: { color: '#65788B', fontSize: 11, marginTop: 3 },
  choices: { flexDirection: 'row', gap: 8 }, choice: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: '#DAE2EB', borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FBFD' }, choiceText: { color: '#5D6D7E', fontSize: 12 },
  next: { padding: 20, borderRadius: 14, backgroundColor: '#E5EFF8', marginTop: 26 }, nextTitle: { fontSize: 14, fontWeight: '700', color: '#17212D', marginBottom: 7 }, nextText: { fontSize: 13, lineHeight: 21, color: '#4F6880' },
  footer: { color: '#607184', fontSize: 11, lineHeight: 18, textAlign: 'center', marginTop: 22 }, rosterDescription: { color: '#5D6D7E', fontSize: 13, marginTop: 8, marginBottom: 18 },
  loader: { padding: 40 }, error: { backgroundColor: '#FDE9EB', padding: 16, borderRadius: 10, marginBottom: 12 },
});
