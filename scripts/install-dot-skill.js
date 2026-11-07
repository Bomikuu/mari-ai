import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'skills', 'mari-handoff');
const destination = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills', 'mari-handoff');
const files = ['SKILL.md', 'agents/openai.yaml'];
// Refuse to replace a different installed skill; reruns of this installation are safe.
for (const file of files) {
  const from = await fs.readFile(path.join(source, file));
  try {
    if (!(await fs.readFile(path.join(destination, file))).equals(from)) throw new Error(`An existing Mari handoff skill differs at ${path.join(destination, file)}. Review it before updating.`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
for (const file of files) {
  await fs.mkdir(path.dirname(path.join(destination, file)), { recursive: true });
  try { await fs.copyFile(path.join(source, file), path.join(destination, file), fs.constants.COPYFILE_EXCL); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}
console.log(JSON.stringify({ installed: true, skillPath: path.join(destination, 'SKILL.md') }));
