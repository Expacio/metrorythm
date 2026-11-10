#!/usr/bin/env node
/**
 * Metrorythm — one-off developer script to fill coordinate gaps.
 *
 * The broad network-wide Overpass query in fetch-coords.mjs leaves a handful of
 * stations unmatched, usually because OSM tags them without `station=subway`
 * (Faridabad's Violet Line stretch, parts of the Aqua Line, a few central
 * stations mapped only as station areas).
 *
 * This script asks for ONLY the named stragglers, which is a far lighter query
 * and therefore far more likely to survive Overpass's rate limiting. Results
 * are merged into data-src/coords.delhi.json, which is committed — the
 * application never runs this and never hits the network.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINES, STATION_ALIASES } from '../data-src/delhi.source.mjs';
import { slug } from './build-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COORDS = path.join(ROOT, 'data-src/coords.delhi.json');
const BBOX = '28.20,76.70,29.10,77.95';
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];

const norm = (s) =>
  s.toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\bmetro station\b|\bmetro\b|\bstation\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bsec\b/g, 'sector')
    .trim()
    .replace(/\s+/g, ' ');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(query) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const url of ENDPOINTS) {
      try {
        process.stdout.write(`  ${new URL(url).host} (try ${attempt + 1}) ... `);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain', 'User-Agent': 'Metrorythm-data-build/1.0' },
          body: query,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        console.log(`${j.elements.length} elements`);
        return j;
      } catch (e) {
        console.log(`failed (${e.message})`);
        lastErr = e;
      }
    }
    await sleep(5000 * (attempt + 1));
  }
  throw lastErr;
}

async function main() {
  const existing = JSON.parse(fs.readFileSync(COORDS, 'utf8'));

  // Every canonical station, so we can tell which still lack a coordinate.
  const canonical = [];
  for (const line of LINES) {
    for (const n of line.stations) {
      if (!canonical.some((c) => c.name === n)) canonical.push({ name: n, id: slug(n) });
    }
  }
  const missing = canonical.filter((c) => !existing.coords[c.id]);
  console.log(`  ${missing.length} stations still need coordinates\n`);
  if (missing.length === 0) return;

  // Match on the first significant word of each name — narrow enough to keep
  // the query small, broad enough to catch OSM's naming variations.
  const keys = [...new Set(missing.map((m) => m.name.split(/[\s(-]/)[0].replace(/[^A-Za-z0-9]/g, '')))]
    .filter((k) => k.length > 2);
  const re = keys.join('|');

  const query = `
[out:json][timeout:120];
(
  nwr["railway"~"station|halt"]["name"~"${re}",i](${BBOX});
  nwr["public_transport"="station"]["name"~"${re}",i](${BBOX});
);
out center tags;
`;

  const osm = await run(query);

  const byName = new Map();
  for (const el of osm.elements) {
    const t = el.tags || {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    for (const n of [t.name, t['name:en'], t.alt_name, t.official_name].filter(Boolean)) {
      const k = norm(n);
      if (k && !byName.has(k)) byName.set(k, { lat, lng, osmName: n });
    }
  }

  let added = 0;
  const stillMissing = [];
  for (const st of missing) {
    const candidates = [st.name, ...(STATION_ALIASES[st.name] || [])];
    let hit = null;
    for (const c of candidates) {
      hit = byName.get(norm(c));
      if (hit) break;
    }
    if (!hit) {
      // One unambiguous prefix match only — never attach a coordinate to the
      // wrong station just to fill a gap.
      for (const c of candidates) {
        const target = norm(c);
        const partial = [...byName.entries()].filter(
          ([k]) => k === target || k.startsWith(`${target} `) || target.startsWith(`${k} `),
        );
        if (partial.length === 1) { hit = partial[0][1]; break; }
      }
    }
    if (hit) {
      existing.coords[st.id] = { lat: hit.lat, lng: hit.lng };
      console.log(`  + ${st.name.padEnd(34)} -> ${hit.osmName}`);
      added += 1;
    } else {
      stillMissing.push(st.name);
    }
  }

  existing.matched = Object.keys(existing.coords).length;
  existing.missing = stillMissing;
  existing.fetchedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(COORDS, `${JSON.stringify(existing, null, 2)}\n`);

  console.log(`\n  added ${added}; ${existing.matched}/${canonical.length} now have coordinates`);
  if (stillMissing.length) {
    console.log('  still unmatched (left null, never guessed):');
    for (const m of stillMissing) console.log(`    - ${m}`);
  }
}

main().catch((e) => {
  console.error('\n  failed:', e.message);
  process.exit(1);
});
