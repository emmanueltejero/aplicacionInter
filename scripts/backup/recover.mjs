import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { decryptFile } from './crypto.mjs';
import { verifyBundle } from './bundle.mjs';
import { restoreImages } from './storage.mjs';

const exec = promisify(execFile);
const [command, source, destination] = process.argv.slice(2);
let work;
try {
  if (command === 'open' && source && destination) {
    work = await mkdtemp(join(tmpdir(), 'inter-club-recovery-'));
    const archive = join(work, 'backup.tar.gz'); await decryptFile(resolve(source), archive, process.env.CLUB_BACKUP_PASSWORD);
    const listing = (await exec('tar', ['-tzf', archive], { maxBuffer: 64 * 1024 * 1024 })).stdout.split('\n').filter(Boolean);
    if (listing.some(name => name.startsWith('/') || name.split('/').includes('..'))) throw new Error('La copia contiene rutas no permitidas.');
    const entries = (await exec('tar', ['-tvzf', archive], { maxBuffer: 64 * 1024 * 1024 })).stdout.split('\n').filter(Boolean);
    if (entries.some(entry => !['d', '-'].includes(entry[0]))) throw new Error('La copia contiene enlaces u objetos no permitidos.');
    const target = resolve(destination); await mkdir(target, { mode: 0o700 });
    try {
      await exec('tar', ['-xzf', archive, '--no-same-owner', '--no-same-permissions', '-C', target]);
      await verifyBundle(target);
    } catch { await rm(target, { recursive: true, force: true }); throw new Error('La copia no supera la verificación.'); }
    console.log('Copia abierta y verificada. No se ha modificado Supabase. Sigue RECOVERY.md para restaurarla en un proyecto nuevo.');
  } else if (command === 'verify' && source && !destination) {
    await verifyBundle(resolve(source)); console.log('Todos los componentes y las imágenes de la copia coinciden con sus huellas.');
  } else if (command === 'images' && source && !destination) {
    const directory = resolve(source), manifest = await verifyBundle(directory);
    await restoreImages({ url: process.env.CLUB_RESTORE_URL, key: process.env.CLUB_RESTORE_KEY, directory, manifest });
    console.log('Imágenes restauradas en el proyecto nuevo. Verifica acceso, fichas y PDF antes de cambiar la aplicación.');
  } else throw new Error('Uso: node scripts/backup/recover.mjs open COPIA.enc CARPETA_NUEVA | verify CARPETA | images CARPETA');
} catch (cause) { console.error(['TypeError', 'SyntaxError'].includes(cause.name) ? 'No se pudo interpretar la copia o la configuración de recuperación.' : cause.message); process.exitCode = 1; }
finally { if (work) await rm(work, { recursive: true, force: true }); }
