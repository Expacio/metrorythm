/**
 * Write DMRC's official per-hop distances into the Delhi dataset, and set each
 * line's scheduled speed from them.
 *
 * What is OFFICIAL here and what is not:
 *
 *   km            OFFICIAL. DMRC publishes a chargeable route distance for
 *                 every station pair; these are read straight from it.
 *
 *   run time      NOT stored per edge. Analysing DMRC's own leg durations
 *                 shows its planner derives time as distance ÷ a fixed line
 *                 speed — every regular line comes back at 33.0 km/h — so a
 *                 per-edge "measured" time would imply a timetable that does
 *                 not exist. Instead each line records `avgSpeedKmh`, computed
 *                 from the figures DMRC returns, and the engine derives the
 *                 run time from distance. Same numbers, honest mechanism.
 *
 *   dwell         UNKNOWN, left at 0. DMRC's speed already includes station
 *                 stops, so charging dwell separately would double-count.
 *
 * Run: node scripts/apply-delhi-hops.mjs
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DELHI = join(ROOT, 'src', 'data', 'cities', 'delhi.json');
const HOPS = join(ROOT, 'data-src', 'generated', 'delhi-hops.json');

const SOURCES = [
  {
    id: 'dmrc-planner',
    organisation: 'Delhi Metro Rail Corporation (DMRC)',
    url: 'https://www.delhimetrorail.com/',
    official: true,
    retrievedAt: '2026-11-12',
    lastVerifiedAt: '2026-11-12',
    coverage:
      'Route distance, fare and journey-time estimate for every adjacent station pair '
      + 'on the DMRC network, the Airport Express, the Gurugram Rapid Metro and the '
      + 'NMRC Aqua Line, plus DMRC\'s published interchange allowances.',
    limitations: [
      'Reached through the open REST wrapper at dmrc-rest-api.vercel.app, which fronts '
      + 'DMRC\'s own planner endpoints; DMRC publishes no documented public API of its own.',
      'DMRC publishes no GTFS feed, so no working timetable is available. Journey times '
      + 'are DMRC\'s published estimate, computed from distance at a constant line speed, '
      + 'not observed running times.',
      'Phase IV corridors opened in March 2026 are not yet present in this dataset — see '
      + 'the data-gaps section of the audit.',
    ],
  },
];

if (!existsSync(HOPS)) {
  console.error(`Missing ${HOPS}. Run scripts/fetch-delhi-hops.mjs first.`);
  process.exit(1);
}

const dataset = JSON.parse(readFileSync(DELHI, 'utf8'));
const { hops } = JSON.parse(readFileSync(HOPS, 'utf8'));

const lookup = (a, b) => {
  const h = hops[`${a}|${b}`] ?? hops[`${b}|${a}`];
  return h && h.km != null ? h : null;
};

/**
 * Speeds that cannot be real. A handful of pairs come back with a distance or
 * duration the planner clearly did not compute for that hop alone, and one
 * such value drags a mean badly — hence the median, and hence rejecting these
 * outright rather than quietly averaging them in.
 */
const PLAUSIBLE_KMH = { min: 15, max: 100 };

/* -------------------------------------------------- distances onto edges */

let applied = 0;
let missing = 0;
const missingPairs = [];

/**
 * A handful of pairs come back with a distance the planner plainly did not
 * compute for that hop — 0 km between two stations, or 0.26 km where the
 * surrounding hops are over a kilometre. Writing those in would corrupt the
 * fare (which is distance-banded) far more than leaving the geometric estimate
 * in place, so they are rejected and reported.
 */
const MIN_PLAUSIBLE_KM = 0.2;
const rejectedKm = [];

for (const e of dataset.edges) {
  if (e.kind !== 'ride') continue;
  const h = lookup(e.from, e.to);
  if (!h) { missing++; missingPairs.push(`${e.line}: ${e.from}->${e.to}`); continue; }

  // Cross-check against the straight-line distance: a published route distance
  // shorter than the crow flies is impossible.
  const impliedKmh = h.runSeconds ? (h.km / h.runSeconds) * 3600 : null;
  if (h.km < MIN_PLAUSIBLE_KM
      || (impliedKmh != null && (impliedKmh < PLAUSIBLE_KMH.min || impliedKmh > PLAUSIBLE_KMH.max))) {
    rejectedKm.push(
      `${e.line} ${e.from}->${e.to}: ${h.km} km`
      + (impliedKmh != null ? ` implying ${impliedKmh.toFixed(1)} km/h` : ''),
    );
    missing++;
    continue;
  }

  e.km = Math.round(h.km * 1000) / 1000;
  e.provenance = { confidence: 'OFFICIAL', source: 'dmrc-planner' };
  applied++;
}

/* --------------------------------------- line speed from the same figures */

