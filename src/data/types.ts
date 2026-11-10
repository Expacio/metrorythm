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
}

export interface Station {
  id: StationId;
  name: string;
  lines: LineId[];
  aliases: string[];
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
  seconds: number;
  /** Present on ride edges. */
  line?: LineId;
  /** Present on interchange/transfer edges. */
  fromLine?: LineId;
  toLine?: LineId;
  paidArea?: boolean;
  note?: string;
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

export interface CityDataset {
  schemaVersion: number;
  /** The date this transit data was last verified. Surfaced in the UI. */
  dataVersion: string;
  generatedAt: string;
  city: CityMeta;
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
