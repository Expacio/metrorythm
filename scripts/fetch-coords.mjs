#!/usr/bin/env node
/**
 * Metrorythm — OPTIONAL one-time developer script.
 *
 *   node scripts/fetch-coords.mjs
 *
 * Downloads metro station coordinates for the Delhi network from OpenStreetMap
 * (Overpass API) and writes them to data-src/coords.delhi.json, which is then
 * baked into src/data/cities/delhi.json by scripts/build-data.mjs.
 *
 * IMPORTANT
 * ---------
 * This is a DEVELOPER / BUILD-TIME step only. It is not part of `npm run dev`,
 * `npm run build` or the shipped bundle. The Metrorythm application performs ZERO
 * network requests at runtime — it imports the generated JSON directly.
 *
 * The output file is committed to the repo, so a fresh clone needs no network
 * access to build or run the app.
 *
 * Stations that cannot be confidently matched are left out rather than guessed;
 * build-data.mjs reports them and the map simply omits them.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slug } from './build-data.mjs';

// Usage: node scripts/fetch-coords.mjs [cityId]
const CITY_ID = process.argv[2] ?? 'delhi';
const { LINES, STATION_ALIASES } = await import(`../data-src/${CITY_ID}.source.mjs`);

/** Bounding boxes: south, west, north, east. */
const BBOXES = {
  delhi: '28.20,76.70,29.10,77.95',
  chennai: '12.75,79.95,13.35,80.40',
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, `data-src/coords.${CITY_ID}.json`);

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const BBOX = BBOXES[CITY_ID];
if (!BBOX) throw new Error(`No bounding box configured for city "${CITY_ID}"`);

// Delhi Metro stations are mapped inconsistently in OSM — some are nodes, many
// are ways (station buildings) or relations (station areas). `out center` gives
// a representative point for all three.
const QUERY = `
[out:json][timeout:240];
(
  nwr["railway"="station"]["station"="subway"](${BBOX});
  nwr["railway"="station"]["subway"="yes"](${BBOX});
  nwr["railway"="halt"]["station"="subway"](${BBOX});
  nwr["public_transport"="station"]["subway"="yes"](${BBOX});
  nwr["railway"="station"]["operator"~"Metro|DMRC|NMRC|CMRL",i](${BBOX});
  nwr["public_transport"="station"]["network"~"Metro",i](${BBOX});
);
out center tags;
`;

const RAW_CACHE = path.join(ROOT, `data-src/.osm-raw.${CITY_ID}.json`);

/** Normalise a name for fuzzy matching against OSM's spellings. */
function norm(s) {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\bmetro station\b|\bmetro\b|\bstation\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bsec\b/g, 'sector')
    .replace(/\bmarg\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOverpass() {
  let lastErr;
  // Overpass instances rate-limit aggressively; retry each with backoff.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    for (const url of ENDPOINTS) {
      try {
        process.stdout.write(`  querying ${new URL(url).host} (try ${attempt + 1}) ... `);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain', 'User-Agent': 'Metrorythm-data-build/1.0' },
          body: QUERY,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        console.log(`${json.elements.length} nodes`);
        return json;
      } catch (err) {
        console.log(`failed (${err.message})`);
        lastErr = err;
      }
    }
    const wait = 8000 * (attempt + 1);
    console.log(`  backing off ${wait / 1000}s ...`);
    await sleep(wait);
  }
  throw lastErr;
}

async function main() {
  const canonical = [];
  for (const line of LINES) for (const n of line.stations) {
    if (!canonical.some((c) => c.name === n)) canonical.push({ name: n, id: slug(n) });
  }

  // Re-use a cached raw response when present so the matching logic can be
  // iterated on without hammering the (heavily rate-limited) Overpass servers.
  let osm;
  if (process.env.MG_USE_CACHE === '1' && fs.existsSync(RAW_CACHE)) {
    console.log('  using cached OSM response (MG_USE_CACHE=1)');
    osm = JSON.parse(fs.readFileSync(RAW_CACHE, 'utf8'));
  } else {
    osm = await fetchOverpass();
    fs.writeFileSync(RAW_CACHE, JSON.stringify(osm));
  }

  // Build a lookup of normalised OSM names -> coordinate
  const byName = new Map();
  for (const el of osm.elements) {
    const tags = el.tags || {};
    // Nodes carry lat/lon directly; ways and relations carry a `center`.
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    const names = [tags.name, tags['name:en'], tags.alt_name, tags.official_name, tags.short_name]
      .filter(Boolean)
      .flatMap((n) => n.split(';'));
    for (const n of names) {
      const k = norm(n);
      if (!k) continue;
      if (!byName.has(k)) byName.set(k, { lat, lng, osmName: n });
    }
  }

  const coords = {};
  const missing = [];
  for (const st of canonical) {
    const candidates = [st.name, ...(STATION_ALIASES[st.name] || [])];
    let hit = null;
    for (const c of candidates) {
      hit = byName.get(norm(c));
      if (hit) break;
    }
    // Fall back to a unique prefix match, e.g. "Mundka Industrial Area" vs OSM's
    // "Mundka Industrial Area (MIA)" — already handled by norm() stripping
    // parentheses, but this catches minor suffix differences.
    if (!hit) {
      for (const c of candidates) {
        const target = norm(c);
        const partial = [...byName.entries()].filter(
          ([k]) => k === target || k.startsWith(target + ' ') || target.startsWith(k + ' '),
        );
        if (partial.length === 1) {
          hit = partial[0][1];
          break;
        }
      }
    }
    // Last resort: a single unambiguous token-set match (handles word-order and
    // minor spelling differences). Requires exactly one candidate so we never
    // attach a coordinate to the wrong station.
    if (!hit) {
      const target = new Set(norm(st.name).split(' ').filter((w) => w.length > 2));
      if (target.size > 0) {
        const matches = [...byName.entries()].filter(([k]) => {
          const words = new Set(k.split(' ').filter((w) => w.length > 2));
          if (words.size === 0) return false;
          const shared = [...target].filter((w) => words.has(w)).length;
          return shared === target.size && shared === words.size;
        });
        if (matches.length === 1) hit = matches[0][1];
      }
    }
    if (hit) coords[st.id] = { lat: hit.lat, lng: hit.lng };
    else missing.push(st.name);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        source: 'OpenStreetMap via Overpass API (ODbL). Fetched once at build time; not used at runtime.',
        license: '© OpenStreetMap contributors, ODbL 1.0',
        fetchedAt: new Date().toISOString().slice(0, 10),
        matched: Object.keys(coords).length,
        missing,
        coords,
      },
      null,
      2,
    ) + '\n',
  );

  console.log(`\n  matched ${Object.keys(coords).length}/${canonical.length} stations`);
  if (missing.length) {
    console.log(`  unmatched (left without coordinates, never guessed):`);
    for (const m of missing) console.log('    - ' + m);
  }
  console.log(`\n  wrote ${path.relative(ROOT, OUT)}`);
  console.log('  now run: npm run build:data');
}

main().catch((e) => {
  console.error('\n  Coordinate fetch failed:', e.message);
  console.error('  This is optional — the app still builds and routes without coordinates.');
  process.exit(1);
});
