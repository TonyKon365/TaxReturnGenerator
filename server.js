require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { parse: parseCsv } = require('csv-parse/sync');
const { ZipArchive } = require('archiver');

const { db, q, UPLOAD_DIR } = require('./lib/db');
const { SECTIONS, BY_KEY, GROUPS, normalize, validate } = require('./lib/sections');
const { YEARS, yearKeys, currentFilingYear } = require('./lib/rates');
const { compute, fmt } = require('./lib/tax');
const { CHECKLIST, status: checkStatus } = require('./lib/checklist');
const extractor = require('./lib/extract');

const app = express();
const PORT = process.env.PORT || 3000;
const ALLOW_REGISTRATION = (process.env.ALLOW_REGISTRATION || 'true') === 'true';
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 15);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: { 'script-src': ["'self'"], 'img-src': ["'self'", 'data:'] } } }));
app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(session({
  store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 15 * 60 * 1000 } }),
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true', maxAge: 1000 * 60 * 60 * 12 },
}));

// ── helpers available in every view ──
app.use((req, res, next) => {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrf = req.session.csrf;
  res.locals.user = req.session.uid ? q.userById(req.session.uid) : null;
  res.locals.fmt = fmt;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.appName = process.env.APP_NAME || 'IRD Tax Filing Portal';
  res.locals.aiEnabled = extractor.enabled();
  next();
});
const flash = (req, type, msg) => { req.session.flash = { type, msg }; };

function checkCsrf(req, res, next) {
  const token = (req.body && req.body._csrf) || req.query._csrf || req.get('x-csrf-token');
  if (!token || token !== req.session.csrf) {
    for (const f of req.files || []) if (f.path) fs.rmSync(f.path, { force: true });
    return res.status(403).render('error', { title: 'Session expired', message: 'Your form session expired. Go back, refresh the page and try again.' });
  }
  next();
}
app.use((req, res, next) => (req.method === 'POST' && !req.is('multipart/form-data') ? checkCsrf(req, res, next) : next()));

const requireAuth = (req, res, next) => (res.locals.user ? next() : res.redirect('/login'));
const requireAdmin = (req, res, next) => (res.locals.user?.role === 'admin' ? next() : res.status(403).render('error', { title: 'Forbidden', message: 'Admins only.' }));

function loadReturn(req, res, next) {
  const ret = q.returnById(Number(req.params.id));
  const u = res.locals.user;
  if (!ret || (ret.user_id !== u.id && u.role !== 'admin')) return res.status(404).render('error', { title: 'Not found', message: 'Return not found.' });
  req.ret = ret;
  res.locals.ret = ret;
  next();
}
function loadSection(req, res, next) {
  const s = BY_KEY[req.params.section];
  if (!s) return res.status(404).render('error', { title: 'Not found', message: 'Unknown section.' });
  req.sec = s;
  res.locals.sec = s;
  next();
}

function bySection(rid) {
  const out = {};
  for (const e of q.allEntries(rid)) (out[e.section] ||= []).push(e.data);
  return out;
}
function sectionCounts(rid) {
  const counts = {};
  for (const r of db.prepare('SELECT section, COUNT(*) c FROM entries WHERE return_id = ? GROUP BY section').all(rid)) (counts[r.section] ||= {}).entries = r.c;
  for (const r of db.prepare('SELECT section, COUNT(*) c FROM documents WHERE return_id = ? GROUP BY section').all(rid)) (counts[r.section] ||= {}).docs = r.c;
  return counts;
}
const skippedItems = (rid) => q.entries(rid, '_checklist')[0]?.data.skipped || [];

