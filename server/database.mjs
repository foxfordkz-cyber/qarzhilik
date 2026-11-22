import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
export function openDatabase(filename, migrations) {
  mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS app_migrations(name TEXT PRIMARY KEY)');
  for (const name of readdirSync(migrations).filter(n => n.endsWith('.sql')).sort()) {
    if (db.prepare('SELECT name FROM app_migrations WHERE name=?').get(name)) continue;
    db.exec('BEGIN');
    try { db.exec(readFileSync(join(migrations, name), 'utf8')); db.prepare('INSERT INTO app_migrations VALUES (?)').run(name); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const prepare = (sql, args = []) => ({
    execute: () => ({ results: db.prepare(sql).all(...args) }),
    bind: (...values) => prepare(sql, values),
    first: async () => db.prepare(sql).get(...args) || null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; },
  });
  return { prepare, close: () => db.close(), batch: async statements => {
    db.exec('BEGIN');
    try { const results = []; for (const s of statements) results.push(s.execute()); db.exec('COMMIT'); return results; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  } };
}
