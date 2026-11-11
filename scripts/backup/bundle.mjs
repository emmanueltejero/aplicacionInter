import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { imagePath, projectUrl, sha256 } from './storage.mjs';

export const clubTables = ['club_members', 'teams', 'team_coaches', 'players', 'attendance', 'matches', 'match_players', 'exercises', 'training_plans', 'exercise_favorites', 'exercise_reviews'];
export async function fileRecord(directory, file) {
  const bytes = await readFile(join(directory, file));
  if (!bytes.length) throw new Error('La copia contiene un archivo vacío.');
  return { file, bytes: bytes.length, sha256: sha256(bytes) };
}
export async function verifyBundle(directory) {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || projectUrl(manifest.projectUrl) !== manifest.projectUrl || !Array.isArray(manifest.files) || !Array.isArray(manifest.storage?.objects) || manifest.storage.bucket?.id !== 'exercise-images' || manifest.storage.bucket.public !== false) throw new Error('Manifiesto de copia inválido.');
  const required = ['roles.sql', 'schema.sql', 'data.sql', 'managed-schema-reference.sql', 'backup-managed-objects.sql', 'code.tar.gz', 'RECOVERY.md'];
  if (JSON.stringify([...manifest.files.map(item => item.file)].sort()) !== JSON.stringify([...required].sort())) throw new Error('La copia no contiene todos los componentes de recuperación.');
  const seen = new Set();
  for (const record of [...manifest.files, ...manifest.storage.objects]) {
    if (!required.includes(record.file) && (!imagePath.test(record.path) || record.file !== `images/${record.path}`)) throw new Error('Ruta de archivo inválida.');
    if (seen.has(record.file)) throw new Error('La copia contiene archivos repetidos.');
    seen.add(record.file);
    if (!(await stat(join(directory, record.file))).isFile()) throw new Error('Falta un archivo de la copia.');
    const actual = await fileRecord(directory, record.file);
    if (actual.bytes !== record.bytes || actual.sha256 !== record.sha256) throw new Error('La copia está incompleta o dañada.');
  }
  const data = await readFile(join(directory, 'data.sql'), 'utf8');
  for (const [schema, table] of [['auth', 'users'], ['auth', 'identities'], ...clubTables.map(table => ['public', table])]) {
    if (!new RegExp(`COPY\\s+"?${schema}"?\\."?${table}"?\\s*\\(`, 'i').test(data)) throw new Error('La exportación no incluye todas las tablas y cuentas requeridas.');
  }
  const schema = await readFile(join(directory, 'schema.sql'), 'utf8');
  for (const name of ['provision_web_coach', 'is_active_club_member', 'valid_exercise_image_path', 'exercise_review_content_changed']) if (!schema.includes(name)) throw new Error('Faltan funciones o permisos de la aplicación en la copia.');
  const managed = await readFile(join(directory, 'managed-schema-reference.sql'), 'utf8');
  for (const name of ['club_web_coach_provision', 'club_exercise_images_read', 'club_exercise_images_upload']) if (!managed.includes(name)) throw new Error('Faltan personalizaciones de Auth o Storage en la copia.');
  // These immutable image paths appear in the exercise table and historical plan JSON.
  const references = new Set(data.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg/gi) ?? []);
  const paths = new Set(manifest.storage.objects.map(item => item.path));
  for (const path of references) if (!paths.has(path)) throw new Error('Falta una imagen usada por un ejercicio o entrenamiento histórico.');
  return manifest;
}
