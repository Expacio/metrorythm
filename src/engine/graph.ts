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

import type { CityDataset, Edge, LineId, Station, StationId } from '../data/types';

/** A node is a platform: being at station X on line Y. */
export type NodeKey = string;

export const nodeKey = (station: StationId, line: LineId): NodeKey => `${station}@${line}`;

export function parseNodeKey(key: NodeKey): { station: StationId; line: LineId } {
  const at = key.lastIndexOf('@');
  return { station: key.slice(0, at), line: key.slice(at + 1) };
}

export interface GraphEdge {
  to: NodeKey;
  /** Estimated seconds to traverse this edge. */
  seconds: number;
  /** Straight-line distance in km, 0 for interchanges at the same station. */
  km: number;
  kind: Edge['kind'];
  line: LineId;
  fromStation: StationId;
  toStation: StationId;
  paidArea?: boolean;
  note?: string;
}

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

  for (const e of dataset.edges) {
    if (e.kind === 'ride') {
      const line = e.line!;
      const a = nodeKey(e.from, line);
      const b = nodeKey(e.to, line);
      const km = stationDistanceKm(stationsById.get(e.from), stationsById.get(e.to));
      // Metro services run in both directions.
      link(a, { to: b, seconds: e.seconds, km, kind: 'ride', line, fromStation: e.from, toStation: e.to });
      link(b, { to: a, seconds: e.seconds, km, kind: 'ride', line, fromStation: e.to, toStation: e.from });
    } else {
      const fromLine = e.fromLine!;
      const toLine = e.toLine!;
      const a = nodeKey(e.from, fromLine);
      const b = nodeKey(e.to, toLine);
      if (!adjacency.has(a) || !adjacency.has(b)) continue;
      const km = e.kind === 'transfer'
        ? stationDistanceKm(stationsById.get(e.from), stationsById.get(e.to))
        : 0;
      const base = {
        seconds: e.seconds,
        km,
        kind: e.kind,
        paidArea: e.paidArea,
        note: e.note,
      };
      link(a, { ...base, to: b, line: toLine, fromStation: e.from, toStation: e.to });
      link(b, { ...base, to: a, line: fromLine, fromStation: e.to, toStation: e.from });
    }
  }

  return { dataset, adjacency, stationsById, linesById, nodesAtStation };
}
