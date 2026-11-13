import { Asset } from 'expo-asset';
import { clubCrestData } from './clubCrestData';

let fonts: Promise<{ font: string; boldFont: string; crest: string }> | undefined;
async function fontBase64(module: number | string) {
  const response = await fetch(Asset.fromModule(module).uri);
  if (!response.ok) throw new Error('No se pudo cargar la tipografía del PDF. Revisa la conexión e inténtalo de nuevo.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(binary);
}
export function loadPdfAssets() {
  fonts ??= Promise.all([fontBase64(require('../assets/fonts/DejaVuSans.ttf')), fontBase64(require('../assets/fonts/DejaVuSans-Bold.ttf'))])
    .then(([font, boldFont]) => ({ font, boldFont, crest: clubCrestData })).catch(error => { fonts = undefined; throw error; });
  return fonts;
}
