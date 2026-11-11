import { spawnSync } from 'node:child_process';
import { copyFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePwa } from './pwa-assets.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const basePath = process.env.EXPO_BASE_PATH || '/aplicacionInter';
if (!/^\/[a-zA-Z0-9_-]+$/.test(basePath)) throw new Error('Expected a single repository path such as /aplicacionInter.');
if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) {
  throw new Error('The web build requires the Supabase URL and public Publishable key, never a secret key.');
}
const exported = spawnSync(process.execPath, [resolve(root, 'node_modules/expo/bin/cli'), 'export', '--platform', 'web', '--max-workers', '2'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, EXPO_BASE_PATH: basePath },
});
if (exported.error) throw exported.error;
if (exported.status !== 0) process.exit(exported.status ?? 1);
await preparePwa(root, resolve(root, 'dist'), basePath);
copyFileSync(resolve(root, 'dist/index.html'), resolve(root, 'dist/404.html'));
copyFileSync(resolve(root, 'assets/fonts/LICENSE-DejaVu.txt'), resolve(root, 'dist/LICENSE-DejaVu.txt'));
writeFileSync(resolve(root, 'dist/.nojekyll'), '');
console.log(`GitHub Pages export prepared for ${basePath}/. Not uploaded or published.`);
