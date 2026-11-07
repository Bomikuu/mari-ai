import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRedactor, createLineWriter, ensureInside, safeChildEnv, validateHttpUrl, secretEnvironmentValues } from '../server/security.js';

test('known and named credentials are scrubbed recursively, including split output chunks', () => {
  const secret = 'private-credential-1234';
  const redactor = createRedactor([secret]);
  const lines = [];
  const writer = createLineWriter(redactor, (line) => lines.push(line));
  writer.write('token=private-'); writer.write('credential-1234\n');
  writer.write(`URL: https://name:pass@example.com/ ${secret}`); writer.flush();
  assert.equal(lines[0], 'token=[REDACTED]');
  assert.ok(lines.every((line) => !line.includes(secret) && !line.includes('name:pass')));
  assert.deepEqual(redactor.redact({ password: secret, log: `value ${secret}` }), { password: '[REDACTED]', log: 'value [REDACTED]' });
});

test('Codex child environment strips API and application credentials', () => {
  const env = safeChildEnv({ OPENAI_API_KEY: 'never-forward', MARI_ACCESS_KEY: 'owner-only', SERVICE_TOKEN: 'private', STRIPE_KEY: 'secret', RESEND_KEY: 'secret', AWS_ACCESS_KEY_ID: 'secret', DATABASE_URL: 'postgres://u:p@localhost/db', PATH: '/test/bin' });
  assert.equal(env.OPENAI_API_KEY, undefined); assert.equal(env.MARI_ACCESS_KEY, undefined); assert.equal(env.SERVICE_TOKEN, undefined);
  assert.equal(env.PATH, '/test/bin');
  for (const key of ['STRIPE_KEY', 'RESEND_KEY', 'AWS_ACCESS_KEY_ID', 'DATABASE_URL']) assert.equal(env[key], undefined);
});

test('quoted JSON and JavaScript credential keys and escaped values are redacted', () => {
  const redactor=createRedactor();
  for (const source of [
    'const config = {"apiKey": "synthetic-review-only-credential-73819"};',
    "const config = {'password': 'synthetic-secret'};",
    String.raw`{"authorization":"Bearer synthetic\"escaped-secret", "label":"Visible"}`,
  ]) {
    const result=redactor.redact(source);
    assert.ok(result.includes('[REDACTED]'));assert.ok(!result.includes('synthetic'));assert.ok(!result.includes('escaped-secret'));
  }
  assert.equal(redactor.redact('{"label":"Visible"}'),'{"label":"Visible"}');
});

test('unbounded output lines remain suppressed through their final chunk', () => {
  const lines = [];
  const writer = createLineWriter(createRedactor(['sensitive-tail']), (line) => lines.push(line), { maxLength: 10 });
  writer.write('a'.repeat(11) + 'sensi'); writer.write('tive-tail'); writer.write('\nsafe\n'); writer.flush();
  assert.deepEqual(lines, ['[Output line exceeded the size limit and was omitted.]', 'safe']);
});

test('fixed user approval actor stays factual even when a short credential coincides with that word', () => {
  const redactor = createRedactor(['user']);
  assert.deepEqual(redactor.redact({ actor: 'user', output: 'user' }), { actor: 'user', output: '[REDACTED]' });
});

test('artifact containment rejects symlinks and traversal outside root', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mari-security-'));
  fs.mkdirSync(path.join(dir, 'allowed')); fs.mkdirSync(path.join(dir, 'other'));
  fs.symlinkSync(path.join(dir, 'other'), path.join(dir, 'allowed', 'escape'));
  assert.throws(() => ensureInside(path.join(dir, 'allowed'), path.join(dir, 'allowed', 'escape', 'new.png')));
  assert.throws(() => ensureInside(path.join(dir, 'allowed'), path.join(dir, 'other', 'x.png')));
  assert.equal(ensureInside(path.join(dir, 'allowed'), path.join(dir, 'allowed', 'new.png')), path.join(dir, 'allowed', 'new.png'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('URLs reject embedded credentials and non-HTTP schemes', () => {
  assert.throws(() => validateHttpUrl('file:///etc/passwd'));
  assert.throws(() => validateHttpUrl('http://user:pass@localhost'));
  assert.equal(validateHttpUrl('http://localhost:4173/#frag'), 'http://localhost:4173/');
});

test('desktop session metadata does not redact legitimate user scope or prose', () => {
  const values = secretEnvironmentValues({ XDG_SESSION_CLASS: 'user', XDG_SESSION_TYPE: 'wayland', DESKTOP_SESSION: 'ubuntu', SESSION_TOKEN: 'actual-private-token' });
  assert.deepEqual(values, ['actual-private-token']);
  const redactor = createRedactor(values);
  assert.equal(redactor.redact('user-facing skill'), 'user-facing skill');
  assert.equal(redactor.redact('actual-private-token'), '[REDACTED]');
});
