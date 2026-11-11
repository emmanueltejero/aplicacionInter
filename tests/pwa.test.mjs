import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import imageUtils from '@expo/image-utils';
import { preparePwa, pwaManifest } from '../scripts/pwa-assets.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = mkdtempSync(resolve(tmpdir(), 'inter-pwa-test-'));
const html = '<!doctype html><html lang="en"><head><title>App</title></head><body><script src="/aplicacionInter/app-v1.js"></script></body></html>';
let worker;
before(async () => { writeFileSync(resolve(output, 'index.html'), html); await preparePwa(root, output, '/aplicacionInter'); worker = readFileSync(resolve(output, 'service-worker.js'), 'utf8'); });
after(() => rmSync(output, { recursive: true, force: true }));

test('installation metadata and real crest PNGs stay inside the hosted app and launch without user-specific URLs', async () => {
  const manifest = JSON.parse(readFileSync(resolve(output, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.id, '/aplicacionInter/'); assert.equal(manifest.scope, manifest.id);
  assert.equal(manifest.start_url, '/aplicacionInter/?source=pwa'); assert.equal(manifest.display, 'standalone');
  assert.equal(pwaManifest('/club').icons[0].src, '/club/pwa/icon-192.png');
  for (const path of ['', '/', '/club/extra', '/club?code=token', '//evil.example']) assert.throws(() => pwaManifest(path));
  const page = readFileSync(resolve(output, 'index.html'), 'utf8');
  assert.ok(page.includes('lang="es"')); assert.ok(page.includes('href="/aplicacionInter/manifest.webmanifest"'));
  assert.ok(page.includes('apple-mobile-web-app-capable')); assert.ok(page.includes('/aplicacionInter/pwa/apple-touch-icon.png'));
  for (const [name, size] of [['icon-192.png',192],['icon-512.png',512],['icon-maskable-512.png',512],['apple-touch-icon.png',180]]) {
    const info = await imageUtils.getPngInfo(resolve(output, 'pwa', name)); assert.equal(info.width,size); assert.equal(info.height,size);
    assert.deepEqual([...info.data.subarray(0,3)], [255,255,255]);
  }
  const fallback = readFileSync(resolve(output, 'offline.html'), 'utf8');
  assert.ok(fallback.includes('Necesitas conexión')); assert.ok(fallback.includes('location.reload()'));
  assert.ok(fallback.includes('data:image/jpeg;base64,')); assert.equal(fallback.includes('supabase'), false);
});

function runtime() {
  const origin = 'https://example.invalid', listeners = {}, stores = new Map(), added = [], removed = [], fetched = [];
  let offline = false, claimed = false, skipped = false;
  const cache = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    return { async add(request) { added.push(request); stores.get(name).set(new URL(request.url).pathname, new Response('public connection notice')); }, async match(path) { return stores.get(name).get(path)?.clone(); } };
  };
  const self = { location: { origin }, addEventListener(name, callback) { listeners[name] = callback; }, async skipWaiting() { skipped = true; }, clients: { async claim() { claimed = true; } } };
  const caches = { async open(name) { return cache(name); }, async keys() { return [...stores.keys()]; }, async delete(name) { removed.push(name); return stores.delete(name); } };
  class ScopedRequest extends Request { constructor(input, init) { super(new URL(input, origin), init); } }
  runInNewContext(worker, { self, caches, URL, Request: ScopedRequest, Response, fetch: async (request, options) => { fetched.push({ request, options }); if (offline) throw new Error('Offline'); return new Response('network HTML'); } });
  return { listeners, stores, added, removed, fetched, setOffline() { offline = true; }, get claimed() { return claimed; }, get skipped() { return skipped; } };
}
async function lifecycle(runtime, name) { let promise; runtime.listeners[name]({ waitUntil(value) { promise = value; } }); await promise; }
function navigation(runtime, path, patch = {}) {
  let response;
  runtime.listeners.fetch({ request: { url: new URL(path, 'https://example.invalid').href, method: 'GET', mode: 'navigate', ...patch }, respondWith(promise) { response = promise; } });
  return response;
}
test('worker caches only the public fallback and leaves APIs, auth requests and static assets on the network', async () => {
  const app = runtime(); await lifecycle(app, 'install'); assert.equal(app.skipped,true);
  assert.equal(app.added.length,1); assert.equal(app.added[0].url,'https://example.invalid/aplicacionInter/offline.html');
  assert.equal(app.added[0].credentials,'omit');
  for (const [path, patch] of [['https://club.supabase.co/rest/v1/players',{}],['/aplicacionInter/',{method:'POST'}],['/aplicacionInter/app.js',{mode:'cors'}],['/other/',{}],['/aplicacionInter/document.pdf',{}]]) assert.equal(navigation(app,path,patch),undefined);
  const reset = '/aplicacionInter/?password_reset=1&code=private-code';
  assert.equal(await (await navigation(app,reset)).text(),'network HTML'); assert.equal(app.fetched[0].options.cache,'no-store');
  app.setOffline(); assert.equal(await (await navigation(app,reset)).text(),'public connection notice');
  assert.equal(app.added.length,1); assert.equal([...app.stores.values()].some(store => [...store.keys()].some(key => key.includes('code='))),false);
});
test('updates clean only this app cache, take over without reloading open forms and version with the exported code', async () => {
  const app = runtime(); await lifecycle(app, 'install');
  app.stores.set('inter-pwa-aplicacionInter-old',new Map());app.stores.set('inter-pwa-another-repo-old',new Map());app.stores.set('other-app',new Map());
  await lifecycle(app, 'activate');assert.equal(app.claimed,true);assert.deepEqual(app.removed,['inter-pwa-aplicacionInter-old']);
  writeFileSync(resolve(output, 'index.html'), html.replace('app-v1','app-v2'));await preparePwa(root,output,'/aplicacionInter');
  const nextWorker=readFileSync(resolve(output,'service-worker.js'),'utf8');assert.notEqual(nextWorker,worker);
  assert.equal(JSON.parse(readFileSync(resolve(output,'manifest.webmanifest'),'utf8')).id,'/aplicacionInter/');
});
