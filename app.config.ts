import type { ConfigContext, ExpoConfig } from 'expo/config';

// Keep development/native builds at the root; Pages exports use the repository path.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Inter Playa Honda',
  slug: config.slug ?? 'inter-playa-honda',
  // SDK 58 enables async web routes by default. This small Pages app uses a
  // self-contained export so OAuth links do not depend on lazy route chunks.
  plugins: [
    ['expo-router', { asyncRoutes: { web: false } }],
    ...(config.plugins ?? []).filter(plugin => (typeof plugin === 'string' ? plugin : plugin[0]) !== 'expo-router'),
    'expo-sharing', 'expo-asset',
  ],
  web: { ...config.web, output: 'single' },
  experiments: { ...config.experiments, baseUrl: process.env.EXPO_BASE_PATH ?? '' },
});
