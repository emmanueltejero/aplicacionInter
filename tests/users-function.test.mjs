import test from 'node:test';
import assert from 'node:assert/strict';
import { createClubUsersHandler } from '../supabase/functions/club-users/index.ts';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const secret = 'SERVER_ONLY_FAKE_KEY', actor = id(1), origin = 'https://emmanueltejero.github.io';
const draft = { action: 'create', requestId: id(100), name: '  Iván  Pérez ', email: 'COACH@EXAMPLE.INVALID', password: 'Ficticia-123!', teamIds: [id(20), id(10)] };
function environment({ admin = true, ready = 1, invalidSession = false, lost = false, authError = null, missingTeam = false, serviceKey = secret } = {}) {
  const accounts = new Map(), calls = [];
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname, body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ path, body, headers: options.headers, method: options.method });
    const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    assert.equal(options.headers.apikey, path.startsWith('/auth/v1/admin/') ? serviceKey : 'PUBLIC_FAKE_KEY');
    if (path === '/auth/v1/user') return invalidSession ? json({}, 401) : json({ id: actor, app_metadata: { role: 'admin' } });
    if (path === '/rest/v1/rpc/is_club_admin') { assert.equal(options.headers.Authorization, 'Bearer SESSION_TOKEN'); return json(admin); }
    if (path === '/rest/v1/rpc/admin_user_setup_ready') return json(ready);
    if (path === '/rest/v1/teams') return json(missingTeam ? [{ id: id(10) }] : [{ id: id(10) }, { id: id(20) }]);
    assert.equal(options.headers.Authorization, serviceKey.startsWith('sb_secret_') ? undefined : `Bearer ${serviceKey}`);
    if (path.startsWith('/auth/v1/admin/users/')) return accounts.has(path.split('/').at(-1)) ? json(accounts.get(path.split('/').at(-1))) : json({ error_code: 'user_not_found' }, 404);
    if (path === '/auth/v1/admin/users') {
      if (authError) return json({ code: 422, error_code: authError, msg: 'UNSAFE_SERVER_TEXT password=DO_NOT_SHOW' }, 422);
      assert.equal(body.id, draft.requestId); assert.equal(body.role, 'authenticated'); assert.equal(body.email_confirm, true);
      const user = { id: body.id, email: body.email, app_metadata: body.app_metadata };
      accounts.set(user.id, user);
      if (lost) { lost = false; throw new Error('Response lost after commit'); }
      return json(user, 201);
    }
    throw new Error('Unexpected endpoint '+path);
  };
  const handler = createClubUsersHandler({ supabaseUrl: 'https://project.supabase.co', publicKey: 'PUBLIC_FAKE_KEY', serviceKey, fetcher });
  async function send(body = draft, headers = {}, method = 'POST') {
    return handler(new Request('https://project.supabase.co/functions/v1/club-users', { method,
      headers: { origin, authorization: 'Bearer SESSION_TOKEN', 'Content-Type': 'application/json', ...headers },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    }));
  }
  return { handler, send, accounts, calls };
}
test('valid admin account creation is coach-only, normalized, atomic-ready and never returns credentials', async () => {
  const env = environment(), response = await env.send(), body = await response.json();
  assert.equal(response.status, 201); assert.deepEqual(body, { id: draft.requestId, email: 'coach@example.invalid', replayed: false });
  const created = env.calls.find(call => call.path === '/auth/v1/admin/users').body;
  assert.equal(created.user_metadata.display_name, 'Iván Pérez'); assert.deepEqual(created.app_metadata.club_provisioning.team_ids, [id(10), id(20)]);
  assert.equal(created.app_metadata.club_provisioning.actor_id, actor);
  assert.equal(JSON.stringify(body).includes(draft.password), false); assert.equal(JSON.stringify(body).includes(secret), false);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
test('new secret API keys stay in apikey and never replace the user JWT on permission checks', async () => {
  const env = environment({ serviceKey: 'sb_secret_FAKE_SERVER_ONLY' });
  assert.equal((await env.send()).status, 201);
  assert.ok(env.calls.filter(call => call.path.startsWith('/rest/')).every(call => call.headers.Authorization === 'Bearer SESSION_TOKEN' && call.headers.apikey === 'PUBLIC_FAKE_KEY'));
});
test('missing/forged credentials, non-admins and absent provisioning never reach the admin API', async () => {
  for (const [options, headers, expected] of [[{}, { authorization: '' }, 401], [{ invalidSession: true }, {}, 401], [{ admin: false }, {}, 403], [{ ready: 0 }, {}, 503]]) {
    const env = environment(options), response = await env.send(draft, headers);
    assert.equal(response.status, expected); assert.equal(env.calls.some(call => call.path.includes('/admin/')), false);
  }
  const env = environment(); assert.equal((await env.send(draft, { origin: 'https://attacker.invalid' })).status, 403); assert.equal(env.calls.length, 0);
  assert.equal((await env.send(null, {}, 'OPTIONS')).status, 204); assert.equal(env.calls.length, 0);
  assert.equal((await env.send(null, {}, 'GET')).status, 405);
});
test('validation rejects role injection, unavailable teams and malformed account fields before creation', async () => {
  for (const patch of [{ role: 'admin' }, { requestId: actor }, { teamIds: [] }, { teamIds: [id(10), id(10)] }, { password: 'short' }, { password: 'ñ'.repeat(37) }, { email: 'bad' }, { name: '' }]) {
    const env = environment(); const response = await env.send({ ...draft, ...patch });
    assert.equal(response.status, 400); assert.equal(env.accounts.size, 0); assert.equal(env.calls.some(call => call.path.includes('/admin/')), false);
  }
  const env = environment({ missingTeam: true }); assert.equal((await env.send()).status, 400); assert.equal(env.accounts.size, 0);
});
test('lost responses retry the same account without resetting its password or creating duplicates', async () => {
  const env = environment({ lost: true });
  assert.equal((await env.send()).status, 503); assert.equal(env.accounts.size, 1);
  const response = await env.send(); assert.deepEqual(await response.json(), { id: draft.requestId, email: 'coach@example.invalid', replayed: true });
  const again = await env.send({ ...draft, password: 'Otra-ficticia-456!' }); assert.equal((await again.json()).replayed, true);
  assert.equal(env.calls.filter(call => call.path === '/auth/v1/admin/users').length, 1);
  assert.equal((await env.send({ ...draft, email: 'other@example.invalid' })).status, 409);
  assert.equal(env.calls.some(call => call.method === 'PUT' || call.method === 'DELETE'), false);
});
test('an arbitrary existing account ID cannot be adopted; errors suppress raw server contents', async () => {
  const env = environment(); env.accounts.set(draft.requestId, { id: draft.requestId, email: 'coach@example.invalid', app_metadata: {} });
  assert.equal((await env.send()).status, 409); assert.equal(env.calls.some(call => call.path === '/auth/v1/admin/users'), false);
  for (const [error, expected] of [['email_exists', 'EMAIL_EXISTS'], ['weak_password', 'PASSWORD_POLICY']]) {
    const other = environment({ authError: error }), response = await other.send(), result = await response.json();
    assert.equal(result.error.code, expected); assert.equal(JSON.stringify(result).includes('DO_NOT_SHOW'), false); assert.equal(other.accounts.size, 0);
  }
});
