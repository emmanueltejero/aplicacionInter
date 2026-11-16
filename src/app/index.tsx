import { useAuthorizationRequest } from '../components/useAuthorizationRequest';
import EntryScreen from '../screens/EntryScreen';
import OAuthConsentScreen from '../screens/OAuthConsentScreen';

export default function Index() {
  const request = useAuthorizationRequest();
  return request.present ? <OAuthConsentScreen /> : <EntryScreen />;
}
