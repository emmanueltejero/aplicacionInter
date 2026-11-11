import { StyleSheet, Text, View } from 'react-native';
import { dateKey } from '../domain';
import { calendarDate } from '../teamCalendar';
import { DateField } from './DateField';

export function AttendanceDateSearch({ date, disabled, onSelect, label = 'Buscar asistencia por fecha', inputLabel = 'Fecha de asistencia' }: {
  date: Date; disabled: boolean; onSelect: (date: Date) => void; label?: string; inputLabel?: string;
}) {
  return <View style={s.container}>
    <Text style={s.label}>{label}</Text>
    <DateField value={dateKey(date)} label={inputLabel} disabled={disabled} onChange={value => { const selected = calendarDate(value); if (selected && !disabled) onSelect(selected); }} />
  </View>;
}
const s = StyleSheet.create({ container: { gap: 7, marginBottom: 16 }, label: { fontSize: 13, fontWeight: '600', color: '#4F6880' } });
