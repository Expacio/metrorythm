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

/* -------------------------------------------------------------- CMRL */

/**
 * Chennai Metro (CMRL) — Blue, Green and Yellow lines.
 *
 * One distance-based fare covers the whole network; changing between CMRL
 * lines at MGR Central, Alandur or Vadapalani never costs extra.
 *
 * CMRL gives a flat 20% discount on smart cards and on digital QR tickets —
 * twice DMRC's 10%, and with no separate off-peak tier.
 */
export const CMRL: FareConfig = {
  fareSystemId: 'cmrl',
  operator: 'CMRL',
  label: 'Chennai Metro',
  currency: 'INR',
  fareType: 'token',
  basis: 'distance',
  effectiveDate: '2026-11-10',
  effectiveDateIsPublished: false,
  confidence: 'estimated',
  sourceNote:
    'CMRL publishes distance slabs of ₹10/20/30/40/50 up to 32 km, with a flat '
    + '20% discount on smart cards and digital QR tickets. Sources disagree on the '
    + 'over-32 km slab — some list ₹50, others quote a ₹60 network maximum — so '
    + 'journeys beyond 32 km may be ₹10 out. CMRL publishes no effective date, so '
    + 'the date above is when these figures were verified.',
  slabs: [
    { maxKm: 2, fare: 10 },
    { maxKm: 5, fare: 20 },
    { maxKm: 12, fare: 30 },
    { maxKm: 21, fare: 40 },
    { maxKm: 32, fare: 50 },
    { maxKm: null, fare: 60 },
  ],
  discounts: { smartCard: 0.2, offPeakExtra: 0 },
  specialRules: [
    {
      id: 'single-fare-across-network',
      description:
        'A single distance-based fare covers the whole Chennai Metro network. '
        + 'Changing lines inside the paid area never triggers an additional fare.',
    },
    {
      id: 'cmrl-long-distance-uncertain',
      description:
        'Journeys over 32 km: published sources disagree between ₹50 and ₹60, so '
        + 'this fare is an estimate and may be ₹10 out.',
    },
    {
      id: 'cmrl-qr-discount',
      description:
        'CMRL gives a flat 20% discount on smart cards and on digital QR tickets.',
    },
  ],
};


/* ============================================================================
 * The remaining Indian networks.
 *
 * Four are sourced from published fare charts. The rest could not be verified
 * to the standard the DMRC and CMRL tables were held to, so they use a clearly
 * flagged generic Indian slab and are marked `estimated`. The UI shows that
 * per-operator, and replacing any of them is a one-object edit.
 * ========================================================================== */

const GENERIC_INDIA_SLABS: DistanceSlab[] = [
  { maxKm: 2, fare: 10 },
  { maxKm: 5, fare: 20 },
  { maxKm: 12, fare: 30 },
  { maxKm: 21, fare: 40 },
  { maxKm: 32, fare: 50 },
  { maxKm: null, fare: 60 },
];

/** Build a config for a network whose exact table could not be verified. */
function estimatedNetwork(
  fareSystemId: string,
  operator: string,
  label: string,
  extra: Partial<FareConfig> = {},
): FareConfig {
  return {
    fareSystemId,
    operator,
    label,
    currency: 'INR',
    fareType: 'token',
    basis: 'distance',
    effectiveDate: '2026-11-10',
    effectiveDateIsPublished: false,
    confidence: 'estimated',
    sourceNote:
      `No published ${operator} fare chart could be verified, so this uses the `
      + 'distance slabs common to Indian metros (₹10/20/30/40/50/60). Treat the '
      + 'figure as indicative only. The date above is when this was last reviewed, '
      + 'not a published effective date.',
    slabs: GENERIC_INDIA_SLABS,
    discounts: { smartCard: 0.1, offPeakExtra: 0 },
    specialRules: [
      {
        id: 'unverified-table',
        description:
          `${operator}'s exact fare table could not be verified — this fare is a `
          + 'generic estimate and may differ from what you are charged.',
      },
      {
        id: 'single-fare-across-network',
        description:
          'A single distance-based fare covers the whole network; changing lines '
          + 'inside the paid area never triggers an additional fare.',
      },
    ],
    ...extra,
  };
}

