import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTeamName } from '../src/teams.ts';
test('team names normalize whitespace and reject empty or oversized input', () => {
  assert.equal(validateTeamName('  Alevín   B '), 'Alevín B');
  for (const name of ['', ' \n ', 'x'.repeat(81)]) assert.throws(() => validateTeamName(name));
  assert.equal(validateTeamName('x'.repeat(80)).length, 80);
});
