import { useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { dateKey } from '../domain';
import { calendarDate, calendarMonth, moveCalendarMonth } from '../teamCalendar';
import { changePickerMonth, datePickerLabel, datePickerMonths, pickerYearPage } from '../datePicker';
import { trainingStyles as s } from './trainingStyles';

export function DateField({ value, onChange, label, disabled = false }: { value: string; onChange: (date: string) => void; label: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => calendarDate(value) ? value : dateKey(new Date()));
  const [view, setView] = useState<'days' | 'months' | 'years'>('days');
  const [yearStart, setYearStart] = useState(() => pickerYearPage(Number(draft.slice(0,4))));
  const selected = calendarDate(draft)!;
  const year = selected.getFullYear(), month = selected.getMonth() + 1;
  const previous = view === 'years' ? yearStart > 1 : !!moveCalendarMonth(draft, -1);
  const next = view === 'years' ? yearStart + 12 <= 9999 : !!moveCalendarMonth(draft, 1);
  function show() {
    Keyboard.dismiss();
    const date = calendarDate(value) ? value : dateKey(new Date());
    setDraft(date); setYearStart(pickerYearPage(Number(date.slice(0,4)))); setView('days'); setOpen(true);
  }
  function move(offset: number) {
    if (view === 'years') setYearStart(current => current + offset * 12);
    else { const result = moveCalendarMonth(draft, offset); if (result) setDraft(result); }
  }
  return <View style={d.field}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={`Fecha seleccionada: ${datePickerLabel(value)}. Abre el calendario para elegir una fecha.`} aria-expanded={open} disabled={disabled} style={[d.input, disabled && d.disabled]} onPress={show}><Text style={d.value}>{datePickerLabel(value)}</Text><Text style={s.blue}>▾</Text></Pressable>
    {open && <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}><View style={s.overlay}><View style={[s.modal, d.modal]} accessibilityLabel="Selector de fecha">
      <ScrollView contentContainerStyle={d.content}>
        <Text style={s.subtitle}>{label}</Text>
        <View style={d.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={view === 'years' ? 'Años anteriores del selector' : 'Mes anterior del selector'} disabled={disabled || !previous} style={d.arrow} onPress={() => move(-1)}><Text style={d.arrowText}>‹</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Elegir mes de la fecha" aria-expanded={view === 'months'} disabled={disabled} style={[s.secondary, d.month]} onPress={() => setView(current => current === 'months' ? 'days' : 'months')}><Text style={s.blue}>{datePickerMonths[month - 1]} ▾</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Elegir año de la fecha" aria-expanded={view === 'years'} disabled={disabled} style={[s.secondary, d.year]} onPress={() => { setYearStart(pickerYearPage(year)); setView(current => current === 'years' ? 'days' : 'years'); }}><Text style={s.blue}>{year} ▾</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={view === 'years' ? 'Años siguientes del selector' : 'Mes siguiente del selector'} disabled={disabled || !next} style={d.arrow} onPress={() => move(1)}><Text style={d.arrowText}>›</Text></Pressable>
        </View>
        {view === 'years' ? <><Text style={s.label}>{yearStart}–{Math.min(9999, yearStart + 11)}</Text><View style={d.choices}>{Array.from({length: Math.min(12, 10000 - yearStart)}, (_, i) => yearStart + i).map(item => <Pressable key={item} accessibilityRole="button" accessibilityLabel={`Elegir año ${item}`} aria-pressed={year === item} disabled={disabled} style={[s.secondary, d.option, year === item && s.selected]} onPress={() => { setDraft(changePickerMonth(draft, item, month)); setView('days'); }}><Text style={s.blue}>{item}</Text></Pressable>)}</View></>
          : view === 'months' ? <View style={d.choices}>{datePickerMonths.map((item, i) => <Pressable key={item} accessibilityRole="button" accessibilityLabel={`Elegir mes ${item}`} aria-pressed={month === i + 1} disabled={disabled} style={[s.secondary, d.option, month === i + 1 && s.selected]} onPress={() => { setDraft(changePickerMonth(draft, year, i + 1)); setView('days'); }}><Text style={d.monthText}>{item}</Text></Pressable>)}</View>
            : <View accessibilityLabel="Días del selector de fecha">
              <View style={d.week}>{['L','M','X','J','V','S','D'].map((item, i) => <Text key={i} style={d.weekday}>{item}</Text>)}</View>
              {calendarMonth(draft).map((week, index) => <View key={index} style={d.week}>{week.map((item, i) => <View key={item ?? `empty-${i}`} style={d.cell}>{item && <Pressable accessibilityRole="button" accessibilityLabel={`Elegir fecha ${item}`} aria-pressed={item === draft} disabled={disabled} style={[d.day, item === draft && d.selected]} onPress={() => setDraft(item)}><Text style={item === draft ? s.white : d.dayText}>{Number(item.slice(-2))}</Text></Pressable>}</View>)}</View>)}
            </View>}
        <Text accessibilityLiveRegion="polite" style={s.text}>Fecha elegida: {datePickerLabel(draft)}</Text>
        <Pressable accessibilityRole="button" style={s.secondary} disabled={disabled} onPress={() => { setDraft(dateKey(new Date())); setView('days'); }}><Text style={s.blue}>Elegir hoy</Text></Pressable>
      </ScrollView>
      <View style={d.footer}>
        <Pressable accessibilityRole="button" style={s.primary} disabled={disabled} onPress={() => { if (!disabled) { onChange(draft); setOpen(false); } }}><Text style={s.white}>Usar fecha</Text></Pressable>
        <Pressable accessibilityRole="button" style={s.secondary} onPress={() => setOpen(false)}><Text style={s.blue}>Cancelar fecha</Text></Pressable>
      </View>
    </View></View></Modal>}
  </View>;
}
const d = StyleSheet.create({
  field: { minWidth: 0 }, input: { minHeight: 48, paddingHorizontal: 10, borderWidth: 1, borderColor: '#DAE2EB', borderRadius: 8, backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  value: { color: '#17212D', fontSize: 14, flexShrink: 1 }, disabled: { opacity: .65 }, modal: { maxWidth: 420 }, content: { padding: 12, gap: 12 }, header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  month: { flex: 1, paddingHorizontal: 3 }, year: { paddingHorizontal: 6 }, arrow: { minWidth: 36, minHeight: 44, justifyContent: 'center', alignItems: 'center' }, arrowText: { color: '#176BA0', fontSize: 26 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, option: { flexGrow: 1, width: '30%', paddingHorizontal: 4 }, monthText: { color: '#176BA0', fontSize: 12, fontWeight: '600' },
  week: { flexDirection: 'row' }, weekday: { flex: 1, textAlign: 'center', paddingVertical: 8, color: '#61758A', fontSize: 12 }, cell: { flex: 1, minWidth: 0, padding: 1 },
  day: { minHeight: 44, borderRadius: 7, justifyContent: 'center', alignItems: 'center' }, selected: { backgroundColor: '#176BA0' }, dayText: { color: '#17212D', fontSize: 14 }, footer: { padding: 12, borderTopWidth: 1, borderColor: '#DFE5EC', gap: 8 },
});
