/**
 * Metrorythm — journey planner.
 *
 * Turns a raw Dijkstra path over the platform graph into a structured journey:
 * ride legs grouped by line, interchange legs with walking times, direction of
 * travel, estimated duration and an estimated fare per operator.
 */

import type { CityDataset, Line, LineId, Station, StationId } from '../data/types';
import { buildGraph, nodeKey, type GraphEdge, type MetroGraph, type NodeKey } from './graph';
import { dijkstra, type EdgeCostFn, type PathStep } from './dijkstra';
import { computeFare, type FareBreakdown, type FareSegmentInput } from './fare';

export type RouteMode = 'fastest' | 'cheapest' | 'fewest-interchanges';

export const ROUTE_MODES: { id: RouteMode; label: string; description: string }[] = [
  { id: 'fastest', label: 'Fastest', description: 'Lowest total journey time' },
  { id: 'cheapest', label: 'Cheapest', description: 'Lowest estimated fare' },
  { id: 'fewest-interchanges', label: 'Fewest changes', description: 'Minimum line changes' },
];

export interface RideLeg {
  type: 'ride';
  line: Line;
  from: Station;
  to: Station;
  /** Intermediate stations, excluding `from` and `to`. */
  intermediate: Station[];
  stationCount: number;
  seconds: number;
  km: number;
  /** e.g. "towards Noida Electronic City" — the line's terminus in the direction of travel. */
  direction: string;
}

export interface TransferLeg {
  type: 'transfer';
  at: Station;
  /** Set when the transfer is between two differently-named stations. */
  to?: Station;
  fromLine: Line;
  toLine: Line;
  seconds: number;
  paidArea: boolean;
  note?: string;
}

export type JourneyLeg = RideLeg | TransferLeg;

export interface Journey {
  /** The highest-priority mode that produced this route. */
  mode: RouteMode;
  /**
   * Every mode that produced this exact route. Often more than one — on most
   * pairs the fastest route is also the cheapest and has the fewest changes.
   */
  modes: RouteMode[];
  origin: Station;
  destination: Station;
  legs: JourneyLeg[];
  /** Total estimated seconds including interchange walking. */
  totalSeconds: number;
  rideSeconds: number;
  walkSeconds: number;
  interchanges: number;
  /** Station hops travelled, excluding the origin. */
  stationCount: number;
  distanceKm: number;
  fare: FareBreakdown;
  linesUsed: Line[];
  /** True when any leg lacked verified coordinates and distance was estimated. */
  distanceApproximated: boolean;
}

export interface PlanOptions {
  modes?: RouteMode[];
}

export interface PlanResult {
  journeys: Journey[];
  origin: Station;
  destination: Station;
  /** Set when no route exists in the local dataset. */
  error?: string;
}

/* ------------------------------------------------------------------ costing */

const INTERCHANGE_TIME_PENALTY_S = 0;
/** Strongly discourage line changes when optimising for fewest interchanges. */
const INTERCHANGE_BIG_PENALTY = 60 * 60;
/** Switching operator means buying a second ticket; penalise in cheapest mode. */
const OPERATOR_SWITCH_KM_PENALTY = 12;

function costFnFor(mode: RouteMode, graph: MetroGraph): EdgeCostFn {
  const lineFareSystem = (lineId: LineId) => graph.linesById.get(lineId)?.fareSystem;

  if (mode === 'fastest') {
    return (edge) => edge.seconds + (edge.kind !== 'ride' ? INTERCHANGE_TIME_PENALTY_S : 0);
  }

  if (mode === 'fewest-interchanges') {
    return (edge) =>
      edge.kind === 'ride' ? edge.seconds : INTERCHANGE_BIG_PENALTY + edge.seconds;
  }

  // cheapest: minimise distance, and avoid crossing into a separate fare table.
  return (edge, previous) => {
    let cost = edge.km;
    if (edge.kind !== 'ride') {
      // A small time-equivalent so interchanges are not free.
      cost += 0.2;
      const prevSystem = previous ? lineFareSystem(previous.line) : undefined;
      const nextSystem = lineFareSystem(edge.line);
      if (prevSystem && nextSystem && prevSystem !== nextSystem) {
        cost += OPERATOR_SWITCH_KM_PENALTY;
      }
    }
    return cost;
  };
}

/* ------------------------------------------------------- path -> journey */

function directionOf(line: Line, from: StationId, to: StationId, stations: Map<StationId, Station>): string {
  const i = line.stations.indexOf(from);
  const j = line.stations.indexOf(to);
  if (i === -1 || j === -1) return line.name;
  const terminusId = j > i ? line.stations[line.stations.length - 1] : line.stations[0];
  const terminus = stations.get(terminusId);
  return terminus ? `towards ${terminus.name}` : line.name;
}

function stationsBetween(
  line: Line,
  from: StationId,
  to: StationId,
  stations: Map<StationId, Station>,
): Station[] {
  const i = line.stations.indexOf(from);
  const j = line.stations.indexOf(to);
  if (i === -1 || j === -1) return [];
  const slice = i < j ? line.stations.slice(i + 1, j) : line.stations.slice(j + 1, i).reverse();
  return slice.map((id) => stations.get(id)).filter((s): s is Station => !!s);
}

