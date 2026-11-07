import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProfilePreview } from '../src/lib/agent-profile-import.js';
import { disconnectedExecutionView } from '../src/lib/connection-state.js';

test('malformed but valid JSON never reaches an unsafe profile preview', () => {
  for (const value of [null, [], { name: { x: 1 }, instructions: 'Check' }, { name: 'Role', instructions: { text: 'Check' } }, { profile: null }]) assert.throws(() => validateProfilePreview(value));
  assert.deepEqual(validateProfilePreview({ profile: { name: 'Role', instructions: 'Check', skillIds: [], enabled: true } }), { profile: { name: 'Role', instructions: 'Check', skillIds: [], enabled: true } });
  for (const extra of [{ portraitId: 'https://example.com/track.png' }, { category: [] }, { category: 'not-installed' }]) assert.throws(() => validateProfilePreview({ name: 'Role', instructions: 'Check', ...extra }));
  assert.equal(validateProfilePreview({ name: 'CEO', instructions: 'Advise.', category: 'leadership', portraitId: 'elesis' }).portraitId, 'elesis');
});

test('connection loss clears current activity while preserving last known execution status', () => {
  const now = Date.now();
  const data = { workers: [{ status: 'online', lastHeartbeatAt: new Date(now).toISOString() }], agents: [{ status: 'working', live: true }], services: [{ status: 'running', ownership: 'managed' }] };
  const disconnected = disconnectedExecutionView(data, now);
  assert.equal(disconnected.workers[0].status, 'reconnecting'); assert.equal(disconnected.agents[0].status, 'working'); assert.equal(disconnected.agents[0].live, false); assert.equal(disconnected.services[0].status, 'unknown');
  assert.equal(disconnectedExecutionView(data, now + 21000).workers[0].status, 'offline');
});
