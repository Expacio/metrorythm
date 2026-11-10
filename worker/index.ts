/**
 * Metrorythm — Cloudflare Worker entry point.
 *
 * Metrorythm is a pure client-side app, so the Worker exists only to serve the
 * built assets correctly. It does NOT render, route or calculate anything —
 * all of that still happens in the browser, offline.
 *
 * Why a Worker script at all, rather than assets-only config?
 * Because `not_found_handling: "single-page-application"` returns index.html
 * with a 200 for *every* unmatched path, including a mistyped font or icon
 * URL. That silently masks 404s — a bug we already hit and fixed on the other
 * host. This script serves the SPA shell for navigations only, and lets real
 * asset misses 404 properly.
 */

export interface Env {
  ASSETS: Fetcher;
}

/** Paths that are real files. A miss under these must 404, never fall back. */
const ASSET_PREFIXES = ['/assets/', '/fonts/', '/icons/'];
const ASSET_FILES = ['/favicon.ico', '/manifest.webmanifest', '/sw.js'];

const IMMUTABLE = /^\/(assets|fonts|icons)\//;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    const res = await env.ASSETS.fetch(request);

    const isAssetPath =
      ASSET_PREFIXES.some((p) => pathname.startsWith(p)) || ASSET_FILES.includes(pathname);

    // A missing asset is a genuine 404 — do not serve the SPA shell for it.
    if (res.status === 404 && isAssetPath) {
      return new Response(`Not found: ${pathname}`, {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    // Any other miss is a client-side route: serve the app shell.
    if (res.status === 404) {
      const shell = await env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
      return new Response(shell.body, {
        status: 200,
        headers: shell.headers,
      });
    }

    // Content-hashed bundles and fonts never change — cache them hard.
    if (res.ok && IMMUTABLE.test(pathname)) {
      const headers = new Headers(res.headers);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      return new Response(res.body, { status: res.status, headers });
    }

    return res;
  },
} satisfies ExportedHandler<Env>;
