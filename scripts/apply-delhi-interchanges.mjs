/**
 * Apply DMRC's published interchange allowances to the Delhi dataset.
 *
 * Metrorythm already had a platform-to-platform walking time for each
 * interchange but charged no waiting at all, so a three-change journey came
 * out roughly ten minutes short. DMRC publishes an allowance per interchange —
 * 5 minutes at most, 10 where the change crosses a fare boundary or a long
 * concourse — which covers walking AND waiting together.
 *
 * The walking time stays as it is; the remainder of DMRC's allowance becomes
 * `waitSeconds`. So walk + wait equals the published figure, while the UI can
 * still show the two separately.
 *
 * Run: node scripts/apply-delhi-interchanges.mjs
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DELHI = join(ROOT, 'src', 'data', 'cities', 'delhi.json');
const ALLOWANCES = join(ROOT, 'data-src', 'generated', 'delhi-interchanges.json');

/**
 * Connections the automated harvest could not settle, each resolved by hand
 * against DMRC's own behaviour and recorded here rather than left to a default.
 */
const MANUAL = {
  // Observed directly in DMRC's planner output for Blue <-> Aqua journeys.
  'noida-sector-52|blue|aqua': { minutes: 6, why: 'Observed in DMRC planner output for Blue to Aqua journeys.' },
  // The planner routes Azadpur journeys without reporting a change there; DMRC's
  // standard in-station allowance applies.
  'azadpur|yellow|pink': { minutes: 5, why: 'DMRC standard in-station allowance.' },
};

/**
 * Blue Line branch trains run through Yamuna Bank — asked for a journey across
 * it, DMRC's planner reports NO interchange at all. Passengers stay seated, so
 * this is marked as through service rather than given a wait.
 */
const THROUGH_SERVICE = [['blue', 'blue-branch']];

const dataset = JSON.parse(readFileSync(DELHI, 'utf8'));
if (!existsSync(ALLOWANCES)) {
  console.error(`Missing ${ALLOWANCES}. Run scripts/fetch-delhi-interchanges.mjs first.`);
  process.exit(1);
}
const harvested = JSON.parse(readFileSync(ALLOWANCES, 'utf8'));

const allowanceFor = (station, a, b) => {
  for (const key of [`${station}|${a}|${b}`, `${station}|${b}|${a}`]) {
    if (harvested[key]?.minutes != null) return { minutes: harvested[key].minutes, manual: null };
    if (MANUAL[key]) return { minutes: MANUAL[key].minutes, manual: MANUAL[key].why };
  }
  return null;
};

/* ------------------------------------------------------ through service */

for (const [a, b] of THROUGH_SERVICE) {
  for (const id of [a, b]) {
    const line = dataset.lines.find((l) => l.id === id);
    if (!line) continue;
    const other = id === a ? b : a;
    line.throughServiceWith = [...new Set([...(line.throughServiceWith ?? []), other])];
  }
}

/* ------------------------------------------------------------ allowances */

let applied = 0;
const unresolved = [];
const rows = [];

for (const e of dataset.edges) {
  if (e.kind === 'ride') continue;

  const through = THROUGH_SERVICE.some(([a, b]) =>
    (e.fromLine === a && e.toLine === b) || (e.fromLine === b && e.toLine === a));
  if (through) {
    delete e.waitSeconds;
    e.provenance = {
      confidence: 'VERIFIED_SECONDARY',
      source: 'dmrc-planner',
      note: 'Trains run through here — DMRC\'s planner reports no interchange, so no wait is charged.',
    };
    rows.push(`${e.from.padEnd(26)} ${e.fromLine}/${e.toLine} through service, no wait`);
    continue;
  }

  const hit = allowanceFor(e.from, e.fromLine, e.toLine);
  if (!hit) {
    unresolved.push(`${e.from} ${e.fromLine}/${e.toLine}`);
    continue;
  }

  const total = hit.minutes * 60;
  const walk = e.seconds ?? 0;
  e.waitSeconds = Math.max(0, total - walk);
  e.provenance = {
    confidence: 'VERIFIED_SECONDARY',
    source: 'dmrc-planner',
    note:
      `DMRC allows ${hit.minutes} min here. The walking time is Metrorythm's; the remainder `
      + `is reported as waiting, so the two together match the published allowance.`
      + (hit.manual ? ` ${hit.manual}` : ''),
  };
  applied++;
  rows.push(
    `${e.from.padEnd(26)} ${(`${e.fromLine}/${e.toLine}`).padEnd(22)} `
    + `allowance ${hit.minutes}min = walk ${walk}s + wait ${e.waitSeconds}s`,
  );
}

dataset.provenance = {
  ...(dataset.provenance ?? {}),
  interchanges: {
    confidence: 'VERIFIED_SECONDARY',
    source: 'dmrc-planner',
    note: 'Total allowance published by DMRC; the split into walking and waiting is Metrorythm\'s.',
  },
};

writeFileSync(DELHI, `${JSON.stringify(dataset, null, 1)}\n`);

console.log(`applied allowances to ${applied} interchange edges`);
for (const r of rows) console.log(`  ${r}`);
if (unresolved.length) {
  console.log(`\nno allowance found (${unresolved.length}) — these keep walking time only:`);
  for (const u of unresolved) console.log(`  ${u}`);
}
