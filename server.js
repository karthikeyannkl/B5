const express = require('express');
const { Pool } = require('pg');
const app = express();
app.use(express.json());

function safeDbInfo() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return { configured: false };
  try {
    const u = new URL(raw);
    return {
      configured: true,
      protocol: u.protocol,
      host: u.hostname,
      port: u.port || '(default)',
      database: u.pathname.replace(/^\//, ''),
      user: decodeURIComponent(u.username || ''),
      passwordLength: (u.password || '').length,
      sslmode: u.searchParams.get('sslmode') || '(none)',
      channelBinding: u.searchParams.get('channel_binding') || '(none)'
    };
  } catch (e) {
    return { configured: true, parseError: e.message };
  }
}

const rawUrl = process.env.DATABASE_URL;
const pool = rawUrl ? new Pool({
  connectionString: rawUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 10000,
  max: 1
}) : null;

console.log('=== BORNTOWIN5 DATABASE CONNECTION TEST V2 ===');
console.log('DATABASE_URL diagnostic:', JSON.stringify(safeDbInfo()));

async function dbCheck(req, res) {
  if (!pool) return res.status(500).json({ ok:false, error:'DATABASE_URL is not configured' });
  try {
    const r = await pool.query('SELECT 1 AS ok');
    console.log('DATABASE TEST: SUCCESS SELECT 1');
    return res.json({ ok:true, message:'PostgreSQL authentication and connection successful', result:r.rows[0] });
  } catch (e) {
    console.error('DATABASE TEST: FAILED', e.message);
    return res.status(500).json({ ok:false, error:e.message, diagnostic:safeDbInfo() });
  }
}

// AIC Cloud may rewrite/strip a path before forwarding. Therefore the ROOT path
// also performs the real DB test. This does not create, update, or delete anything.
app.get('/', dbCheck);
app.get('/db-test', dbCheck);

const port = process.env.PORT || 10000;
app.listen(port, '0.0.0.0', () => console.log('BORNTOWIN5 DB TEST V2 running on ' + port));
