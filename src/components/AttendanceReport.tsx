import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Player, Register } from '../domain';
import { dateKey, formatDateInput, initialReportFilters } from '../domain';
import { attendanceReport } from '../attendanceReport';
import type { ReportFilters } from '../attendanceReport';
import type { Match } from '../matches';
import { matchTotals } from '../matches';
import { summaryDocument } from '../summaryDocument';
import { exportSummary } from '../exportSummary';
import type { SummaryExportMode } from '../exportSummary';

export function AttendanceReport({ teamName, roster, register, filters, onChange, matches, matchesError, onRetryMatches }: {
  teamName: string; roster: Player[]; register: Register; filters: ReportFilters; onChange: (filters: ReportFilters) => void;
  matches: Match[] | null; matchesError: string; onRetryMatches: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState('');
  const [exportError, setExportError] = useState('');
  const exportLock = useRef(false);
  const today = dateKey(new Date());
  const result = useMemo(() => {
    try { return { report: attendanceReport(roster, register, filters, today), games: matches === null ? null : matchTotals(roster.filter(player => filters.includeArchived || !player.archivedAt), matches, filters.from, filters.to, today), error: '' }; }
    catch (cause) { return { report: null, games: null, error: cause instanceof Error ? cause.message : 'Revisa las fechas.' }; }
  }, [roster, register, filters, today, matches]);
  const report = result.report;
  const canExport = !!report && matches !== null && !matchesError;
  async function prepareDocument(mode: SummaryExportMode) {
    if (exportLock.current || !canExport || matches === null) return;
    exportLock.current = true; setExporting(true); setExportNotice(''); setExportError('');
    try {
      const document = summaryDocument(teamName, roster, register, filters, matches, today);
      setExportNotice(await exportSummary(document, mode));
    } catch { setExportError('No se pudo preparar el resumen. Revisa la conexión y vuelve a intentarlo. Si falla la impresión o el visor, prueba Guardar PDF.'); }
    finally { exportLock.current = false; setExporting(false); }
  }
  function choosePeriod(period: 'month' | 'last30' | 'all') {
    const now = new Date();
    const previous = new Date(now); previous.setDate(previous.getDate() - 29);
    const range = period === 'month' ? initialReportFilters(now) : { from: period === 'all' ? '' : dateKey(previous), to: period === 'all' ? '' : today };
    onChange({ ...filters, from: range.from, to: range.to });
  }
  return <View style={s.container}>
    <Text style={s.title}>Resumen por jugador</Text>
    <Text style={s.description}>Entrenamientos, partidos jugados y minutos de cada jugador en el mismo período.</Text>
    <View style={s.shortcuts}>{([{ value: 'month', label: 'Este mes' }, { value: 'last30', label: 'Últimos 30 días' }, { value: 'all', label: 'Todo' }] as const).map(period => <Pressable key={period.value} accessibilityRole="button" style={s.shortcut} onPress={() => choosePeriod(period.value)}><Text style={s.blue}>{period.label}</Text></Pressable>)}</View>
    <View style={s.dateFields}>
      <View style={s.field}><Text style={s.label}>Desde</Text><TextInput accessibilityLabel="Resumen desde" style={s.input} value={filters.from} onChangeText={value => onChange({ ...filters, from: formatDateInput(value) })} placeholder="AAAA-MM-DD" placeholderTextColor="#718096" keyboardType="number-pad" maxLength={10} /></View>
      <View style={s.field}><Text style={s.label}>Hasta</Text><TextInput accessibilityLabel="Resumen hasta" style={s.input} value={filters.to} onChangeText={value => onChange({ ...filters, to: formatDateInput(value) })} placeholder="AAAA-MM-DD" placeholderTextColor="#718096" keyboardType="number-pad" maxLength={10} /></View>
    </View>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: filters.includeArchived }} style={s.checkbox} onPress={() => onChange({ ...filters, includeArchived: !filters.includeArchived })}><Text style={s.blue}>{filters.includeArchived ? '☑' : '☐'} Incluir jugadores archivados</Text></Pressable>
    <View style={s.shortcuts}>{([{ value: 'view', label: 'Ver PDF' }, { value: 'save', label: 'Guardar PDF' }, { value: 'print', label: 'Imprimir' }] as const).map(action => <Pressable key={action.value} accessibilityRole="button" accessibilityLabel={`${action.label} del resumen`} disabled={!canExport || exporting} style={[s.shortcut, (!canExport || exporting) && { opacity: .5 }]} onPress={() => { void prepareDocument(action.value); }}><Text style={s.blue}>{action.label}</Text></Pressable>)}</View>
    <Text style={s.description}>El PDF incluye el listado del equipo con los filtros seleccionados. Puedes guardarlo en el móvil o imprimirlo.</Text>
    {(!canExport || exporting) && <Text accessibilityLiveRegion="polite" style={s.description}>{exporting ? 'Preparando resumen…' : result.error ? 'Corrige las fechas para preparar el PDF.' : matchesError ? 'Reintenta la carga de partidos antes de preparar el PDF.' : 'Espera a que se carguen los partidos para preparar el PDF.'}</Text>}
    {!!exportNotice && <Text accessibilityLiveRegion="polite" style={s.description}>{exportNotice}</Text>}
    {!!exportError && <Text accessibilityRole="alert" style={s.error}>{exportError}</Text>}
    <Text style={s.explanation}>Porcentaje = asistencias ÷ registros completados del jugador. Las ausencias justificadas cuentan como no asistidas. Los días sin marcar y las fechas futuras quedan fuera del cálculo.</Text>
    <Text style={s.explanation}>Media de minutos = minutos registrados ÷ partidos en los que jugó. Las convocatorias con 0 minutos y los registros pendientes no entran en la media.</Text>
    {matches === null && !matchesError && <ActivityIndicator accessibilityLabel="Cargando estadísticas de partidos" color="#176BA0" />}
    {!!matchesError && <View style={s.matchesError}><Text accessibilityRole="alert" style={s.error}>{matchesError}</Text><Pressable accessibilityRole="button" style={s.shortcut} onPress={onRetryMatches}><Text style={s.blue}>Reintentar partidos</Text></Pressable></View>}
    {!!result.error && <Text accessibilityRole="alert" style={s.error}>{result.error}</Text>}
    {report && <>
      <Text accessibilityLiveRegion="polite" style={s.caption}>{report.dates} fechas de entrenamiento · {report.totals.recorded} registros completados</Text>
      {report.totals.recorded === 0 && <Text style={s.empty}>Todavía no hay registros de entrenamiento en este período.</Text>}
      {report.rows.length === 0 && <Text style={s.description}>No hay jugadores para mostrar con este filtro.</Text>}
      {report.rows.map(row => {
        const game = result.games?.rows.find(item => item.player.id === row.player.id);
        const percentage = row.percentage === null ? 'Sin datos' : `${row.percentage.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`;
        return <View key={row.player.id} style={s.card} accessibilityLabel={`Resumen de ${row.player.name}`}>
          <View style={s.heading}><View style={s.identity}><Text style={s.number}>#{row.player.number}</Text><Text style={s.name}>{row.player.name}</Text></View><Text style={s.percentage}>{percentage}</Text></View>
          {!!row.player.archivedAt && <Text style={s.archived}>Jugador archivado · historial conservado</Text>}
          <Text style={s.description}>{row.recorded} registros de entrenamiento completados</Text>
          {row.percentage !== null && <View accessibilityRole="progressbar" accessibilityLabel={`Asistencia de ${row.player.name}`} accessibilityValue={{ min: 0, max: 100, now: row.percentage }} style={s.track}><View style={[s.fill, { width: `${row.percentage}%` }]} /></View>}
          <View style={s.counts}>{[{ label: 'Asistidos', count: row.present, color: '#176BA0' }, { label: 'Ausencias', count: row.absent, color: '#A52D38' }, { label: 'Justificadas', count: row.excused, color: '#855A0D' }].map(item => <View key={item.label} style={s.count}><Text style={[s.countNumber, { color: item.color }]}>{item.count}</Text><Text style={s.countLabel}>{item.label}</Text></View>)}</View>
          {game && <View style={s.games}>
            <Text style={s.gamesTitle}>Partidos</Text>
            <View style={s.counts}>{[
              { label: 'Partidos jugados', value: String(game.played) },
              { label: 'Minutos totales', value: game.called > 0 && game.called === game.pending ? '—' : game.minutes.toLocaleString('es-ES') },
              { label: 'Media min/partido', value: game.average === null ? '—' : game.average.toLocaleString('es-ES', { maximumFractionDigits: 1 }) },
            ].map(item => <View key={item.label} style={s.count} accessibilityLabel={`${item.label} de ${row.player.name}`}><Text style={s.gameValue}>{item.value}</Text><Text style={s.gameLabel}>{item.label}</Text></View>)}</View>
            {game.pending > 0 && <Text style={s.pending}>{game.pending} {game.pending === 1 ? 'partido con minutos pendientes' : 'partidos con minutos pendientes'} · cifras provisionales</Text>}
            {game.called === 0 && <Text style={s.archived}>Sin convocatorias registradas en este período.</Text>}
          </View>}
        </View>;
      })}
    </>}
  </View>;
}
const s = StyleSheet.create({ games: { borderTopWidth: 1, borderColor: '#E5EFF8', marginTop: 8, paddingTop: 12, gap: 8 }, gamesTitle: { fontSize: 13, color: '#4F6880', fontWeight: '700' }, gameValue: { fontSize: 20, color: '#176BA0', fontWeight: '700' }, gameLabel: { fontSize: 10, lineHeight: 14, width: '100%', textAlign: 'center', color: '#5D6D7E' }, pending: { color: '#855A0D', fontSize: 11, lineHeight: 17 }, matchesError: { padding: 12, gap: 8, borderRadius: 8, backgroundColor: '#FDE9EB' }, container: { gap: 12 }, title: { fontSize: 21, color: '#17212D', fontWeight: '700' }, description: { color: '#5D6D7E', fontSize: 13, lineHeight: 20 }, shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, shortcut: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: '#DAE2EB', borderRadius: 8, backgroundColor: '#FFF' }, blue: { color: '#176BA0', fontSize: 13, fontWeight: '600' }, dateFields: { flexDirection: 'row', gap: 10 }, field: { flex: 1 }, label: { fontSize: 12, fontWeight: '600', color: '#4F6880', marginBottom: 6 }, input: { minHeight: 48, borderWidth: 1, borderColor: '#DAE2EB', borderRadius: 8, padding: 10, backgroundColor: '#FFF', color: '#17212D', fontSize: 14 }, checkbox: { minHeight: 44, justifyContent: 'center' }, explanation: { fontSize: 12, color: '#4F6880', lineHeight: 19, padding: 14, backgroundColor: '#E5EFF8', borderRadius: 10 }, caption: { fontSize: 12, fontWeight: '600', color: '#5D6D7E', marginTop: 4 }, empty: { color: '#5D6D7E', fontSize: 14, paddingVertical: 12 }, error: { color: '#A52D38', fontSize: 13, lineHeight: 20 }, card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DFE5EC', borderRadius: 14, padding: 16, gap: 8 }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, identity: { flex: 1, gap: 4 }, number: { color: '#176BA0', fontSize: 12, fontWeight: '700' }, name: { color: '#17212D', fontSize: 16, fontWeight: '600' }, percentage: { color: '#176BA0', fontSize: 22, fontWeight: '800' }, archived: { color: '#718096', fontSize: 11 }, track: { height: 6, backgroundColor: '#E5EFF8', borderRadius: 3, overflow: 'hidden' }, fill: { height: 6, backgroundColor: '#176BA0' }, counts: { flexDirection: 'row', marginTop: 4 }, count: { flex: 1, alignItems: 'center', gap: 4 }, countNumber: { fontSize: 20, fontWeight: '700' }, countLabel: { fontSize: 10, color: '#5D6D7E' } });
