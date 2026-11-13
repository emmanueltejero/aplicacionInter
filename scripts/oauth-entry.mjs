// GitHub Pages hosts this directory as a real static entry point. Navigate to
// the existing root route before loading Expo Router, keeping Auth's request
// parameters unchanged. This avoids requiring a nested SPA route to start OAuth.
export function oauthEntryHtml(basePath) {
  if (!/^\/[a-zA-Z0-9_-]+$/.test(basePath)) throw new Error('Invalid application base path.');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Autorizar ChatGPT · Inter Playa Honda</title></head><body><p>Abriendo la autorización del club…</p><noscript>Activa JavaScript para continuar con la autorización.</noscript><script>location.replace(${JSON.stringify(`${basePath}/`)} + location.search);</script></body></html>`;
}
