import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key?.startsWith('sb_publishable_')) {
  throw new Error('Set the project URL and its public Publishable key; never use a secret key.');
}
if (new URL(url).protocol !== 'https:') throw new Error('Supabase must use HTTPS.');
const config = JSON.stringify({ url: url.replace(/\/$/, ''), key }).replaceAll('<', '\\u003c');
const crest = `data:image/jpeg;base64,${readFileSync(resolve(root, 'assets/club-crest.jpg')).toString('base64')}`;
const html = readFileSync(resolve(root, 'demo/access-check.html'), 'utf8')
  .replace('/* PUBLIC_CONFIG */', config).replace('__CREST__', crest);
const target = resolve(process.argv[2] ?? resolve(root, 'dist-portable/inter-playa-honda-acceso.html'));
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, html);
console.log('Access check created; it contains only public configuration and the club crest.');
