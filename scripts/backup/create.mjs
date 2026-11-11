import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, copyFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { decryptFile, encryptFile } from './crypto.mjs';
import { exportImages, projectUrl, sha256, storageHeaders } from './storage.mjs';
import { fileRecord, verifyBundle } from './bundle.mjs';

const exec = promisify(execFile);
async function run(command, args, options = {}) {
  try { return await exec(command, args, { ...options, maxBuffer: 8 * 1024 * 1024 }); }
  catch { throw new Error(`Falló ${basename(command)} al preparar la copia; revisa la conexión y la configuración. No se subirá una copia parcial.`); }
}
export function databaseUrl(template, password, origin) {
  if (!template || !password) throw new Error('Faltan CLUB_DB_URL o CLUB_DB_PASSWORD en los secretos de GitHub.');
  const url = new URL(template.replace('[YOUR-PASSWORD]', ''));
  const ref = new URL(projectUrl(origin)).hostname.split('.')[0];
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || (url.port && url.port !== '5432') || url.pathname !== '/postgres' || url.hash) throw new Error('Usa la conexión Session pooler, puerto 5432, de Supabase.');
  const direct = url.hostname === `db.${ref}.supabase.co` && decodeURIComponent(url.username) === 'postgres';
  const pooler = url.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(url.username) === `postgres.${ref}`;
  if (!direct && !pooler) throw new Error('La conexión de la base de datos no corresponde al proyecto de la copia.');
  url.password = encodeURIComponent(password); url.searchParams.set('sslmode', 'require');
  return url.toString();
}
export async function dumpDatabase(url, directory, runner = run) {
  const base = [`--remote=${url}`, '--log-level=error'];
  for (const [file, flags] of [
    ['roles.sql', ['--role-only']], ['schema.sql', []],
    ['data.sql', ['--data-only', '--use-copy', '-x', 'storage.buckets_vectors', '-x', 'storage.vector_indexes']],
    ['managed-schema-reference.sql', ['--schema', 'auth,storage']],
  ]) await runner('supabase', ['db', 'dump', ...base, '--file', join(directory, file), ...flags]);
}
export async function createBackup(env = process.env, dependencies = {}) {
  const origin = projectUrl(env.CLUB_SUPABASE_URL ?? 'https://corcjvflavfpvzgyvpyb.supabase.co');
  storageHeaders(env.CLUB_SUPABASE_KEY);
  if (!env.CLUB_BACKUP_PASSWORD || env.CLUB_BACKUP_PASSWORD.length < 32) throw new Error('Configura CLUB_BACKUP_PASSWORD con al menos 32 caracteres aleatorios y guárdala fuera de GitHub.');
  const connection = databaseUrl(env.CLUB_DB_URL, env.CLUB_DB_PASSWORD, origin);
  const directory = await mkdtemp(join(tmpdir(), 'inter-club-backup-'));
  const payload = join(directory, 'payload'), output = resolve(env.CLUB_BACKUP_OUTPUT ?? 'backup-output');
  const stamp = new Date().toISOString().replace(/[-:.]/g, ''), name = `inter-club-${stamp}-${randomUUID().slice(0, 8)}.tar.gz.enc`;
  const target = join(output, name);
  try {
    await mkdir(payload, { mode: 0o700 }); await mkdir(output, { recursive: true, mode: 0o700 });
    await (dependencies.dumpDatabase ?? dumpDatabase)(connection, payload);
    const storage = await (dependencies.exportImages ?? exportImages)({ url: origin, key: env.CLUB_SUPABASE_KEY, directory: payload });
    const commit = (await run('git', ['rev-parse', 'HEAD'])).stdout.trim();
    await run('git', ['archive', '--format=tar.gz', '--output=' + join(payload, 'code.tar.gz'), commit]);
    await copyFile('supabase/backup-managed-objects.sql', join(payload, 'backup-managed-objects.sql'));
    await copyFile('supabase/BACKUPS.md', join(payload, 'RECOVERY.md'));
    const files = [];
    for (const file of ['roles.sql', 'schema.sql', 'data.sql', 'managed-schema-reference.sql', 'backup-managed-objects.sql', 'code.tar.gz', 'RECOVERY.md']) files.push(await fileRecord(payload, file));
    const manifest = { version: 1, createdAt: new Date().toISOString(), projectUrl: origin, commit, cliVersion: '3.1.0', files, storage };
    await writeFile(join(payload, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    await verifyBundle(payload);
    const archive = join(directory, 'backup.tar.gz'); await run('tar', ['-czf', archive, '-C', payload, '.']);
    await encryptFile(archive, target, env.CLUB_BACKUP_PASSWORD);
    // Authenticate/decrypt the actual output and compare the entire archive before upload.
    const check = join(directory, 'check.tar.gz'); await decryptFile(target, check, env.CLUB_BACKUP_PASSWORD);
    if (sha256(await readFile(archive)) !== sha256(await readFile(check))) throw new Error('La verificación del archivo cifrado ha fallado.');
    return target;
  } catch (cause) { await rm(target, { force: true }); throw cause; }
  finally { await rm(directory, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { const target = await createBackup(); console.log(`Copia cifrada y verificada: ${basename(target)}`); }
  catch (cause) { console.error(['TypeError', 'SyntaxError'].includes(cause.name) ? 'Revisa el formato de las direcciones y los secretos de la copia.' : cause.message); process.exitCode = 1; }
}
