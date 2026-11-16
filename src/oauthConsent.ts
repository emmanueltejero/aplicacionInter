// Supabase validates the OAuth client's registered redirect_uri. Limit this
// club integration to ChatGPT's callback as well; never navigate to URL input.
export function chatGptCallback(value: string): string {
  const url = new URL(value);
  if (!['https://chatgpt.com', 'https://chat.openai.com'].includes(url.origin)
    || url.pathname !== '/connector_platform/oauth/callback' || url.username || url.password || url.hash) throw new Error('Destino OAuth no admitido.');
  return url.href;
}
export function validAuthorizationId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(value);
}

// The browser URL is authoritative on web, including when a saved navigator
// state has selected the unmatched-route screen or retained older parameters.
export function authorizationRequest(routeValue: unknown, browserSearch?: string): { present: boolean; id?: string } {
  if (browserSearch !== undefined) {
    const values = new URLSearchParams(browserSearch).getAll('authorization_id');
    return { present: values.length > 0, id: values.length === 1 && validAuthorizationId(values[0]) ? values[0] : undefined };
  }
  return { present: routeValue !== undefined, id: validAuthorizationId(routeValue) ? routeValue : undefined };
}

export type ConsentStage = 'session' | 'request' | 'callback' | 'permission' | 'decision';
export function consentFailure(cause: unknown, stage: ConsentStage, callback = '', clientId = '') {
  const value = cause && typeof cause === 'object' ? cause as { code?: unknown; status?: unknown } : {};
  const code = typeof value.code === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,70}$/.test(value.code) && !/^sb_/i.test(value.code) ? value.code : '';
  const status = typeof value.status === 'number' && Number.isInteger(value.status) && value.status >= 400 && value.status <= 599 ? value.status : undefined;
  const expired = stage === 'request' && /expir|not_found|flow_state_not_found/.test(code);
  const message = stage === 'callback' ? 'La dirección de regreso de esta conexión no está admitida. Facilita al administrador el diagnóstico que aparece debajo.'
    : stage === 'permission' && ['PGRST202', 'PGRST204', '42883', '42P01'].includes(code) ? 'Falta activar la configuración MCP del club en Supabase. El administrador debe ejecutar la migración MCP.'
      : expired ? 'La solicitud de autorización ha caducado o ya no existe. Inicia una conexión nueva desde ChatGPT.'
        : stage === 'request' ? 'Supabase no ha podido consultar esta solicitud de autorización. Facilita al administrador el código de diagnóstico.'
          : stage === 'permission' ? 'No se pudo comprobar el permiso de esta conexión. Facilita al administrador el código de diagnóstico.'
            : stage === 'decision' ? 'No se pudo completar la autorización. Facilita al administrador el código de diagnóstico.'
              : 'No se pudo comprobar la sesión del club. Revisa la conexión e inicia sesión de nuevo.';
  const diagnostic = [`OAuth · ${stage.toUpperCase()}`, code || (stage === 'callback' ? 'CALLBACK_NOT_ALLOWED' : 'CHECK_FAILED'), ...(status ? [`HTTP ${status}`] : [])];
  // Never display Auth error messages, tokens, OAuth codes, state, hashes or
  // URL credentials. A registered callback origin/path and client UUID suffice.
  if (stage === 'callback' && callback) {
    try { const url = new URL(callback); diagnostic.push(`Destino: ${url.origin}${['https://chatgpt.com', 'https://chat.openai.com'].includes(url.origin) ? url.pathname : ''}`); } catch { /* Invalid URLs carry no displayable diagnostics. */ }
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) diagnostic.push(`Identificador público de la conexión: ${clientId}`);
  return { message, diagnostic: diagnostic.join(' · ') };
}
