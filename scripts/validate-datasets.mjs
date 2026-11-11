/**
 * Structural validation for every city dataset.
 *
 * This is the backstop for data edits: a dataset can be internally broken in
 * ways no route query would reveal (a station on a line that does not list it,
 * a loop whose ends do not meet, an interchange with no edge), and those
 * defects surface later as wrong journeys rather than as errors.
 *
 * ERROR  — the dataset is wrong and routing will misbehave.
 * WARN   — legitimate but worth knowing, e.g. an estimated figure.
 *
 * Exits non-zero if any ERROR is found, so it can gate a build.
 * Run: node scripts/validate-datasets.mjs [cityId...]
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CITY_DIR = join(ROOT, 'src', 'data', 'cities');

const only = process.argv.slice(2);

/** Plausibility bounds. Outside these, a figure is wrong, not merely unusual. */
const LIMITS = {
  minHopSeconds: 20,
  maxHopSeconds: 900,
  minHopKm: 0.15,
  maxHopKm: 12,
  minSpeedKmh: 8,
  maxSpeedKmh: 130,
  maxInterchangeSeconds: 1200,
  maxFare: 500,
};

export function validateDataset(d) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  const stationById = new Map();
  const lineById = new Map(d.lines.map((l) => [l.id, l]));

  /* ---------------------------------------------------------- stations */

  for (const s of d.stations) {
    if (stationById.has(s.id)) err(`duplicate station id "${s.id}"`);
    stationById.set(s.id, s);
    if (!s.name?.trim()) err(`station "${s.id}" has no name`);
    if (s.name !== s.name?.trim()) err(`station "${s.id}" name has stray whitespace`);
    if ((s.lat == null) !== (s.lng == null)) err(`station "${s.id}" has half a coordinate`);
    if (s.lat != null && (s.lat < 6 || s.lat > 37)) err(`station "${s.id}" latitude ${s.lat} is outside India`);
    if (s.lng != null && (s.lng < 68 || s.lng > 98)) err(`station "${s.id}" longitude ${s.lng} is outside India`);
    if (s.lat == null) warn(`station "${s.id}" has no coordinate — distances fall back to an estimate`);
    if (s.status && !['open', 'under-construction', 'closed'].includes(s.status)) {
      err(`station "${s.id}" has unknown status "${s.status}"`);
    }
    if (s.status && s.status !== 'open') {
      const onLine = d.lines.some((l) => l.stations.includes(s.id));
      if (onLine) err(`station "${s.id}" is ${s.status} but still sits in a line sequence`);
    }
    if (!s.lines?.length) err(`station "${s.id}" belongs to no line`);
  }

  // Same name, different ids — legitimate only if they are genuinely separate
  // stations, so this warns rather than errors.
  const byName = new Map();
  for (const s of d.stations) {
    const k = s.name.toLowerCase().replace(/\s+/g, ' ').trim();
    byName.set(k, [...(byName.get(k) ?? []), s.id]);
  }
  for (const [n, ids] of byName) {
    if (ids.length > 1) warn(`stations share the name "${n}": ${ids.join(', ')}`);
  }

  /* ------------------------------------------------- line membership */

  for (const line of d.lines) {
    if (!line.stations?.length) { err(`line "${line.id}" has no stations`); continue; }
    const seen = new Set();
    for (const sid of line.stations) {
      const s = stationById.get(sid);
      if (!s) { err(`line "${line.id}" references unknown station "${sid}"`); continue; }
      if (seen.has(sid) && !line.isLoop) err(`line "${line.id}" repeats station "${sid}"`);
      seen.add(sid);
      if (!s.lines.includes(line.id)) {
        err(`station "${sid}" is in line "${line.id}" but does not list it`);
      }
    }
    if (line.parentLine && !lineById.has(line.parentLine)) {
      err(`line "${line.id}" names unknown parent "${line.parentLine}"`);
    }
    for (const other of line.throughServiceWith ?? []) {
      if (!lineById.has(other)) err(`line "${line.id}" through-serves unknown line "${other}"`);
    }
    if (line.isLoop && line.stations.length < 3) {
      err(`line "${line.id}" is marked a loop but has ${line.stations.length} stations`);
    }
    if (line.headwaySeconds && line.headwaySeconds.peak <= 0) {
      err(`line "${line.id}" has a non-positive peak headway`);
    }
    if (line.avgSpeedKmh != null && (line.avgSpeedKmh < LIMITS.minSpeedKmh || line.avgSpeedKmh > LIMITS.maxSpeedKmh)) {
      err(`line "${line.id}" average speed ${line.avgSpeedKmh} km/h is implausible`);
    }
  }

  for (const s of d.stations) {
    for (const lid of s.lines) {
      const l = lineById.get(lid);
      if (!l) { err(`station "${s.id}" claims unknown line "${lid}"`); continue; }
      if (!l.stations.includes(s.id)) err(`station "${s.id}" claims line "${lid}" but is not in its sequence`);
    }
  }

  /* ------------------------------------------------------------- edges */

  const rideKey = (e) => `${e.line}|${e.from}|${e.to}`;
  const seenRide = new Set();

  for (const e of d.edges) {
    if (!stationById.has(e.from)) err(`edge references unknown station "${e.from}"`);
    if (!stationById.has(e.to)) err(`edge references unknown station "${e.to}"`);
    if (typeof e.seconds !== 'number' || !Number.isFinite(e.seconds)) {
      err(`edge ${e.from}->${e.to} has a non-numeric duration`);
    } else if (e.seconds < 0) {
      err(`edge ${e.from}->${e.to} has a negative duration (${e.seconds}s)`);
    }
    if (e.km != null && (!Number.isFinite(e.km) || e.km < 0)) {
      err(`edge ${e.from}->${e.to} has an invalid distance (${e.km})`);
    }
    if (e.runSeconds != null && e.dwellSeconds != null && e.seconds != null) {
      const sum = e.runSeconds + e.dwellSeconds;
      if (Math.abs(sum - e.seconds) > 1) {
        err(`edge ${e.from}->${e.to}: run+dwell (${sum}s) does not match seconds (${e.seconds}s)`);
      }
    }

    if (e.kind === 'ride') {
      if (!e.line) { err(`ride edge ${e.from}->${e.to} has no line`); continue; }
      const line = lineById.get(e.line);
      if (!line) { err(`ride edge ${e.from}->${e.to} names unknown line "${e.line}"`); continue; }
      if (seenRide.has(rideKey(e))) err(`duplicate ride edge ${e.line}: ${e.from}->${e.to}`);
      seenRide.add(rideKey(e));

      if (e.seconds < LIMITS.minHopSeconds || e.seconds > LIMITS.maxHopSeconds) {
        err(`ride ${e.line} ${e.from}->${e.to} takes ${e.seconds}s, outside ${LIMITS.minHopSeconds}-${LIMITS.maxHopSeconds}s`);
      }
      if (e.km != null) {
        if (e.km < LIMITS.minHopKm || e.km > LIMITS.maxHopKm) {
          warn(`ride ${e.line} ${e.from}->${e.to} is ${e.km} km, outside the usual range`);
        }
        const run = e.runSeconds ?? e.seconds;
        const kmh = (e.km / run) * 3600;
        if (kmh < LIMITS.minSpeedKmh || kmh > LIMITS.maxSpeedKmh) {
          err(`ride ${e.line} ${e.from}->${e.to} implies ${kmh.toFixed(1)} km/h`);
        }
      }
    } else {
      if (!e.fromLine || !e.toLine) err(`${e.kind} edge ${e.from}->${e.to} is missing a line`);
      if (e.fromLine === e.toLine) err(`${e.kind} edge at ${e.from} connects line "${e.fromLine}" to itself`);
      if (e.seconds > LIMITS.maxInterchangeSeconds) {
        err(`${e.kind} at ${e.from} takes ${e.seconds}s — implausibly long`);
      }
      if (e.kind === 'interchange' && e.from !== e.to) {
        err(`interchange at ${e.from} points to a different station (${e.to}); use kind "transfer"`);
      }
      if (e.kind === 'transfer' && e.from === e.to) {
        err(`transfer at ${e.from} points to itself; use kind "interchange"`);
      }
    }
  }

  /* ------------------------- every consecutive pair needs a ride edge */

  for (const line of d.lines) {
    const pairs = new Set();
    for (let i = 0; i + 1 < line.stations.length; i++) {
      pairs.add(`${line.stations[i]}|${line.stations[i + 1]}`);
    }
    // A ring closes last->first. A "lollipop" (a stem plus a terminal loop,
    // like the Rapid Metro) closes last->loopsBackTo instead.
    if (line.isLoop && line.stations.length > 2) {
      pairs.add(`${line.stations[line.stations.length - 1]}|${line.stations[0]}`);
    } else if (line.loopsBackTo) {
      if (!line.stations.includes(line.loopsBackTo)) {
        err(`line "${line.id}" loops back to "${line.loopsBackTo}", which is not on it`);
      } else {
        pairs.add(`${line.stations[line.stations.length - 1]}|${line.loopsBackTo}`);
      }
    }
    const have = new Set(
      d.edges.filter((e) => e.kind === 'ride' && e.line === line.id).map((e) => `${e.from}|${e.to}`),
    );
    for (const p of pairs) {
      const [a, b] = p.split('|');
      if (!have.has(p) && !have.has(`${b}|${a}`)) {
        err(`line "${line.id}" has no ride edge between ${a} and ${b}`);
      }
    }
    for (const p of have) {
      const [a, b] = p.split('|');
      if (!pairs.has(p) && !pairs.has(`${b}|${a}`)) {
        err(`line "${line.id}" has a ride edge ${a}->${b} that is not a consecutive pair `
          + '(if the line closes a ring set isLoop, if it loops back mid-line set loopsBackTo)');
      }
    }
  }

  /* --------------------------- every interchange station needs edges */

  for (const s of d.stations) {
    if (s.lines.length < 2) continue;
    for (let i = 0; i < s.lines.length; i++) {
      for (let j = i + 1; j < s.lines.length; j++) {
        const a = s.lines[i];
        const b = s.lines[j];
        const has = d.edges.some((e) => e.kind !== 'ride' && e.from === s.id && e.to === s.id
          && ((e.fromLine === a && e.toLine === b) || (e.fromLine === b && e.toLine === a)));
        if (!has) err(`station "${s.id}" serves ${a} and ${b} but has no interchange edge between them`);
      }
    }
  }

  /* ------------------------------------------------------ reachability */

  const adjacency = new Map();
  for (const s of d.stations) adjacency.set(s.id, []);
  for (const e of d.edges) {
    adjacency.get(e.from)?.push(e.to);
    adjacency.get(e.to)?.push(e.from);
  }
  const components = [];
  const visited = new Set();
  for (const s of d.stations) {
    if (visited.has(s.id)) continue;
    const comp = [];
    const queue = [s.id];
    while (queue.length) {
      const cur = queue.pop();
      if (visited.has(cur)) continue;
      visited.add(cur);
      comp.push(cur);
      for (const n of adjacency.get(cur) ?? []) if (!visited.has(n)) queue.push(n);
    }
    components.push(comp);
  }
  if (components.length > 1) {
    const declared = d.connectivity?.connected === false ? d.connectivity.components : null;
    const msg = `network splits into ${components.length} disconnected parts `
      + `(largest ${Math.max(...components.map((c) => c.length))} stations)`;
    if (declared === components.length) warn(`${msg} — declared in connectivity`);
    else err(`${msg}, but connectivity says ${JSON.stringify(d.connectivity ?? null)}`);
  }

  /* -------------------------------------------------------- provenance */

  if (!d.sources?.length) warn('no sources recorded — provenance cannot be checked');
  const sourceIds = new Set((d.sources ?? []).map((s) => s.id));
  for (const src of d.sources ?? []) {
    for (const f of ['organisation', 'url', 'retrievedAt', 'lastVerifiedAt', 'coverage']) {
      if (!src[f]) err(`source "${src.id}" is missing ${f}`);
    }
    if (typeof src.official !== 'boolean') err(`source "${src.id}" does not say whether it is official`);
  }
  const VALID_CONFIDENCE = ['OFFICIAL', 'VERIFIED_SECONDARY', 'ESTIMATED', 'UNKNOWN'];
  const checkProv = (p, where) => {
    if (!p) return;
    if (!VALID_CONFIDENCE.includes(p.confidence)) err(`${where}: invalid confidence "${p.confidence}"`);
    if (p.source && !sourceIds.has(p.source)) err(`${where}: references unknown source "${p.source}"`);
    if (p.confidence === 'OFFICIAL' && !p.source) err(`${where}: claims OFFICIAL with no source`);
  };
  for (const [k, p] of Object.entries(d.provenance ?? {})) checkProv(p, `provenance.${k}`);
  for (const l of d.lines) for (const [k, p] of Object.entries(l.provenance ?? {})) checkProv(p, `line ${l.id}.${k}`);
  for (const e of d.edges) checkProv(e.provenance, `edge ${e.from}->${e.to}`);

  if (!d.dataVersion) err('dataset has no dataVersion');

  return { errors, warnings };
}

