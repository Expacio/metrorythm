/**
 * Metrorythm — fare configuration.
 *
 * Fare data lives here, completely separate from the routing engine and the
 * station database. Each operator has its own independent, versioned config.
 * The routing engine never applies one operator's table to another.
 *
 * EVERY config carries:
 *   - `effectiveDate`  when this fare structure came into force
 *   - `confidence`     'official' | 'estimated' | 'unavailable'
 *   - `sourceNote`     where the numbers came from
 *
 * Nothing here is invented. Where an official figure could not be sourced the
 * config is marked `estimated` and the UI says so, per-operator.
 */

export type FareBasis = 'distance' | 'stationCount' | 'flat';

/** How much we trust these numbers. Surfaced in the UI, never hidden. */
export type FareConfidence = 'official' | 'estimated' | 'unavailable';

export interface DistanceSlab {
  /** Upper bound in km. `null` = "and above". */
  maxKm: number | null;
  fare: number;
}

export interface StationSlab {
  /** Upper bound on stations travelled. `null` = "and above". */
  maxStations: number | null;
  fare: number;
}

export interface FareDiscounts {
  /** Fractional discount for stored-value / smart cards, e.g. 0.1 = 10%. */
  smartCard: number;
  /** ADDITIONAL fractional discount during off-peak hours, on top of smartCard. */
  offPeakExtra: number;
}

export interface FareConfig {
  fareSystemId: string;
  operator: string;
  label: string;
  currency: string;
  fareType: 'token';
  basis: FareBasis;
  /** When this fare structure came into force, where the operator publishes one. */
  effectiveDate: string;
  /**
   * False when the operator does not publish an effective date, in which case
   * `effectiveDate` is the date the figures were last verified instead. The UI
   * says "verified" rather than "effective" for these.
   */
  effectiveDateIsPublished: boolean;
  confidence: FareConfidence;
  sourceNote: string;

  /** Used when basis === 'distance'. */
  slabs?: DistanceSlab[];
  /** Used when basis === 'stationCount'. */
  stationSlabs?: StationSlab[];
  /** Used when basis === 'flat'. */
  flatFare?: number;

  /** Concessional fares on Sundays and national holidays, same basis as above. */
  sundaySlabs?: DistanceSlab[];
  sundayStationSlabs?: StationSlab[];
  sundayFlatFare?: number;

  discounts: FareDiscounts;

  /**
   * Verified station-to-station fares, keyed `fromId|toId` (order-independent;
   * the lookup tries both directions). Takes priority over slabs.
   */
  stationPairs?: Record<string, number>;

  specialRules?: {
    id: string;
    description: string;
  }[];
}

/* ------------------------------------------------------------------- DMRC */

/**
 * Delhi Metro (DMRC) regular network — Red, Yellow, Blue, Green, Violet, Pink,
 * Magenta and Grey lines.
 *
 * ONE fare covers the entire DMRC paid network regardless of how many lines
 * you change. Changing from the Red Line to the Yellow Line does NOT incur a
 * second fare.
 */
export const DMRC: FareConfig = {
  fareSystemId: 'dmrc',
  operator: 'DMRC',
  label: 'Delhi Metro network',
  currency: 'INR',
  fareType: 'token',
  basis: 'distance',
  effectiveDate: '2025-08-25',
  effectiveDateIsPublished: true,
  confidence: 'official',
  sourceNote:
    'Fares revised 25 Aug 2025 (first revision since 2017), announced by DMRC. '
    + 'Token slabs ₹11/21/32/43/54/64; concessional Sunday & national-holiday slabs; '
    + '10% smart-card discount plus a further 10% off-peak.',
  slabs: [
    { maxKm: 2, fare: 11 },
    { maxKm: 5, fare: 21 },
    { maxKm: 12, fare: 32 },
    { maxKm: 21, fare: 43 },
    { maxKm: 32, fare: 54 },
    { maxKm: null, fare: 64 },
  ],
  sundaySlabs: [
    { maxKm: 2, fare: 11 },
    { maxKm: 5, fare: 11 },
    { maxKm: 12, fare: 21 },
    { maxKm: 21, fare: 32 },
    { maxKm: 32, fare: 43 },
    { maxKm: null, fare: 54 },
  ],
  discounts: { smartCard: 0.1, offPeakExtra: 0.1 },
  specialRules: [
    {
      id: 'single-fare-across-network',
      description:
        'A single distance-based fare covers the whole DMRC network. Interchanging '
        + 'between DMRC lines inside the paid area never triggers an additional fare.',
    },
    {
      id: 'sunday-holiday',
      description:
        'Concessional slabs apply on Sundays and the three national holidays '
        + '(26 January, 15 August, 2 October).',
    },
  ],
};

