import test from 'node:test';
import assert from 'node:assert/strict';
import { chatGptCallback, validAuthorizationId } from '../src/oauthConsent.ts';
import { oauthEntryHtml } from '../scripts/oauth-entry.mjs';
import { runInNewContext } from 'node:vm';
test('consent accepts opaque authorization IDs and only approved HTTPS ChatGPT callbacks', () => {
  assert.ok(validAuthorizationId('opaque_auth-id_123')); assert.ok(validAuthorizationId('00000000-0000-4000-8000-000000000001'));
  for (const value of [undefined, '', ['id'], '../users', 'x?redirect=https://evil.invalid', 'x'.repeat(513)]) assert.equal(validAuthorizationId(value), false);
  for (const origin of ['https://chatgpt.com', 'https://chat.openai.com']) assert.equal(chatGptCallback(origin+'/connector_platform/oauth/callback?code=test&state=s'), origin+'/connector_platform/oauth/callback?code=test&state=s');
  for (const value of ['javascript:alert(1)', 'https://evil.invalid/connector_platform/oauth/callback', 'https://chatgpt.com.evil.invalid/connector_platform/oauth/callback', 'https://chatgpt.com/login', 'https://user:password@chatgpt.com/connector_platform/oauth/callback', 'https://chatgpt.com/connector_platform/oauth/callback#access_token=secret']) assert.throws(() => chatGptCallback(value));
});
test('static OAuth entry keeps the complete authorization query and navigates to the known root before loading the app', () => {
  const html = oauthEntryHtml('/aplicacionInter');
  assert.equal(html.includes('src='), false);
  const script = html.match(/<script>(.*?)<\/script>/s)[1];
  for (const query of ['?authorization_id=opaque_auth-id_123', '?authorization_id=request_2&state=opaque%2Bvalue', '']) {
    let target;
    runInNewContext(script, { location: { search: query, replace: value => { target = value; } } });
    assert.equal(target, '/aplicacionInter/' + query);
  }
  for (const path of ['https://evil.invalid', '//evil.invalid', '/x/../../evil', '/x</script>']) assert.throws(() => oauthEntryHtml(path));
});
