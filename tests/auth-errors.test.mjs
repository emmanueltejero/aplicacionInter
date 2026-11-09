import test from 'node:test';
import assert from 'node:assert/strict';
import { describeAuthFailure } from '../src/authError.ts';

test('wrong credentials and unconfirmed email give distinct, actionable messages', () => {
  const wrong = describeAuthFailure({ code: 'invalid_credentials', status: 400 });
  const unconfirmed = describeAuthFailure({ code: 'email_not_confirmed', status: 400 });
  assert.match(wrong.message, /correo o la contraseña no coinciden/);
  assert.match(unconfirmed.message, /no está confirmado/);
  assert.equal(wrong.code, 'invalid_credentials');
  assert.equal(unconfirmed.status, 400);
  assert.equal(describeAuthFailure({ error_code: 'invalid_credentials', status: 400 }).code, 'invalid_credentials');
});
test('network, timeout, server failure, rate limit and rejected project are distinct', () => {
  assert.equal(describeAuthFailure(new TypeError('Failed to fetch')).code, 'network_error');
  assert.equal(describeAuthFailure({ name: 'AuthRetryableFetchError', status: 0 }).code, 'network_error');
  assert.equal(describeAuthFailure({ name: 'AbortError' }).code, 'timeout');
  assert.equal(describeAuthFailure({ name: 'AuthRetryableFetchError', status: 503 }).code, 'server_error');
  assert.equal(describeAuthFailure({ status: 429 }).code, 'rate_limit');
  assert.equal(describeAuthFailure({ status: 401 }).code, 'project_access');
});
test('unknown errors cannot expose request data, passwords, tokens or arbitrary error codes', () => {
  const privateValue = 'private-test-value-not-a-real-secret';
  for (const cause of [null, undefined, privateValue, { message: privateValue, code: privateValue, password: privateValue, status: 999 }, { code: '__proto__' }]) {
    const result = describeAuthFailure(cause);
    assert.equal(result.code, 'auth_error');
    assert.equal(result.status, null);
    assert.equal(JSON.stringify(result).includes(privateValue), false);
  }
});
