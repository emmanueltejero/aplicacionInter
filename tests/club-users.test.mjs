import test from 'node:test';
import assert from 'node:assert/strict';
import { UsersRequestFailure, UsersSetupRequired, userCreationFailure, validateCoachAccount } from '../src/clubUsers.ts';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const draft = { id: id(100), name: '  Iván   Pérez ', email: ' COACH@EXAMPLE.INVALID ', password: 'Ficticia-123!', teamIds: [id(20), id(10)] };
test('coach accounts normalize identity and preserve a password only in the request', () => {
  const clean = validateCoachAccount(draft);
  assert.equal(clean.name, 'Iván Pérez'); assert.equal(clean.email, 'coach@example.invalid'); assert.equal(clean.password, draft.password);
  assert.deepEqual(clean.teamIds, [id(10), id(20)]); assert.deepEqual(draft.teamIds, [id(20), id(10)]);
  for (const patch of [{ name: '' }, { email: 'bad' }, { password: 'short' }, { password: 'ñ'.repeat(37) }, { password: '😀'.repeat(4) }, { teamIds: [] }, { teamIds: [id(10), id(10)] }, { teamIds: ['bad'] }, { id: 'bad' }]) assert.throws(() => validateCoachAccount({ ...draft, ...patch }));
  assert.equal(validateCoachAccount({ ...draft, password: 'ñ'.repeat(36) }).password.length, 36);
});
test('errors never display backend text or credentials and distinguish safe retries and activation', () => {
  assert.equal(userCreationFailure('EMAIL_EXISTS') instanceof UsersRequestFailure, true);
  assert.equal(userCreationFailure('SETUP_REQUIRED') instanceof UsersSetupRequired, true);
  assert.equal(userCreationFailure('SERVER_CONFIG').part, 'function');
  const unknown = userCreationFailure('password=SECRET&service_role=KEY');
  assert.equal(unknown.retryable, true); assert.equal(unknown.message.includes('SECRET'), false); assert.equal(unknown.message.includes('KEY'), false);
});