/* --------------------------------------------------------- Airport Express */

/**
 * Airport Express (Orange) Line.
 *
 * A SEPARATE fare system from the rest of DMRC, despite being DMRC-operated.
 * A journey that uses both the Airport Express and the regular network pays
 * one Airport Express fare plus one DMRC fare.
 *
 * ⚠ CONFIDENCE: estimated.
 * DMRC confirmed Airport Express fares rose by up to ₹5 on 25 Aug 2025 and that
 * the revised range is ₹11–₹75, but no official post-revision station-to-station
 * Airport Express chart could be sourced. The station pairs below are the widely
 * published pre-revision fares (New Delhi → Shivaji Stadium ₹20, Dhaula Kuan ₹30,
 * IGI T3 ₹60, Dwarka Sector 21 ₹60) carried forward with the announced increase
 * and bounded by the published ₹11–₹75 range.
 *
 * These are ESTIMATES and the UI labels them as such. Replace `stationPairs`
 * with the official chart when one becomes available — nothing else changes.
 */
export const AIRPORT_EXPRESS: FareConfig = {
  fareSystemId: 'airportExpress',
  operator: 'DMRC Airport Express',
  label: 'Airport Express (Orange Line)',
  currency: 'INR',
  fareType: 'token',
  basis: 'distance',
  effectiveDate: '2025-08-25',
  effectiveDateIsPublished: true,
  confidence: 'estimated',
  sourceNote:
    'DMRC announced Airport Express fares rose by up to ₹5 on 25 Aug 2025, with a '
    + 'revised range of ₹11–₹75. No official post-revision station-to-station chart '
    + 'could be sourced, so these values are derived from the published pre-revision '
    + 'fares plus the announced increase, bounded by that range. ESTIMATED.',
  // Fares from New Delhi, the line's city terminus and by far the most common origin.
  stationPairs: {
    'new-delhi|shivaji-stadium': 21,
    'new-delhi|dhaula-kuan': 32,
    'new-delhi|delhi-aerocity': 54,
    'new-delhi|igi-airport-terminal-3': 65,
    'new-delhi|dwarka-sector-21': 65,
    'new-delhi|yashobhoomi-dwarka-sector-25': 75,
  },
  // Fallback for pairs not in the matrix above.
  slabs: [
    { maxKm: 2, fare: 11 },
    { maxKm: 5, fare: 21 },
    { maxKm: 12, fare: 32 },
    { maxKm: 21, fare: 54 },
    { maxKm: 32, fare: 65 },
    { maxKm: null, fare: 75 },
  ],
  discounts: { smartCard: 0.1, offPeakExtra: 0 },
  specialRules: [
    {
      id: 'separate-from-dmrc',
      description:
        'The Airport Express has its own fare table. A journey using both it and the '
        + 'regular DMRC network is charged one fare for each.',
    },
  ],
};

/* -------------------------------------------------------------- NMRC Aqua */

/**
 * Noida Metro (NMRC) Aqua Line.
 *
 * Priced by NUMBER OF STATIONS TRAVELLED, not by distance — a genuinely
 * different fare model from DMRC's.
 */