// ── uploads ──
const ALLOWED = {
  'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'image/heic': '.heic', 'image/heif': '.heif', 'text/csv': '.csv', 'text/plain': '.txt', 'application/vnd.ms-excel': '.csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ALLOWED[file.mimetype] || ''}`),
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => cb(null, Boolean(ALLOWED[file.mimetype])),
});

// ───────────────────────── auth ─────────────────────────
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

app.get('/login', (req, res) => res.render('login', { title: 'Sign in', allowRegistration: ALLOW_REGISTRATION || q.userCount() === 0 }));
app.post('/login', authLimiter, (req, res) => {
  const u = q.userByEmail(String(req.body.email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.password_hash)) {
    flash(req, 'error', 'Incorrect email or password.');
    return res.redirect('/login');
  }
  req.session.regenerate(() => { req.session.uid = u.id; res.redirect('/'); });
});
app.get('/register', (req, res) => {
  if (!ALLOW_REGISTRATION && q.userCount() > 0) return res.redirect('/login');
  res.render('register', { title: 'Create account', first: q.userCount() === 0 });
});
app.post('/register', authLimiter, (req, res) => {
  if (!ALLOW_REGISTRATION && q.userCount() > 0) return res.redirect('/login');
  const email = String(req.body.email || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim();
  const pw = String(req.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email) || !name || pw.length < 8) {
    flash(req, 'error', 'Enter your name, a valid email and a password of at least 8 characters.');
    return res.redirect('/register');
  }
  if (q.userByEmail(email)) { flash(req, 'error', 'That email is already registered.'); return res.redirect('/register'); }
  const role = q.userCount() === 0 ? 'admin' : 'user';
  const id = q.createUser(email, name, bcrypt.hashSync(pw, 11), role);
  req.session.regenerate(() => { req.session.uid = id; res.redirect('/'); });
});
app.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

// ───────────────────────── dashboard ─────────────────────────
app.get('/', requireAuth, (req, res) => {
  const u = res.locals.user;
  const returns = u.role === 'admin' && req.query.mine !== '1' ? q.allReturns() : q.returnsForUser(u.id);
  res.render('dashboard', { title: 'My tax returns', returns, years: yearKeys, defaultYear: currentFilingYear(), users: u.role === 'admin' ? q.allUsers() : [] });
});

const COPY_FORWARD = ['profile', 'bank_balances', 'shares', 'vehicles', 'immovable', 'gold_gems', 'other_assets', 'business_assets', 'liabilities', 'business'];

app.post('/returns', requireAuth, (req, res) => {
  const u = res.locals.user;
  const year = YEARS[req.body.year] ? req.body.year : currentFilingYear();
  const owner = u.role === 'admin' && req.body.owner ? Number(req.body.owner) : u.id;
  const label = String(req.body.label || '').trim().slice(0, 120) || null;
  const prev = q.returnsForUser(owner).filter((r) => r.year < year).sort((a, b) => (a.year < b.year ? 1 : -1))[0];
  const id = q.tx(() => {
    const rid = q.createReturn(owner, year, label);
    if (prev && req.body.copy === 'on') {
      for (const key of COPY_FORWARD) {
        for (const e of q.entries(prev.id, key)) {
          const d = { ...e.data };
          if (key === 'business') { d.turnover = ''; d.direct_expenses = ''; }
          if (key === 'solar') continue;
          q.addEntry(rid, key, d);
        }
      }
      // Carry forward unused solar relief as a new row
      const prevCalc = compute(prev.year, bySection(prev.id));
      if (prevCalc.cages[513] > 0) {
        const share = prevCalc.cages[511] ? prevCalc.cages[512] / prevCalc.cages[511] : 0;
        for (const e of q.entries(prev.id, 'solar')) {
          const cost = Number(e.data.total_cost) || 0;
          q.addEntry(rid, 'solar', { ...e.data, claimed_before: Math.round(((Number(e.data.claimed_before) || 0) + cost * share) * 100) / 100 });
        }
      }
      const prevNet = prevCalc.netWorth;
      const prof = q.entries(rid, 'profile')[0];
      if (prof) q.updateEntry(prof.id, { ...prof.data, opening_net_worth: prevNet });
    }
    return rid;
  });
  flash(req, 'ok', prev && req.body.copy === 'on' ? `Return created. Details carried forward from ${prev.year} — update the balances to 31 March.` : 'Return created.');
  res.redirect(`/returns/${id}`);
});

app.post('/returns/:id/delete', requireAuth, loadReturn, (req, res) => {
  for (const d of q.allDocs(req.ret.id)) fs.rmSync(path.join(UPLOAD_DIR, d.stored_name), { force: true });
  q.deleteReturn(req.ret.id);
  flash(req, 'ok', 'Return deleted.');
  res.redirect('/');
});
app.post('/returns/:id/status', requireAuth, loadReturn, (req, res) => {
  const s = ['draft', 'ready', 'filed'].includes(req.body.status) ? req.body.status : 'draft';
  q.setReturnStatus(req.ret.id, s);
  res.redirect(`/returns/${req.ret.id}`);
});

// ───────────────────────── return overview ─────────────────────────
app.get('/returns/:id', requireAuth, loadReturn, (req, res) => {
  const counts = sectionCounts(req.ret.id);
  const skipped = skippedItems(req.ret.id);
  const checklist = CHECKLIST.map((it) => ({ ...it, status: checkStatus(it, counts, skipped) }));
  const calc = compute(req.ret.year, bySection(req.ret.id));
  res.render('return', { title: `Return ${req.ret.year}`, counts, checklist, calc, groups: GROUPS, sections: SECTIONS });
});

app.post('/returns/:id/checklist', requireAuth, loadReturn, (req, res) => {
  const existing = q.entries(req.ret.id, '_checklist')[0];
  let skipped = existing?.data.skipped || [];
  const id = String(req.body.item || '');
  skipped = skipped.includes(id) ? skipped.filter((x) => x !== id) : [...skipped, id];
  if (existing) q.updateEntry(existing.id, { skipped }); else q.addEntry(req.ret.id, '_checklist', { skipped });
  res.redirect(`/returns/${req.ret.id}#checklist`);
});

