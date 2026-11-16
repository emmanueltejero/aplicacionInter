import { useLocalSearchParams } from 'expo-router';
import { Platform } from 'react-native';
import { authorizationRequest } from '../oauthConsent';

export function useAuthorizationRequest() {
  const route = useLocalSearchParams<{ authorization_id?: string }>();
  return authorizationRequest(route.authorization_id, Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.search : undefined);
}
