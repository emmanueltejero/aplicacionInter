// Deno runtime smoke with generated keys and a fake Supabase backend only.
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createClubMcp } from '../server.ts';
const base = 'https://fixture.example.supabase.co', resource = `${base}/functions/v1/club-mcp`;
const now = new Date('2026-11-13T12:00:00Z'), { privateKey, publicKey } = await generateKeyPair('ES256');
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const token = await new SignJWT({ role: 'club_mcp_reader', client_id: id(90), club_mcp_read: true })
  .setProtectedHeader({ alg: 'ES256', kid: 'local-only' }).setSubject(id(2)).setIssuer(`${base}/auth/v1`).setAudience(resource)
  .setIssuedAt(now.getTime() / 1000).setExpirationTime(now.getTime() / 1000 + 3600).sign(privateKey);
const handler = createClubMcp({ supabaseUrl: base, publicKey: 'sb_publishable_fake_fixture', resourceUrl: resource, now: () => now,
  jwks: createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), alg: 'ES256', kid: 'local-only' }] }),
  fetcher: async url => {
    if (String(url).endsWith('club_mcp_authorized')) return Response.json(true);
    if (String(url).endsWith('club_mcp_read_team')) return Response.json({ team: { id: id(10), name: 'Equipo ficticio' }, roster: [{ id: id(50), name: 'Jugador ficticio', number: 7 }], attendance: [{ date: '2026-11-01', player_id: id(50), status: 'present' }], matches: [] });
    throw new Error('Unexpected request');
  },
});
if ((await handler(new Request(resource))).status !== 401) throw new Error('Expected OAuth challenge');
const response = await handler(new Request(resource, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_player_summary', arguments: { team_id: id(10) } } }),
}));
const text = await response.text();
if (response.status !== 200 || !text.includes('Jugador ficticio') || !text.includes('percentage') || !text.includes('100')) throw new Error('Deno tool call failed');
console.log('PASS Deno runtime: signed OAuth token, Streamable HTTP and shared attendance calculation; fixture data only.');