// ───────────────────────── sections ─────────────────────────
function renderSection(req, res, extra = {}) {
  const sec = req.sec;
  const rows = q.entries(req.ret.id, sec.key);
  const docs = q.docs(req.ret.id, sec.key).map((d) => ({ ...d, canExtract: extractor.canExtract(d) }));
  const idx = SECTIONS.indexOf(sec);
  res.render('section', {
    title: sec.title, rows, docs, groups: GROUPS, sections: SECTIONS, counts: sectionCounts(req.ret.id),
    prev: SECTIONS[idx - 1], next: SECTIONS[idx + 1],
    editing: null, values: sec.singleton ? (rows[0]?.data || defaults(sec)) : defaults(sec), errors: [], ...extra,
  });
}
const defaults = (sec) => Object.fromEntries(sec.fields.filter((f) => f.default !== undefined).map((f) => [f.name, f.default]));

app.get('/returns/:id/s/:section', requireAuth, loadReturn, loadSection, (req, res) => {
  if (req.query.edit) {
    const e = q.entry(Number(req.query.edit));
    if (e && e.return_id === req.ret.id && e.section === req.sec.key) return renderSection(req, res, { editing: e.id, values: e.data });
  }
  renderSection(req, res);
});

app.post('/returns/:id/s/:section/entries', requireAuth, loadReturn, loadSection, (req, res) => {
  const data = normalize(req.sec, req.body);
  const errors = validate(req.sec, data);
  const editId = Number(req.body._entry || 0);
  if (errors.length) return renderSection(req, res, { values: data, errors, editing: editId || null });
  if (req.sec.singleton) {
    const existing = q.entries(req.ret.id, req.sec.key)[0];
    if (existing) q.updateEntry(existing.id, data); else q.addEntry(req.ret.id, req.sec.key, data);
    flash(req, 'ok', 'Saved.');
  } else if (editId) {
    const e = q.entry(editId);
    if (e && e.return_id === req.ret.id && e.section === req.sec.key) q.updateEntry(e.id, data);
    flash(req, 'ok', 'Row updated.');
  } else {
    q.addEntry(req.ret.id, req.sec.key, data);
    flash(req, 'ok', 'Row added.');
  }
  q.touchReturn(req.ret.id);
  res.redirect(`/returns/${req.ret.id}/s/${req.sec.key}#entries`);
});