/** Bengaluru — Namma Metro (BMRCL). */
export const NAMMA_METRO: FareConfig = {
  fareSystemId: 'nammaMetro',
  operator: 'BMRCL',
  label: 'Namma Metro, Bengaluru',
  currency: 'INR',
  fareType: 'token',
  basis: 'distance',
  effectiveDate: '2026-02-09',
  effectiveDateIsPublished: true,
  confidence: 'estimated',
  sourceNote:
    'Namma Metro fares were revised on 9 February 2026, now spanning roughly '
    + '₹11 to ₹95. Published slabs: 0–2 km ₹10, 2–5 ₹20, 5–10 ₹30, 10–15 ₹40, '
    + '15–20 ₹50, 20–25 ₹55, 25–30 ₹60. The slab list and the quoted ₹95 maximum '
    + 'do not fully reconcile in public sources, so long journeys are estimated.',
  slabs: [
    { maxKm: 2, fare: 10 },
    { maxKm: 5, fare: 20 },
    { maxKm: 10, fare: 30 },
    { maxKm: 15, fare: 40 },
    { maxKm: 20, fare: 50 },
    { maxKm: 25, fare: 55 },
    { maxKm: 30, fare: 60 },
    { maxKm: null, fare: 90 },
  ],
  discounts: { smartCard: 0.05, offPeakExtra: 0 },
  specialRules: [{
    id: 'single-fare-across-network',
    description: 'One distance-based fare covers the whole Namma Metro network.',
  }],
};

/** Hyderabad Metro — finer-grained slabs than most Indian networks. */
export const HYDERABAD_METRO: FareConfig = {
  fareSystemId: 'hyderabadMetro',
  operator: 'L&T Metro Rail Hyderabad',
  label: 'Hyderabad Metro',
  currency: 'INR',
  fareType: 'token',
  basis: 'distance',
  effectiveDate: '2026-11-10',
  effectiveDateIsPublished: false,
  confidence: 'official',
  sourceNote:
    'Hyderabad Metro publishes ten distance bands from ₹10 to ₹60: 0–2 ₹10, 2–4 ₹15, '
    + '4–6 ₹25, 6–8 ₹30, 8–10 ₹35, 10–14 ₹40, 14–18 ₹45, 18–22 ₹50, 22–26 ₹55, 26+ ₹60. '
    + 'No effective date is published, so the date above is when this was verified.',
  slabs: [
    { maxKm: 2, fare: 10 }, { maxKm: 4, fare: 15 }, { maxKm: 6, fare: 25 },
    { maxKm: 8, fare: 30 }, { maxKm: 10, fare: 35 }, { maxKm: 14, fare: 40 },
    { maxKm: 18, fare: 45 }, { maxKm: 22, fare: 50 }, { maxKm: 26, fare: 55 },
    { maxKm: null, fare: 60 },
  ],
  discounts: { smartCard: 0.1, offPeakExtra: 0 },
  specialRules: [{
    id: 'single-fare-across-network',
    description: 'One distance-based fare covers all three Hyderabad Metro lines.',
  }],
};

/** Kolkata — the cheapest metro in India. */
export const KOLKATA_METRO: FareConfig = {
  fareSystemId: 'kolkataMetro',
  operator: 'Metro Railway, Kolkata',
  label: 'Kolkata Metro',
  currency: 'INR',
  fareType: 'token',
  basis: 'distance',
  effectiveDate: '2026-11-10',
  effectiveDateIsPublished: false,
  confidence: 'estimated',
  sourceNote:
    'Kolkata Metro is India\'s cheapest: fares run ₹5–₹25 on the Blue Line and '
    + '₹5–₹30 on the Green, Purple, Orange and Yellow lines. Operated by Indian '
    + 'Railways rather than a metro corporation. The band boundaries are not '
    + 'published consistently, so the slabs below are interpolated between the '
    + 'known ₹5 minimum and ₹30 maximum.',
  slabs: [
    { maxKm: 2, fare: 5 }, { maxKm: 5, fare: 10 }, { maxKm: 10, fare: 15 },
    { maxKm: 20, fare: 20 }, { maxKm: 25, fare: 25 }, { maxKm: null, fare: 30 },
  ],
  discounts: { smartCard: 0.1, offPeakExtra: 0 },
  specialRules: [{
    id: 'kolkata-cheapest',
    description: 'Kolkata Metro fares are capped at ₹30, the lowest of any Indian metro.',
  }],
};

