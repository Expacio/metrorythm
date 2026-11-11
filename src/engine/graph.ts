/**
 * Metrorythm — graph construction.
 *
 * The routing graph uses (station, line) pairs as nodes rather than bare
 * stations. That is what makes it possible to:
 *   - charge a realistic platform-to-platform walking time at an interchange,
 *   - count interchanges correctly,
 *   - know which line you are physically on at every step of a journey.
 *
 * Every edge in this graph comes from the dataset. The engine never invents a
 * connection that is not present in the local data.
 */

import type { CityDataset, Confidence, Edge, Line, LineId, Station, StationId } from '../data/types';

/** A node is a platform: being at station X on line Y. */
export type NodeKey = string;

export const nodeKey = (station: StationId, line: LineId): NodeKey => `${station}@${line}`;

export function parseNodeKey(key: NodeKey): { station: StationId; line: LineId } {
  const at = key.lastIndexOf('@');
  return { station: key.slice(0, at), line: key.slice(at + 1) };
}

/**
 * The parts a journey time is made of, kept separate all the way to the UI.
 *
 * Lumping these together is what made the old model impossible to reason
 * about: a number that silently mixed running, dwelling and waiting could not
 * be checked against anything. Every edge now declares which parts it
 * contributes, and `seconds` is only ever their sum.
 */
export interface EdgeTiming {
  /** Train in motion. */
  run: number;
  /** Train standing at a station. */
  dwell: number;
  /** Walking between platforms at an interchange. */
  walk: number;
  /** Expected wait for the next service, i.e. half the headway. */
  wait: number;
}

export interface GraphEdge {
  to: NodeKey;
  /** Total seconds — always `run + dwell + walk + wait`. */
  seconds: number;
  timing: EdgeTiming;
  /** Route distance in km. 0 for an interchange within one station. */
  km: number;
  /** How the distance was arrived at. */
  kmConfidence: Confidence;
  /** How the time was arrived at. */
  timeConfidence: Confidence;
  kind: Edge['kind'];
  line: LineId;
  fromStation: StationId;
  toStation: StationId;
  paidArea?: boolean;
  note?: string;
  /**
   * True when trains run through this connection, so a passenger stays seated.
   * Such an edge is not counted as an interchange.
   */
  throughService?: boolean;
}

const NO_TIME: EdgeTiming = { run: 0, dwell: 0, walk: 0, wait: 0 };
const sumTiming = (t: EdgeTiming) => t.run + t.dwell + t.walk + t.wait;

export interface MetroGraph {
  dataset: CityDataset;
  adjacency: Map<NodeKey, GraphEdge[]>;
  stationsById: Map<StationId, Station>;
  linesById: Map<LineId, CityDataset['lines'][number]>;
  /** All platform nodes that exist at a given station. */
  nodesAtStation: Map<StationId, NodeKey[]>;
}

const EARTH_RADIUS_KM = 6371;
/**
 * Metro track is never a straight line between two stations. Multiplying the
 * great-circle distance by this factor approximates real route distance and is
 * what the fare estimate is based on. Clearly an approximation.
 */
export const ROUTE_DISTANCE_FACTOR = 1.12;

/** Fallback inter-station distance when a station has no verified coordinate. */
export const FALLBACK_HOP_KM = 1.1;

export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Distance between two stations. Falls back to a documented constant when
 * either station lacks a verified coordinate — we never fabricate a position.
 */
export function stationDistanceKm(a: Station | undefined, b: Station | undefined): number {
  if (!a || !b) return FALLBACK_HOP_KM;
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return FALLBACK_HOP_KM;
  return haversineKm(a.lat, a.lng, b.lat, b.lng) * ROUTE_DISTANCE_FACTOR;
}

/**
 * Distance for one ride edge, preferring published route distance.
 *
 * Order: the dataset's own `km` (measured along the track) > great-circle
 * between coordinates inflated by ROUTE_DISTANCE_FACTOR > a flat fallback.
 * Only the first is trustworthy; the other two are reported as ESTIMATED so
 * a fare derived from them can be labelled honestly.
 */
export function resolveEdgeKm(
  e: Edge,
  from: Station | undefined,
  to: Station | undefined,
): { km: number; confidence: Confidence } {
  if (typeof e.km === 'number' && e.km >= 0) {
    return { km: e.km, confidence: e.provenance?.confidence ?? 'OFFICIAL' };
  }
  if (from?.lat != null && from.lng != null && to?.lat != null && to.lng != null) {
    return {
      km: haversineKm(from.lat, from.lng, to.lat, to.lng) * ROUTE_DISTANCE_FACTOR,
      confidence: 'ESTIMATED',
    };
  }
  return { km: FALLBACK_HOP_KM, confidence: 'UNKNOWN' };
}

/**
 * Time for one ride edge, split into running and dwelling.
 *
 * Order of preference:
 *   1. measured `runSeconds` from a timetable — OFFICIAL;
 *   2. distance divided by the line's scheduled speed — ESTIMATED, but it at
 *      least scales with distance, which a constant per hop does not;
 *   3. the legacy flat `seconds`, which bundles dwell and cannot be split.
 */
