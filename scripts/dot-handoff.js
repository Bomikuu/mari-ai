import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStore } from '../server/store.js';
import { cleanKnowledgeText } from '../server/knowledge.js';
import { dotWorkerState, dotProjects, dotRequests, submitDotGoal, dotStatus, dotResult, cancelDotGoal } from '../server/dot-handoff.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function dotArguments(args) {
  const [command, ...rest] = args;
  if (!['health', 'projects', 'list', 'submit', 'status', 'result', 'cancel'].includes(command)) throw new Error('Usage: node scripts/dot-handoff.js health|projects|list|submit|status|result|cancel [requestId] [--after cursor] [--data-dir /absolute/runtime]. Submit reads JSON from stdin.');
  const options = { command, dataDir: process.env.MARI_DATA_DIR || path.join(repoRoot, '.mari'), after: 0 };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--data-dir' && rest[i + 1]) { if (options.explicitData) throw new Error('Pass data-dir once.'); options.dataDir = rest[++i]; options.explicitData = true; }
    else if (rest[i] === '--after' && command === 'status' && rest[i + 1] && /^\d+$/.test(rest[i + 1])) { options.after = Number(rest[++i]); if (!Number.isSafeInteger(options.after)) throw new Error('Invalid event cursor.'); }
    else if (['status', 'result', 'cancel'].includes(command) && !options.requestId && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(rest[i])) options.requestId = rest[i];
    else throw new Error('Unsupported handoff argument. Use an explicit requestId and supported flags.');
  }
  if (!path.isAbsolute(options.dataDir)) throw new Error('MARI_DATA_DIR and --data-dir must be absolute paths.');
  if (['status', 'result', 'cancel'].includes(command) && !options.requestId) throw new Error('This command requires a requestId.');
  return options;
}

export async function readDotInput(input = process.stdin) {
  let bytes = 0; const chunks = [];
  for await (const chunk of input) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 32 * 1024) throw new Error('Submission JSON exceeds 32 KiB.');
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Submit expects a JSON object on stdin.'); }
}

export async function runDotCommand(options, input) {
  // A typo must not create a second empty Mari runtime.
  if (!fs.existsSync(path.join(options.dataDir, 'mari.sqlite'))) throw new Error('Mari data directory not found. Start Mari first, or select its existing absolute --data-dir.');
  const store = createStore(options.dataDir);
  try {
    switch (options.command) {
      case 'health': return { source: 'local-dot-handoff', worker: await dotWorkerState(store), authority: 'Local OS owner; no cloud Dot session is authenticated by this CLI.', permissions: 'Scoped delegated analysis and artifacts. Website changes require Mari’s image approval and explicit implementation.' };
      case 'projects': return dotProjects(store);
      case 'list': return dotRequests(store);
      case 'submit': return await submitDotGoal(store, input);
      case 'status': return await dotStatus(store, options.requestId, { after: options.after });
      case 'result': return await dotResult(store, options.requestId);
      case 'cancel': return cancelDotGoal(store, options.requestId);
      default: throw new Error('Unsupported handoff command.');
    }
  } finally { store.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  Promise.resolve().then(async () => {
    const options = dotArguments(process.argv.slice(2));
    return runDotCommand(options, options.command === 'submit' ? await readDotInput() : undefined);
  }).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(JSON.stringify({ error: { code: error.code || 'HANDOFF_ERROR', message: cleanKnowledgeText(error.message) } }));
    process.exitCode = 1;
  });
}
