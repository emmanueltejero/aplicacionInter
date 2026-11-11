import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import imageUtils from '@expo/image-utils';

export function pwaManifest(basePath) {
  if (!/^\/[a-zA-Z0-9_-]+$/.test(basePath)) throw new Error('Invalid PWA base path.');
  const scope = `${basePath}/`;
  return {
    id: scope, name: 'Inter Playa Honda', short_name: 'Inter PH', lang: 'es-ES',
    description: 'El día a día de los entrenadores del Inter Playa Honda.',
    start_url: `${scope}?source=pwa`, scope, display: 'standalone',
    theme_color: '#10151D', background_color: '#F4F6F9', prefer_related_applications: false,
    icons: [
      { src: `${scope}pwa/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${scope}pwa/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${scope}pwa/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

export async function preparePwa(root, output, basePath) {
  const manifest = pwaManifest(basePath), scope = manifest.scope;
  const crestPath = resolve(root, 'assets/club-crest.jpg'), crest = readFileSync(crestPath);
  mkdirSync(resolve(output, 'pwa'), { recursive: true });
  // Expo's own icon pipeline keeps the supplied crest intact, with safe margins.
  for (const [size, fraction, name] of [[192, .84, 'icon-192.png'], [512, .84, 'icon-512.png'], [512, .7, 'icon-maskable-512.png'], [180, .84, 'apple-touch-icon.png']]) {
    const inner = Math.round(size * fraction);
    const foreground = await imageUtils.generateImageAsync({ projectRoot: root, cacheType: 'pwa' }, { src: crestPath, name, resizeMode: 'contain', width: inner, height: inner, backgroundColor: '#FFFFFF' });
    const background = await imageUtils.generateImageBackgroundAsync({ resizeMode: 'contain', width: size, height: size, backgroundColor: '#FFFFFF' });
    const icon = await imageUtils.compositeImagesAsync({ foreground: foreground.source, background, x: Math.floor((size - inner) / 2), y: Math.floor((size - inner) / 2) });
    writeFileSync(resolve(output, 'pwa', name), icon);
  }
  const offline = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#10151D"><title>Sin conexión · Inter Playa Honda</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F4F6F9;color:#17212D;font:16px/1.6 system-ui,sans-serif;padding:24px}main{max-width:440px;background:white;border:1px solid #DFE5EC;border-radius:18px;padding:28px}img{display:block;width:88px;height:88px;object-fit:contain;margin:auto}h1{font-size:24px}button{background:#176BA0;color:white;border:0;border-radius:8px;font:inherit;font-weight:700;min-height:48px;width:100%;padding:12px;cursor:pointer}</style></head><body><main><img alt="Escudo del Inter Playa Honda" src="data:image/jpeg;base64,${crest.toString('base64')}"><h1>Necesitas conexión</h1><p>Conéctate a internet para entrar y consultar o guardar los datos del club.</p><p>Los PDF que hayas descargado siguen disponibles en tu dispositivo.</p><button id="retry">Reintentar conexión</button></main><script>document.getElementById('retry').addEventListener('click',function(){location.reload()});</script></body></html>`;
  let html = readFileSync(resolve(output, 'index.html'), 'utf8');
  if (!/<\/head>/i.test(html)) throw new Error('Missing HTML head in Expo export.');
  html = html.replace(/<html\b([^>]*)>/i, (_, attributes) => `<html${attributes.replace(/\s+lang=(['"]).*?\1/i, '')} lang="es">`);
  html = html.replace(/<title>[^<]*<\/title>/i, '<title>Inter Playa Honda</title>');
  html = html.replace(/<\/head>/i, `<link rel="manifest" href="${scope}manifest.webmanifest"><meta name="theme-color" content="#10151D"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Inter Playa Honda"><meta name="apple-mobile-web-app-status-bar-style" content="default"><link rel="apple-touch-icon" sizes="180x180" href="${scope}pwa/apple-touch-icon.png"></head>`);
  const template = readFileSync(resolve(root, 'pwa/service-worker.js'), 'utf8');
  const version = createHash('sha256').update(html).update(offline).update(template).digest('hex').slice(0, 16);
  const prefix = `inter-pwa-${basePath.slice(1)}-`;
  const worker = template.replaceAll('__CACHE_PREFIX__', prefix).replaceAll('__CACHE_NAME__', prefix + version)
    .replaceAll('__APP_PATH__', scope).replaceAll('__OFFLINE_PATH__', `${scope}offline.html`);
  writeFileSync(resolve(output, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
  writeFileSync(resolve(output, 'service-worker.js'), worker);
  writeFileSync(resolve(output, 'offline.html'), offline);
  writeFileSync(resolve(output, 'index.html'), html);
}
