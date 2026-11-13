// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['supabase/functions/club-mcp/**/*.{ts,mjs}'],
    // This Deno package resolves pinned npm imports through deno.json. Expo's
    // import resolver cannot use that map without installing server packages.
    // The dedicated MCP CI installs its own lockfile and typechecks every import.
    rules: { 'import/no-unresolved': 'off' },
  },
]);
