import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Player, Register } from '../domain';
import { dateKey, formatDateInput, initialReportFilters } from '../domain';
import { attendanceReport } from '../attendanceReport';
import type { ReportFilters } from '../attendanceReport';

export function AttendanceReport({ roster, register, filters, onChange }: {
  roster: Player[]; register: Register; filters: ReportFilters; onChange: (filters: ReportFilters) => void;
}) {
  const today = dateKey(new Date());
  const result = useMemo(() => {
    try { return { report: attendanceReport(roster, register, filters, today), error: '' }; }
    catch (cause) { return { report: null, error: cause instanceof Error ? cause.message : 'Revisa las fechas.' }; }
  }, [roster, register, filters, today]);
  const report = result.report;
  function choosePeriod(period: 'month' | 'last30' | 'all') {
    const now = new Date();
    const previous = new Date(now); previous.setDate(previous.getDate() - 29);
    const range = period === 'month' ? initialReportFilters(now) : { from: period === 'all' ? '' : dateKey(previous), to: period === 'all' ? '' : today };
    onChange({ ...filters, from: range.from, to: range.to });
  }
  return <View style={s.container}>
    <Text style={s.title}>Resumen de asistencia</Text>
    <Text style={s.description}>Asistencias y ausencias de cada jugador en el período elegido.</Text>
    <View style={s.shortcuts}>{([{ value: 'month', label: 'Este mes' }, { value: 'last30', label: 'Últimos 30 días' }, { value: 'all', label: 'Todo' }] as const).map(period => <Pressable key={period.value} accessibilityRole="button" style={s.shortcut} onPress={() => choosePeriod(period.value)}><Text style={s.blue}>{period.label}</Text></Pressable>)}</View>
    <View style={s.dateFields}>
      <View style={s.field}><Text style={s.label}>Desde</Text><TextInput accessibilityLabel="Resumen desde" style={s.input} value={filters.from} onChangeText={value => onChange({ ...filters, from: formatDateInput(value) })} placeholder="AAAA-MM-DD" placeholderTextColor="#718096" keyboardType="number-pad" maxLength={10} /></View>
      <View style={s.field}><Text style={s.label}>Hasta</Text><TextInput accessibilityLabel="Resumen hasta" style={s.input} value={filters.to} onChangeText={value => onChange({ ...filters, to: formatDateInput(value) })} placeholder="AAAA-MM-DD" placeholderTextColor="#718096" keyboardType="number-pad" maxLength={10} /></View>
    </View>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: filters.includeArchived }} style={s.checkbox} onPress={() => onChange({ ...filters, includeArchived: !filters.includeArchived })}><Text style={s.blue}>{filters.includeArchived ? '☑' : '☐'} Incluir jugadores archivados</Text></Pressable>
    <Text style={s.explanation}>Porcentaje = asistencias ÷ registros completados del jugador. Las ausencias justificadas cuentan como no asistidas. Los días sin marcar y las fechas futuras quedan fuera del cálculo.</Text>
    {!!result.error && <Text accessibilityRole="alert" style={s.error}>{result.error}</Text>}
    {report && <>
      <Text accessibilityLiveRegion="polite" style={s.caption}>{report.dates} fechas con registros · {report.totals.recorded} registros completados</Text>
      {report.totals.recorded === 0 && <Text style={s.empty}>Todavía no hay asistencias registradas en este período.</Text>}
      {report.rows.length === 0 && <Text style={s.description}>No hay jugadores para mostrar con este filtro.</Text>}
      {report.rows.map(row => {
        const percentage = row.percentage === null ? 'Sin datos' : `${row.percentage.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`;
        return <View key={row.player.id} style={s.card} accessibilityLabel={`Resumen de ${row.player.name}`}>
          <View style={s.heading}><View style={s.identity}><Text style={s.number}>#{row.player.number}</Text><Text style={s.name}>{row.player.name}</Text></View><Text style={s.percentage}>{percentage}</Text></View>
          {!!row.player.archivedAt && <Text style={s.archived}>Jugador archivado · historial conservado</Text>}
          <Text style={s.description}>{row.recorded} registros completados</Text>
          {row.percentage !== null && <View accessibilityRole="progressbar" accessibilityLabel={`Asistencia de ${row.player.name}`} accessibilityValue={{ min: 0, max: 100, now: row.percentage }} style={s.track}><View style={[s.fill, { width: `${row.percentage}%` }]} /></View>}
          <View style={s.counts}>{[{ label: 'Asistidos', count: row.present, color: '#176BA0' }, { label: 'Ausencias', count: row.absent, color: '#A52D38' }, { label: 'Justificadas', count: row.excused, color: '#855A0D' }].map(item => <View key={item.label} style={s.count}><Text style={[s.countNumber, { color: item.color }]}>{item.count}</Text><Text style={s.countLabel}>{item.label}</Text></View>)}</View>
        </View>;
      })}
    </>}
  </View>;
}
const s = StyleSheet.create({ container: { gap: 12 }, title: { fontSize: 21, color: '#17212D', fontWeight: '700' }, description: { color: '#5D6D7E', fontSize: 13, lineHeight: 20 }, shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, shortcut: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: '#DAE2EB', borderRadius: 8, backgroundColor: '#FFF' }, blue: { color: '#176BA0', fontSize: 13, fontWeight: '600' }, dateFields: { flexDirection: 'row', gap: 10 }, field: { flex: 1 }, label: { fontSize: 12, fontWeight: '600', color: '#4F6880', marginBottom: 6 }, input: { minHeight: 48, borderWidth: 1, borderColor: '#DAE2EB', borderRadius: 8, padding: 10, backgroundColor: '#FFF', color: '#17212D', fontSize: 14 }, checkbox: { minHeight: 44, justifyContent: 'center' }, explanation: { fontSize: 12, color: '#4F6880', lineHeight: 19, padding: 14, backgroundColor: '#E5EFF8', borderRadius: 10 }, caption: { fontSize: 12, fontWeight: '600', color: '#5D6D7E', marginTop: 4 }, empty: { color: '#5D6D7E', fontSize: 14, paddingVertical: 12 }, error: { color: '#A52D38', fontSize: 13, lineHeight: 20 }, card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DFE5EC', borderRadius: 14, padding: 16, gap: 8 }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, identity: { flex: 1, gap: 4 }, number: { color: '#176BA0', fontSize: 12, fontWeight: '700' }, name: { color: '#17212D', fontSize: 16, fontWeight: '600' }, percentage: { color: '#176BA0', fontSize: 22, fontWeight: '800' }, archived: { color: '#718096', fontSize: 11 }, track: { height: 6, backgroundColor: '#E5EFF8', borderRadius: 3, overflow: 'hidden' }, fill: { height: 6, backgroundColor: '#176BA0' }, counts: { flexDirection: 'row', marginTop: 4 }, count: { flex: 1, alignItems: 'center', gap: 4 }, countNumber: { fontSize: 20, fontWeight: '700' }, countLabel: { fontSize: 10, color: '#5D6D7E' } });
