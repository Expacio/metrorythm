/**
 * Metrorythm — journey planner.
 *
 * Turns a raw Dijkstra path over the platform graph into a structured journey:
 * ride legs grouped by line, interchange legs with walking times, direction of
 * travel, estimated duration and an estimated fare per operator.
 */

import type { CityDataset, Confidence, Line, LineId, Station, StationId } from '../data/types';
import { buildGraph, nodeKey, type GraphEdge, type MetroGraph, type NodeKey } from './graph';
import { dijkstra, type EdgeCostFn, type PathStep } from './dijkstra';
import { computeFare, type FareBreakdown, type FareSegmentInput } from './fare';

export type RouteMode = 'fastest' | 'cheapest' | 'fewest-interchanges';

/** Worse confidence sorts higher, so `Math.max` picks the weakest link. */
const CONFIDENCE_ORDER: Record<Confidence, number> = {
  OFFICIAL: 0,
  VERIFIED_SECONDARY: 1,
  ESTIMATED: 2,
  UNKNOWN: 3,
};

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
  /** Walking between platforms. */
  walkSeconds: number;
  /** Expected wait for the next train — half the headway, where known. */
  waitSeconds: number;
  paidArea: boolean;
  note?: string;
  /**
   * True when trains run through, so the passenger stays seated. Shown as a
   * line change on the timeline but not counted as an interchange.
   */
  throughService?: boolean;
}

/**
 * A journey time, kept as its parts.
 *
 * Reporting a single number hides whether an estimate is dominated by running,
 * by dwelling or by a guessed wait — so the parts travel all the way to the UI
 * and `total` is only ever their sum.
 */
