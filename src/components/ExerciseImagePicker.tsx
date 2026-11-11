import { Text } from 'react-native';
import type { PreparedExerciseImage } from '../exerciseMedia';
import { trainingStyles as s } from './trainingStyles';
export function ExerciseImagePicker(_props: { disabled: boolean; onPick: (image: PreparedExerciseImage) => void; onProcessing: (processing: boolean) => void }) {
  return <Text style={s.small}>Puedes añadir imágenes desde la versión web del club, también instalada en el móvil.</Text>;
}
