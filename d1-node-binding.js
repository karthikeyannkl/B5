/**
 * BORNTOWIN5 (B5) — Cloudflare D1 Binding Provider for Node/CLI & Remote REST API
 *
 * Provides a genuine Cloudflare `D1Database` binding (`env.DB`) connected to:
 * 1. Remote Cloudflare D1 (`b5-level-tracking`) when CLOUDFLARE_ACCOUNT_ID,
 *    CLOUDFLARE_API_TOKEN, and CLOUDFLARE_D1_DATABASE_ID are configured, OR
 * 2. Local Cloudflare D1 (`workerd` / `miniflare` SQLite in `.wrangler/state/v3/d1`)
 *    matching `wrangler d1 execute b5-level-tracking --local` and `wrangler dev --local`.
 */

const fs = require('fs');
const path = require('path');

function findMiniflareModule() {
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
          return require(candidate);
        }
      }
    }
  }
  throw new Error('Miniflare (Cloudflare D1 local runtime) not found. Run `npx wrangler --version` once to initialize.');
}

function createRemoteCloudflareD1Binding({ accountId, apiToken, databaseId }) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

  async function executeQuery(sql, params = []) {
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
    const firstResult = Array.isArray(data.result) ? data.result[0] : data.result;
    return {
      results: (firstResult && firstResult.results) || [],
      success: true,
      meta: (firstResult && firstResult.meta) || {}
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

let _activeMiniflare = null;
let _activeD1 = null;

async function getD1Binding(options = {}) {
  const accountId = options.accountId || process.env.CLOUDFLARE_ACCOUNT_ID || '';
  const apiToken = options.apiToken || process.env.CLOUDFLARE_API_TOKEN || '';
  const databaseId = options.databaseId || process.env.CLOUDFLARE_D1_DATABASE_ID || '66c93b0f-274f-44df-82f0-b310c7c2acdf';
  const forceLocal = options.forceLocal ?? (String(process.env.B5_LOCAL_TEST_ONLY || '') === '1');

  if (!forceLocal && accountId && apiToken && databaseId && databaseId !== '00000000-0000-0000-0000-000000000000') {
    return {
      DB: createRemoteCloudflareD1Binding({ accountId, apiToken, databaseId }),
      mode: 'cloudflare-d1-remote',
      databaseName: 'b5-level-tracking',
      databaseId,
      dispose: async () => {}
    };
  }

  if (_activeD1 && !options.persistDir) {
    return _activeD1;
  }

  const { Miniflare } = findMiniflareModule();
  const rootDir = path.resolve(__dirname, '..');
  const persistDir = options.persistDir || process.env.D1_PERSIST_DIR || path.join(rootDir, '.wrangler', 'state', 'v3', 'd1');
  const localDbId = options.localDatabaseId || process.env.CLOUDFLARE_D1_DATABASE_ID || '66c93b0f-274f-44df-82f0-b310c7c2acdf';

  fs.mkdirSync(persistDir, { recursive: true });

  const mf = new Miniflare({
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
}

module.exports = {
  getD1Binding,
  createRemoteCloudflareD1Binding
};
