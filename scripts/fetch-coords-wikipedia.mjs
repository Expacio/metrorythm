#!/usr/bin/env node
/**
 * Metrorythm — coordinate fetch via the Wikipedia (MediaWiki) API.
 *
 *   node scripts/fetch-coords-wikipedia.mjs <cityId>
 *
 * Overpass is heavily rate-limited and frequently unreachable. Wikipedia's API
 * carries `coordinates` for essentially every metro station article, is stable,
 * batches 50 titles per request, and follows redirects for free — which means
 * alternative station spellings resolve themselves.
 *
 * BUILD-TIME ONLY. The result is merged into data-src/coords.<city>.json, which
 * is committed. The application never runs this and never touches the network.
 *
 * A station whose article has no coordinates is left out, never guessed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slug } from './build-data.mjs';

const CITY_ID = process.argv[2] ?? 'chennai';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, `data-src/coords.${CITY_ID}.json`);
const API = 'https://en.wikipedia.org/w/api.php';

const { LINES, STATION_ALIASES } = await import(`../data-src/${CITY_ID}.source.mjs`);

/** Article-title candidates for a station, most specific first. */
function titlesFor(name, cityName) {
  const base = [name, ...(STATION_ALIASES?.[name] ?? [])];
  const out = [];
  for (const b of base) {
    out.push(`${b} metro station`);
    out.push(`${b} metro station (${cityName})`);
    out.push(`${b} Metro Station`);
  }
  return [...new Set(out)];
}

async function queryCoords(titles) {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'coordinates',
    titles: titles.join('|'),
    format: 'json',
    redirects: '1',
    formatversion: '2',
    // The coordinates prop returns only 10 results per query by default, which
    // silently truncates a 50-title batch. 'max' lifts it to the API ceiling.
    colimit: 'max',
  });
  // Wikipedia returns 429 if we push too hard; back off and retry politely.
  let res;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    res = await fetch(`${API}?${params}`, {
      headers: { 'User-Agent': 'Metrorythm-data-build/1.0 (offline transit planner)' },
    });
    if (res.ok) break;
    if (res.status !== 429) throw new Error(`HTTP ${res.status}`);
    const wait = 3000 * (attempt + 1);
    process.stdout.write(`429, waiting ${wait / 1000}s ... `);
    await new Promise((r) => setTimeout(r, wait));
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} after retries`);
  const json = await res.json();

  const found = new Map(); // normalised title -> {lat,lng}
  for (const page of json.query?.pages ?? []) {
    const c = page.coordinates?.[0];
    if (c) found.set(page.title.toLowerCase(), { lat: c.lat, lng: c.lon });
  }
  // Redirects/normalisations map the title we asked for onto the page title.
  const alias = new Map();
  for (const r of json.query?.redirects ?? []) alias.set(r.from.toLowerCase(), r.to.toLowerCase());
  for (const n of json.query?.normalized ?? []) alias.set(n.from.toLowerCase(), n.to.toLowerCase());
  return { found, alias };
}

async function main() {
  const cityName = CITY_ID[0].toUpperCase() + CITY_ID.slice(1);

  const stations = [];
  for (const line of LINES) {
    for (const n of line.stations) {
      if (!stations.some((s) => s.name === n)) stations.push({ name: n, id: slug(n) });
    }
  }

  // Every candidate title across every station, de-duplicated.
  const allTitles = [...new Set(stations.flatMap((s) => titlesFor(s.name, cityName)))];
  console.log(`  ${stations.length} stations, ${allTitles.length} candidate article titles`);

  const found = new Map();
  const alias = new Map();
  for (let i = 0; i < allTitles.length; i += 50) {
    const batch = allTitles.slice(i, i + 50);
    process.stdout.write(`  batch ${i / 50 + 1} (${batch.length} titles) ... `);
    const r = await queryCoords(batch);
    for (const [k, v] of r.found) found.set(k, v);
    for (const [k, v] of r.alias) alias.set(k, v);
    console.log(`${r.found.size} with coordinates`);
    await new Promise((r2) => setTimeout(r2, 900)); // be a good API citizen
  }

  const resolve = (title) => {
    let t = title.toLowerCase();
    for (let hop = 0; hop < 4 && !found.has(t) && alias.has(t); hop += 1) t = alias.get(t);
    return found.get(t);
  };

  const coords = {};
  const missing = [];
  for (const st of stations) {
    let hit;
    for (const t of titlesFor(st.name, cityName)) {
      hit = resolve(t);
      if (hit) break;
    }
    if (hit) coords[st.id] = { lat: hit.lat, lng: hit.lng };
    else missing.push(st.name);
  }

  // Merge rather than clobber: never drop a coordinate we already had.
  let existing = { coords: {} };
  if (fs.existsSync(OUT)) existing = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const merged = { ...existing.coords, ...coords };

  fs.writeFileSync(OUT, `${JSON.stringify({
    source: 'Wikipedia (MediaWiki API) article coordinates, CC BY-SA. Fetched once at build time; not used at runtime.',
    license: 'CC BY-SA 4.0 — © Wikipedia contributors',
    fetchedAt: new Date().toISOString().slice(0, 10),
    matched: Object.keys(merged).length,
    missing,
    coords: merged,
  }, null, 2)}\n`);

  console.log(`\n  resolved ${Object.keys(coords).length}/${stations.length}`);
  if (missing.length) {
    console.log('  no article coordinates (left for interpolation, never guessed):');
    for (const m of missing) console.log(`    - ${m}`);
  }
  console.log(`\n  wrote ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => { console.error('\n  failed:', e.message); process.exit(1); });
