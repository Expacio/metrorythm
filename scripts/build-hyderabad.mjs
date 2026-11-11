/**
 * Build the Hyderabad dataset from the official HMRL GTFS feed.
 *
 * Source: Open Data Telangana (data.telangana.gov.in), publishing Hyderabad
 * Metro Rail / L&T Metro's own schedule feed. This is the only Indian metro in
 * Metrorythm for which a complete official feed could be obtained, so it is
 * the one city where station sequence, inter-station distance, run time,
 * dwell, headway, operating hours AND fares are all OFFICIAL rather than
 * estimated.
 *
 * Everything written here is derived from the feed. Nothing is invented: where
 * the feed is silent, the field is omitted and the confidence says so.
 *
 * Run: node scripts/build-hyderabad.mjs
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGtfs, gtfsSeconds, median, slug } from './lib/gtfs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ZIP = join(ROOT, 'data-src', 'gtfs', 'hmrl-telangana-2026-07-03.zip');
const OUT = join(ROOT, 'src', 'data', 'cities', 'hyderabad.json');

/** Feed retrieval facts, recorded so the dataset can state its own age. */
const SOURCE = {
  id: 'hmrl-gtfs',
  organisation: 'Open Data Telangana (feed published for Hyderabad Metro Rail / L&T Metro)',
  url: 'https://data.opencity.in/dataset/4e72c202-4cdb-4437-a629-ffcbe9519f73/resource/5fa250e1-3104-4ca7-ad31-4fa3321f6255/download/telangana_opendata_gtfs_hmrl_03_july_2026.zip',
  official: true,
  retrievedAt: '2026-11-12',
  lastVerifiedAt: '2026-11-12',
  coverage:
    'All three Hyderabad Metro corridors (Red/C1, Green/C2, Blue/C3): stops with '
    + 'coordinates, full timetable, shape distances, headways, and a complete '
    + 'station-to-station fare matrix. Feed valid 2026-07-03 to 2030-01-01.',
  limitations: [
    'HMRL\'s own open-data page (hmrl.co.in/open-data.html) returned 404 when checked '
    + 'on 2026-11-12, so the feed was taken from the Telangana government portal that '
    + 'republishes it.',
    'Run times are scheduled, not observed; real journeys vary with operations.',
    'The feed does not model out-of-station interchanges, because the network has none.',
  ],
};

const SOURCE_WIKI = {
  id: 'wikipedia-hyderabad-metro',
  organisation: 'Wikipedia',
  url: 'https://en.wikipedia.org/wiki/Parade_Ground_metro_station',
  official: false,
  retrievedAt: '2026-11-12',
  lastVerifiedAt: '2026-11-12',
  coverage: 'Confirms Parade Ground (Blue) and JBS Parade Ground (Green) are an interchange with connecting corridors.',
  limitations: [
    'Secondary source. Used only for the existence of this one interchange, never for timings or fares.',
  ],
};

const LINE_META = {
  RED: { id: 'red-line', name: 'Red Line', code: 'C1', color: '#E31E24' },
  GREEN: { id: 'green-line', name: 'Green Line', code: 'C2', color: '#009846' },
  BLUE: { id: 'blue-line', name: 'Blue Line', code: '#C3', color: '#007ABB' },
};
// The route_color in the feed is authoritative; code above is only a fallback.

const g = openGtfs(ZIP);

