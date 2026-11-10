/**
 * Metrorythm — fare calculation.
 *
 * Rule-based, per-operator. The engine:
 *   1. receives the journey already split into fare-system segments,
 *   2. calculates each segment using ONLY that operator's own rules,
 *   3. sums them into a payable total.
 *
 * It never applies one operator's table to another, and it never charges a
 * second fare merely because the passenger changed lines inside one network —
 * segment merging happens upstream in the planner, so a Red→Yellow→Red journey
 * arrives here as a single DMRC segment.
 *
 * Every figure is traceable to a config in src/data/fares, each of which
 * carries an effective date and a confidence level.
 */

import {
  getFareConfig,
  type FareConfig,
  type FareConfidence,
  type DistanceSlab,
  type StationSlab,
} from '../data/fares';

/** One contiguous run of travel on a single operator's network. */
export interface FareSegmentInput {
  fareSystemId: string;
  /** Route distance in km across this segment. */
  km: number;
  /** Station hops travelled across this segment. */
  stations: number;
  fromStationId: string;
  toStationId: string;
}

export type FareBasisUsed = 'distance' | 'stationCount' | 'flat' | 'stationPair';

export interface FareSegmentResult {
  fareSystemId: string;
  operator: string;
  label: string;
  /** Which rule actually produced the number. */
  basisUsed: FareBasisUsed;
  km: number;
  stations: number;
  /** Standard single-journey (token/QR) fare. */
  token: number;
  /** Smart-card / NCMC fare after the operator's discount. */
  smartCard: number;
  /** Smart-card fare during off-peak hours, where the operator offers it. */
  smartCardOffPeak: number;
  /** Token fare on Sundays and national holidays. */
  sundayToken: number;
  confidence: FareConfidence;
  effectiveDate: string;
  effectiveDateIsPublished: boolean;
  sourceNote: string;
  /** Set when this particular segment fell back to an estimated rule. */
  estimateReason?: string;
}

export interface FareBreakdown {
  segments: FareSegmentResult[];
  token: number;
  smartCard: number;
  smartCardOffPeak: number;
  sundayToken: number;
  currency: string;
  /** Worst confidence across all segments — the journey is only as solid as its weakest leg. */
  confidence: FareConfidence;
  /** Oldest effective date across the operators used. */
  effectiveDate: string;
  /** Human-readable rules and caveats that applied to this journey. */
  notes: string[];
  /** True when more than one operator is billed. */
  multiOperator: boolean;
}

/* ------------------------------------------------------------- slab lookup */

export function fareForDistance(slabs: DistanceSlab[], km: number): number {
  for (const slab of slabs) {
    if (slab.maxKm === null || km <= slab.maxKm) return slab.fare;
  }
  return slabs[slabs.length - 1].fare;
}

export function fareForStations(slabs: StationSlab[], stations: number): number {
  for (const slab of slabs) {
    if (slab.maxStations === null || stations <= slab.maxStations) return slab.fare;
  }
  return slabs[slabs.length - 1].fare;
}

/** Order-independent station-pair lookup. */
export function lookupStationPair(
  config: FareConfig,
  a: string,
  b: string,
): number | undefined {
  if (!config.stationPairs) return undefined;
  return config.stationPairs[`${a}|${b}`] ?? config.stationPairs[`${b}|${a}`];
}

/** Round to the nearest rupee — operators do not charge paise. */
const rupees = (n: number) => Math.round(n);

/* -------------------------------------------------------- segment costing */

