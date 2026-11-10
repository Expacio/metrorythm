#!/usr/bin/env node
/**
 * Metrorythm — import Indian metro networks from Wikidata.
 *
 *   node scripts/import-wikidata.mjs
 *
 * BUILD TIME ONLY. Writes data-src/generated/<city>.json, which is committed.
 * The application never runs this and never touches the network.
 *
 * WHY WIKIDATA, after trying two other sources
 * --------------------------------------------
 * Overpass was unreachable. Scraping Wikipedia's HTML tables was actively
 * wrong — it returned 26 stations for Kochi's 25 (a header row), parsed a fare
 * table for Kanpur, and found nothing at all for Bengaluru, Mumbai or
 * Hyderabad. Station ORDER is the one thing a route planner cannot get wrong,
 * so that approach was abandoned.
 *
 * Wikidata is structured instead of scraped:
 *   - P81  connecting line      which line a station belongs to
 *   - P197 adjacent station     the ordering relation, 1,871 statements
 *   - P625 coordinates          near-complete for Indian metro stations
 *   - P5817 state of use        lets us drop under-construction stations
 *
 * HOW ORDER IS DERIVED
 * Station order is NOT taken on trust. For each line we build a graph from its
 * adjacency statements and require it to be a simple path: every station has
 * degree <= 2, exactly two endpoints, and one connected component covering
 * every station on the line. Anything else is REPORTED AND DROPPED. A missing
 * city is a much smaller problem than a city with invented station order.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'data-src/generated');
const EP = 'https://query.wikidata.org/sparql';

/**
 * City centres, used only to group lines geographically — Wikidata's
 * "part of system" links are too sparse to rely on (3 of 21 systems).
 * Indian metro systems are hundreds of km apart, so nearest-centre is
 * unambiguous.
 */
