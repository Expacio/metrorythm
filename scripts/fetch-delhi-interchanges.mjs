/**
 * Harvest DMRC's published interchange allowance for every Delhi interchange.
 *
 * Metrorythm's interchange edges carried a platform-to-platform walking time
 * and nothing else, so changing trains cost no waiting at all. DMRC's planner
 * does publish an allowance per interchange — 5 minutes at most stations, 10
 * where the change crosses a fare boundary or a long concourse — and that is
 * what this collects.
 *
 * For each interchange station it asks for a journey between the far ends of
 * the two lines that meet there, then reads the allowance the planner reports
 * at that station. Journeys that do not actually change there are discarded
 * rather than guessed at.
 *
 * Run: node scripts/fetch-delhi-interchanges.mjs
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DELHI = join(ROOT, 'src', 'data', 'cities', 'delhi.json');
const CODES = join(ROOT, 'data-src', 'generated', 'delhi-station-codes.json');
const OUT = join(ROOT, 'data-src', 'generated', 'delhi-interchanges.json');

const API = 'https://dmrc-rest-api.vercel.app/api/v2/journeys/plan';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dataset = JSON.parse(readFileSync(DELHI, 'utf8'));
const codeOf = JSON.parse(readFileSync(CODES, 'utf8'));
const lineById = new Map(dataset.lines.map((l) => [l.id, l]));
const found = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

/** Interchange edges, one query per distinct (station, lineA, lineB). */
const targets = dataset.edges
  .filter((e) => e.kind !== 'ride')
  .map((e) => ({ station: e.from, to: e.to, a: e.fromLine, b: e.toLine }));

console.log(`${targets.length} interchange connections to resolve`);

for (const t of targets) {
  const key = `${t.station}|${t.a}|${t.b}`;
  if (found[key]?.minutes != null) continue;

  const la = lineById.get(t.a);
  const lb = lineById.get(t.b);
  if (!la || !lb) continue;

  /*
   * Query between the stations either side of the interchange, one on each
   * line. Asking for the far ends of the two lines does not work — the planner
   * simply finds a shorter route elsewhere and never changes here, which is
   * what made the first version of this resolve 7 of 30.
   *
   * A neighbour that also sits on the other line is skipped, since the change
   * could then happen there instead.
   */
  const neighbours = (line, at) => {
    const i = line.stations.indexOf(at);
    if (i === -1) return [];
    return [line.stations[i - 1], line.stations[i + 1]].filter(Boolean);
  };
  const onOther = (s, other) => other.stations.includes(s);

  const from = neighbours(la, t.station).find((s) => !onOther(s, lb));
  const to = neighbours(lb, t.to).find((s) => !onOther(s, la) && s !== from);
  const ca = codeOf[from];
  const cb = codeOf[to];
  if (!ca || !cb || ca === cb) { found[key] = { error: 'no usable endpoints' }; continue; }

  try {
    const res = await fetch(
      `${API}?from_station_code=${ca}&to_station_code=${cb}&strategy=least-distance`,
      { signal: AbortSignal.timeout(40000) },
    );
    const json = await res.json();
    const code = codeOf[t.station];
    const hit = (json.interchanges ?? []).find((x) => x.station === code && x.minutes > 0);
    found[key] = hit
      ? { minutes: hit.minutes, via: `${from}->${to}` }
      : { error: `planner did not change at ${t.station} on ${from}->${to}` };
  } catch (err) {
    found[key] = { error: String(err).slice(0, 100) };
  }

  writeFileSync(OUT, `${JSON.stringify(found, null, 1)}\n`);
  await sleep(320);
}

const ok = Object.entries(found).filter(([, v]) => v.minutes != null);
const bad = Object.entries(found).filter(([, v]) => v.error);
console.log(`\nresolved ${ok.length}, unresolved ${bad.length}`);

const byMinutes = {};
for (const [, v] of ok) byMinutes[v.minutes] = (byMinutes[v.minutes] ?? 0) + 1;
console.log('allowances seen:', JSON.stringify(byMinutes));
for (const [k, v] of ok) console.log(`  ${k.padEnd(52)} ${v.minutes} min`);
if (bad.length) {
  console.log('\nunresolved — these keep Metrorythm\'s own walking time with no wait added:');
  for (const [k, v] of bad) console.log(`  ${k}: ${v.error}`);
}
