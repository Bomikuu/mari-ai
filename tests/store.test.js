import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/store.js';

test('records and ordered redacted events survive reopening the database', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mari-store-'));
  let store = createStore(dir);
  store.put('projects', { id: 'p', name: 'First' });
  store.update('projects', 'p', { name: 'Saved' });
  store.addSecrets(['top-secret-value']);
  const event = store.event({ projectId: 'p', source: 'service', message: 'top-secret-value' });
  store.event({ source: 'agent', message: 'another' });
  store.close(); store = createStore(dir);
  assert.equal(store.get('projects', 'p').name, 'Saved');
  assert.equal(store.events({ projectId: 'p' })[0].message, '[REDACTED]');
  assert.equal(store.events({ after: event.id }).length, 1);
  assert.equal(store.events({ source: 'service' }).length, 1);
  assert.equal(store.events({ tail: true, limit: 1 })[0].message, 'another');
  store.close(); fs.rmSync(dir, { recursive: true, force: true });
});
