#!/usr/bin/env node
/**
 * Metrorythm — data build step.
 *
 * Reads the hand-authored topology in data-src/*.source.mjs, merges in the
 * cached station coordinates from data-src/coords.delhi.json (if present), and
 * writes the single offline dataset the app ships with:
 *
 *     src/data/cities/delhi.json
 *
 * This script runs at BUILD time only. The application never executes it and
 * never makes a network request of any kind.
 *
 * Usage:  node scripts/build-data.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as GEN from '../data-src/generated-meta.mjs';

// Which cities to build. Adding one is: author data-src/<id>.source.mjs,
// add its id here, and register it in src/data/index.ts.
const HAND_AUTHORED = ['delhi', 'chennai'];

/** Fare system ids the engine knows about (src/data/fares). */
const KNOWN_FARE_SYSTEMS = new Set([
  'dmrc', 'airportExpress', 'nmrcAqua', 'rapidMetro', 'cmrl',
  'mumbaiMetro', 'naviMumbaiMetro', 'nammaMetro', 'hyderabadMetro',
  'kolkataMetro', 'kochiMetro', 'jaipurMetro', 'upMetro', 'nagpurMetro',
  'ahmedabadMetro', 'puneMetro', 'mpMetro', 'patnaMetro', 'meerutMetro',
]);

/**
 * Load a city's source.
 *
 * Two kinds of city exist and the rest of this pipeline cannot tell them apart:
 *   - HAND-AUTHORED (Delhi, Chennai): data-src/<id>.source.mjs, with
 *     coordinates merged from data-src/coords.<id>.json.
 *   - GENERATED: imported from Wikidata into data-src/generated/<id>.json,
 *     already carrying ordered stations and inline coordinates.
 *
 * The adapter below normalises the generated shape into the hand-authored one,
 * so edge building, interchange detection, interpolation and validation are
 * all shared — there is exactly one implementation of the graph logic.
 */