app.post('/returns/:id/s/:section/entries/:eid/delete', requireAuth, loadReturn, loadSection, (req, res) => {
  const e = q.entry(Number(req.params.eid));
  if (e && e.return_id === req.ret.id) q.deleteEntry(e.id);
  q.touchReturn(req.ret.id);
  flash(req, 'ok', 'Row deleted.');
  res.redirect(`/returns/${req.ret.id}/s/${req.sec.key}#entries`);
});

// bulk add (from CSV or AI review)
app.post('/returns/:id/s/:section/bulk', requireAuth, loadReturn, loadSection, (req, res) => {
  let rows = [];
  try { rows = JSON.parse(req.body.rows || '[]'); } catch { rows = []; }
  const include = [].concat(req.body.include || []).map(Number);
  let added = 0;
  q.tx(() => {
    rows.forEach((raw, i) => {
      if (!include.includes(i)) return;
      const edited = {};
      for (const f of req.sec.fields) {
        const k = `r${i}_${f.name}`;
        edited[f.name] = f.type === 'checkbox' ? req.body[k] === 'on' : req.body[k] ?? raw[f.name];
      }
      q.addEntry(req.ret.id, req.sec.key, normalize(req.sec, edited));
      added++;
    });
  });
  q.touchReturn(req.ret.id);
  flash(req, 'ok', `${added} row(s) added.`);
  res.redirect(`/returns/${req.ret.id}/s/${req.sec.key}#entries`);
});

// CSV template + import
app.get('/returns/:id/s/:section/template.csv', requireAuth, loadReturn, loadSection, (req, res) => {
  res.type('text/csv').attachment(`${req.sec.key}-template.csv`);
  res.send(req.sec.fields.map((f) => f.name).join(',') + '\n');
});
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
app.post('/returns/:id/s/:section/csv', requireAuth, loadReturn, loadSection, csvUpload.single('file'), checkCsrf, (req, res) => {
  if (!req.file) { flash(req, 'error', 'Choose a CSV file.'); return res.redirect(`/returns/${req.ret.id}/s/${req.sec.key}`); }
  let records;
  try {
    records = parseCsv(req.file.buffer.toString('utf8').replace(/^﻿/, ''), { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true });
  } catch (e) {
    flash(req, 'error', `Could not read CSV: ${e.message}`);
    return res.redirect(`/returns/${req.ret.id}/s/${req.sec.key}`);
  }
  // Map headers to fields by name or label (case/space-insensitive)
  const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const map = {};
  for (const f of req.sec.fields) map[key(f.name)] = f.name, map[key(f.label)] = f.name;
  const rows = records.map((rec) => {
    const o = {};
    for (const [h, v] of Object.entries(rec)) if (map[key(h)]) o[map[key(h)]] = v;
    return normalize(req.sec, o);
  }).filter((r) => Object.values(r).some((v) => v !== '' && v !== false));
  res.render('review', { title: `Review import – ${req.sec.title}`, rows, source: req.file.originalname, notes: null });
});