const CITIES = [
  { id: 'mumbai', name: 'Mumbai', lat: 19.0760, lng: 72.8777 },
  { id: 'navi-mumbai', name: 'Navi Mumbai', lat: 19.0330, lng: 73.0297 },
  { id: 'bengaluru', name: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
  { id: 'hyderabad', name: 'Hyderabad', lat: 17.3850, lng: 78.4867 },
  { id: 'kolkata', name: 'Kolkata', lat: 22.5726, lng: 88.3639 },
  { id: 'kochi', name: 'Kochi', lat: 9.9312, lng: 76.2673 },
  { id: 'jaipur', name: 'Jaipur', lat: 26.9124, lng: 75.7873 },
  { id: 'lucknow', name: 'Lucknow', lat: 26.8467, lng: 80.9462 },
  { id: 'kanpur', name: 'Kanpur', lat: 26.4499, lng: 80.3319 },
  { id: 'nagpur', name: 'Nagpur', lat: 21.1458, lng: 79.0882 },
  { id: 'ahmedabad', name: 'Ahmedabad', lat: 23.0225, lng: 72.5714 },
  { id: 'pune', name: 'Pune', lat: 18.5204, lng: 73.8567 },
  { id: 'agra', name: 'Agra', lat: 27.1767, lng: 78.0081 },
  { id: 'indore', name: 'Indore', lat: 22.7196, lng: 75.8577 },
  { id: 'patna', name: 'Patna', lat: 25.5941, lng: 85.1376 },
  { id: 'bhopal', name: 'Bhopal', lat: 23.2599, lng: 77.4126 },
  { id: 'meerut', name: 'Meerut', lat: 28.9845, lng: 77.7064 },
  // Already hand-authored and verified — imported lines near these are skipped.
  { id: 'delhi', name: 'Delhi NCR', lat: 28.6139, lng: 77.2090, skip: true },
  { id: 'chennai', name: 'Chennai', lat: 13.0827, lng: 80.2707, skip: true },
];

/** Independently sourced operational station counts, used as a cross-check. */
const EXPECTED_STATIONS = {
  kolkata: 58, bengaluru: 85, hyderabad: 59, mumbai: 77, jaipur: 11,
  kochi: 25, lucknow: 21, kanpur: 14, nagpur: 37, ahmedabad: 53,
  pune: 46, agra: 6, indore: 16, patna: 5, bhopal: 8,
  'navi-mumbai': 11, meerut: 13,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sparql(query) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await fetch(`${EP}?query=${encodeURIComponent(query)}&format=json`, {
      headers: {
        'User-Agent': 'Metrorythm-data-build/1.0 (offline transit planner)',
        Accept: 'application/sparql-results+json',
      },
    });
    if (res.ok) return (await res.json()).results.bindings;
    if (res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status}`);
    await sleep(3000 * (attempt + 1));
  }
  throw new Error('SPARQL failed after retries');
}

const qid = (uri) => uri.split('/').pop();

function haversine(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.sin(dLng / 2) ** 2 * Math.cos(rad(aLat)) * Math.cos(rad(bLat));
  return 2 * R * Math.asin(Math.sqrt(h));
}

function parsePoint(wkt) {
  const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(wkt);
  return m ? { lng: Number(m[1]), lat: Number(m[2]) } : null;
}

/* ----------------------------------------------------------------- queries */

const Q_STATIONS = `
SELECT ?line ?lineLabel ?st ?stLabel ?coord WHERE {
  ?st wdt:P31/wdt:P279* wd:Q928830 ;
      wdt:P17 wd:Q668 ;
      wdt:P81 ?line ;
      wdt:P5817 ?state .
  ?state rdfs:label ?stateEn . FILTER(LANG(?stateEn) = "en")
  FILTER(CONTAINS(LCASE(?stateEn), "in use"))
  OPTIONAL { ?st wdt:P625 ?coord }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

const Q_ADJACENCY = `
SELECT ?a ?b ?line WHERE {
  ?a wdt:P31/wdt:P279* wd:Q928830 ; wdt:P17 wd:Q668 .
  ?a p:P197 ?stmt .
  ?stmt ps:P197 ?b .
  OPTIONAL { ?stmt pq:P81 ?line }
}`;

/* ------------------------------------------------------- order derivation */

/**
 * Turn an adjacency set into a single ordered path.
 * Returns null (with a reason) when the graph is not a simple path, because an
 * unverifiable order must never be shipped.
 */
function orderLine(stationIds, edges) {
  const members = new Set(stationIds);
  const adj = new Map([...members].map((id) => [id, new Set()]));
  for (const [a, b] of edges) {
    if (!members.has(a) || !members.has(b) || a === b) continue;
    adj.get(a).add(b);
    adj.get(b).add(a);
  }

  const degrees = [...adj.entries()].map(([id, n]) => ({ id, d: n.size }));
  const branching = degrees.filter((x) => x.d > 2);
  if (branching.length) return { error: `${branching.length} branching station(s)` };

  const ends = degrees.filter((x) => x.d === 1).map((x) => x.id);
  const isolated = degrees.filter((x) => x.d === 0);
  if (isolated.length) return { error: `${isolated.length} station(s) with no adjacency` };

  let start;
  let loop = false;
  if (ends.length === 2) [start] = ends;
  else if (ends.length === 0) { start = stationIds[0]; loop = true; } // ring line
  else return { error: `${ends.length} endpoints (expected 2)` };

  const order = [];
  const seen = new Set();
  let cur = start;
  let prev = null;
  while (cur && !seen.has(cur)) {
    order.push(cur);
    seen.add(cur);
    const next = [...adj.get(cur)].find((n) => n !== prev && !seen.has(n));
    prev = cur;
    cur = next;
  }

  if (order.length !== stationIds.length) {
    return { error: `path covers ${order.length}/${stationIds.length} (disconnected)` };
  }
  return { order, loop };
}

/* -------------------------------------------------------------------- main */

async function main() {
  console.log('  querying Wikidata ...');
  const [stationRows, adjRows] = await Promise.all([sparql(Q_STATIONS), sparql(Q_ADJACENCY)]);
  console.log(`  ${stationRows.length} in-use station/line pairs, ${adjRows.length} adjacency statements\n`);

  // line -> { label, stations: Map(qid -> {name, lat, lng}) }
  const lines = new Map();
  for (const r of stationRows) {
    const lid = qid(r.line.value);
    if (!lines.has(lid)) lines.set(lid, { id: lid, label: r.lineLabel?.value ?? lid, stations: new Map() });
    const sid = qid(r.st.value);
    const c = r.coord ? parsePoint(r.coord.value) : null;
    const name = r.stLabel?.value ?? sid;
    if (/^Q\d+$/.test(name)) continue; // unlabelled item — unusable
    lines.get(lid).stations.set(sid, { id: sid, name, lat: c?.lat ?? null, lng: c?.lng ?? null });
  }

  // Adjacency, both globally and per-line where the statement says which line.
  const edgesByLine = new Map();
  const edgesGlobal = [];
  for (const r of adjRows) {
    const a = qid(r.a.value);
    const b = qid(r.b.value);
    edgesGlobal.push([a, b]);
    if (r.line) {
      const lid = qid(r.line.value);
      if (!edgesByLine.has(lid)) edgesByLine.set(lid, []);
      edgesByLine.get(lid).push([a, b]);
    }
  }

  const report = [];
  const byCity = new Map();

  for (const line of lines.values()) {
    const ids = [...line.stations.keys()];
    if (ids.length < 3) continue;

    // Group by centroid of the stations that have coordinates.
    const located = [...line.stations.values()].filter((s) => s.lat != null);
    if (located.length === 0) {
      report.push({ line: line.label, n: ids.length, status: 'DROPPED', why: 'no coordinates' });
      continue;
    }
    const cLat = located.reduce((a, s) => a + s.lat, 0) / located.length;
    const cLng = located.reduce((a, s) => a + s.lng, 0) / located.length;
    const city = CITIES
      .map((c) => ({ c, d: haversine(cLat, cLng, c.lat, c.lng) }))
      .sort((a, b) => a.d - b.d)[0];

    if (city.d > 60) {
      report.push({ line: line.label, n: ids.length, status: 'DROPPED', why: `no city within 60km (${city.d.toFixed(0)}km to ${city.c.name})` });
      continue;
    }
    if (city.c.skip) continue; // hand-authored already

    // Prefer line-qualified adjacency. Wikidata's P81 qualifiers are patchy, so
    // if that yields a broken graph, retry using every adjacency statement
    // between stations of this line before giving up.
    const scoped = edgesByLine.get(line.id) ?? [];
    let result = orderLine(ids, scoped.length >= ids.length - 2 ? scoped : edgesGlobal);
    let via = 'line-qualified';
    if (result.error) {
      const retry = orderLine(ids, edgesGlobal);
      if (!retry.error) { result = retry; via = 'all-adjacency'; }
    }

    if (result.error) {
      report.push({ city: city.c.id, line: line.label, n: ids.length, status: 'DROPPED', why: result.error });
      continue;
    }

    const key = city.c.id;
    if (!byCity.has(key)) byCity.set(key, { cityId: key, cityName: city.c.name, lines: [] });
    byCity.get(key).lines.push({
      wikidataId: line.id,
      name: line.label,
      loop: result.loop,
      stations: result.order.map((sid) => line.stations.get(sid)),
    });
    report.push({ city: key, line: line.label, n: ids.length, status: 'ok', why: via === 'all-adjacency' ? 'via unqualified adjacency' : '' });
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('  LINES');
  for (const r of report.sort((a, b) => (a.city ?? 'zz').localeCompare(b.city ?? 'zz'))) {
    const tag = r.status === 'ok' ? ' ok ' : 'DROP';
    console.log(`   ${tag} ${(r.city ?? '?').padEnd(13)} ${r.line.padEnd(34)} ${String(r.n).padStart(3)}${r.why ? '  ' + r.why : ''}`);
  }

  console.log('\n  CITIES');
  for (const city of [...byCity.values()].sort((a, b) => a.cityId.localeCompare(b.cityId))) {
    const unique = new Set(city.lines.flatMap((l) => l.stations.map((s) => s.name)));
    const expected = EXPECTED_STATIONS[city.cityId];
    const delta = expected ? unique.size - expected : null;
    city.expectedStations = expected ?? null;
    city.importedStations = unique.size;
    fs.writeFileSync(path.join(OUT_DIR, `${city.cityId}.json`), `${JSON.stringify(city, null, 2)}\n`);
    const flag = delta === null ? '  (no expected count)'
      : delta === 0 ? '  exact match'
      : `  ${delta > 0 ? '+' : ''}${delta} vs expected ${expected}`;
    console.log(`   ${city.cityId.padEnd(13)} ${String(city.lines.length).padStart(2)} lines  ${String(unique.size).padStart(3)} stations${flag}`);
  }
  console.log(`\n  wrote ${byCity.size} files to data-src/generated/`);
}

main().catch((e) => { console.error('\n  failed:', e.message); process.exit(1); });
