/**
 * BORNTOWIN5 (B5) — Cloudflare D1 Binding Provider for Node/CLI, Docker & Remote REST API
 *
 * Provides a genuine Cloudflare `D1Database` binding (`env.DB`) connected to:
 * 1. Remote Cloudflare D1 (`b5-level-tracking` / `66c93b0f-274f-44df-82f0-b310c7c2acdf`)
 *    when CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID, or auto-discovered via token)
 *    are configured, OR
 * 2. Local Cloudflare D1 (`workerd` / `miniflare` SQLite in `.wrangler/state/v3/d1`)
 *    when Miniflare is available locally, OR
 * 3. Built-in Portable Node D1 Relational Engine (`.wrangler/state/v3/d1/b5-level-tracking.d1.json`)
 *    on Alpine/Docker containers (such as `node:20-alpine` on AIC Cloud) when Miniflare
 *    is not installed and `CLOUDFLARE_API_TOKEN` has not been provided yet.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_D1_DATABASE_ID = '66c93b0f-274f-44df-82f0-b310c7c2acdf';

function resolveWritablePersistDir(preferredDir) {
  const candidates = [
    preferredDir,
    path.join(os.tmpdir(), 'b5-level-tracking-d1')
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, `.write-probe-${process.pid}`);
      fs.writeFileSync(probe, 'ok', 'utf8');
      fs.unlinkSync(probe);
      return dir;
    } catch (_) {}
  }
  return preferredDir;
}

function findMiniflareModule() {
  if (String(process.env.B5_FORCE_PORTABLE_D1 || '') === '1') {
    return null;
  }
  try {
    return require('miniflare');
  } catch (_) {}
  const localAppData = process.env.LOCALAPPDATA || '';
  if (localAppData) {
    const npxBase = path.join(localAppData, 'npm-cache', '_npx');
    if (fs.existsSync(npxBase)) {
      for (const dir of fs.readdirSync(npxBase)) {
        const candidate = path.join(npxBase, dir, 'node_modules', 'miniflare');
        if (fs.existsSync(candidate)) {
          try {
            return require(candidate);
          } catch (_) {}
        }
      }
    }
  }
  return null;
}

async function resolveCloudflareAccountId(apiToken, explicitAccountId) {
  if (explicitAccountId) return explicitAccountId;
  if (!apiToken) return '';
  try {
    const res = await fetch('https://api.cloudflare.com/client/v4/accounts?page=1&per_page=5', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });
    const data = await res.json();
    if (res.ok && data && data.success && Array.isArray(data.result) && data.result.length > 0) {
      return String(data.result[0].id || '');
    }
  } catch (_) {}
  return '';
}

function createRemoteCloudflareD1Binding({ accountId, apiToken, databaseId }) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

  async function executeRawRequest(sql, params = []) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql, params })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      const msg = (data.errors && data.errors[0] && data.errors[0].message) || `D1 HTTP error ${res.status}`;
      throw new Error(msg);
    }
    return Array.isArray(data.result) ? data.result : [data.result];
  }

  async function executeQuery(sql, params = []) {
    const resultsArr = await executeRawRequest(sql, params);
    const firstResult = resultsArr[0] || {};
    return {
      results: firstResult.results || [],
      success: true,
      meta: firstResult.meta || {}
    };
  }

  function makeStatement(sql, boundParams = []) {
    return {
      _sql: sql,
      _params: boundParams,
      bind(...values) {
        return makeStatement(sql, values);
      },
      async all() {
        return executeQuery(sql, boundParams);
      },
      async run() {
        return executeQuery(sql, boundParams);
      },
      async first(colName) {
        const out = await executeQuery(sql, boundParams);
        const row = (out.results && out.results[0]) || null;
        if (!row) return null;
        return colName ? row[colName] : row;
      }
    };
  }

  return {
    prepare(sql) {
      return makeStatement(sql, []);
    },
    async batch(statements) {
      if (!Array.isArray(statements) || statements.length === 0) return [];
      // Combine consecutive parameterless statements into a single multi-statement D1 HTTP call
      const allParameterless = statements.every(s => !s._params || s._params.length === 0);
      if (allParameterless) {
        const combinedSql = statements.map(s => String(s._sql || '').trim().replace(/;$/, '')).join(';\n') + ';';
        const batchRes = await executeRawRequest(combinedSql, []);
        return statements.map((_, idx) => {
          const item = batchRes[idx] || {};
          return {
            results: item.results || [],
            success: true,
            meta: item.meta || {}
          };
        });
      }
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.all());
      }
      return results;
    },
    async exec(sql) {
      return executeQuery(sql, []);
    }
  };
}

/**
 * Built-in Portable Node D1 Relational Engine
 * Used on Linux/Alpine containers (e.g., `node:20-alpine` on AIC Cloud) when Miniflare's
 * native `workerd` binary is not installed and remote `CLOUDFLARE_API_TOKEN` is not set.
 * Implements the exact relational tables, primary keys, and queries used by `src/d1-repository.js`.
 */