export function resolveEdgeTiming(
  e: Edge,
  line: Line | undefined,
  km: number,
): { timing: EdgeTiming; confidence: Confidence } {
  const dwell = e.dwellSeconds ?? line?.dwellSeconds ?? 0;

  if (typeof e.runSeconds === 'number') {
    return {
      timing: { ...NO_TIME, run: e.runSeconds, dwell },
      confidence: e.provenance?.confidence ?? 'OFFICIAL',
    };
  }

  if (line?.avgSpeedKmh && line.avgSpeedKmh > 0 && km > 0) {
    return {
      timing: { ...NO_TIME, run: Math.round((km / line.avgSpeedKmh) * 3600), dwell },
      // As good as the weaker of the distance and the line's speed. A published
      // distance divided by the operator's own published speed is not a guess,
      // so it must not be reported as one.
      confidence: line.provenance?.timings?.confidence ?? 'ESTIMATED',
    };
  }

  // Legacy: a single number covering run and dwell together. Reported as run
  // so totals stay correct; the split is simply unknown.
  return {
    timing: { ...NO_TIME, run: e.seconds ?? line?.avgHopSeconds ?? 0 },
    confidence: 'ESTIMATED',
  };
}

/** Expected wait when changing onto `line`: half its headway. */
export function expectedWaitSeconds(line: Line | undefined): number {
  const h = line?.headwaySeconds;
  if (!h) return 0;
  // Peak is the conservative choice for a planner people catch trains with.
  return Math.round(h.peak / 2);
}

export function buildGraph(dataset: CityDataset): MetroGraph {
  const stationsById = new Map(dataset.stations.map((s) => [s.id, s]));
  const linesById = new Map(dataset.lines.map((l) => [l.id, l]));
  const adjacency = new Map<NodeKey, GraphEdge[]>();
  const nodesAtStation = new Map<StationId, NodeKey[]>();

  const ensureNode = (key: NodeKey, station: StationId) => {
    if (!adjacency.has(key)) {
      adjacency.set(key, []);
      const list = nodesAtStation.get(station) ?? [];
      list.push(key);
      nodesAtStation.set(station, list);
    }
  };

  // Create every platform node up front so lookups never miss.
  for (const line of dataset.lines) {
    for (const st of line.stations) ensureNode(nodeKey(st, line.id), st);
  }

  const link = (from: NodeKey, edge: GraphEdge) => {
    adjacency.get(from)!.push(edge);
  };

  /** True when trains run straight through between these two lines. */
  const runsThrough = (a: LineId, b: LineId) => {
    const la = linesById.get(a);
    const lb = linesById.get(b);
    return !!(la?.throughServiceWith?.includes(b) || lb?.throughServiceWith?.includes(a));
  };

  for (const e of dataset.edges) {
    if (e.kind === 'ride') {
      const lineId = e.line!;
      const line = linesById.get(lineId);
      const a = nodeKey(e.from, lineId);
      const b = nodeKey(e.to, lineId);
      const { km, confidence: kmConfidence } = resolveEdgeKm(
        e, stationsById.get(e.from), stationsById.get(e.to),
      );
      const { timing, confidence: timeConfidence } = resolveEdgeTiming(e, line, km);
      const base = {
        seconds: sumTiming(timing),
        timing,
        km,
        kmConfidence,
        timeConfidence,
        kind: 'ride' as const,
        line: lineId,
      };
      // Metro services run in both directions.
      link(a, { ...base, to: b, fromStation: e.from, toStation: e.to });
      link(b, { ...base, to: a, fromStation: e.to, toStation: e.from });
    } else {
      const fromLine = e.fromLine!;
      const toLine = e.toLine!;
      const a = nodeKey(e.from, fromLine);
      const b = nodeKey(e.to, toLine);
      if (!adjacency.has(a) || !adjacency.has(b)) continue;

      const km = e.kind === 'transfer'
        ? resolveEdgeKm(e, stationsById.get(e.from), stationsById.get(e.to)).km
        : 0;
      const throughService = runsThrough(fromLine, toLine);
      const walk = e.seconds ?? 0;

      // Waiting depends on which line you are boarding, so each direction of
      // the edge gets its own figure. Through services need no wait at all.
      const waitOnto = (target: LineId) =>
        throughService ? 0 : (e.waitSeconds ?? expectedWaitSeconds(linesById.get(target)));

      const make = (target: LineId, fromStation: StationId, toStation: StationId, to: NodeKey) => {
        const timing: EdgeTiming = { ...NO_TIME, walk, wait: waitOnto(target) };
        return {
          to,
          seconds: sumTiming(timing),
          timing,
          km,
          kmConfidence: (e.provenance?.confidence ?? 'ESTIMATED') as Confidence,
          timeConfidence: (e.provenance?.confidence ?? 'ESTIMATED') as Confidence,
          kind: e.kind,
          line: target,
          fromStation,
          toStation,
          paidArea: e.paidArea,
          note: e.note,
          throughService,
        };
      };

      link(a, make(toLine, e.from, e.to, b));
      link(b, make(fromLine, e.to, e.from, a));
    }
  }

  return { dataset, adjacency, stationsById, linesById, nodesAtStation };
}
