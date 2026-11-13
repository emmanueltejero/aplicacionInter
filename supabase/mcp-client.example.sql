-- Run only after creating/identifying the ChatGPT OAuth client in Supabase.
-- Replace the public client UUID; NEVER paste a client secret in this file.
insert into public.club_mcp_oauth_clients (client_id, resource_uri, enabled)
values (
  'REPLACE_WITH_OAUTH_CLIENT_UUID'::uuid,
  'https://corcjvflavfpvzgyvpyb.supabase.co/functions/v1/club-mcp',
  true
)
on conflict (client_id) do update
set resource_uri = excluded.resource_uri, enabled = excluded.enabled;

-- To revoke this integration immediately, set enabled=false for this client.
-- Removing a team assignment or disabling a club account also takes effect on
-- every subsequent request. Do not revoke ordinary web sessions to test MCP.
