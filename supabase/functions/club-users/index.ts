// Deploy this single file as the Supabase Edge Function named "club-users".
// Gateway verify_jwt is disabled; EVERY request is verified with Auth and the
// current database admin membership before any privileged Auth operation.
// Supabase supplies publishable/secret key dictionaries (with legacy fallbacks).
type Options = { supabaseUrl: string; publicKey: string; serviceKey: string; allowedOrigins?: string[]; fetcher?: typeof fetch };
type ApiResult = { ok: boolean; status: number; data: unknown };
type Account = { id: string; email?: string; app_metadata?: Record<string, unknown> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
class Failure extends Error {
  status: number; code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}
export function createClubUsersHandler(options: Options) {
  const fetcher = options.fetcher ?? fetch;
  const base = options.supabaseUrl.replace(/\/$/, '');
  const origins = options.allowedOrigins ?? ['https://emmanueltejero.github.io'];
  async function call(path: string, token: string, body?: unknown, privileged = false): Promise<ApiResult> {
    const headers: Record<string, string> = { apikey: privileged ? options.serviceKey : options.publicKey, 'Content-Type': 'application/json' };
    // Secret API keys are not JWTs. Let the gateway derive its service context;
    // legacy service_role JWT keys still use the classic Bearer header.
    if (!privileged || !options.serviceKey.startsWith('sb_secret_')) headers.Authorization = `Bearer ${token}`;
    const response = await fetcher(base + path, { method: body === undefined ? 'GET' : 'POST',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000),
    });
    return { ok: response.ok, status: response.status, data: await response.json().catch(() => null) };
  }
  function account(result: ApiResult): Account | null {
    const data = record(result.data), user = record(data?.user) ?? data;
    return user && typeof user.id === 'string' && uuid.test(user.id) ? user as Account : null;
  }
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Origin': origin && origins.includes(origin) ? origin : origins[0] ?? 'https://emmanueltejero.github.io',
      'Access-Control-Allow-Headers': 'authorization,apikey,x-client-info,content-type,x-supabase-client-platform,x-supabase-client-platform-version,x-supabase-client-runtime,x-supabase-client-runtime-version', 'Access-Control-Allow-Methods': 'POST,OPTIONS',
    };
    const reply = (status: number, body: unknown) => new Response(body === null ? null : JSON.stringify(body), { status, headers });
    try {
      if (origin && !origins.includes(origin)) throw new Failure(403, 'FORBIDDEN');
      if (request.method === 'OPTIONS') return reply(204, null);
      if (request.method !== 'POST') throw new Failure(405, 'METHOD_NOT_ALLOWED');
      if (!options.publicKey || !options.serviceKey || !/^https:\/\//.test(base)) throw new Failure(503, 'SERVER_CONFIG');
      const authorization = request.headers.get('authorization') ?? '';
      const match = /^Bearer ([^\s]{1,8192})$/i.exec(authorization);
      if (!match || match[1] === options.serviceKey) throw new Failure(401, 'SESSION_INVALID');
      const token = match[1];
      const identity = await call('/auth/v1/user', token), actor = account(identity);
      if (!identity.ok || !actor) throw new Failure(401, 'SESSION_INVALID');
      const admin = await call('/rest/v1/rpc/is_club_admin', token, {});
      if (!admin.ok || admin.data !== true) throw new Failure(admin.status === 401 ? 401 : 403, admin.status === 401 ? 'SESSION_INVALID' : 'FORBIDDEN');
      // Without the provisioning trigger, Auth creation could leave a partial
      // account. Do not call the admin API unless this migration is active.
      const ready = await call('/rest/v1/rpc/admin_user_setup_ready', token, {});
      if (!ready.ok || ready.data !== 1) throw new Failure(ready.status === 403 ? 403 : 503, ready.status === 403 ? 'FORBIDDEN' : 'SETUP_REQUIRED');
      if (Number(request.headers.get('content-length') ?? 0) > 16384) throw new Failure(413, 'BAD_REQUEST');
      const text = await request.text();
      if (new TextEncoder().encode(text).length > 16384) throw new Failure(413, 'BAD_REQUEST');
      let body: Record<string, unknown> | null;
      try { body = record(JSON.parse(text)); } catch { throw new Failure(400, 'BAD_REQUEST'); }
      const fields = ['action', 'requestId', 'name', 'email', 'password', 'teamIds'];
      if (!body || body.action !== 'create' || Object.keys(body).some(key => !fields.includes(key))) throw new Failure(400, 'BAD_REQUEST');
      const requestId = typeof body.requestId === 'string' ? body.requestId.toLowerCase() : '';
      const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!uuid.test(requestId) || requestId === actor.id) throw new Failure(400, 'BAD_REQUEST');
      if (!name || name.length > 80) throw new Failure(400, 'NAME_INVALID');
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Failure(400, 'EMAIL_INVALID');
      if ([...password].length < 8 || new TextEncoder().encode(password).length > 72) throw new Failure(400, 'PASSWORD_INVALID');
      if (!Array.isArray(body.teamIds) || body.teamIds.length < 1 || body.teamIds.length > 20
        || body.teamIds.some(value => typeof value !== 'string' || !uuid.test(value))) throw new Failure(400, 'TEAMS_INVALID');
      const teamIds = (body.teamIds as string[]).map(value => value.toLowerCase()).sort();
      if (new Set(teamIds).size !== teamIds.length) throw new Failure(400, 'TEAMS_INVALID');
      const teams = await call(`/rest/v1/teams?select=id&id=in.(${teamIds.join(',')})`, token);
      if (!teams.ok) throw new Failure(503, 'TEMPORARY_FAILURE');
      const available = Array.isArray(teams.data) ? new Set(teams.data.map(row => record(row)?.id)) : new Set();
      if (available.size !== teamIds.length || teamIds.some(id => !available.has(id))) throw new Failure(400, 'TEAMS_INVALID');
      const matchesRequest = (user: Account): boolean => {
        const metadata = record(user.app_metadata?.club_provisioning);
        return user.id === requestId && user.email?.toLowerCase() === email && metadata?.version === 1
          && metadata.request_id === requestId && metadata.actor_id === actor.id && metadata.name === name
          && Array.isArray(metadata.team_ids) && JSON.stringify([...metadata.team_ids].sort()) === JSON.stringify(teamIds);
      };
      const recovered = (user: Account) => {
        if (!matchesRequest(user)) throw new Failure(409, 'REQUEST_CONFLICT');
        // Never reset an existing password or rewrite existing permissions.
        return reply(200, { id: user.id, email, replayed: true });
      };
      const previous = await call(`/auth/v1/admin/users/${requestId}`, options.serviceKey, undefined, true), previousUser = account(previous);
      if (previous.ok && previousUser) return recovered(previousUser);
      if (previous.status !== 404) throw new Failure(503, 'TEMPORARY_FAILURE');
      const created = await call('/auth/v1/admin/users', options.serviceKey, {
        id: requestId, email, password, email_confirm: true, role: 'authenticated',
        user_metadata: { display_name: name },
        app_metadata: { club_provisioning: { version: 1, request_id: requestId, actor_id: actor.id, name, team_ids: teamIds } },
      }, true);
      const createdUser = account(created);
      if (created.ok && createdUser && matchesRequest(createdUser)) return reply(201, { id: createdUser.id, email, replayed: false });
      // A concurrent retry may have completed first. Resolve only this exact ID
      // and server-controlled provisioning metadata; never adopt by email.
      const retried = await call(`/auth/v1/admin/users/${requestId}`, options.serviceKey, undefined, true), retriedUser = account(retried);
      if (retried.ok && retriedUser) return recovered(retriedUser);
      const details = record(created.data);
      const code = typeof details?.error_code === 'string' ? details.error_code : typeof details?.code === 'string' ? details.code : '';
      if (['email_exists', 'user_already_exists'].includes(String(code))) throw new Failure(409, 'EMAIL_EXISTS');
      if (['weak_password', 'password_too_short', 'password_too_long'].includes(String(code))) throw new Failure(400, 'PASSWORD_POLICY');
      if (['email_address_invalid', 'validation_failed'].includes(String(code))) throw new Failure(400, 'EMAIL_INVALID');
      throw new Failure(503, 'TEMPORARY_FAILURE');
    } catch (cause) {
      // Do not return or log credentials, Auth response bodies, or server keys.
      const failure = cause instanceof Failure ? cause : new Failure(503, 'TEMPORARY_FAILURE');
      return reply(failure.status, { error: { code: failure.code } });
    }
  };
}

type EdgeRuntime = { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };
const edge = (globalThis as typeof globalThis & { Deno?: EdgeRuntime }).Deno;
function defaultKey(json: string | undefined, fallback: string | undefined): string {
  try {
    const keys = record(JSON.parse(json ?? '{}'));
    if (typeof keys?.default === 'string') return keys.default;
    const first = keys ? Object.values(keys).find(value => typeof value === 'string') : undefined;
    if (typeof first === 'string') return first;
  } catch { /* Use the legacy server-provided key when no dictionary is available. */ }
  return fallback ?? '';
}
if (edge) edge.serve(createClubUsersHandler({
  supabaseUrl: edge.env.get('SUPABASE_URL') ?? '',
  publicKey: defaultKey(edge.env.get('SUPABASE_PUBLISHABLE_KEYS'), edge.env.get('SUPABASE_ANON_KEY')),
  serviceKey: defaultKey(edge.env.get('SUPABASE_SECRET_KEYS'), edge.env.get('SUPABASE_SERVICE_ROLE_KEY')),
  allowedOrigins: (edge.env.get('CLUB_ALLOWED_ORIGINS') ?? 'https://emmanueltejero.github.io').split(',').map(value => value.trim()).filter(Boolean),
}));