/** Kochi — priced by number of stations, like the NMRC Aqua Line. */
export const KOCHI_METRO: FareConfig = {
  fareSystemId: 'kochiMetro',
  operator: 'KMRL',
  label: 'Kochi Metro',
  currency: 'INR',
  fareType: 'token',
  basis: 'stationCount',
  effectiveDate: '2026-11-10',
  effectiveDateIsPublished: false,
  confidence: 'official',
  sourceNote:
    'KMRL prices by NUMBER OF STATIONS, not distance: 0–2 stations ₹10, 3–5 ₹20, '
    + '6–8 ₹30, 9–12 ₹40, 13–17 ₹50, 18+ ₹60. The Kochi1 card gives a discount. '
    + 'No effective date is published; the date above is when this was verified.',
  stationSlabs: [
    { maxStations: 2, fare: 10 }, { maxStations: 5, fare: 20 },
    { maxStations: 8, fare: 30 }, { maxStations: 12, fare: 40 },
    { maxStations: 17, fare: 50 }, { maxStations: null, fare: 60 },
  ],
  discounts: { smartCard: 0.1, offPeakExtra: 0 },
  specialRules: [{
    id: 'kochi-station-count',
    description: 'Kochi Metro charges by number of stations travelled, not by distance.',
  }],
};

export const MUMBAI_METRO = estimatedNetwork('mumbaiMetro', 'Mumbai Metro', 'Mumbai Metro');
export const NAVI_MUMBAI_METRO = estimatedNetwork('naviMumbaiMetro', 'MMMOCL', 'Navi Mumbai Metro');
export const JAIPUR_METRO = estimatedNetwork('jaipurMetro', 'JMRC', 'Jaipur Metro');
export const UP_METRO = estimatedNetwork('upMetro', 'UPMRC', 'UP Metro (Lucknow, Kanpur, Agra)');
export const NAGPUR_METRO = estimatedNetwork('nagpurMetro', 'MahaMetro', 'Nagpur Metro');
export const AHMEDABAD_METRO = estimatedNetwork('ahmedabadMetro', 'GMRC', 'Ahmedabad Metro');
export const PUNE_METRO = estimatedNetwork('puneMetro', 'MahaMetro', 'Pune Metro');
export const MP_METRO = estimatedNetwork('mpMetro', 'MPMRCL', 'MP Metro (Indore, Bhopal)');
export const PATNA_METRO = estimatedNetwork('patnaMetro', 'PMRC', 'Patna Metro');
export const MEERUT_METRO = estimatedNetwork('meerutMetro', 'NCRTC', 'Meerut Metro / Namo Bharat');
export const GENERIC_INDIA = estimatedNetwork('genericIndia', 'Unknown operator', 'Metro network');

export const FARE_CONFIGS: Record<string, FareConfig> = {
  dmrc: DMRC,
  airportExpress: AIRPORT_EXPRESS,
  nmrcAqua: NMRC_AQUA,
  rapidMetro: RAPID_METRO,
  cmrl: CMRL,
  nammaMetro: NAMMA_METRO,
  hyderabadMetro: HYDERABAD_METRO,
  kolkataMetro: KOLKATA_METRO,
  kochiMetro: KOCHI_METRO,
  mumbaiMetro: MUMBAI_METRO,
  naviMumbaiMetro: NAVI_MUMBAI_METRO,
  jaipurMetro: JAIPUR_METRO,
  upMetro: UP_METRO,
  nagpurMetro: NAGPUR_METRO,
  ahmedabadMetro: AHMEDABAD_METRO,
  puneMetro: PUNE_METRO,
  mpMetro: MP_METRO,
  patnaMetro: PATNA_METRO,
  meerutMetro: MEERUT_METRO,
  genericIndia: GENERIC_INDIA,
};

/** The newest effectiveDate across all operators — shown in the UI. */
export const FARE_DATA_VERSION = Object.values(FARE_CONFIGS)
  .map((c) => c.effectiveDate)
  .sort()
  .reverse()[0];

export function getFareConfig(fareSystemId: string): FareConfig | undefined {
  return FARE_CONFIGS[fareSystemId];
}
