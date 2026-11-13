import { createClubMcp } from './server.ts';

type Edge = { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };
const edge = (globalThis as typeof globalThis & { Deno?: Edge }).Deno;
function publicKey() {
  try {
    const keys = JSON.parse(edge?.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
    if (typeof keys.default === 'string') return keys.default;
  } catch { /* Legacy anon key is public, never use a service key. */ }
  return edge?.env.get('SUPABASE_ANON_KEY') ?? '';
}
if (edge) {
  const supabaseUrl = edge.env.get('SUPABASE_URL') ?? '';
  edge.serve(createClubMcp({ supabaseUrl, publicKey: publicKey(), resourceUrl: edge.env.get('CLUB_MCP_RESOURCE_URL') ?? `${supabaseUrl}/functions/v1/club-mcp` }));
}
