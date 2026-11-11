import { Stack } from 'expo-router';
import { View } from 'react-native';
import { InstallApp } from '../components/InstallApp';

export default function Layout() {
  return <View style={{ flex: 1 }}><Stack screenOptions={{ headerShown: false }} /><InstallApp /></View>;
}