function buildJourney(
  graph: MetroGraph,
  mode: RouteMode,
  path: PathStep[],
  origin: Station,
  destination: Station,
): Journey {
  const { dataset, stationsById, linesById } = graph;
  const legs: JourneyLeg[] = [];
  /**
   * Fare segments, in travel order. Consecutive ride legs on the SAME fare
   * system are merged into one segment, which is what stops a line change
   * inside a single operator's network from being billed twice.
   */
  const fareSegments: FareSegmentInput[] = [];

  let rideSeconds = 0;
  let walkSeconds = 0;
  let stationCount = 0;
  let distanceKm = 0;
  let distanceApproximated = false;

  // Group consecutive ride edges on the same line into one leg.
  let i = 0;
  while (i < path.length) {
    const edge: GraphEdge = path[i].edge;

    if (edge.kind === 'ride') {
      const line = linesById.get(edge.line)!;
      const startStation = edge.fromStation;
      let endStation = edge.toStation;
      let seconds = edge.seconds;
      let km = edge.km;
      let hops = 1;

      let j = i + 1;
      while (j < path.length && path[j].edge.kind === 'ride' && path[j].edge.line === edge.line) {
        endStation = path[j].edge.toStation;
        seconds += path[j].edge.seconds;
        km += path[j].edge.km;
        hops += 1;
        j += 1;
      }

      const fromSt = stationsById.get(startStation)!;
      const toSt = stationsById.get(endStation)!;
      if (fromSt.lat == null || toSt.lat == null) distanceApproximated = true;

      legs.push({
        type: 'ride',
        line,
        from: fromSt,
        to: toSt,
        intermediate: stationsBetween(line, startStation, endStation, stationsById),
        stationCount: hops,
        seconds,
        km,
        direction: directionOf(line, startStation, endStation, stationsById),
      });

      rideSeconds += seconds;
      stationCount += hops;
      distanceKm += km;

      const open = fareSegments[fareSegments.length - 1];
      if (open && open.fareSystemId === line.fareSystem) {
        // Same operator as the previous leg — extend, do not open a new fare.
        open.km += km;
        open.stations += hops;
        open.toStationId = endStation;
      } else {
        fareSegments.push({
          fareSystemId: line.fareSystem,
          km,
          stations: hops,
          fromStationId: startStation,
          toStationId: endStation,
        });
      }

      i = j;
      continue;
    }

    // interchange / walking transfer
    const fromLine = linesById.get(path[i].edge.line)!;
    // The line we were on before this edge is the previous ride leg's line.
    const prevRide = [...legs].reverse().find((l): l is RideLeg => l.type === 'ride');
    const atStation = stationsById.get(edge.fromStation)!;
    const toStation = stationsById.get(edge.toStation)!;

    legs.push({
      type: 'transfer',
      at: atStation,
      to: edge.kind === 'transfer' ? toStation : undefined,
      fromLine: prevRide ? prevRide.line : fromLine,
      toLine: linesById.get(edge.line)!,
      seconds: edge.seconds,
      paidArea: edge.paidArea ?? true,
      note: edge.note,
    });

    walkSeconds += edge.seconds;
    if (edge.kind === 'transfer') {
      distanceKm += edge.km;
    }
    i += 1;
  }

  const linesUsed: Line[] = [];
  for (const leg of legs) {
    if (leg.type === 'ride' && !linesUsed.some((l) => l.id === leg.line.id)) linesUsed.push(leg.line);
  }

  return {
    mode,
    modes: [mode],
    origin,
    destination,
    legs,
    totalSeconds: rideSeconds + walkSeconds,
    rideSeconds,
    walkSeconds,
    interchanges: legs.filter((l) => l.type === 'transfer').length,
    stationCount,
    distanceKm: Math.round(distanceKm * 10) / 10,
    fare: computeFare(fareSegments),
    linesUsed,
    distanceApproximated,
  };
}

/* ------------------------------------------------------------------- public */

export function createPlanner(dataset: CityDataset) {
  const graph = buildGraph(dataset);

  function plan(
    originId: StationId,
    destinationId: StationId,
    options: PlanOptions = {},
  ): PlanResult {
    const origin = graph.stationsById.get(originId);
    const destination = graph.stationsById.get(destinationId);

    if (!origin) return { journeys: [], origin: origin!, destination: destination!, error: `Unknown station: ${originId}` };
    if (!destination) return { journeys: [], origin, destination: destination!, error: `Unknown station: ${destinationId}` };
    if (originId === destinationId) {
      return { journeys: [], origin, destination, error: 'Origin and destination are the same station.' };
    }

    const sources = origin.lines.map((l) => nodeKey(origin.id, l));
    const targets = new Set<NodeKey>(destination.lines.map((l) => nodeKey(destination.id, l)));

    const modes = options.modes ?? (['fastest', 'cheapest', 'fewest-interchanges'] as RouteMode[]);
    const journeys: Journey[] = [];

    for (const mode of modes) {
      const result = dijkstra(graph, sources, targets, costFnFor(mode, graph));
      if (!result.path || result.path.length === 0) continue;
      journeys.push(buildJourney(graph, mode, result.path, origin, destination));
    }

    if (journeys.length === 0) {
      return {
        journeys: [],
        origin,
        destination,
        error:
          'No route exists between these stations in the local dataset. ' +
          'Metrorythm never invents connections that are not in its data.',
      };
    }

    // De-duplicate identical journeys produced by different modes. The surviving
    // journey records every mode that produced it, so the UI can show one card
    // badged "Fastest · Cheapest" rather than three identical cards.
    const signatureOf = (j: Journey) =>
      j.legs
        .map((l) => (l.type === 'ride' ? `R:${l.line.id}:${l.from.id}>${l.to.id}` : `T:${l.at.id}`))
        .join('|');

    const unique: Journey[] = [];
    const bySignature = new Map<string, Journey>();
    for (const j of journeys) {
      const sig = signatureOf(j);
      const existing = bySignature.get(sig);
      if (existing) {
        if (!existing.modes.includes(j.mode)) existing.modes.push(j.mode);
        continue;
      }
      bySignature.set(sig, j);
      unique.push(j);
    }

    return { journeys: unique, origin, destination };
  }

  return { graph, plan };
}

export type Planner = ReturnType<typeof createPlanner>;
