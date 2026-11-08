const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(process.env.DB_FILE || path.join(DATA_DIR, 'portal.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  data TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_entries_return ON entries(return_id, section);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  note TEXT,
  extracted TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_docs_return ON documents(return_id, section);
`);

const parse = (row) => (row ? { ...row, data: JSON.parse(row.data) } : row);

const q = {
  // users
  userCount: () => db.prepare('SELECT COUNT(*) c FROM users').get().c,
  userByEmail: (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email),
  userById: (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id),
  allUsers: () => db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY id').all(),
  createUser: (email, name, hash, role) =>
    db.prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?,?,?,?)').run(email, name, hash, role).lastInsertRowid,
  setRole: (id, role) => db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id),

  // returns
  returnsForUser: (uid) =>
    db.prepare('SELECT r.*, u.name owner_name, u.email owner_email FROM returns r JOIN users u ON u.id = r.user_id WHERE r.user_id = ? ORDER BY r.year DESC, r.id DESC').all(uid),
  allReturns: () =>
    db.prepare('SELECT r.*, u.name owner_name, u.email owner_email FROM returns r JOIN users u ON u.id = r.user_id ORDER BY r.updated_at DESC').all(),
  returnById: (id) => db.prepare('SELECT * FROM returns WHERE id = ?').get(id),
  createReturn: (uid, year, label) =>
    db.prepare('INSERT INTO returns (user_id, year, label) VALUES (?,?,?)').run(uid, year, label).lastInsertRowid,
  touchReturn: (id) => db.prepare("UPDATE returns SET updated_at = datetime('now') WHERE id = ?").run(id),
  setReturnStatus: (id, status) => db.prepare("UPDATE returns SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id),
  deleteReturn: (id) => db.prepare('DELETE FROM returns WHERE id = ?').run(id),

  // entries
  entries: (rid, section) =>
    db.prepare('SELECT * FROM entries WHERE return_id = ? AND section = ? ORDER BY position, id').all(rid, section).map(parse),
  allEntries: (rid) => db.prepare('SELECT * FROM entries WHERE return_id = ? ORDER BY section, position, id').all(rid).map(parse),
  entry: (id) => parse(db.prepare('SELECT * FROM entries WHERE id = ?').get(id)),
  addEntry: (rid, section, data) =>
    db.prepare('INSERT INTO entries (return_id, section, data) VALUES (?,?,?)').run(rid, section, JSON.stringify(data)).lastInsertRowid,
  updateEntry: (id, data) =>
    db.prepare("UPDATE entries SET data = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(data), id),
  deleteEntry: (id) => db.prepare('DELETE FROM entries WHERE id = ?').run(id),

  // documents
  docs: (rid, section) => db.prepare('SELECT * FROM documents WHERE return_id = ? AND section = ? ORDER BY id').all(rid, section),
  allDocs: (rid) => db.prepare('SELECT * FROM documents WHERE return_id = ? ORDER BY section, id').all(rid),
  doc: (id) => db.prepare('SELECT * FROM documents WHERE id = ?').get(id),
  addDoc: (rid, section, f, note) =>
    db.prepare('INSERT INTO documents (return_id, section, original_name, stored_name, mime, size, note) VALUES (?,?,?,?,?,?,?)')
      .run(rid, section, f.originalname, f.filename, f.mimetype, f.size, note || null).lastInsertRowid,
  setDocExtracted: (id, json) => db.prepare('UPDATE documents SET extracted = ? WHERE id = ?').run(json, id),
  deleteDoc: (id) => db.prepare('DELETE FROM documents WHERE id = ?').run(id),
};

q.tx = (fn) => db.transaction(fn)();

module.exports = { db, q, DATA_DIR, UPLOAD_DIR };
