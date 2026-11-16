import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { useAuthorizationRequest } from '../components/useAuthorizationRequest';
import OAuthConsentScreen from '../screens/OAuthConsentScreen';
import { trainingStyles as s } from '../components/trainingStyles';

export default function NotFound() {
  const request = useAuthorizationRequest();
  // Recover only the authorization UI. The same authenticated Supabase checks,
  // client allowlist, callback validation and explicit consent still apply.
  if (request.present) return <OAuthConsentScreen />;
  return <View style={{ flex: 1, padding: 24, gap: 16, backgroundColor: '#F4F7FA', justifyContent: 'center' }}>
    <Text style={s.title}>No encontramos esta página</Text>
    <Link href="/" style={s.blue}>Volver a la aplicación del club</Link>
  </View>;
}