// ───────────────────────── documents ─────────────────────────
app.post('/returns/:id/s/:section/upload', requireAuth, loadReturn, loadSection, upload.array('files', 20), checkCsrf, (req, res) => {
  const files = req.files || [];
  for (const f of files) q.addDoc(req.ret.id, req.sec.key, f, String(req.body.note || '').slice(0, 300));
  q.touchReturn(req.ret.id);
  flash(req, files.length ? 'ok' : 'error', files.length ? `${files.length} file(s) uploaded.` : `No file uploaded. Allowed: PDF, JPG, PNG, WEBP, HEIC, CSV, XLSX up to ${MAX_UPLOAD_MB} MB.`);
  res.redirect(`/returns/${req.ret.id}/s/${req.sec.key}#documents`);
});

function loadDoc(req, res, next) {
  const d = q.doc(Number(req.params.docId));
  if (!d || d.return_id !== req.ret.id) return res.status(404).render('error', { title: 'Not found', message: 'Document not found.' });
  req.doc = d;
  next();
}
app.get('/returns/:id/docs/:docId', requireAuth, loadReturn, loadDoc, (req, res) => {
  res.setHeader('Content-Type', req.doc.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${req.query.dl ? 'attachment' : 'inline'}; filename="${req.doc.original_name.replace(/[^\w.\- ]/g, '_')}"`);
  fs.createReadStream(path.join(UPLOAD_DIR, req.doc.stored_name)).on('error', () => res.status(404).end()).pipe(res);
});
app.post('/returns/:id/docs/:docId/delete', requireAuth, loadReturn, loadDoc, (req, res) => {
  fs.rmSync(path.join(UPLOAD_DIR, req.doc.stored_name), { force: true });
  q.deleteDoc(req.doc.id);
  flash(req, 'ok', 'Document deleted.');
  res.redirect(`/returns/${req.ret.id}/s/${req.doc.section}#documents`);
});
app.post('/returns/:id/docs/:docId/extract', requireAuth, loadReturn, loadDoc, async (req, res) => {
  const sec = BY_KEY[req.doc.section];
  req.sec = sec; res.locals.sec = sec;
  if (!extractor.canExtract(req.doc)) { flash(req, 'error', 'Automatic reading is not available for this file.'); return res.redirect(`/returns/${req.ret.id}/s/${sec.key}`); }
  try {
    let result = req.doc.extracted && req.body.fresh !== '1' ? JSON.parse(req.doc.extracted) : null;
    if (!result) {
      result = await extractor.extract(sec, req.doc, path.join(UPLOAD_DIR, req.doc.stored_name), req.ret.year);
      q.setDocExtracted(req.doc.id, JSON.stringify(result));
    }
    const rows = result.rows.map((r) => normalize(sec, r));
    if (sec.singleton) {
      const existing = q.entries(req.ret.id, sec.key)[0];
      const merged = { ...(existing?.data || {}) };
      for (const [k, v] of Object.entries(rows[0] || {})) if (v !== '' && v !== false) merged[k] = v;
      return renderSection(req, res, { values: merged, errors: [], extractedNote: 'Values read from the document are filled in below. Check them, then Save.' });
    }
    res.render('review', { title: `Review extracted rows – ${sec.title}`, rows, source: req.doc.original_name, notes: result.notes });
  } catch (e) {
    console.error('extract failed', e);
    flash(req, 'error', `Could not read the document automatically (${e.message}). Enter the values manually.`);
    res.redirect(`/returns/${req.ret.id}/s/${sec.key}#documents`);
  }
});

// ───────────────────────── summary & exports ─────────────────────────
app.get('/returns/:id/summary', requireAuth, loadReturn, (req, res) => {
  const data = bySection(req.ret.id);
  const calc = compute(req.ret.year, data);
  const docs = q.allDocs(req.ret.id);
  res.render('summary', { title: `Filing summary ${req.ret.year}`, calc, data, docs, sections: SECTIONS, layout: 'print' });
});

app.get('/returns/:id/export.json', requireAuth, loadReturn, (req, res) => {
  const out = { app: 'ird-tax-portal', version: 1, year: req.ret.year, label: req.ret.label, entries: q.allEntries(req.ret.id).map((e) => ({ section: e.section, data: e.data })) };
  res.attachment(`tax-return-${req.ret.year.replace('/', '-')}-${req.ret.id}.json`).json(out);
});

const jsonUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
app.post('/returns/:id/import.json', requireAuth, loadReturn, jsonUpload.single('file'), checkCsrf, (req, res) => {
  try {
    const parsed = JSON.parse(req.file.buffer.toString('utf8'));
    let added = 0;
    q.tx(() => {
      for (const e of parsed.entries || []) {
        const sec = BY_KEY[e.section];
        if (!sec) continue;
        if (sec.singleton) {
          const ex = q.entries(req.ret.id, sec.key)[0];
          if (ex) { q.updateEntry(ex.id, normalize(sec, e.data)); continue; }
        }
        q.addEntry(req.ret.id, sec.key, normalize(sec, e.data));
        added++;
      }
    });
    flash(req, 'ok', `Imported ${added} row(s).`);
  } catch (e) {
    flash(req, 'error', `Import failed: ${e.message}`);
  }
  res.redirect(`/returns/${req.ret.id}`);
});

app.get('/returns/:id/export.zip', requireAuth, loadReturn, (req, res) => {
  const name = `tax-return-${req.ret.year.replace('/', '-')}-${req.ret.id}`;
  res.attachment(`${name}.zip`);
  const zip = new ZipArchive({ zlib: { level: 6 } });
  zip.on('error', () => res.end());
  zip.pipe(res);
  zip.append(JSON.stringify({ year: req.ret.year, entries: q.allEntries(req.ret.id).map((e) => ({ section: e.section, data: e.data })) }, null, 2), { name: `${name}/data.json` });
  // one CSV per section
  for (const sec of SECTIONS) {
    const rows = q.entries(req.ret.id, sec.key);
    if (!rows.length) continue;
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [sec.fields.map((f) => esc(f.label)).join(','), ...rows.map((r) => sec.fields.map((f) => esc(r.data[f.name])).join(','))].join('\n');
    zip.append(csv, { name: `${name}/tables/${sec.key}.csv` });
  }
  for (const d of q.allDocs(req.ret.id)) {
    const p = path.join(UPLOAD_DIR, d.stored_name);
    if (fs.existsSync(p)) zip.file(p, { name: `${name}/documents/${d.section}/${d.id}-${d.original_name.replace(/[^\w.\- ]/g, '_')}` });
  }
  zip.finalize();
});

// ───────────────────────── admin ─────────────────────────
app.get('/admin/users', requireAuth, requireAdmin, (req, res) => res.render('users', { title: 'Users', users: q.allUsers() }));
app.post('/admin/users/:uid/role', requireAuth, requireAdmin, (req, res) => {
  const uid = Number(req.params.uid);
  if (uid !== res.locals.user.id) q.setRole(uid, req.body.role === 'admin' ? 'admin' : 'user');
  res.redirect('/admin/users');
});
app.post('/admin/users', requireAuth, requireAdmin, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim();
  const pw = String(req.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email) || !name || pw.length < 8 || q.userByEmail(email)) {
    flash(req, 'error', 'Check the details — email must be new and the password at least 8 characters.');
  } else {
    q.createUser(email, name, bcrypt.hashSync(pw, 11), 'user');
    flash(req, 'ok', `Account created for ${name}. Share the password with them securely.`);
  }
  res.redirect('/admin/users');
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  console.error(err);
  const msg = err.code === 'LIMIT_FILE_SIZE' ? `File too large (max ${MAX_UPLOAD_MB} MB).` : 'Something went wrong.';
  res.status(err.status || 500).render('error', { title: 'Error', message: msg });
});
app.use((req, res) => res.status(404).render('error', { title: 'Not found', message: 'Page not found.' }));

if (require.main === module) app.listen(PORT, () => console.log(`IRD tax portal on http://localhost:${PORT}`));
module.exports = app;
