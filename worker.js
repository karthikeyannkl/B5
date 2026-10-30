/**
 * BORNTOWIN5 (B5) — Cloudflare Worker Entry Point
 * Database : Cloudflare D1 (`b5-level-tracking`) bound as `env.DB`
 * Assets   : Static portal HTML/CSS/media bound as `env.ASSETS` (`./public`)
 */

import b5Engine from './b5-engine.js';

const { isBlockedInternalPath, handleApiRequest } = b5Engine;

const ROUTE_ALIASES = {
  '/': '/member.html',
  '/user/dashboard': '/member.html',
  '/user/login': '/login.html',
  '/admin': '/admin.html',
  '/admin/login': '/admin.html',
  '/mobile-preview': '/mobile-preview.html'
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    // 1. Block direct access to internal server/database/migration paths
    if (isBlockedInternalPath(pathname)) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Direct access to internal server or database files is not permitted.' }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        }
      );
    }

    // 2. Route all /api/* requests through the Cloudflare D1 (`env.DB`) engine
    if (pathname.startsWith('/api/')) {
      const query = {};
      for (const [k, v] of url.searchParams.entries()) {
        query[k] = v;
      }

      const headers = {};
      for (const [k, v] of request.headers.entries()) {
        headers[k.toLowerCase()] = v;
      }

      let body = {};
      if (method !== 'GET' && method !== 'HEAD') {
        try {
          const text = await request.text();
          body = text ? JSON.parse(text) : {};
        } catch (_) {
          body = {};
        }
      }

      try {
        const result = await handleApiRequest({
          method,
          pathname,
          query,
          headers,
          body,
          env
        });

        if (result.isBinary) {
          return new Response(result.body, {
            status: result.status,
            headers: result.headers
          });
        }

        return new Response(JSON.stringify(result.body), {
          status: result.status,
          headers: result.headers
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: err?.message || 'Internal Cloudflare Worker D1 error' }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          }
        );
      }
    }

    // 3. Serve Portal HTML/CSS/Media via Cloudflare Workers Assets binding (`env.ASSETS`)
    if (env && env.ASSETS) {
      const aliasTarget = ROUTE_ALIASES[pathname];
      if (aliasTarget) {
        const assetUrl = new URL(aliasTarget, request.url);
        return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
      }
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  }
};
