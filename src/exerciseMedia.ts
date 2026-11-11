export const exerciseImageLimit = 200 * 1024;
export const exerciseImageBucket = 'exercise-images';
export type PreparedExerciseImage = { id: string; dataUrl: string; bytes: number };
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export function validExerciseImagePath(value: unknown): value is string {
  return typeof value === 'string' && new RegExp(`^(?:${uuid}/${uuid}\\.jpg|demo:${uuid})$`, 'i').test(value);
}
export function exerciseVideoUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 1000) throw new Error('Usa un enlace HTTPS de YouTube o Vimeo.');
  if (!value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port && ['youtube.com','www.youtube.com','m.youtube.com','youtu.be','vimeo.com','www.vimeo.com','player.vimeo.com'].includes(url.hostname)) return url.href;
  } catch {}
  throw new Error('Usa un enlace HTTPS de YouTube o Vimeo.');
}
export function exerciseMediaFields(value: { imagePath?: unknown; videoUrl?: unknown }): { imagePath?: string | null; videoUrl?: string | null } {
  const result: { imagePath?: string | null; videoUrl?: string | null } = {};
  if (value.imagePath !== undefined) {
    if (value.imagePath !== null && !validExerciseImagePath(value.imagePath)) throw new Error('La referencia de la imagen no es válida.');
    result.imagePath = value.imagePath;
  }
  if (value.videoUrl !== undefined) result.videoUrl = exerciseVideoUrl(value.videoUrl);
  return result;
}
export function jpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length > exerciseImageLimit || bytes[0] !== 255 || bytes[1] !== 216) throw new Error('La imagen debe ser JPEG y ocupar como máximo 200 KB.');
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset++] !== 255) break;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217 || marker === 218) break;
    const length = (bytes[offset] << 8) + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) break;
    if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 7) {
      const height = (bytes[offset + 3] << 8) + bytes[offset + 4], width = (bytes[offset + 5] << 8) + bytes[offset + 6];
      if (width > 0 && height > 0 && width <= 1280 && height <= 1280) return { width, height };
      break;
    }
    offset += length;
  }
  throw new Error('No se pudo comprobar la imagen. Vuelve a seleccionarla.');
}
export function exerciseImageBytes(dataUrl: string): Uint8Array {
  const prefix = 'data:image/jpeg;base64,';
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix) || dataUrl.length > prefix.length + Math.ceil(exerciseImageLimit / 3) * 4) throw new Error('La imagen preparada no es válida o supera los 200 KB.');
  let binary: string;
  try { binary = atob(dataUrl.slice(prefix.length)); } catch { throw new Error('La imagen preparada no es válida.'); }
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  jpegDimensions(bytes); return bytes;
}
export function imageDataUrl(bytes: Uint8Array): string {
  jpegDimensions(bytes);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return 'data:image/jpeg;base64,' + btoa(binary);
}