export interface JourneyTiming {
  /** Train in motion. */
  inTrain: number;
  /** Standing at intermediate stations. */
  dwell: number;
  /** Walking between platforms at interchanges. */
  interchangeWalk: number;
  /** Waiting for connecting trains. */
  interchangeWait: number;
  total: number;
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
  /** Total estimated seconds including interchange walking and waiting. */
  totalSeconds: number;
  rideSeconds: number;
  walkSeconds: number;
  /** The same total, broken into its parts. */
  timing: JourneyTiming;
  /**
   * Worst confidence across every timing input used. 'OFFICIAL' only when
   * every leg came from a published timetable.
   */
  timeConfidence: Confidence;
  /** Worst confidence across the distances used. */
  distanceConfidence: Confidence;
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

/** Strongly discourage line changes when optimising for fewest interchanges. */
const INTERCHANGE_BIG_PENALTY = 60 * 60;
/** Switching operator usually means a second ticket. In km-equivalent. */
const OPERATOR_SWITCH_KM_PENALTY = 12;

/**
 * Cost functions used to GENERATE candidate routes — not to label them.
 *
 * None of these is trusted to decide which journey is "cheapest" or "fastest".
 * They only produce a diverse pool of sensible routes; the labels are assigned
 * afterwards by measuring each finished journey's real fare, real duration and
 * real interchange count. That separation is what stops a card badged
 * "Cheapest" from costing more than the one next to it.
 */
type CandidateStrategy = 'min-time' | 'min-interchanges' | 'min-distance' | 'min-operator-switches';

const STRATEGIES: CandidateStrategy[] = [
  'min-time', 'min-interchanges', 'min-distance', 'min-operator-switches',
];

function costFnFor(strategy: CandidateStrategy, graph: MetroGraph): EdgeCostFn {
  const lineFareSystem = (lineId: LineId) => graph.linesById.get(lineId)?.fareSystem;

  if (strategy === 'min-time') return (edge) => edge.seconds;

  if (strategy === 'min-interchanges') {
    return (edge) =>
      edge.kind === 'ride' || edge.throughService
        ? edge.seconds
        : INTERCHANGE_BIG_PENALTY + edge.seconds;
  }

  if (strategy === 'min-distance') {
    // A small constant keeps interchanges from being free, so the search does
    // not wander through a station just because it costs no distance.
    return (edge) => edge.km + (edge.kind === 'ride' ? 0 : 0.2);
  }

  // min-operator-switches: distance, but crossing a fare boundary is costly.
  return (edge, previous) => {
    let cost = edge.km;
    if (edge.kind !== 'ride') {
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

/**
 * On a loop, `stations` wraps: the last entry is adjacent to the first. Going
 * "forwards" from index 30 to index 2 is three hops, not twenty-eight back.
 * These helpers pick the shorter arc instead of assuming i < j means forwards.
 */
function directionOf(line: Line, from: StationId, to: StationId, stations: Map<StationId, Station>): string {
  const i = line.stations.indexOf(from);
  const j = line.stations.indexOf(to);
  if (i === -1 || j === -1) return line.name;

  const loopAt = loopStartIndex(line);
  const n = line.stations.length;

  // Inside a ring there is no terminus, so name the far side of the loop —
  // which is what the platform signs point at.
  if (loopAt >= 0 && i >= loopAt && j >= loopAt) {
    const ringLen = n - loopAt;
    const fwd = (j - i + ringLen) % ringLen;
    const forwards = fwd <= ringLen - fwd;
    const half = Math.max(1, Math.floor(ringLen / 2));
    const idx = loopAt + (((i - loopAt) + (forwards ? half : -half)) % ringLen + ringLen) % ringLen;
    const far = stations.get(line.stations[idx]);
    return far ? `towards ${far.name}` : line.name;
  }

  const terminusId = j > i ? line.stations[n - 1] : line.stations[0];
  const terminus = stations.get(terminusId);
  return terminus ? `towards ${terminus.name}` : line.name;
}

/**
 * Where the loop portion of a "lollipop" line starts, or -1 for a plain line.
 *
 * The Rapid Metro is a stem (Sector 55-56 → Sikanderpur) plus a one-way ring
 * back to Sikanderpur, which `loopsBackTo` records. Treating the whole line as
 * a ring would make its first and last stations adjacent, which they are not.
 */
function loopStartIndex(line: Line): number {
  if (line.isLoop) return 0;
  if (!line.loopsBackTo) return -1;
  return line.stations.indexOf(line.loopsBackTo);
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

  let stationCount = 0;
  let distanceKm = 0;
  let distanceApproximated = false;
  const timing: JourneyTiming = {
    inTrain: 0, dwell: 0, interchangeWalk: 0, interchangeWait: 0, total: 0,
  };
  let timeConfidence: Confidence = 'OFFICIAL';
  let distanceConfidence: Confidence = 'OFFICIAL';
  const worsen = (a: Confidence, b: Confidence): Confidence =>
    (CONFIDENCE_ORDER[b] > CONFIDENCE_ORDER[a] ? b : a);

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
      let run = edge.timing.run;
      let dwell = edge.timing.dwell;
      timeConfidence = worsen(timeConfidence, edge.timeConfidence);
      distanceConfidence = worsen(distanceConfidence, edge.kmConfidence);
      /*
       * Intermediate stations come from the path itself, not from index
       * arithmetic over `line.stations`. Slicing the sequence breaks on any
       * line that is not a simple list — the Rapid Metro's terminal loop, the
       * Pink Line once its ring closes — because the station you pass through
       * need not sit between the endpoints in array order.
       */
      const intermediate: Station[] = [];

      let j = i + 1;
      while (j < path.length && path[j].edge.kind === 'ride' && path[j].edge.line === edge.line) {
        const next = path[j].edge;
        const mid = stationsById.get(endStation);
        if (mid) intermediate.push(mid);
        endStation = next.toStation;
        seconds += next.seconds;
        km += next.km;
        run += next.timing.run;
        dwell += next.timing.dwell;
        timeConfidence = worsen(timeConfidence, next.timeConfidence);
        distanceConfidence = worsen(distanceConfidence, next.kmConfidence);
        hops += 1;
        j += 1;
      }

      // The final station's dwell is not part of the journey — you get off.
      dwell = Math.max(0, dwell - (path[j - 1].edge.timing.dwell ?? 0));
      seconds = run + dwell;

      const fromSt = stationsById.get(startStation)!;
      const toSt = stationsById.get(endStation)!;
      if (fromSt.lat == null || toSt.lat == null) distanceApproximated = true;

      legs.push({
        type: 'ride',
        line,
        from: fromSt,
        to: toSt,
        intermediate,
        stationCount: hops,
        seconds,
        km,
        direction: directionOf(line, startStation, endStation, stationsById),
      });

      timing.inTrain += run;
      timing.dwell += dwell;
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
      walkSeconds: edge.timing.walk,
      waitSeconds: edge.timing.wait,
      paidArea: edge.paidArea ?? true,
      note: edge.note,
      throughService: edge.throughService,
    });

    timing.interchangeWalk += edge.timing.walk;
    timing.interchangeWait += edge.timing.wait;
    timeConfidence = worsen(timeConfidence, edge.timeConfidence);
    if (edge.kind === 'transfer') {
      distanceKm += edge.km;
      distanceConfidence = worsen(distanceConfidence, edge.kmConfidence);
    }
    i += 1;
  }

  const linesUsed: Line[] = [];
  for (const leg of legs) {
    if (leg.type === 'ride' && !linesUsed.some((l) => l.id === leg.line.id)) linesUsed.push(leg.line);
  }

  timing.total = timing.inTrain + timing.dwell + timing.interchangeWalk + timing.interchangeWait;

  return {
    mode,
    modes: [mode],
    origin,
    destination,
    legs,
    totalSeconds: timing.total,
    rideSeconds: timing.inTrain + timing.dwell,
    walkSeconds: timing.interchangeWalk + timing.interchangeWait,
    timing,
    timeConfidence,
    distanceConfidence,
    // Staying seated through a junction is not an interchange.
    interchanges: legs.filter((l) => l.type === 'transfer' && !l.throughService).length,
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

    const wanted = options.modes ?? (['fastest', 'cheapest', 'fewest-interchanges'] as RouteMode[]);

    /*
     * Generate a pool of candidate routes, then label them by what they
     * actually are. The old code ran one search per mode and took the result
     * on trust — which is how a route badged "Cheapest" ended up costing ₹86
     * when another on the same screen cost ₹85.
     */
    const candidates: Journey[] = [];
    const seenPaths = new Set<string>();
    for (const strategy of STRATEGIES) {
      const result = dijkstra(graph, sources, targets, costFnFor(strategy, graph));
      if (!result.path || result.path.length === 0) continue;
      const key = result.path.map((s) => `${s.from}>${s.to}`).join('|');
      if (seenPaths.has(key)) continue;
      seenPaths.add(key);
      candidates.push(buildJourney(graph, 'fastest', result.path, origin, destination));
    }

    // Pick the genuine winner for each objective, breaking ties on time so the
    // badge lands on the better journey when two cost the same.
    const best = (score: (j: Journey) => number): Journey | undefined =>
      candidates.reduce<Journey | undefined>((acc, j) => {
        if (!acc) return j;
        const d = score(j) - score(acc);
        if (d < 0) return j;
        if (d === 0 && j.totalSeconds < acc.totalSeconds) return j;
        return acc;
      }, undefined);

    const winners = new Map<RouteMode, Journey | undefined>([
      ['fastest', best((j) => j.totalSeconds)],
      ['cheapest', best((j) => j.fare.token)],
      ['fewest-interchanges', best((j) => j.interchanges)],
    ]);

    const journeys: Journey[] = [];
    for (const mode of wanted) {
      const j = winners.get(mode);
      if (!j) continue;
      if (journeys.includes(j)) continue;
      journeys.push(j);
    }
    // Assign every objective each journey actually wins.
    for (const j of journeys) {
      j.modes = wanted.filter((m) => winners.get(m) === j);
      j.mode = j.modes[0] ?? 'fastest';
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

    return { journeys, origin, destination };
  }

  return { graph, plan };
}

export type Planner = ReturnType<typeof createPlanner>;