async function loadCitySource(cityId) {
  if (HAND_AUTHORED.includes(cityId)) {
    return { ...(await import(`../data-src/${cityId}.source.mjs`)), inlineCoords: null };
  }

  const raw = JSON.parse(
    fs.readFileSync(path.join(ROOT, `data-src/generated/${cityId}.json`), 'utf8'),
  );
  const meta = GEN.CITY_META[cityId] ?? {};
  const inlineCoords = {};
  const seenIds = new Map(); // slug -> wikidata id, to catch name collisions
  const disambiguated = [];

  const LINES = raw.lines.map((line, i) => {
    const override = meta.lines?.[line.name];
    const names = [];
    for (const st of line.stations) {
      const baseName = GEN.cleanStationName(st.name);
      const baseId = slug(baseName);
      // Two different Wikidata items that clean to the same name are DIFFERENT
      // stations (Ahmedabad genuinely has two called Sabarmati). Merging them
      // would invent an interchange, so disambiguate by line instead.
      let name = baseName;
      let id = baseId;
      const prior = seenIds.get(baseId);
      if (prior && prior !== st.id) {
        name = `${baseName} (${GEN.cleanLineName(line.name, cityId)})`;
        id = slug(name);
        disambiguated.push(name);
      }
      seenIds.set(id, st.id);
      if (st.lat != null && st.lng != null) inlineCoords[id] = { lat: st.lat, lng: st.lng };
      names.push(name);
    }
    return {
      id: slug(GEN.cleanLineName(line.name, cityId)) || `line-${i + 1}`,
      name: GEN.cleanLineName(line.name, cityId),
      code: line.name,
      color: override?.color ?? GEN.colorForLine(line.name, i),
      operator: (meta.operators ?? ['Unknown operator'])[0],
      fareSystem: meta.fareSystem ?? 'genericIndia',
      avgHopSeconds: 140,
      stations: names,
      loopsBackTo: null,
    };
  });

  if (disambiguated.length) {
    console.log(`   note         disambiguated same-named stations: ${disambiguated.join(', ')}`);
  }

  return {
    DATA_VERSION: raw.dataVersion ?? '2026-11-10',
    CITY: {
      cityId,
      cityName: meta.cityName ?? raw.cityName,
      country: 'India',
      timezone: 'Asia/Kolkata',
      operators: meta.operators ?? [],
      notes:
        'Network imported from Wikidata: station order is derived from adjacency '
        + 'statements and validated to form a single unbroken path per line. '
        + 'Under-construction stations are excluded.',
      source: 'wikidata',
    },
    LINES,
    TRANSFERS: [],
    INTERCHANGE_WALK_SECONDS: {},
    AIRPORTS: [],
    LANDMARKS: [],
    STATION_ALIASES: {},
    inlineCoords,
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'src/data/cities');


const DEFAULT_INTERCHANGE_SECONDS = 180;

/** Stable, URL-safe station id. */
export function slug(name) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function buildCity(cityId) {
  const src = await loadCitySource(cityId);
  const {
    DATA_VERSION, CITY, LINES, TRANSFERS,
    INTERCHANGE_WALK_SECONDS, AIRPORTS, LANDMARKS, STATION_ALIASES, inlineCoords,
  } = src;
  const COORDS_FILE = path.join(ROOT, `data-src/coords.${cityId}.json`);

  /* ---------------------------------------------------------------- stations */
  /** @type {Map<string, {id:string,name:string,lines:string[],aliases:string[],lat:number|null,lng:number|null}>} */
  const stations = new Map();

  const addStation = (name, lineId) => {
    const id = slug(name);
    if (!stations.has(id)) {
      stations.set(id, {
        id,
        name,
        lines: [],
        aliases: STATION_ALIASES[name] ? [...STATION_ALIASES[name]] : [],
        lat: null,
        lng: null,
      });
    }
    const st = stations.get(id);
    if (!st.lines.includes(lineId)) st.lines.push(lineId);
    return st;
  };

  for (const line of LINES) {
    for (const name of line.stations) addStation(name, line.id);
  }

  /* ------------------------------------------------------------------- edges */
  // Graph nodes are (station, line) pairs so that interchanges can be counted
  // and charged a realistic platform-to-platform walking time.
  const edges = [];

  const pushEdge = (e) => {
    edges.push(e);
  };

  // 1. Ride edges along each line.
  for (const line of LINES) {
    for (let i = 0; i < line.stations.length - 1; i += 1) {
      const a = slug(line.stations[i]);
      const b = slug(line.stations[i + 1]);
      pushEdge({
        kind: 'ride',
        line: line.id,
        from: a,
        to: b,
        seconds: line.avgHopSeconds,
      });
    }
    // Rapid Metro's northern section closes back on itself.
    if (line.loopsBackTo) {
      const a = slug(line.stations[line.stations.length - 1]);
      const b = slug(line.loopsBackTo);
      pushEdge({
        kind: 'ride',
        line: line.id,
        from: a,
        to: b,
        seconds: line.avgHopSeconds,
        note: 'Loop section — trains run one-way around the loop.',
      });
    }
  }

  // 2. Interchange edges wherever a station is served by more than one line.
  const interchanges = [];
  for (const st of stations.values()) {
    if (st.lines.length < 2) continue;
    const seconds = INTERCHANGE_WALK_SECONDS[st.name] ?? DEFAULT_INTERCHANGE_SECONDS;
    interchanges.push({ station: st.id, lines: [...st.lines], walkSeconds: seconds });
    for (let i = 0; i < st.lines.length; i += 1) {
      for (let j = i + 1; j < st.lines.length; j += 1) {
        pushEdge({
          kind: 'interchange',
          from: st.id,
          to: st.id,
          fromLine: st.lines[i],
          toLine: st.lines[j],
          seconds,
          paidArea: true,
        });
      }
    }
  }

  // 3. Out-of-station walking transfers between differently-named stations.
  const namedTransfers = [];
  for (const t of TRANSFERS) {
    const aId = slug(t.a);
    const bId = slug(t.b);
    const a = stations.get(aId);
    const b = stations.get(bId);
    if (!a || !b) {
      throw new Error(`Transfer references unknown station: ${t.a} <-> ${t.b}`);
    }
    namedTransfers.push({ from: aId, to: bId, walkSeconds: t.walkSeconds, paidArea: !!t.paidArea, note: t.note });
    for (const fl of a.lines) {
      for (const tl of b.lines) {
        pushEdge({
          kind: 'transfer',
          from: aId,
          to: bId,
          fromLine: fl,
          toLine: tl,
          seconds: t.walkSeconds,
          paidArea: !!t.paidArea,
          note: t.note,
        });
      }
    }
  }

  /* ------------------------------------------------------------- coordinates */
  // Every station carries a provenance marker:
  //   'surveyed'     - a verified position from the committed coordinate file
  //   'interpolated' - derived geometrically from its known neighbours on the
  //                    line (see below). Honest, reproducible, and clearly
  //                    distinguished from a surveyed position.
  //   null           - unknown. Never guessed; the map breaks the line here.
  let coordsMeta = {
    present: false, source: null, fetchedAt: null,
    surveyed: 0, interpolated: 0, missing: [],
  };

  if (inlineCoords) {
    coordsMeta.present = true;
    coordsMeta.source = 'Wikidata (P625), CC0. Imported at build time; not used at runtime.';
    for (const st of stations.values()) {
      const c = inlineCoords[st.id];
      if (c) {
        st.lat = Number(c.lat.toFixed(6));
        st.lng = Number(c.lng.toFixed(6));
        st.coordSource = 'surveyed';
        coordsMeta.surveyed += 1;
      } else {
        st.coordSource = null;
      }
    }
  } else if (fs.existsSync(COORDS_FILE)) {
    const raw = JSON.parse(fs.readFileSync(COORDS_FILE, 'utf8'));
    coordsMeta.present = true;
    coordsMeta.source = raw.source ?? 'unknown';
    coordsMeta.fetchedAt = raw.fetchedAt ?? null;
    for (const st of stations.values()) {
      const c = raw.coords[st.id];
      if (c && typeof c.lat === 'number' && typeof c.lng === 'number') {
        st.lat = Number(c.lat.toFixed(6));
        st.lng = Number(c.lng.toFixed(6));
        st.coordSource = 'surveyed';
        coordsMeta.surveyed += 1;
      } else {
        st.coordSource = null;
      }
    }
  } else {
    for (const st of stations.values()) st.coordSource = null;
  }

  /**
   * Fill gaps by interpolating along the line.
   *
   * A station with a known station somewhere before it and somewhere after it
   * on the same line is geometrically constrained: its position is placed at
   * the proportional point along the straight segment joining those two
   * neighbours. For interior stations on a roughly straight corridor — which
   * is what the remaining gaps are — this is accurate enough to draw and to
   * put a journey in the right fare slab.
   *
   * It is NOT a surveyed position and is never presented as one. Repeated to a
   * fixed point so a filled station can anchor its own neighbours.
   */
  for (let pass = 0; pass < 6; pass += 1) {
    let filled = 0;
    for (const line of LINES) {
      // A looping line (Rapid Metro) closes back on an earlier station, which
      // gives its final stations an anchor on both sides.
      const ids = line.loopsBackTo
        ? [...line.stations.map(slug), slug(line.loopsBackTo)]
        : line.stations.map(slug);
      for (let i = 0; i < ids.length; i += 1) {
        const st = stations.get(ids[i]);
        if (st.lat !== null) continue;

        let before = -1;
        for (let j = i - 1; j >= 0; j -= 1) {
          if (stations.get(ids[j]).lat !== null) { before = j; break; }
        }
        let after = -1;
        for (let j = i + 1; j < ids.length; j += 1) {
          if (stations.get(ids[j]).lat !== null) { after = j; break; }
        }
        if (before === -1 || after === -1) continue;

        const a = stations.get(ids[before]);
        const b = stations.get(ids[after]);
        const t = (i - before) / (after - before);
        st.lat = Number((a.lat + (b.lat - a.lat) * t).toFixed(6));
        st.lng = Number((a.lng + (b.lng - a.lng) * t).toFixed(6));
        st.coordSource = 'interpolated';
        filled += 1;
      }
    }
    if (filled === 0) break;
  }

  for (const st of stations.values()) {
    if (st.coordSource === 'interpolated') coordsMeta.interpolated += 1;
    else if (st.coordSource === null) coordsMeta.missing.push(st.id);
  }

  /* ---------------------------------------------------------------- landmarks */
  const landmarks = LANDMARKS.map(([label, stationName]) => {
    const id = slug(stationName);
    if (!stations.has(id)) throw new Error(`Landmark "${label}" points at unknown station "${stationName}"`);
    return { label, station: id };
  });

  /* ----------------------------------------------------------------- airports */
  const airports = AIRPORTS.map((a) => ({
    ...a,
    terminals: a.terminals.map((t) => {
      const id = slug(t.station);
      if (!stations.has(id)) throw new Error(`Airport ${a.iata} terminal ${t.terminal} points at unknown station "${t.station}"`);
      return { ...t, station: id };
    }),
  }));

  /* -------------------------------------------------------------- validation */
  const problems = [];
  for (const line of LINES) {
    const seen = new Set();
    for (const name of line.stations) {
      if (seen.has(name)) problems.push(`Line ${line.id} lists "${name}" twice`);
      seen.add(name);
    }
    if (line.stations.length < 2) problems.push(`Line ${line.id} has fewer than 2 stations`);
    if (!KNOWN_FARE_SYSTEMS.has(line.fareSystem)) problems.push(`Line ${line.id} references unknown fare system "${line.fareSystem}"`);
  }
  // Connectivity check over the station-level graph.
  const adj = new Map();
  for (const id of stations.keys()) adj.set(id, new Set());
  for (const e of edges) {
    if (e.from === e.to) continue;
    adj.get(e.from).add(e.to);
    adj.get(e.to).add(e.from);
  }
  const seen = new Set();
  const stack = [stations.keys().next().value];
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const n of adj.get(cur)) if (!seen.has(n)) stack.push(n);
  }
  // Disconnection is a hard error for hand-authored cities, where it means a
  // typo. For imported cities it can be the truth: Mumbai's Line 2A/7 corridor
  // meets Line 1 only by walking between differently-named stations, and we
  // have no verified transfer data for that. Record it rather than invent one.
  const connected = seen.size === stations.size;
  let components = 1;
  if (!connected) {
    const unvisited = new Set([...stations.keys()].filter((k) => !seen.has(k)));
    while (unvisited.size) {
      components += 1;
      const stack2 = [unvisited.values().next().value];
      while (stack2.length) {
        const cur = stack2.pop();
        if (!unvisited.has(cur)) continue;
        unvisited.delete(cur);
        for (const n of adj.get(cur)) if (unvisited.has(n)) stack2.push(n);
      }
    }
    const msg = `not fully connected — ${components} separate components`;
    if (HAND_AUTHORED.includes(cityId)) problems.push(`Graph is ${msg}`);
    else console.log(`   warning      network is ${msg}; no route exists between them`);
  }
  if (problems.length) {
    console.error('\n  Data validation failed:');
    for (const p of problems) console.error('   - ' + p);
    process.exit(1);
  }

  /* -------------------------------------------------------------------- emit */
  const dataset = {
    schemaVersion: 1,
    dataVersion: DATA_VERSION,
    generatedAt: new Date().toISOString().slice(0, 10),
    city: CITY,
    connectivity: { connected, components },
    coordinates: {
      available: coordsMeta.present,
      source: coordsMeta.source,
      fetchedAt: coordsMeta.fetchedAt,
      surveyed: coordsMeta.surveyed,
      interpolated: coordsMeta.interpolated,
      matched: coordsMeta.surveyed + coordsMeta.interpolated,
      missingCount: coordsMeta.missing.length,
      missing: coordsMeta.missing,
    },
    lines: LINES.map((l) => ({
      id: l.id,
      name: l.name,
      code: l.code,
      color: l.color,
      operator: l.operator,
      fareSystem: l.fareSystem,
      avgHopSeconds: l.avgHopSeconds,
      isExpress: !!l.isExpress,
      parentLine: l.parentLine ?? null,
      loopsBackTo: l.loopsBackTo ? slug(l.loopsBackTo) : null,
      stations: l.stations.map(slug),
    })),
    stations: [...stations.values()].sort((a, b) => a.name.localeCompare(b.name)),
    edges,
    interchanges,
    transfers: namedTransfers,
    airports,
    landmarks,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${cityId}.json`);
  fs.writeFileSync(outFile, JSON.stringify(dataset, null, 2) + '\n');

  const rideEdges = edges.filter((e) => e.kind === 'ride').length;
  console.log(`\n  ${CITY.cityName}`);
  console.log(`   dataset      ${path.relative(ROOT, outFile)}`);
  console.log(`   dataVersion  ${DATA_VERSION}`);
  console.log(`   lines        ${dataset.lines.length}`);
  console.log(`   stations     ${dataset.stations.length}`);
  console.log(`   ride edges   ${rideEdges}`);
  console.log(`   interchanges ${interchanges.length} stations, ${namedTransfers.length} walking transfers`);
  console.log(`   coordinates  ${coordsMeta.surveyed} surveyed + ${coordsMeta.interpolated} interpolated`
    + ` = ${coordsMeta.surveyed + coordsMeta.interpolated}/${dataset.stations.length}`
    + (coordsMeta.missing.length ? ` (${coordsMeta.missing.length} still unknown)` : ''));
}

async function main() {
  const generated = fs.existsSync(path.join(ROOT, 'data-src/generated'))
    ? fs.readdirSync(path.join(ROOT, 'data-src/generated'))
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''))
        .sort()
    : [];
  const all = [...HAND_AUTHORED, ...generated.filter((g) => !HAND_AUTHORED.includes(g))];
  const failures = [];
  for (const id of all) {
    try {
      await buildCity(id);
    } catch (e) {
      failures.push(`${id}: ${e.message}`);
      console.error(`\n  SKIPPED ${id} — ${e.message}`);
    }
  }
  if (failures.length) console.error(`\n  ${failures.length} city/cities skipped`);
  console.log('\n  Metrorythm data build complete');
}

// Only run the build when invoked directly, so other scripts can import slug().
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