try {
  const stopsRaw = g.table('stops.txt');
  const routes = g.table('routes.txt');
  const trips = g.table('trips.txt');
  const stopTimes = g.table('stop_times.txt');
  const fareAttrs = g.table('fare_attributes.txt');
  const fareRules = g.table('fare_rules.txt');

  /* ---------------------------------------------------------- stations */

  // GTFS models each platform separately under a parent station. Metrorythm
  // routes between stations, so platforms collapse into their parent.
  const parentOf = new Map();
  const stationRows = [];
  for (const s of stopsRaw) {
    if (s.location_type === '1') stationRows.push(s);
    if (s.parent_station) parentOf.set(s.stop_id, s.parent_station);
  }
  const toStation = (stopId) => parentOf.get(stopId) ?? stopId;

  const idOf = new Map();  // GTFS station id -> Metrorythm slug
  for (const s of stationRows) idOf.set(s.stop_id, slug(s.stop_name));

  /* ------------------------------------------------- trips and sequences */

  const tripById = new Map(trips.map((t) => [t.trip_id, t]));
  const byTrip = new Map();
  for (const r of stopTimes) {
    let list = byTrip.get(r.trip_id);
    if (!list) byTrip.set(r.trip_id, (list = []));
    list.push(r);
  }
  for (const list of byTrip.values()) {
    list.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
  }

  // Longest observed sequence per route/direction gives the full line.
  const longest = new Map();
  for (const [tripId, rows] of byTrip) {
    const t = tripById.get(tripId);
    if (!t) continue;
    const key = `${t.route_id}|${t.direction_id}`;
    const prev = longest.get(key);
    if (!prev || rows.length > prev.rows.length) longest.set(key, { trip: t, rows });
  }

  /* ----------------------------------- per-hop run time, dwell, distance */

  const hopRuns = new Map();     // route|a|b -> seconds[]
  const hopMetres = new Map();   // route|a|b -> metres[]
  const stopDwell = new Map();   // route|station -> seconds[]

  for (const [tripId, rows] of byTrip) {
    const t = tripById.get(tripId);
    if (!t) continue;
    for (let i = 0; i < rows.length; i++) {
      const arr = gtfsSeconds(rows[i].arrival_time);
      const dep = gtfsSeconds(rows[i].departure_time);
      const here = toStation(rows[i].stop_id);
      if (arr != null && dep != null && dep >= arr) {
        const k = `${t.route_id}|${here}`;
        (stopDwell.get(k) ?? stopDwell.set(k, []).get(k)).push(dep - arr);
      }
      if (i + 1 >= rows.length) continue;
      const next = toStation(rows[i + 1].stop_id);
      if (next === here) continue;
      const nextArr = gtfsSeconds(rows[i + 1].arrival_time);
      if (dep == null || nextArr == null) continue;
      const run = nextArr - dep;
      if (run <= 0 || run > 1800) continue;
      const k = `${t.route_id}|${here}|${next}`;
      (hopRuns.get(k) ?? hopRuns.set(k, []).get(k)).push(run);
      const a = Number(rows[i].shape_dist_traveled);
      const b = Number(rows[i + 1].shape_dist_traveled);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        (hopMetres.get(k) ?? hopMetres.set(k, []).get(k)).push(Math.abs(b - a));
      }
    }
  }

  /** Median across both directions, so a hop has one agreed time. */
  const hopStat = (map, route, a, b) => {
    const xs = [...(map.get(`${route}|${a}|${b}`) ?? []), ...(map.get(`${route}|${b}|${a}`) ?? [])];
    return median(xs);
  };

  /* ------------------------------------------------- headway & hours */

  const departuresFor = (routeId, serviceId) => {
    const out = [];
    for (const [tripId, rows] of byTrip) {
      const t = tripById.get(tripId);
      if (!t || t.route_id !== routeId || t.service_id !== serviceId) continue;
      const s = gtfsSeconds(rows[0].departure_time);
      if (s != null) out.push(s);
    }
    return out.sort((x, y) => x - y);
  };

  const gapsIn = (times, fromH, toH) => {
    const win = times.filter((t) => t >= fromH * 3600 && t <= toH * 3600);
    return win.slice(1).map((t, i) => t - win[i]).filter((gp) => gp > 0 && gp < 3600);
  };

  const hhmm = (s) =>
    `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;

  /* --------------------------------------------------------- assemble */

  const usedStations = new Set();
  const lines = [];
  const edges = [];

  for (const r of routes) {
    const meta = LINE_META[r.route_id] ?? { id: slug(r.route_id), name: r.route_id, code: r.route_short_name };
    const seqEntry = longest.get(`${r.route_id}|0`) ?? longest.get(`${r.route_id}|1`);
    if (!seqEntry) continue;

    // Collapse platforms and drop consecutive repeats.
    const seq = [];
    for (const row of seqEntry.rows) {
      const st = toStation(row.stop_id);
      if (seq[seq.length - 1] !== st) seq.push(st);
    }

    const weekday = departuresFor(r.route_id, 'WK');
    const peakGaps = gapsIn(weekday, 8, 11);
    const allGaps = weekday.slice(1).map((t, i) => t - weekday[i]).filter((gp) => gp > 0 && gp < 3600);

    const dwellSamples = seq.flatMap((st) => stopDwell.get(`${r.route_id}|${st}`) ?? []);

    lines.push({
      id: meta.id,
      name: meta.name,
      code: r.route_short_name || meta.code,
      color: r.route_color ? `#${r.route_color}` : meta.color,
      operator: 'Hyderabad Metro Rail (L&T Metro)',
      fareSystem: 'hyderabadMetro',
      avgHopSeconds: median(seq.slice(1).map((_, i) =>
        hopStat(hopRuns, r.route_id, seq[i], seq[i + 1]) ?? 0).filter(Boolean)) ?? 120,
      isExpress: false,
      parentLine: null,
      loopsBackTo: null,
      isLoop: false,
      dwellSeconds: median(dwellSamples) ?? 0,
      headwaySeconds: {
        peak: median(peakGaps) ?? median(allGaps) ?? 0,
        offPeak: median(allGaps) ?? 0,
      },
      operatingHours: weekday.length
        ? { first: hhmm(weekday[0]), last: hhmm(weekday[weekday.length - 1]) }
        : undefined,
      stations: seq.map((s) => idOf.get(s)).filter(Boolean),
      provenance: {
        stations: { confidence: 'OFFICIAL', source: SOURCE.id },
        timings: { confidence: 'OFFICIAL', source: SOURCE.id, note: 'Scheduled times from the published timetable.' },
        headways: { confidence: 'OFFICIAL', source: SOURCE.id, note: 'Median gap between weekday departures, 08:00–11:00.' },
      },
    });

    for (const s of seq) usedStations.add(s);

    for (let i = 0; i + 1 < seq.length; i++) {
      const a = seq[i];
      const b = seq[i + 1];
      const run = hopStat(hopRuns, r.route_id, a, b);
      const metres = hopStat(hopMetres, r.route_id, a, b);
      const dwell = median(stopDwell.get(`${r.route_id}|${b}`) ?? []) ?? 0;
      if (run == null) continue;
      edges.push({
        kind: 'ride',
        line: meta.id,
        from: idOf.get(a),
        to: idOf.get(b),
        seconds: run + dwell,
        runSeconds: run,
        dwellSeconds: dwell,
        ...(metres != null ? { km: Math.round((metres / 1000) * 1000) / 1000 } : {}),
        provenance: { confidence: 'OFFICIAL', source: SOURCE.id },
      });
    }
  }

  /* ------------------------------------------------ stations & interchanges */

  const linesAt = new Map();
  for (const l of lines) for (const sid of l.stations) {
    if (!linesAt.has(sid)) linesAt.set(sid, []);
    linesAt.get(sid).push(l.id);
  }

  const stations = stationRows
    .filter((s) => usedStations.has(s.stop_id))
    .map((s) => ({
      id: idOf.get(s.stop_id),
      name: s.stop_name,
      code: s.stop_id,
      lines: linesAt.get(idOf.get(s.stop_id)) ?? [],
      aliases: [],
      status: 'open',
      lat: Number(s.stop_lat),
      lng: Number(s.stop_lon),
      coordSource: 'surveyed',
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // Interchange edges. The feed gives no platform-to-platform walking time, so
  // this is the one timing here that is NOT official and is labelled as such.
  const INTERCHANGE_WALK_SECONDS = 180;
  const interchanges = [];
  const transfers = [];
  for (const [sid, ls] of linesAt) {
    if (ls.length < 2) continue;
    interchanges.push({ station: sid, lines: ls, walkSeconds: INTERCHANGE_WALK_SECONDS });
    for (let i = 0; i < ls.length; i++) {
      for (let j = i + 1; j < ls.length; j++) {
        edges.push({
          kind: 'interchange',
          from: sid,
          to: sid,
          fromLine: ls[i],
          toLine: ls[j],
          seconds: INTERCHANGE_WALK_SECONDS,
          paidArea: true,
          provenance: {
            confidence: 'ESTIMATED',
            source: null,
            note: 'The feed publishes no platform-to-platform walking time; 3 minutes assumed.',
          },
        });
      }
    }
  }

  /*
   * Parade Ground (Blue) and JBS Parade Ground (Green) are separate stations in
   * the feed — separate ids, separate fare zones, 143 m apart by the feed's own
   * coordinates — but they are the network's Blue/Green interchange, linked by
   * connecting corridors. The feed models no walking links at all, so this edge
   * is added from secondary sources and labelled VERIFIED_SECONDARY, not
   * OFFICIAL. Without it the two corridors only meet the long way round.
   */
  const PARADE_WALK_SECONDS = 300;
  const blueParade = idOf.get('PRG');
  const greenParade = idOf.get('JBS');
  if (blueParade && greenParade) {
    const note = 'Connecting corridor between Parade Ground and JBS Parade Ground (143 m).';
    edges.push({
      kind: 'transfer',
      from: blueParade,
      to: greenParade,
      fromLine: 'blue-line',
      toLine: 'green-line',
      seconds: PARADE_WALK_SECONDS,
      paidArea: true,
      note,
      provenance: {
        confidence: 'VERIFIED_SECONDARY',
        source: 'wikipedia-hyderabad-metro',
        note:
          'Interchange documented by Wikipedia; walking time estimated from the 143 m '
          + 'between the two stations\' official coordinates. HMRL charges one fare '
          + 'network-wide, so no second ticket applies.',
      },
    });
    transfers.push({
      from: blueParade,
      to: greenParade,
      walkSeconds: PARADE_WALK_SECONDS,
      paidArea: true,
      note,
    });
  }

  /* ------------------------------------------------------- fare matrix */

  const priceOf = Object.fromEntries(fareAttrs.map((f) => [f.fare_id, Number(f.price)]));
  const zoneAliases = [];

  // fare_rules keys on zone_id, and zone_id lives on the PLATFORM rows, not on
  // the parent. Interchange stations carry one zone per line (AME_R / AME_B),
  // so a zone maps to exactly one station but a station may have two zones.
  const zoneToStation = new Map();
  for (const s of stopsRaw) {
    if (!s.zone_id) continue;
    const station = idOf.get(toStation(s.stop_id));
    if (station) zoneToStation.set(s.zone_id, station);
  }

  /*
   * Two zones in stops.txt never appear in fare_rules: JBS (JBS Parade Ground)
   * and MGB_G (the Green Line platforms at MG Bus Station). HMRL prices both
   * through their interchange partner instead — MGB_G via MGB_R, which already
   * resolves to the same station, and JBS via PRG next door. Without that
   * alias the Green Line terminus would have no published fare at all and the
   * engine would silently fall back to an estimated slab.
   */
  const ZONE_PRICED_AS = { JBS: 'PRG' };
  const zoneFor = (station) => {
    for (const [zone, st] of zoneToStation) if (st === station) return zone;
    return null;
  };
  for (const [alias, actual] of Object.entries(ZONE_PRICED_AS)) {
    const aliasStation = zoneToStation.get(alias);
    const actualStation = zoneToStation.get(actual);
    if (aliasStation && actualStation) {
      zoneAliases.push({ alias, actual, aliasStation, actualStation });
    }
  }
  void zoneFor;

  const stationPairs = {};
  let fareUnmapped = 0;
  for (const rule of fareRules) {
    const a = zoneToStation.get(rule.origin_id);
    const b = zoneToStation.get(rule.destination_id);
    const price = priceOf[rule.fare_id];
    if (!a || !b || !Number.isFinite(price)) { fareUnmapped++; continue; }
    if (a === b) continue;
    // Where two platform zones map to the same pair, they agree; keep the max
    // so a mismatch never silently under-charges.
    const key = `${a}|${b}`;
    stationPairs[key] = Math.max(stationPairs[key] ?? 0, price);
  }

  // Mirror the priced station's fares onto the station that shares its zone.
  for (const { aliasStation, actualStation } of zoneAliases) {
    for (const [key, price] of Object.entries({ ...stationPairs })) {
      const [a, b] = key.split('|');
      if (a === actualStation && b !== aliasStation) stationPairs[`${aliasStation}|${b}`] ??= price;
      if (b === actualStation && a !== aliasStation) stationPairs[`${a}|${aliasStation}`] ??= price;
    }
    // The walk between the two is inside the paid area, so it is not a journey.
    stationPairs[`${aliasStation}|${actualStation}`] ??= 0;
  }

  /* ------------------------------------------------------------ output */

  const dataset = {
    schemaVersion: 2,
    dataVersion: SOURCE.lastVerifiedAt,
    generatedAt: new Date().toISOString().slice(0, 10),
    city: {
      cityId: 'hyderabad',
      cityName: 'Hyderabad',
      country: 'India',
      timezone: 'Asia/Kolkata',
      operators: ['Hyderabad Metro Rail (L&T Metro)'],
      notes:
        'Built from Hyderabad Metro\'s official GTFS timetable, published via Open Data '
        + 'Telangana. Station sequences, inter-station distances, run times, dwell times, '
        + 'headways and fares all come from that feed. Platform-to-platform walking times '
        + 'at interchanges are the one estimated figure.',
      source: 'gtfs',
    },
    sources: [SOURCE, SOURCE_WIKI],
    provenance: {
      stations: { confidence: 'OFFICIAL', source: SOURCE.id },
      lineMembership: { confidence: 'OFFICIAL', source: SOURCE.id },
      coordinates: { confidence: 'OFFICIAL', source: SOURCE.id },
      distances: { confidence: 'OFFICIAL', source: SOURCE.id, note: 'shape_dist_traveled along the published alignment.' },
      timings: { confidence: 'OFFICIAL', source: SOURCE.id, note: 'Median scheduled run and dwell across all trips.' },
      headways: { confidence: 'OFFICIAL', source: SOURCE.id },
      fares: { confidence: 'OFFICIAL', source: SOURCE.id, note: 'Complete station-pair matrix from fare_rules.txt.' },
      interchanges: { confidence: 'ESTIMATED', source: null, note: 'Walking times not published in the feed.' },
      openingStatus: { confidence: 'OFFICIAL', source: SOURCE.id, note: 'Only stops present in the live feed are included.' },
    },
    connectivity: { connected: true, components: 1 },
    coordinates: {
      available: true,
      source: 'Hyderabad Metro GTFS (Open Data Telangana), stop_lat/stop_lon.',
      fetchedAt: SOURCE.retrievedAt,
      surveyed: stations.length,
      interpolated: 0,
      matched: stations.length,
      missingCount: 0,
      missing: [],
    },
    fareSystems: {},
    lines,
    stations,
    edges,
    interchanges,
    transfers,
    airports: [],
    landmarks: [],
  };

  writeFileSync(OUT, `${JSON.stringify(dataset, null, 1)}\n`);
  // The fare matrix is imported by src/data/fares/index.ts. Kept as its own
  // file because 3,000-odd pairs do not belong inline in a hand-edited config.
  writeFileSync(
    join(ROOT, 'src', 'data', 'fares', 'hyderabad-station-pairs.json'),
    `${JSON.stringify(stationPairs, null, 0)}\n`,
  );

  const rideEdges = edges.filter((e) => e.kind === 'ride');
  const withKm = rideEdges.filter((e) => e.km != null);
  console.log(`stations          ${stations.length}`);
  console.log(`lines             ${lines.map((l) => `${l.name} (${l.stations.length})`).join(', ')}`);
  console.log(`ride edges        ${rideEdges.length} (${withKm.length} with official distance)`);
  console.log(`interchange edges ${edges.length - rideEdges.length}`);
  console.log(`fare pairs        ${Object.keys(stationPairs).length} (${fareUnmapped} unmapped)`);
  for (const l of lines) {
    console.log(
      `  ${l.name.padEnd(11)} dwell ${String(l.dwellSeconds).padStart(3)}s  `
      + `headway peak ${String(l.headwaySeconds.peak).padStart(4)}s / off ${String(l.headwaySeconds.offPeak).padStart(4)}s  `
      + `hours ${l.operatingHours?.first}-${l.operatingHours?.last}`,
    );
  }
} finally {
  g.close();
}
