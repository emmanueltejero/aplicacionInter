import type { ConfigContext, ExpoConfig } from 'expo/config';

// Keep development/native builds at the root; Pages exports use the repository path.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Inter Playa Honda',
  slug: config.slug ?? 'inter-playa-honda',
  plugins: [...(config.plugins ?? []), 'expo-sharing', 'expo-asset'],
  web: { ...config.web, output: 'single' },
  experiments: { ...config.experiments, baseUrl: process.env.EXPO_BASE_PATH ?? '' },
});
