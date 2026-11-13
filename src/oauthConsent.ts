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