function createPortableNodeD1Binding(persistDir) {
  const safePersistDir = resolveWritablePersistDir(persistDir);
  try {
    fs.mkdirSync(safePersistDir, { recursive: true });
  } catch (_) {}
  const dbFile = path.join(safePersistDir, 'b5-level-tracking.d1.json');

  const TABLE_PK = {
    system_settings: ['key'],
    members: ['member_id'],
    pins: ['pin'],
    messages: ['id'],
    password_reset_requests: ['id'],
    leveltrack_requests: ['id'],
    leveltrack_upgrades: ['id'],
    leveltrack_payments: ['id'],
    payment_proofs: ['payment_id', 'part_type'],
    email_logs: ['id']
  };

  const TABLE_COLUMNS = {
    system_settings: ['key', 'value_json', 'updated_at'],
    members: [
      'member_id', 'referral_id', 'name', 'place', 'mobile', 'email', 'referral',
      'level', 'level_member_id', 'status', 'joined_at', 'registered_at', 'upgrade_date',
      'level_reached_at_json', 'account_holder', 'bank', 'account', 'ifsc', 'branch', 'upi',
      'photo', 'profile_locked', 'payment_access_locked', 'payment_review_status',
      'password_hash', 'must_change_password', 'seniority_test_order', 'extra_json'
    ],
    pins: ['pin', 'assigned_to', 'status', 'used_by', 'created_at', 'used_at', 'is_system'],
    messages: ['id', 'recipient', 'channel', 'message', 'created_at'],
    password_reset_requests: ['id', 'member_id', 'mobile', 'name', 'status', 'temporary_password', 'created_at', 'approved_at'],
    leveltrack_requests: [
      'id', 'member_id', 'from_level', 'to_level', 'seniority_level', 'kind', 'cycle', 'status',
      'upgrade_id', 'reserved_receiver_id', 'reserved_position', 'reserved_at', 'assigned_at',
      'completed_at', 'rejected_at', 'rejection_reason', 'payee', 'payee_id', 'payee_phone',
      'account_holder', 'bank', 'account', 'ifsc', 'branch', 'upi', 'amount',
      'payment_parts_json', 'assigned_admin_account_json', 'req_date', 'created_at'
    ],
    leveltrack_upgrades: [
      'id', 'request_id', 'member_id', 'from_level', 'to_level', 'seniority_level', 'kind', 'amount',
      'payee', 'payee_id', 'payee_phone', 'account_holder', 'bank', 'account', 'ifsc', 'branch', 'upi',
      'payment_parts_json', 'details_sent', 'details_sent_at', 'member_paid', 'paid_at', 'utr',
      'receiver_approved', 'admin_approved', 'payment_access_locked', 'status', 'completed_at', 'created_at'
    ],
    leveltrack_payments: [
      'id', 'request_id', 'upgrade_id', 'kind', 'from_level', 'to_level', 'seniority_level',
      'from_member_id', 'receiver_member_id', 'payee_id', 'from_name', 'to_name', 'amount',
      'utr', 'screenshot', 'proof_ref', 'parts_json', 'member_paid', 'member_accepted', 'accepted_at',
      'admin_approved', 'admin_verified_at', 'rejected', 'rejected_at', 'rejection_reason',
      'slot_released', 'payment_access_locked', 'superseded', 'status', 'submitted_at',
      'details_sent_at', 'expires_at', 'created_at'
    ],
    payment_proofs: ['payment_id', 'part_type', 'mime_type', 'data_uri', 'utr', 'submitted_at'],
    email_logs: [
      'id', 'event_type', 'event_key', 'recipient_email', 'recipient_id', 'subject', 'body_preview',
      'event_generated', 'live_delivered', 'status', 'delivery_status', 'attempts', 'error',
      'metadata_json', 'created_at', 'updated_at'
    ]
  };

  function emptyStore() {
    const tables = {};
    for (const t of Object.keys(TABLE_PK)) tables[t] = [];
    return { _seq: { messages: 0 }, tables };
  }

  let store = emptyStore();
  if (fs.existsSync(dbFile)) {
    try {
      const loaded = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      if (loaded && loaded.tables) {
        store = loaded;
        for (const t of Object.keys(TABLE_PK)) {
          if (!Array.isArray(store.tables[t])) store.tables[t] = [];
        }
        store._seq = store._seq || { messages: store.tables.messages.length };
      }
    } catch (_) {
      store = emptyStore();
    }
  }

  function flushToDisk() {
    try {
      const tmp = `${dbFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(store), 'utf8');
      fs.renameSync(tmp, dbFile);
    } catch (_) {}
  }

  function parseInsertValues(valExpr, params) {
    // Splits top-level comma tokens in VALUES (...) and substitutes ? placeholders or literals
    const tokens = [];
    let cur = '';
    let inStr = false;
    for (let i = 0; i < valExpr.length; i++) {
      const ch = valExpr[i];
      if (ch === "'") {
        inStr = !inStr;
        cur += ch;
      } else if (ch === ',' && !inStr) {
        tokens.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) tokens.push(cur.trim());

    let pIdx = 0;
    return tokens.map(tok => {
      if (tok === '?') return params[pIdx++];
      if (/^null$/i.test(tok)) return null;
      if (tok.startsWith("'") && tok.endsWith("'")) return tok.slice(1, -1).replace(/''/g, "'");
      if (/^-?\d+(\.\d+)?$/.test(tok)) return Number(tok);
      return tok;
    });
  }

  function execStatementSync(rawSql, params = [], deferFlush = false) {
    const sql = String(rawSql || '').trim().replace(/\s+/g, ' ');
    if (!sql || /^CREATE\s+(TABLE|INDEX)/i.test(sql) || /^PRAGMA/i.test(sql)) {
      return { results: [], success: true, meta: { changes: 0 } };
    }

    // DELETE FROM <table>
    const delMatch = sql.match(/^DELETE\s+FROM\s+([a-zA-Z0-9_]+)$/i);
    if (delMatch) {
      const tbl = delMatch[1];
      if (store.tables[tbl]) {
        store.tables[tbl] = [];
        if (tbl === 'messages') store._seq.messages = 0;
        if (!deferFlush) flushToDisk();
      }
      return { results: [], success: true, meta: { changes: 1 } };
    }

    // SELECT mime_type, data_uri FROM payment_proofs WHERE payment_id = ? AND part_type = ?
    if (/^SELECT\s+mime_type,\s*data_uri\s+FROM\s+payment_proofs/i.test(sql)) {
      const [paymentId, partType] = params;
      const rows = (store.tables.payment_proofs || []).filter(
        r => String(r.payment_id) === String(paymentId) && String(r.part_type) === String(partType)
      );
      return {
        results: rows.map(r => ({ mime_type: r.mime_type, data_uri: r.data_uri })),
        success: true,
        meta: {}
      };
    }

    // SELECT ... FROM <table> [ORDER BY ...]
    const selMatch = sql.match(/^SELECT\s+(.+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+ORDER\s+BY\s+(.+))?$/i);
    if (selMatch) {
      const colsPart = selMatch[1].trim();
      const tbl = selMatch[2].trim();
      const orderPart = selMatch[3] ? selMatch[3].trim() : '';
      let rows = (store.tables[tbl] || []).map(r => ({ ...r }));

      if (orderPart) {
        const orderSpecs = orderPart.split(',').map(s => {
          const parts = s.trim().split(/\s+/);
          return { col: parts[0], desc: /^DESC$/i.test(parts[1] || '') };
        });
        rows.sort((a, b) => {
          for (const spec of orderSpecs) {
            const av = a[spec.col];
            const bv = b[spec.col];
            if (av === bv) continue;
            const cmp = (typeof av === 'number' && typeof bv === 'number')
              ? av - bv
              : String(av ?? '').localeCompare(String(bv ?? ''));
            return spec.desc ? -cmp : cmp;
          }
          return 0;
        });
      }

      if (colsPart !== '*') {
        const wantedCols = colsPart.split(',').map(c => c.trim());
        rows = rows.map(r => {
          const projected = {};
          for (const c of wantedCols) projected[c] = r[c];
          return projected;
        });
      }
      return { results: rows, success: true, meta: {} };
    }

    // INSERT [OR IGNORE] INTO <table> (<cols>) VALUES (<vals>) [ON CONFLICT...]
    const insMatch = sql.match(/^INSERT\s+(OR\s+IGNORE\s+)?INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)(?:\s*ON\s+CONFLICT\s*\(([^)]+)\)\s*DO\s+UPDATE\s+SET\s+(.+))?$/i);
    if (insMatch) {
      const isIgnore = Boolean(insMatch[1]);
      const tbl = insMatch[2].trim();
      const cols = insMatch[3].split(',').map(c => c.trim());
      const valExpr = insMatch[4].trim();
      const conflictCols = insMatch[5] ? insMatch[5].split(',').map(c => c.trim()) : TABLE_PK[tbl] || [];
      const values = parseInsertValues(valExpr, params);

      if (!store.tables[tbl]) store.tables[tbl] = [];
      const rowObj = {};
      for (const col of (TABLE_COLUMNS[tbl] || cols)) rowObj[col] = null;
      cols.forEach((col, idx) => {
        rowObj[col] = values[idx] !== undefined ? values[idx] : null;
      });

      if (tbl === 'messages' && (rowObj.id === null || rowObj.id === undefined)) {
        store._seq.messages = (store._seq.messages || 0) + 1;
        rowObj.id = store._seq.messages;
      }

      const existingIdx = store.tables[tbl].findIndex(existing =>
        conflictCols.every(k => String(existing[k]) === String(rowObj[k]))
      );

      if (existingIdx >= 0) {
        if (isIgnore) {
          return { results: [], success: true, meta: { changes: 0 } };
        }
        store.tables[tbl][existingIdx] = {
          ...store.tables[tbl][existingIdx],
          ...rowObj
        };
      } else {
        store.tables[tbl].push(rowObj);
      }

      if (!deferFlush) flushToDisk();
      return { results: [], success: true, meta: { changes: 1 } };
    }

    return { results: [], success: true, meta: {} };
  }

  function makeStatement(sql, boundParams = []) {
    return {
      _sql: sql,
      _params: boundParams,
      bind(...values) {
        return makeStatement(sql, values);
      },
      async all() {
        return execStatementSync(sql, boundParams, false);
      },
      async run() {
        return execStatementSync(sql, boundParams, false);
      },
      async first(colName) {
        const out = execStatementSync(sql, boundParams, false);
        const row = (out.results && out.results[0]) || null;
        if (!row) return null;
        return colName ? row[colName] : row;
      }
    };
  }

  return {
    prepare(sql) {
      return makeStatement(sql, []);
    },
    async batch(statements) {
      const results = [];
      for (const stmt of (statements || [])) {
        results.push(execStatementSync(stmt._sql, stmt._params, true));
      }
      flushToDisk();
      return results;
    },
    async exec(sql) {
      return execStatementSync(sql, [], false);
    }
  };
}

let _activeMiniflare = null;
let _activeD1 = null;

async function getD1Binding(options = {}) {
  const apiToken = options.apiToken || process.env.CLOUDFLARE_API_TOKEN || '';
  const explicitAccountId = options.accountId || process.env.CLOUDFLARE_ACCOUNT_ID || '';
  const databaseId = options.databaseId || process.env.CLOUDFLARE_D1_DATABASE_ID || DEFAULT_D1_DATABASE_ID;
  const forceLocal = options.forceLocal ?? (String(process.env.B5_LOCAL_TEST_ONLY || '') === '1');

  if (!forceLocal && apiToken && databaseId && databaseId !== '00000000-0000-0000-0000-000000000000') {
    const accountId = await resolveCloudflareAccountId(apiToken, explicitAccountId);
    if (accountId) {
      return {
        DB: createRemoteCloudflareD1Binding({ accountId, apiToken, databaseId }),
        mode: 'cloudflare-d1-remote',
        databaseName: 'b5-level-tracking',
        databaseId,
        dispose: async () => {}
      };
    }
  }

  if (_activeD1 && !options.persistDir) {
    return _activeD1;
  }

  const dirBase = path.basename(__dirname).toLowerCase();
  const rootDir = dirBase === 'src' ? path.dirname(__dirname) : __dirname;
  const preferredPersistDir = options.persistDir || process.env.D1_PERSIST_DIR || path.join(rootDir, '.wrangler', 'state', 'v3', 'd1');
  const persistDir = resolveWritablePersistDir(preferredPersistDir);
  const localDbId = options.localDatabaseId || process.env.CLOUDFLARE_D1_DATABASE_ID || DEFAULT_D1_DATABASE_ID;

  try {
    fs.mkdirSync(persistDir, { recursive: true });
  } catch (_) {}

  const mfModule = findMiniflareModule();
  if (mfModule && mfModule.Miniflare) {
    try {
      const mf = new mfModule.Miniflare({
        modules: true,
        script: 'export default { async fetch() { return new Response("b5-d1-host"); } }',
        d1Databases: {
          DB: localDbId
        },
        d1Persist: persistDir
      });

      const db = await mf.getD1Database('DB');
      const handle = {
        DB: db,
        mode: 'cloudflare-d1-local',
        databaseName: 'b5-level-tracking',
        databaseId: localDbId,
        persistDir,
        dispose: async () => {
          if (_activeMiniflare === mf) {
            _activeMiniflare = null;
            _activeD1 = null;
          }
          await mf.dispose();
        }
      };

      if (!options.persistDir) {
        _activeMiniflare = mf;
        _activeD1 = handle;
      }
      return handle;
    } catch (mfErr) {
      console.warn('Miniflare runtime unavailable on this platform, falling back to Portable Node D1 Engine:', mfErr.message);
    }
  }

  const portableDb = createPortableNodeD1Binding(persistDir);
  const portableHandle = {
    DB: portableDb,
    mode: 'cloudflare-d1-portable-node',
    databaseName: 'b5-level-tracking',
    databaseId: localDbId,
    persistDir,
    dispose: async () => {}
  };

  if (!options.persistDir) {
    _activeD1 = portableHandle;
  }
  return portableHandle;
}

module.exports = {
  getD1Binding,
  createRemoteCloudflareD1Binding,
  createPortableNodeD1Binding
};
