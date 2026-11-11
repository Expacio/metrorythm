/**
 * Metrorythm — dataset type definitions.
 *
 * These describe the shape of the generated city JSON files in
 * src/data/cities/*.json. They are intentionally free of any UI or routing
 * concerns so the dataset stays independent of how it is consumed.
 */

export type StationId = string;
export type LineId = string;
export type FareSystemId = string;

/* ------------------------------------------------------- provenance */

/**
 * How much a given figure can be trusted. This is deliberately coarser than a
 * percentage and deliberately explicit: a value is never promoted to OFFICIAL
 * because it looks plausible, only because it came from the operator or a
 * government publication.
 */
export type Confidence = 'OFFICIAL' | 'VERIFIED_SECONDARY' | 'ESTIMATED' | 'UNKNOWN';

/** One place data came from. Referenced by id so it is recorded exactly once. */
export interface DataSource {
  id: string;
  /** Who published it, e.g. "Open Data Telangana" or "DMRC". */
  organisation: string;
  url: string;
  /** True only for the operator itself or a government body. */
  official: boolean;
  /** ISO date this was downloaded. */
  retrievedAt: string;
  /** ISO date the contents were last checked against the source. */
  lastVerifiedAt: string;
  /** What the source actually covers, in plain words. */
  coverage: string;
  /** Anything a reader should know before trusting it. */
  limitations: string[];
  licence?: string;
}

/** Attaches a confidence level and a source to a particular field. */
export interface Provenance {
  confidence: Confidence;
  /** `DataSource.id`, or null when nothing authoritative backs this. */
  source: string | null;
  note?: string;
}

/** Per-aspect provenance for a dataset. Absent means "not yet assessed". */
export interface DatasetProvenance {
  stations?: Provenance;
  lineMembership?: Provenance;
  interchanges?: Provenance;
  coordinates?: Provenance;
  distances?: Provenance;
  timings?: Provenance;
  headways?: Provenance;
  fares?: Provenance;
  openingStatus?: Provenance;
}

export interface FareSlab {
  /** Upper bound of this slab in km. `null` means "and above". */
  maxKm: number | null;
  fare: number;
}

export interface FareSystem {
  id: FareSystemId;
  label: string;
  currency: string;
  /** Always true in this dataset — fares are approximations, not official quotes. */
  estimated: boolean;
  note: string;
  slabs: FareSlab[];
}

export interface Line {
  id: LineId;
  name: string;
  /** Official corridor number, e.g. "Line 3" or "Orange Line". */
  code: string;
  color: string;
  operator: string;
  fareSystem: FareSystemId;
  /** Estimated travel + dwell time between adjacent stations on this line. */
  avgHopSeconds: number;
  isExpress: boolean;
  /** Set when this line is a branch of another, e.g. the Vaishali branch. */
  parentLine: LineId | null;
  /** Set when the line's far end loops back to an earlier station. */
  loopsBackTo: StationId | null;
  stations: StationId[];

  /* --- timing model (all optional; absent falls back to avgHopSeconds) --- */

  /**
   * Scheduled running speed in km/h, EXCLUDING station dwell. Used to derive a
   * hop's run time from its distance when no measured time exists, which is
   * what stops a 0.5 km hop and a 4 km hop from taking the same time.
   */
  avgSpeedKmh?: number;
  /** Seconds a train stands at each station on this line. */
  dwellSeconds?: number;
  /** Time between trains. Drives expected interchange wait (half the headway). */
  headwaySeconds?: { peak: number; offPeak: number };
  /** Local time of the first and last departure, "HH:MM". */
  operatingHours?: { first: string; last: string };
  /**
   * True when the line's two ends are the same place, so position along
   * `stations` wraps. Index arithmetic must take the shorter arc.
   */
  isLoop?: boolean;
  /**
   * Lines whose trains run through onto this one without passengers changing.
   * A transfer between through-served lines costs no wait and no interchange.
   */
  throughServiceWith?: LineId[];

  provenance?: {
    stations?: Provenance;
    timings?: Provenance;
    headways?: Provenance;
  };
}