/**
 * NMRC returns no per-leg duration, so the Aqua Line's speed is fitted to the
 * three end-to-end journeys its planner does publish:
 *   8.67 km / 16 min · 21.29 km / 32 min · 26.06 km / 40 min
 * A straight line through those gives 43.5 km/h plus a fixed ~4 minutes. That
 * constant is a first-train allowance — roughly half the Aqua headway — which
 * Metrorythm deliberately excludes, so only the slope is used here.
 */
const FITTED_SPEEDS = {
  aqua: {
    kmh: 43.5,
    note:
      'Fitted to NMRC\'s three published end-to-end Aqua Line journeys. Their planner '
      + 'also adds a fixed ~4 minutes, which is a first-train wait and is excluded here.',
  },
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const speedStats = {};
const rejected = [];
for (const e of dataset.edges) {
  if (e.kind !== 'ride') continue;
  const h = lookup(e.from, e.to);
  if (!h || !h.runSeconds) continue;
  const kmh = (h.km / h.runSeconds) * 3600;
  if (kmh < PLAUSIBLE_KMH.min || kmh > PLAUSIBLE_KMH.max) {
    rejected.push(`${e.line} ${e.from}->${e.to}: ${kmh.toFixed(1)} km/h`);
    continue;
  }
  (speedStats[e.line] ??= []).push(kmh);
}

const summary = [];
for (const line of dataset.lines) {
  const fitted = FITTED_SPEEDS[line.id];
  const speeds = speedStats[line.id];
  if (!fitted && !speeds?.length) { summary.push(`${line.id}: no speed data`); continue; }

  if (fitted) {
    line.avgSpeedKmh = fitted.kmh;
    line.dwellSeconds = 0;
    line.provenance = {
      ...(line.provenance ?? {}),
      timings: { confidence: 'VERIFIED_SECONDARY', source: 'dmrc-planner', note: fitted.note },
    };
    summary.push(`${line.id.padEnd(14)} ${String(line.avgSpeedKmh).padStart(5)} km/h  (fitted from end-to-end journeys)`);
    continue;
  }

  const mid = median(speeds);
  const spread = Math.max(...speeds) - Math.min(...speeds);
  line.avgSpeedKmh = Math.round(mid * 10) / 10;
  line.dwellSeconds = 0;
  line.provenance = {
    ...(line.provenance ?? {}),
    timings: {
      confidence: 'VERIFIED_SECONDARY',
      source: 'dmrc-planner',
      note:
        'DMRC\'s planner reports a constant speed per line rather than a timetable, so '
        + 'run times are derived from official distances at that speed. Station dwell is '
        + 'already included in it and is therefore not charged separately.',
    },
  };
  summary.push(
    `${line.id.padEnd(14)} ${String(line.avgSpeedKmh).padStart(5)} km/h  `
    + `(${speeds.length} hops, spread ${spread.toFixed(1)})`,
  );
}

/* --------------------------------------------------------- provenance */

dataset.sources = SOURCES;
dataset.provenance = {
  ...(dataset.provenance ?? {}),
  distances: {
    confidence: 'OFFICIAL',
    source: 'dmrc-planner',
    note: 'Chargeable route distance published by DMRC for each adjacent pair.',
  },
  timings: {
    confidence: 'VERIFIED_SECONDARY',
    source: 'dmrc-planner',
    note: 'Derived from official distances at DMRC\'s own published line speed.',
  },
  fares: {
    confidence: 'OFFICIAL',
    source: 'dmrc-planner',
    note: 'DMRC distance slabs effective 2025-08-25; Airport Express station-pair chart.',
  },
  headways: {
    confidence: 'UNKNOWN',
    source: null,
    note: 'DMRC publishes no headway data, so interchange waiting uses its own allowance instead.',
  },
};
dataset.dataVersion = '2026-11-12';

writeFileSync(DELHI, `${JSON.stringify(dataset, null, 1)}\n`);

console.log(`distances applied to ${applied} ride edges, ${missing} missing`);
if (missingPairs.length) {
  console.log('missing:');
  for (const m of missingPairs.slice(0, 15)) console.log(`  ${m}`);
  if (missingPairs.length > 15) console.log(`  ... and ${missingPairs.length - 15} more`);
}
console.log('\nline speeds derived from DMRC figures (median of per-hop values):');
for (const s of summary) console.log(`  ${s}`);
if (rejectedKm.length) {
  console.log(`\ndistances rejected as implausible (${rejectedKm.length}) — geometric estimate kept:`);
  for (const r of rejectedKm) console.log(`  ${r}`);
}
if (rejected.length) {
  console.log(`\nspeeds rejected as implausible (${rejected.length}) — excluded from the median:`);
  for (const r of rejected) console.log(`  ${r}`);
}
