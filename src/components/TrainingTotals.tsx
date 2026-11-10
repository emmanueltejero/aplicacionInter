import { Text, View } from 'react-native';
import type { TrainingDraft, TrainingInput } from '../trainingPlans';
import { trainingTotals } from '../trainingPlans';
import { trainingStyles as s } from './trainingStyles';

export function TrainingTotals({ entries, playerCount }: { entries: TrainingInput['entries'] | TrainingDraft['entries']; playerCount: number | null }) {
  const totals = trainingTotals(entries, playerCount);
  return <View style={s.totals} accessibilityLabel="Necesidades del entrenamiento">
    <Text style={s.subtitle}>Tu entrenamiento, calculado</Text>
    <Text accessibilityLiveRegion="polite" style={s.totalNumber}>{totals.minutes === null ? 'Completa las duraciones' : `${totals.minutes} min en total`}</Text>
    {!!entries.length && <>
      <Text style={s.text}>Jugadores previstos: {playerCount ?? 'pendiente'}</Text>
      <Text style={s.text}>{totals.minPlayers! <= totals.maxPlayers! ? `Rango común de las fichas: ${totals.minPlayers}–${totals.maxPlayers} jugadores` : 'Las fichas no comparten un mismo rango de jugadores.'}</Text>
      <Text style={s.text}>Espacio común: {totals.spaceLength} × {totals.spaceWidth} m ({totals.spaceLength * totals.spaceWidth} m²)</Text>
      <Text style={s.small}>Se toma el largo máximo y el ancho máximo de las fichas, sin rotar los espacios.</Text>
      <Text style={s.label}>Material para preparar</Text>
      {totals.materials.length ? totals.materials.map(item => <Text key={item.name.toLocaleLowerCase('es')} style={s.text}>{item.quantity} × {item.name}</Text>) : <Text style={s.text}>Sin material</Text>}
      <Text style={s.small}>Ejercicios consecutivos: el material se reutiliza y cuenta la cantidad máxima de cada tipo, agrupando nombres iguales. No se multiplica por grupos.</Text>
    </>}
    {!!totals.mismatches.length && <View style={s.warning}><Text style={s.warningText}>Revisa los grupos: {playerCount} jugadores no encajan en estas fichas.</Text>{totals.mismatches.map(item => <Text key={item.id} style={s.warningText}>{item.title}: {item.minPlayers}–{item.maxPlayers} jugadores</Text>)}<Text style={s.warningText}>Si divides al equipo, ajusta el material y el espacio para esos grupos.</Text></View>}
    {totals.minutes !== null && totals.minutes > 600 && <Text style={s.error}>El entrenamiento no puede superar los 600 minutos.</Text>}
  </View>;
}
