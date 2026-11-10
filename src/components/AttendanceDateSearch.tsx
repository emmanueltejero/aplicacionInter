import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { isCalendarDate } from '../attendanceReport';
import { dateKey, formatDateInput } from '../domain';

export function AttendanceDateSearch({ date, disabled, onSelect, label = 'Buscar asistencia por fecha', inputLabel = 'Fecha de asistencia' }: {
  date: Date; disabled: boolean; onSelect: (date: Date) => void; label?: string; inputLabel?: string;
}) {
  const [value, setValue] = useState(() => dateKey(date));
  const [error, setError] = useState('');
  function search() {
    if (disabled) return;
    if (!isCalendarDate(value) || value.startsWith('0000')) { setError('Introduce una fecha válida con el formato AAAA-MM-DD.'); return; }
    setError('');
    onSelect(new Date(`${value}T12:00:00`));
  }
  return <View style={s.container}>
    <Text style={s.label}>{label}</Text>
    <View style={s.row}>
      <TextInput accessibilityLabel={inputLabel} style={s.input} value={value}
        onChangeText={text => { setValue(formatDateInput(text)); setError(''); }} editable={!disabled}
        placeholder="AAAA-MM-DD" placeholderTextColor="#718096" keyboardType="number-pad"
        maxLength={10} returnKeyType="search" onSubmitEditing={search} />
      <Pressable accessibilityRole="button" disabled={disabled} onPress={search} style={s.button}><Text style={s.buttonText}>Ver fecha</Text></Pressable>
    </View>
    <Text style={s.hint}>Año-mes-día, por ejemplo 2026-11-09.</Text>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>;
}
const s = StyleSheet.create({
  container: { gap: 7, marginBottom: 16 }, label: { fontSize: 13, fontWeight: '600', color: '#4F6880' },
  row: { flexDirection: 'row', gap: 8 }, input: { flex: 1, minWidth: 0, minHeight: 48, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#DAE2EB', backgroundColor: '#FFF', color: '#17212D', fontSize: 15 },
  button: { minHeight: 48, paddingHorizontal: 16, borderRadius: 8, justifyContent: 'center', backgroundColor: '#176BA0' }, buttonText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  hint: { color: '#61758A', fontSize: 11 }, error: { color: '#A52D38', fontSize: 13 },
});
