import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const imageBucket = 'exercise-images';
export const imagePath = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/i;
const folder = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function projectUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('La URL debe ser la del proyecto Supabase.');
  return url.origin;
}
export function storageHeaders(key) {
  if (typeof key !== 'string' || (!key.startsWith('sb_secret_') && key.split('.').length !== 3)) throw new Error('Configura una clave de servidor de Supabase para la copia.');
  if (key.split('.').length === 3) {
    let claims; try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); } catch { throw new Error('La clave de servidor no es válida.'); }
    if (claims.role !== 'service_role') throw new Error('La copia necesita una clave de servidor, no la clave pública de la aplicación.');
    return { apikey: key, Authorization: `Bearer ${key}` };
  }
  return { apikey: key };
}
async function response(fetchImpl, url, options) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      last = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(60000) });
      if (last.ok) return last;
      if (last.status < 500 && last.status !== 429) break;
      await last.body?.cancel();
    } catch { last = null; }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(`No se pudo completar la copia de Storage${last ? ` (HTTP ${last.status})` : ''}. No se guardará una copia incompleta.`);
}
export async function exportImages({ url, key, directory, fetchImpl = fetch }) {
  const base = projectUrl(url), headers = storageHeaders(key);
  const bucket = await (await response(fetchImpl, `${base}/storage/v1/bucket/${imageBucket}`, { headers })).json();
  if (bucket.id !== imageBucket || bucket.public !== false) throw new Error('No se pudo verificar el bucket privado de imágenes.');
  const objects = [], seen = new Set(), prefixes = [''];
  for (const prefix of prefixes) {
    for (let offset = 0; ; offset += 100) {
      const rows = await (await response(fetchImpl, `${base}/storage/v1/object/list/${imageBucket}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }) })).json();
      if (!Array.isArray(rows)) throw new Error('No se pudo comprobar la lista completa de imágenes.');
      for (const row of rows) {
        if (!prefix && !row.id && row.metadata == null && folder.test(row.name)) { if (!prefixes.includes(row.name + '/')) prefixes.push(row.name + '/'); continue; }
        const path = prefix + row.name;
        if (!row.id || !imagePath.test(path) || row.metadata?.mimetype !== 'image/jpeg') throw new Error('Storage contiene un archivo que requiere revisar el formato de la copia.');
        if (seen.has(path)) continue;
        seen.add(path);
        const fileResponse = await response(fetchImpl, `${base}/storage/v1/object/authenticated/${imageBucket}/${path}`, { headers });
        const chunks = []; let size = 0;
        for await (const chunk of fileResponse.body) { size += chunk.length; if (size > 204800) { throw new Error('Una imagen supera el límite previsto; revisa la copia.'); } chunks.push(chunk); }
        const bytes = Buffer.concat(chunks);
        if (size < 4 || bytes[0] !== 255 || bytes[1] !== 216 || size !== Number(row.metadata.size)) throw new Error('No se pudo verificar una imagen de la copia.');
        const file = `images/${path}`;
        await mkdir(join(directory, 'images', prefix), { recursive: true, mode: 0o700 });
        await writeFile(join(directory, file), bytes, { mode: 0o600, flag: 'wx' });
        objects.push({ path, file, bytes: size, sha256: sha256(bytes), contentType: 'image/jpeg' });
      }
      if (rows.length < 100) break;
    }
  }
  return { bucket: { id: imageBucket, public: false, fileSizeLimit: bucket.file_size_limit, allowedMimeTypes: bucket.allowed_mime_types }, objects };
}
export async function restoreImages({ url, key, directory, manifest, fetchImpl = fetch }) {
  const base = projectUrl(url);
  if (base === manifest.projectUrl) throw new Error('La restauración de ensayo debe apuntar a un proyecto nuevo, nunca al original.');
  const headers = storageHeaders(key);
  // The database restore creates the private bucket before any files are written.
  const bucket = await (await response(fetchImpl, `${base}/storage/v1/bucket/${imageBucket}`, { headers })).json();
  if (bucket.id !== imageBucket || bucket.public !== false) throw new Error('Restaura primero el bucket privado del proyecto nuevo.');
  for (const object of manifest.storage.objects) {
    if (!imagePath.test(object.path) || object.file !== `images/${object.path}`) throw new Error('Ruta de imagen inválida en la copia.');
    const bytes = await readFile(join(directory, object.file));
    if (bytes.length !== object.bytes || sha256(bytes) !== object.sha256) throw new Error('La copia de una imagen está dañada.');
    await response(fetchImpl, `${base}/storage/v1/object/${imageBucket}/${object.path}`, { method: 'POST', headers: { ...headers, 'Content-Type': object.contentType, 'x-upsert': 'true' }, body: bytes });
  }
}
