import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRedactor, secretEnvironmentValues } from './security.js';

export const id = (prefix = 'record') => `${prefix}_${randomUUID()}`;
export const now = () => new Date().toISOString();
const COLLECTIONS = new Set(['projects', 'services', 'tasks', 'jobs', 'agents', 'workers', 'artifacts', 'approvals', 'requests', 'settings', 'agentProfiles', 'agentChats', 'agentMessages', 'agentTeams', 'memories', 'knowledgeDocuments', 'telegramReceipts', 'telegramOutbox']);

export function createStore(dataDir = process.env.MARI_DATA_DIR || path.resolve('.mari')) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const databasePath = path.join(dataDir, 'mari.sqlite');
  const db = new DatabaseSync(databasePath);
  fs.chmodSync(databasePath, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(collection,id));
    CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, projectId TEXT, taskId TEXT, source TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS events_context ON events(projectId,taskId,source,id);`);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!db.prepare('PRAGMA table_info(events)').all().some((column) => column.name === 'chatId')) db.exec('ALTER TABLE events ADD COLUMN chatId TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS events_chat ON events(chatId,id); COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  const redactor = createRedactor(secretEnvironmentValues());
  const check = (collection) => { if (!COLLECTIONS.has(collection)) throw new Error(`Unknown collection: ${collection}`); };
  const get = (collection, recordId) => {
    check(collection);
    const row = db.prepare('SELECT data FROM records WHERE collection=? AND id=?').get(collection, recordId);
    return row ? JSON.parse(row.data) : null;
  };
  const put = (collection, record) => {
    check(collection);
    if (!record || !record.id) throw new Error('A persistent record requires an id.');
    const value = { ...record, updatedAt: now() };
    db.prepare('INSERT INTO records(collection,id,data) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data').run(collection, value.id, JSON.stringify(value));
    return value;
  };
  return {
    dataDir, db, get, put,
    list(collection) { check(collection); return db.prepare('SELECT data FROM records WHERE collection=? ORDER BY rowid').all(collection).map((row) => JSON.parse(row.data)); },
    remove(collection, recordId) { check(collection); db.prepare('DELETE FROM records WHERE collection=? AND id=?').run(collection, recordId); },
    update(collection, recordId, patch) {
      const previous = get(collection, recordId);
      if (!previous) return null;
      return put(collection, { ...previous, ...(typeof patch === 'function' ? patch(previous) : patch), id: recordId });
    },
    addSecrets(values) { redactor.add(values); },
    event(input) {
      const value = redactor.redact({ at: now(), source: 'system', level: 'info', ...input });
      const result = db.prepare('INSERT INTO events(at,projectId,taskId,source,data,chatId) VALUES(?,?,?,?,?,?)').run(value.at, value.projectId || null, value.taskId || null, value.source, JSON.stringify(value), value.chatId || null);
      return { ...value, id: Number(result.lastInsertRowid) };
    },
    events({ projectId, taskId, chatId, source, after = 0, limit = 300, query = '', tail = false } = {}) {
      const conditions = ['id > ?'];
      const values = [Number(after) || 0];
      for (const [key, value] of Object.entries({ projectId, taskId, chatId, source })) if (value && value !== 'all') { conditions.push(`${key} = ?`); values.push(value); }
      if (query) { conditions.push('data LIKE ?'); values.push(`%${String(query).slice(0, 200)}%`); }
      values.push(Math.min(Math.max(Number(limit) || 300, 1), 10000));
      const records = db.prepare(`SELECT id,data FROM events WHERE ${conditions.join(' AND ')} ORDER BY id ${tail ? 'DESC' : 'ASC'} LIMIT ?`).all(...values).map((row) => ({ ...JSON.parse(row.data), id: row.id }));
      return tail ? records.reverse() : records;
    },
    close() { db.close(); },
  };
}