export function calculateSegment(input: FareSegmentInput): FareSegmentResult {
  const config = getFareConfig(input.fareSystemId);

  // An operator with no fare config must never be silently guessed at.
  if (!config) {
    return {
      fareSystemId: input.fareSystemId,
      operator: 'Unknown operator',
      label: input.fareSystemId,
      basisUsed: 'flat',
      km: Math.round(input.km * 10) / 10,
      stations: input.stations,
      token: 0,
      smartCard: 0,
      smartCardOffPeak: 0,
      sundayToken: 0,
      confidence: 'unavailable',
      effectiveDate: 'unknown',
      effectiveDateIsPublished: false,
      sourceNote: `No fare configuration exists for "${input.fareSystemId}".`,
      estimateReason: 'Fare unavailable — this operator has no published table in the dataset.',
    };
  }

  let token: number;
  let sundayToken: number;
  let basisUsed: FareBasisUsed;
  let confidence: FareConfidence = config.confidence;
  let estimateReason: string | undefined;

  // 1. An exact published station-to-station fare always wins.
  const pairFare = lookupStationPair(config, input.fromStationId, input.toStationId);

  if (pairFare !== undefined) {
    basisUsed = 'stationPair';
    token = pairFare;
    sundayToken = pairFare;
  } else if (config.basis === 'flat') {
    basisUsed = 'flat';
    token = config.flatFare ?? 0;
    sundayToken = config.sundayFlatFare ?? token;
  } else if (config.basis === 'stationCount') {
    basisUsed = 'stationCount';
    token = fareForStations(config.stationSlabs!, input.stations);
    sundayToken = config.sundayStationSlabs
      ? fareForStations(config.sundayStationSlabs, input.stations)
      : token;
  } else {
    basisUsed = 'distance';
    token = fareForDistance(config.slabs!, input.km);
    sundayToken = config.sundaySlabs ? fareForDistance(config.sundaySlabs, input.km) : token;

    // Falling back to distance when the operator publishes a station-pair chart
    // is a weaker result, and is reported rather than hidden.
    if (config.stationPairs) {
      confidence = 'estimated';
      estimateReason =
        'No published station-to-station fare exists for this pair, so an '
        + 'estimated distance slab was used.';
    }
  }

  const sc = 1 - config.discounts.smartCard;
  const scOff = 1 - (config.discounts.smartCard + config.discounts.offPeakExtra);

  return {
    fareSystemId: config.fareSystemId,
    operator: config.operator,
    label: config.label,
    basisUsed,
    km: Math.round(input.km * 10) / 10,
    stations: input.stations,
    token,
    smartCard: rupees(token * sc),
    smartCardOffPeak: rupees(token * scOff),
    sundayToken,
    confidence,
    effectiveDate: config.effectiveDate,
    effectiveDateIsPublished: config.effectiveDateIsPublished,
    sourceNote: config.sourceNote,
    estimateReason,
  };
}

/* ------------------------------------------------------------- journey fare */

const CONFIDENCE_RANK: Record<FareConfidence, number> = {
  official: 0,
  estimated: 1,
  unavailable: 2,
};

export function computeFare(segments: FareSegmentInput[]): FareBreakdown {
  const results = segments.map(calculateSegment);

  const notes: string[] = [];
  const multiOperator = new Set(results.map((r) => r.fareSystemId)).size > 1;

  if (multiOperator) {
    notes.push(
      'This journey crosses a fare-system boundary, so one fare is payable to each '
      + 'operator. Changing lines within a single operator’s network never costs extra.',
    );
  }

  for (const r of results) {
    for (const rule of getFareConfig(r.fareSystemId)?.specialRules ?? []) {
      if (!notes.includes(rule.description)) notes.push(rule.description);
    }
    if (r.estimateReason && !notes.includes(r.estimateReason)) notes.push(r.estimateReason);
  }

  const worst = results.reduce<FareConfidence>(
    (acc, r) => (CONFIDENCE_RANK[r.confidence] > CONFIDENCE_RANK[acc] ? r.confidence : acc),
    'official',
  );

  const effectiveDate = results
    .map((r) => r.effectiveDate)
    .filter((d) => d !== 'unknown')
    .sort()[0] ?? 'unknown';

  const sum = (f: (r: FareSegmentResult) => number) => results.reduce((a, r) => a + f(r), 0);

  return {
    segments: results,
    token: sum((r) => r.token),
    smartCard: sum((r) => r.smartCard),
    smartCardOffPeak: sum((r) => r.smartCardOffPeak),
    sundayToken: sum((r) => r.sundayToken),
    currency: 'INR',
    confidence: worst,
    effectiveDate,
    notes,
    multiOperator,
  };
}

/** True on Sundays and the three Indian national holidays. */
export function isConcessionalDay(date: Date): boolean {
  if (date.getDay() === 0) return true;
  const md = `${date.getMonth() + 1}-${date.getDate()}`;
  return md === '1-26' || md === '8-15' || md === '10-2';
}

export type FarePreference = 'token' | 'smartCard';

/** The amount actually payable under the user's chosen ticket type. */
export function payableFare(breakdown: FareBreakdown, pref: FarePreference): number {
  return pref === 'smartCard' ? breakdown.smartCard : breakdown.token;
}
