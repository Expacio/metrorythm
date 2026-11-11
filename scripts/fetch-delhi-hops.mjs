/**
 * Fetch DMRC's own route distance and running time for every adjacent station
 * pair in the Delhi dataset.
 *
 * Why this exists: Metrorythm's Delhi edges carried a flat 140 seconds per
 * hop, which made a 0.49 km hop and a 4 km hop take the same time and made
 * every distance — and therefore every distance-slab fare — a guess. DMRC
 * publishes both figures through its journey planner, one adjacent pair at a
 * time, so this walks the whole network and records them.
 *
 * Results are cached to data-src/generated/delhi-hops.json so a re-run only
 * fetches what is missing. Nothing here writes to the dataset; see
 * scripts/apply-delhi-hops.mjs for that.
 *
 * Run: node scripts/fetch-delhi-hops.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DELHI = join(ROOT, 'src', 'data', 'cities', 'delhi.json');
const CODES = join(ROOT, 'data-src', 'generated', 'delhi-station-codes.json');
const OUT = join(ROOT, 'data-src', 'generated', 'delhi-hops.json');

const API = 'https://dmrc-rest-api.vercel.app/api/v2/journeys/plan';
const PAUSE_MS = 320;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hhmmssToSeconds = (t) => {
  if (!t) return null;
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + s;
};

const dataset = JSON.parse(readFileSync(DELHI, 'utf8'));
if (!existsSync(CODES)) {
  console.error(
    `Missing ${CODES}.\nRun scripts/fetch-delhi-codes.mjs first — it maps Metrorythm `
    + 'station ids to DMRC station codes.',
  );
  process.exit(1);
}
const codeOf = JSON.parse(readFileSync(CODES, 'utf8'));

mkdirSync(dirname(OUT), { recursive: true });
const cache = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { fetchedAt: null, hops: {} };

/** Every adjacent pair, keyed by line so a shared pair is not fetched twice. */
const wanted = [];
for (const line of dataset.lines) {
  for (let i = 0; i + 1 < line.stations.length; i++) {
    wanted.push({ line: line.id, a: line.stations[i], b: line.stations[i + 1] });
  }
}

console.log(`${wanted.length} adjacent pairs across ${dataset.lines.length} lines`);

let fetched = 0;
let skipped = 0;
let failed = 0;

for (const { line, a, b } of wanted) {
  const key = `${a}|${b}`;
  if (cache.hops[key]?.km != null) { skipped++; continue; }

  const ca = codeOf[a];
  const cb = codeOf[b];
  if (!ca || !cb) {
    cache.hops[key] = { line, error: `no DMRC code for ${!ca ? a : b}` };
    failed++;
    continue;
  }

  try {
    const url = `${API}?from_station_code=${ca}&to_station_code=${cb}&strategy=least-distance`;
    const res = await fetch(url, { signal: AbortSignal.timeout(40000) });
    const json = await res.json();

    // A single hop must come back as one leg on one line; anything else means
    // the planner routed around, so the figures are not this hop's.
    const legs = json.legs ?? [];
    if (legs.length !== 1 || (legs[0].station_count ?? 0) > 2) {
      cache.hops[key] = { line, error: `planner returned ${legs.length} legs / ${legs[0]?.station_count} stops` };
      failed++;
    } else {
      cache.hops[key] = {
        line,
        km: Number(legs[0].distance_km ?? json.total_distance_km),
        runSeconds: hhmmssToSeconds(legs[0].duration),
        lineName: legs[0].line_name,
      };
      fetched++;
    }
  } catch (err) {
    cache.hops[key] = { line, error: String(err).slice(0, 120) };
    failed++;
  }

  if ((fetched + failed) % 25 === 0) {
    cache.fetchedAt = new Date().toISOString().slice(0, 10);
    writeFileSync(OUT, `${JSON.stringify(cache, null, 1)}\n`);
    console.log(`  ${fetched} fetched, ${failed} failed, ${skipped} cached`);
  }
  await sleep(PAUSE_MS);
}

cache.fetchedAt = new Date().toISOString().slice(0, 10);
writeFileSync(OUT, `${JSON.stringify(cache, null, 1)}\n`);

const ok = Object.values(cache.hops).filter((h) => h.km != null);
console.log(`\ndone: ${fetched} fetched, ${skipped} already cached, ${failed} failed`);
console.log(`${ok.length} of ${wanted.length} hops have official distance + run time`);
const bad = Object.entries(cache.hops).filter(([, h]) => h.error);
if (bad.length) {
  console.log(`\nunresolved (${bad.length}):`);
  for (const [k, h] of bad.slice(0, 20)) console.log(`  ${k}: ${h.error}`);
}