/* ------------------------------------------------------------------ main */

const files = readdirSync(CITY_DIR)
  .filter((f) => f.endsWith('.json'))
  .filter((f) => only.length === 0 || only.includes(f.replace('.json', '')));

let totalErrors = 0;
let totalWarnings = 0;
const summary = [];

for (const f of files) {
  const d = JSON.parse(readFileSync(join(CITY_DIR, f), 'utf8'));
  const { errors, warnings } = validateDataset(d);
  totalErrors += errors.length;
  totalWarnings += warnings.length;
  summary.push({ city: d.city.cityId, errors: errors.length, warnings: warnings.length });

  if (errors.length || warnings.length) {
    console.log(`\n${d.city.cityName} (${d.city.cityId})`);
    for (const e of errors) console.log(`  ERROR  ${e}`);
    const shown = warnings.slice(0, 8);
    for (const w of shown) console.log(`  warn   ${w}`);
    if (warnings.length > shown.length) console.log(`  warn   ... and ${warnings.length - shown.length} more`);
  }
}

console.log('\n─────────────────────────────────────────────');
for (const s of summary) {
  const mark = s.errors ? 'FAIL' : '  ok';
  console.log(`${mark}  ${s.city.padEnd(14)} ${String(s.errors).padStart(3)} errors  ${String(s.warnings).padStart(4)} warnings`);
}
console.log(`\n${files.length} datasets · ${totalErrors} errors · ${totalWarnings} warnings`);

process.exit(totalErrors > 0 ? 1 : 0);
