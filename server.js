/**
 * B5 / BORNTOWIN5 — Cloudflare D1 Server Adapter (`server.js`)
 * Scope: B5 Level Tracking only (Magizh Shopping is not integrated).
 *
 * Connects directly to the Cloudflare D1 database `b5-level-tracking` via the
 * Worker binding `DB` (`env.DB`) and routes all API operations through
 * `src/b5-engine.js` + `src/d1-repository.js`.
 * Does NOT use local JSON files (`db.json`) or in-memory storage as the permanent database.
 */

const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const { getD1Binding } = require('./src/d1-node-binding');
const {
  ensureD1SchemaAndBootstrap,
  loadStateFromD1,
  buildSnapshotMap,
  commitStateToD1
} = require('./src/d1-repository');
const {
  handleApiRequest,
  createSessionContext
} = require('./src/b5-engine');

const app = express();

// AIC Cloud SMTP configuration (credentials supplied only through environment variables)
const SMTP_HOST = process.env.SMTP_HOST || 'mail.aiccloud.in';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || 'notifications@borntowin5.com';
const SMTP_PASS = process.env.SMTP_PASS || '';
const EMAIL_FROM = process.env.EMAIL_FROM || SMTP_USER;

const mailer = SMTP_PASS
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      requireTLS: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    })
  : null;

async function smtpSender({ to, subject, text, html }) {
  if (!mailer) throw new Error('SMTP_PASS is not configured');
  return mailer.sendMail({
    from: EMAIL_FROM,
    to,
    subject,
    text,
    html: html || undefined
  });
}

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Block direct web access to internal server/database/configuration files
app.use((req, res, next) => {
  const p = String(req.path || '').toLowerCase();
  if (
    p === '/db.json' ||
    p.endsWith('/db.json') ||
    p.endsWith('.sqlite') ||
    p === '/server.js' ||
    p === '/package.json' ||
    p === '/package-lock.json' ||
    p === '/wrangler.toml' ||
    p.startsWith('/.env') ||
    p.startsWith('/.wrangler') ||
    p.startsWith('/src/') ||
    p.startsWith('/migrations/') ||
    p.startsWith('/data/') ||
    p.startsWith('/_backups/')
  ) {
    return res.status(403).json({ error: 'Forbidden: Direct access to internal system files is blocked.' });
  }
  next();
});

// Static portal HTML routes (Emerald Sovereign UI preserved)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'member.html')));
app.get('/member.html', (req, res) => res.sendFile(path.join(__dirname, 'member.html')));
app.get('/user/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/user/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'member.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/leveltrack-admin.html', (req, res) => res.sendFile(path.join(__dirname, 'leveltrack-admin.html')));
app.get('/leveltrack-member.html', (req, res) => res.sendFile(path.join(__dirname, 'leveltrack-member.html')));
app.get('/mobile-preview', (req, res) => res.sendFile(path.join(__dirname, 'mobile-preview.html')));

let d1DatabaseBinding = null;
let d1ConnectionMode = 'uninitialized';

// Delegate all /api/* routes to the Cloudflare Worker D1 Engine (`env.DB`)
app.use('/api', async (req, res) => {
  try {
    if (!d1DatabaseBinding) {
      return res.status(503).json({ error: 'Cloudflare D1 database binding (DB -> b5-level-tracking) is initializing.' });
    }
    const env = {
      ...process.env,
      DB: d1DatabaseBinding
    };
    const result = await handleApiRequest({
      method: req.method,
      pathname: req.originalUrl.split('?')[0],
      query: req.query || {},
      headers: req.headers || {},
      body: req.body || {},
      env,
      smtpSender: SMTP_PASS ? smtpSender : null
    });

    if (result.headers) {
      for (const [k, v] of Object.entries(result.headers)) {
        res.setHeader(k, v);
      }
    }

    if (result.isBinary && Buffer.isBuffer(result.body)) {
      return res.status(result.status || 200).send(result.body);
    }
    return res.status(result.status || 200).json(result.body);
  } catch (err) {
    console.error('B5 D1 API error:', err);
    return res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
});

// Static assets (CSS, logos, videos)
app.use(express.static(__dirname));

const PORT = process.env.PORT || 10000;

async function startServer() {
  const { DB: d1, mode } = await getD1Binding({
    persistDir: process.env.B5_D1_PERSIST_DIR || process.env.D1_PERSIST_DIR || undefined
  });
  d1DatabaseBinding = d1;
  d1ConnectionMode = mode;

  const configuredAdminPwd =
    process.env.B5_ADMIN_PASSWORD ||
    (String(process.env.B5_LOCAL_TEST_ONLY || '') === '1' ? 'ADMIN' : null);

  await ensureD1SchemaAndBootstrap(d1DatabaseBinding, configuredAdminPwd);

  // Only seed explicit safe-test-mode records when both B5_SENIORITY_TEST_MODE=1 and B5_LOCAL_TEST_ONLY=1
  if (
    String(process.env.B5_SENIORITY_TEST_MODE || '') === '1' &&
    String(process.env.B5_LOCAL_TEST_ONLY || '') === '1'
  ) {
    const state = await loadStateFromD1(d1DatabaseBinding, configuredAdminPwd);
    const snap = buildSnapshotMap(state);
    const ctx = createSessionContext(state, process.env, SMTP_PASS ? smtpSender : null);
    ctx.seedSeniorityTestDataIntoState();
    await commitStateToD1(d1DatabaseBinding, snap, state, []);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `BORNTOWIN5 running on ${PORT} [Database: Cloudflare D1 (b5-level-tracking) | Binding: DB | Mode: ${d1ConnectionMode}]`
    );
  });
}

startServer().catch(err => {
  console.error('CLOUDFLARE D1 STARTUP FAILED:', err.message);
  process.exit(1);
});
