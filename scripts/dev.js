import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const production = process.argv.includes('--production');
const children = [];
let stopping = false;
function start(script, args = []) {
  const child = spawn(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit', env: process.env });
  children.push(child);
  child.once('exit', (code, signal) => {
    if (!stopping && (code || signal)) { process.exitCode = code || 1; stop(); }
  });
}
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  const timer = setTimeout(() => { for (const child of children) if (child.exitCode === null) child.kill('SIGKILL'); }, 7000);
  timer.unref();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
start('server/index.js');
start('worker/index.js');
if (!production) start('node_modules/vite/bin/vite.js', ['--host', '127.0.0.1', '--port', '5173', '--strictPort']);
