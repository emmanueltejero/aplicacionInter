import test from 'node:test';
import assert from 'node:assert/strict';
import { hasRecoveryIntent, validateNewPassword, PASSWORD_RECOVERY_REDIRECT } from '../src/passwordRecovery.ts';

test('recovery hints survive removal of token fragments and do not require exposing tokens', () => {
  assert.equal(hasRecoveryIntent('?password_reset=1', ''), true);
  assert.equal(hasRecoveryIntent('', '#type=recovery&access_token=fake-not-real'), true);
  assert.equal(hasRecoveryIntent('?view=team', '#type=signup'), false);
  assert.equal(hasRecoveryIntent('?password_reset=0', ''), false);
  assert.equal(new URL(PASSWORD_RECOVERY_REDIRECT).origin, 'https://emmanueltejero.github.io');
});
test('new passwords require matching confirmation and at least eight Unicode characters', () => {
  assert.throws(() => validateNewPassword('short', 'short'), /8 caracteres/);
  assert.throws(() => validateNewPassword('long-fake-password', 'different'), /no coinciden/);
  assert.throws(() => validateNewPassword('😀😀😀😀', '😀😀😀😀'), /8 caracteres/);
  assert.doesNotThrow(() => validateNewPassword('fake password for testing', 'fake password for testing'));
});