export const NMRC_AQUA: FareConfig = {
  fareSystemId: 'nmrcAqua',
  operator: 'NMRC',
  label: 'Noida Metro Aqua Line',
  currency: 'INR',
  fareType: 'token',
  basis: 'stationCount',
  effectiveDate: '2026-11-10',
  effectiveDateIsPublished: false,
  confidence: 'official',
  sourceNote:
    'NMRC does not publish an effective date for this table, so the date above is '
    + 'when these figures were last verified, not when they came into force. '
    + 'NMRC publishes Aqua Line fares by number of stations travelled: '
    + '1 station ₹10, 2 ₹15, 3–6 ₹20, 7–9 ₹30, 10–16 ₹40, 17+ ₹50, with lower '
    + 'Sunday/holiday fares. The NMRC City1 smart card gives 10% off.',
  stationSlabs: [
    { maxStations: 1, fare: 10 },
    { maxStations: 2, fare: 15 },
    { maxStations: 6, fare: 20 },
    { maxStations: 9, fare: 30 },
    { maxStations: 16, fare: 40 },
    { maxStations: null, fare: 50 },
  ],
  sundayStationSlabs: [
    { maxStations: 1, fare: 10 },
    { maxStations: 2, fare: 10 },
    { maxStations: 6, fare: 15 },
    { maxStations: 9, fare: 20 },
    { maxStations: 16, fare: 30 },
    { maxStations: null, fare: 40 },
  ],
  discounts: { smartCard: 0.1, offPeakExtra: 0 },
  specialRules: [
    {
      id: 'separate-corporation',
      description:
        'NMRC is a separate corporation from DMRC. The Aqua Line is not part of the '
        + 'Delhi Metro paid area — you must exit at Noida Sector 52 and re-enter at '
        + 'Noida Sector 51, paying both operators.',
    },
  ],
};

/* ------------------------------------------------------------ Rapid Metro */

/**
 * Rapid Metro Gurugram (DMRC-operated since 2019).
 *
 * Flat ₹20. DMRC states that when a journey enters or exits via Rapid Metro
 * Sikanderpur, a combined fare is charged for having used both networks.
 */
export const RAPID_METRO: FareConfig = {
  fareSystemId: 'rapidMetro',
  operator: 'Rapid Metro Gurugram',
  label: 'Rapid Metro Gurugram',
  currency: 'INR',
  fareType: 'token',
  basis: 'flat',
  effectiveDate: '2026-11-10',
  effectiveDateIsPublished: false,
  confidence: 'official',
  sourceNote:
    'No effective date is published for this fare, so the date above is when it was '
    + 'last verified, not when it came into force. '
    + 'DMRC states the Rapid Metro Gurugram fare is ₹20, and that a combined fare is '
    + 'charged when a journey uses both the Delhi Metro and Rapid Metro networks via '
    + 'Sikanderpur.',
  flatFare: 20,
  sundayFlatFare: 20,
  discounts: { smartCard: 0.1, offPeakExtra: 0 },
  specialRules: [
    {
      id: 'combined-fare-sikanderpur',
      description:
        'Entering or exiting via Rapid Metro Sikanderpur charges a combined fare for '
        + 'both the Delhi Metro and Rapid Metro networks.',
    },
  ],
};

export const FARE_CONFIGS: Record<string, FareConfig> = {
  dmrc: DMRC,
  airportExpress: AIRPORT_EXPRESS,
  nmrcAqua: NMRC_AQUA,
  rapidMetro: RAPID_METRO,
};

/** The newest effectiveDate across all operators — shown in the UI. */
export const FARE_DATA_VERSION = Object.values(FARE_CONFIGS)
  .map((c) => c.effectiveDate)
  .sort()
  .reverse()[0];

export function getFareConfig(fareSystemId: string): FareConfig | undefined {
  return FARE_CONFIGS[fareSystemId];
}
