import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Keep the portable demonstration's player data and attendance rules aligned
// with the Expo application. No server, keys or external resources are embedded.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const domain = stripTypeScriptTypes(readFileSync(resolve(root, 'src/domain.ts'), 'utf8'))
  .replace(/^export /gm, '');
const template = readFileSync(resolve(root, 'demo/portable-template.html'), 'utf8');
const crest = `data:image/jpeg;base64,${readFileSync(resolve(root, 'assets/club-crest.jpg')).toString('base64')}`;
const target = resolve(process.argv[2] ?? resolve(root, 'dist-portable/inter-playa-honda-demo.html'));
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, template.replace('/* DOMAIN_CODE */', domain).replaceAll('__CLUB_CREST_DATA_URI__', crest));
console.log(`Portable demo saved to ${target}`);