export interface Station {
  id: StationId;
  name: string;
  lines: LineId[];
  aliases: string[];
  /**
   * Whether the station is in service. Anything not confirmed open is excluded
   * from routing rather than silently treated as usable.
   */
  status?: 'open' | 'under-construction' | 'closed';
  /** Operator's own station code, where one exists (e.g. DMRC "RCK"). */
  code?: string;
  /** `null` only when the position is genuinely unknown. Never guessed. */
  lat: number | null;
  lng: number | null;
  /**
   * Where the position came from:
   *  - 'surveyed'     a verified position
   *  - 'interpolated' derived geometrically from known neighbours on the line
   *  - null           unknown
   */
  coordSource: 'surveyed' | 'interpolated' | null;
}

export type EdgeKind = 'ride' | 'interchange' | 'transfer';

export interface Edge {
  kind: EdgeKind;
  from: StationId;
  to: StationId;
  /**
   * Total seconds for this edge. Retained for compatibility and still used
   * when the components below are absent; prefer `runSeconds` + `dwellSeconds`,
   * which the UI can show separately.
   */
  seconds: number;
  /** Present on ride edges. */
  line?: LineId;
  /** Present on interchange/transfer edges. */
  fromLine?: LineId;
  toLine?: LineId;
  paidArea?: boolean;
  note?: string;

  /* --- measured values, where a source provides them --- */

  /**
   * Route distance in km along the track. Published or measured — NOT a
   * straight line between coordinates. Absent means the engine must fall back
   * to a clearly-flagged geometric estimate.
   */
  km?: number;
  /** Seconds the train is moving, excluding dwell at either end. */
  runSeconds?: number;
  /** Seconds the train stands at the arriving station. */
  dwellSeconds?: number;
  /** Expected wait for the next service, on interchange/transfer edges. */
  waitSeconds?: number;
  provenance?: Provenance;
}

export interface Interchange {
  station: StationId;
  lines: LineId[];
  walkSeconds: number;
}

export interface WalkingTransfer {
  from: StationId;
  to: StationId;
  walkSeconds: number;
  paidArea: boolean;
  note: string;
}

export interface AirportTerminal {
  terminal: string;
  aliases: string[];
  station: StationId;
  note: string;
}

export interface Airport {
  iata: string;
  icao: string;
  name: string;
  city: string;
  /** False when this airport's city is not part of THIS city's dataset. */
  inThisDataset: boolean;
  /** Set when another city in the app does cover it, so the UI can offer a switch. */
  availableInCityId?: string;
  note?: string;
  terminals: AirportTerminal[];
}

export interface Landmark {
  label: string;
  station: StationId;
}

export interface CityMeta {
  cityId: string;
  cityName: string;
  country: string;
  timezone: string;
  operators: string[];
  notes: string;
  /** 'wikidata' for imported networks; absent for hand-authored ones. */
  source?: string;
}

export interface CoordinateMeta {
  available: boolean;
  source: string | null;
  fetchedAt: string | null;
  /** Verified positions. */
  surveyed: number;
  /** Positions derived from neighbours — good enough to draw, not surveyed. */
  interpolated: number;
  /** surveyed + interpolated */
  matched: number;
  missingCount: number;
  missing: StationId[];
}

export interface Connectivity {
  /** False when the network splits into parts no route can cross. */
  connected: boolean;
  components: number;
}

export interface CityDataset {
  schemaVersion: number;
  /** The date this transit data was last verified. Surfaced in the UI. */
  dataVersion: string;
  generatedAt: string;
  city: CityMeta;
  /** Every source this dataset drew on, referenced by id from `provenance`. */
  sources?: DataSource[];
  /** Per-aspect confidence. Absent fields have simply not been assessed yet. */
  provenance?: DatasetProvenance;
  connectivity?: Connectivity;
  coordinates: CoordinateMeta;
  fareSystems: Record<FareSystemId, FareSystem>;
  lines: Line[];
  stations: Station[];
  edges: Edge[];
  interchanges: Interchange[];
  transfers: WalkingTransfer[];
  airports: Airport[];
  landmarks: Landmark[];
}
