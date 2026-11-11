import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { dateKey } from '../domain';
import type { Register } from '../domain';
import type { MatchesRepository } from '../data/matchesRepository';
import type { TrainingRepository } from '../data/trainingRepository';
import type { Match } from '../matches';
import { trainingTotals } from '../trainingPlans';
import type { TrainingPlan } from '../trainingPlans';
import { calendarDate, calendarMonth, moveCalendarMonth, teamCalendarEvents } from '../teamCalendar';
import { AttendanceDateSearch } from './AttendanceDateSearch';
import { trainingStyles as s } from './trainingStyles';

export function TeamCalendar({ teamId, date, register, matchesRepository, trainingRepository, onDateChange, onAttendance, onTraining, onMatch, readOnly = false }: {
  readOnly?: boolean; teamId: string; date: string; register: Register; matchesRepository: MatchesRepository; trainingRepository: TrainingRepository;
  onDateChange: (date: string) => void; onAttendance: () => void; onTraining: (id?: string) => void; onMatch: (id?: string) => void;
}) {
  const [data, setData] = useState<{ plans: TrainingPlan[]; matches: Match[]; plansError: string; matchesError: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.allSettled([trainingRepository.load(teamId), matchesRepository.load(teamId)]).then(([plans, matches]) => {
      if (active) setData({ plans: plans.status === 'fulfilled' ? plans.value : [], matches: matches.status === 'fulfilled' ? matches.value : [],
        plansError: plans.status === 'rejected' ? 'No se pudieron cargar los entrenamientos. Pulsa Actualizar calendario para reintentar.' : '',
        matchesError: matches.status === 'rejected' ? 'No se pudieron cargar los partidos. Pulsa Actualizar calendario para reintentar.' : '' });
    });
    return () => { active = false; };
  }, [teamId, trainingRepository, matchesRepository, attempt]);
  const events = useMemo(() => teamCalendarEvents(teamId, data?.plans ?? [], data?.matches ?? []), [teamId, data]);
  const selected = calendarDate(date)!;
  const today = dateKey(new Date()), previous = moveCalendarMonth(date, -1), next = moveCalendarMonth(date, 1);
  const marks = Object.values(register[date] ?? {});
  return <View style={s.container}>
    <Text style={s.title}>Calendario del equipo</Text>
    <Text style={s.text}>Consulta los planes y partidos guardados. Toca un día para ver sus actividades o pasar lista.</Text>
    <View style={c.monthBar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" disabled={!previous} style={s.secondary} onPress={() => { if (previous) onDateChange(previous); }}><Text style={c.arrow}>‹</Text></Pressable>
      <Text style={c.month}>{selected.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" disabled={!next} style={s.secondary} onPress={() => { if (next) onDateChange(next); }}><Text style={c.arrow}>›</Text></Pressable>
    </View>
    <View style={c.grid} accessibilityLabel="Calendario mensual">
      <View style={c.week}>{['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((label, index) => <Text key={index} style={c.weekday}>{label}</Text>)}</View>
      {calendarMonth(date).map((week, row) => <View key={row} style={c.week}>{week.map((value, column) => {
        if (!value) return <View key={column} style={c.cell} />;
        const list = events[value] ?? [], trainings = list.filter(event => event.kind === 'training').length, matches = list.length - trainings;
        const attendance = Object.keys(register[value] ?? {}).length > 0, active = value === date;
        return <View key={value} style={c.cell}><Pressable accessibilityRole="button" accessibilityLabel={`Día ${value}${trainings ? `, ${trainings} entrenamientos` : ''}${matches ? `, ${matches} partidos` : ''}${attendance ? ', asistencia registrada' : ''}`} aria-pressed={active} style={[c.day, value === today && c.today, active && c.selected]} onPress={() => onDateChange(value)}>
          <Text style={[c.dayNumber, active && s.white]}>{Number(value.slice(-2))}</Text>
          <Text style={[c.markers, active && c.selectedText]}>{[trainings ? 'E' : '', matches ? 'P' : '', attendance ? 'A' : ''].filter(Boolean).join(' · ') || ' '}</Text>
        </Pressable></View>;
      })}</View>)}
    </View>
    <Text style={s.small}>E: entrenamiento · P: partido · A: asistencia registrada</Text>
    <View style={s.controls}>
      <Pressable accessibilityRole="button" style={s.secondary} onPress={() => onDateChange(today)}><Text style={s.blue}>Ir a hoy</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={!data} style={s.secondary} onPress={() => { setData(null); setAttempt(value => value + 1); }}><Text style={s.blue}>Actualizar calendario</Text></Pressable>
    </View>
    <AttendanceDateSearch key={date} date={selected} disabled={false} label="Buscar en el calendario" inputLabel="Fecha del calendario" onSelect={value => onDateChange(dateKey(value))} />
    <View style={s.card}>
      <Text style={s.subtitle}>{selected.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Text>
      <Text style={s.small}>{date}</Text>
      <Pressable accessibilityRole="button" style={s.primary} onPress={onAttendance}><Text style={s.white}>{readOnly ? 'Ver asistencia de este día' : 'Pasar lista de este día'}</Text></Pressable>
      <Text style={s.text}>{marks.length ? `Asistencia: ${marks.filter(value => value === 'present').length} presentes · ${marks.filter(value => value === 'absent').length} ausentes · ${marks.filter(value => value === 'excused').length} justificados` : 'Sin asistencia registrada. Preparar un plan no marca la asistencia.'}</Text>
    </View>
    {!data && <ActivityIndicator accessibilityLabel="Cargando calendario" color="#176BA0" />}
    {!!data?.plansError && <Text accessibilityRole="alert" style={s.error}>{data.plansError}</Text>}
    {!!data?.matchesError && <Text accessibilityRole="alert" style={s.error}>{data.matchesError}</Text>}
    {data && !data.plansError && !data.matchesError && !events[date]?.length && <Text style={s.text}>No hay entrenamientos ni partidos guardados para esta fecha.</Text>}
    {(events[date] ?? []).map(event => event.kind === 'training' ? <View key={`training-${event.plan.id}`} style={s.card}>
      <Text style={s.blue}>ENTRENAMIENTO</Text><Text style={s.subtitle}>{event.plan.title}</Text>
      <Text style={s.text}>{trainingTotals(event.plan.entries, event.plan.playerCount).minutes} min · {event.plan.entries.length} ejercicios · {event.plan.playerCount} jugadores previstos</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Abrir entrenamiento ${event.plan.title}`} style={s.secondary} onPress={() => onTraining(event.plan.id)}><Text style={s.blue}>Ver plan y PDF</Text></Pressable>
    </View> : <View key={`match-${event.match.id}`} style={s.card}>
      <Text style={s.blue}>PARTIDO</Text><Text style={s.subtitle}>Inter Playa Honda · {event.match.opponent}</Text>
      <Text style={s.text}>{event.match.venue === 'home' ? 'Local' : 'Visitante'} · {event.match.duration} min · {event.match.played ? 'Disputado' : 'Pendiente de disputar'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Abrir partido contra ${event.match.opponent}`} style={s.secondary} onPress={() => onMatch(event.match.id)}><Text style={s.blue}>Convocatoria y minutos</Text></Pressable>
    </View>)}
    <View style={s.controls}>
      <Pressable accessibilityRole="button" style={s.secondary} disabled={readOnly} onPress={() => onTraining()}><Text style={s.blue}>Preparar entrenamiento este día</Text></Pressable>
      <Pressable accessibilityRole="button" style={s.secondary} disabled={readOnly} onPress={() => onMatch()}><Text style={s.blue}>Añadir partido este día</Text></Pressable>
    </View>
    <Text style={s.small}>Los entrenamientos archivados se consultan en Entrenar. Aquí se muestran los planes activos y todos los partidos del equipo.</Text>
  </View>;
}
const c = StyleSheet.create({
  monthBar: { flexDirection: 'row', alignItems: 'center', gap: 8 }, month: { flex: 1, color: '#17212D', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  arrow: { color: '#176BA0', fontSize: 24, lineHeight: 25 }, grid: { backgroundColor: '#FFF', borderRadius: 12, padding: 4, borderWidth: 1, borderColor: '#DFE5EC' },
  week: { flexDirection: 'row' }, weekday: { flex: 1, textAlign: 'center', paddingVertical: 10, fontSize: 12, fontWeight: '700', color: '#5D6D7E' },
  cell: { flex: 1, minWidth: 0, padding: 1 }, day: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', borderRadius: 7 },
  dayNumber: { color: '#17212D', fontSize: 14, fontWeight: '600' }, markers: { fontSize: 9, color: '#176BA0', lineHeight: 14 },
  today: { borderColor: '#176BA0' }, selected: { backgroundColor: '#10151D' }, selectedText: { color: '#FFF' },
});
