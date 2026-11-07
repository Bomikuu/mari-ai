import test from 'node:test';
import assert from 'node:assert/strict';
import { coreActivity } from '../src/lib/core-activity.js';

test('globe activity reflects current observable work or service health, never historical/queued activity', () => {
  const base = { workerOnline: true, projectId: 'current' };
  assert.equal(coreActivity({ ...base, agents: [{ projectId: 'current', status: 'working', live: false }] }), 'idle');
  assert.equal(coreActivity({ ...base, jobs: [{ projectId: 'current', status: 'queued' }] }), 'idle');
  assert.equal(coreActivity({ ...base, jobs: [{ projectId: 'other', status: 'running' }] }), 'idle');
  assert.equal(coreActivity({ ...base, agents: [{ projectId: 'current', status: 'working', live: true }] }), 'working');
  assert.equal(coreActivity({ ...base, services: [{ projectId: 'current', status: 'running', lastProbeAt: new Date().toISOString() }] }), 'running');
  assert.equal(coreActivity({ ...base, task: { status: 'awaiting_approval' } }), 'waiting');
  assert.equal(coreActivity({ ...base, workerOnline: false, services: [{ projectId: 'current', status: 'running', lastProbeAt: new Date().toISOString() }] }), 'offline');
});


test('a stale external health record cannot report current running activity', () => {
  assert.equal(coreActivity({workerOnline:true,projectId:'current',services:[{projectId:'current',ownership:'external',status:'running',lastProbeAt:new Date(Date.now()-31000).toISOString()}]}),'idle');
});
