import { useLocalSearchParams } from 'expo-router';
import EntryScreen from '../screens/EntryScreen';
import OAuthConsentScreen from '../screens/OAuthConsentScreen';

export default function Index() {
  const { authorization_id } = useLocalSearchParams<{ authorization_id?: string }>();
  return authorization_id !== undefined ? <OAuthConsentScreen /> : <EntryScreen />;
}
