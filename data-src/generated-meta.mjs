/**
 * Metrorythm — hand-authored metadata for the Wikidata-imported cities.
 *
 * The import gives us station names, order and coordinates. It does NOT give
 * us presentable line names, brand colours, operators or fare systems — those
 * are curated here.
 *
 * Anything absent from this file falls back to a derived default, and the
 * fallback is reported by the build so it can be filled in.
 */

/** Line brand colours, matched on the line label. */
export const COLOR_BY_NAME = {
  red: '#E4322B',
  blue: '#0A6FBA',
  green: '#31A14B',
  yellow: '#F7C600',
  purple: '#7B3F98',
  violet: '#7B3F98',
  pink: '#E6568E',
  magenta: '#B5338A',
  orange: '#F57B20',
  aqua: '#00B6D3',
  grey: '#8A8D8F',
  gray: '#8A8D8F',
};

const FALLBACK_COLORS = ['#0A6FBA', '#E4322B', '#31A14B', '#F57B20', '#7B3F98', '#00B6D3'];

/**
 * Per-city overrides. `lines` maps the imported Wikidata label to a display
 * name and colour; numbered lines carry no colour in their label, so these are
 * the officially branded colours.
 */
export const CITY_META = {
  mumbai: {
    cityName: 'Mumbai',
    operators: ['Mumbai Metro Rail Corporation (MMRC)', 'Maha Mumbai Metro (MMMOCL)', 'Mumbai Metro One'],
    fareSystem: 'mumbaiMetro',
    lines: {
      'Line 1': { name: 'Line 1 (Blue)', color: '#0A6FBA' },
      'Line 2': { name: 'Line 2A (Yellow)', color: '#F7C600' },
      'Line 3': { name: 'Line 3 (Aqua)', color: '#00B6D3' },
      'Line 7': { name: 'Line 7 (Red)', color: '#E4322B' },
      'Line 9': { name: 'Line 9 (Red)', color: '#C0392B' },
    },
  },
  'navi-mumbai': {
    cityName: 'Navi Mumbai',
    operators: ['Maha Mumbai Metro Operation Corporation (MMMOCL)'],
    fareSystem: 'naviMumbaiMetro',
    lines: { 'Line 1': { name: 'Line 1', color: '#31A14B' } },
  },
  bengaluru: {
    cityName: 'Bengaluru',
    operators: ['Bangalore Metro Rail Corporation (BMRCL)'],
    fareSystem: 'nammaMetro',
    lines: {},
  },
  hyderabad: {
    cityName: 'Hyderabad',
    operators: ['L&T Metro Rail Hyderabad / HMRL'],
    fareSystem: 'hyderabadMetro',
    lines: {},
  },
  kolkata: {
    cityName: 'Kolkata',
    operators: ['Metro Railway, Kolkata (Indian Railways)'],
    fareSystem: 'kolkataMetro',
    lines: {},
  },
  kochi: {
    cityName: 'Kochi',
    operators: ['Kochi Metro Rail Limited (KMRL)'],
    fareSystem: 'kochiMetro',
    lines: { 'Line 1': { name: 'Blue Line', color: '#0A6FBA' } },
  },
  jaipur: {
    cityName: 'Jaipur',
    operators: ['Jaipur Metro Rail Corporation (JMRC)'],
    fareSystem: 'jaipurMetro',
    lines: {},
  },
  lucknow: {
    cityName: 'Lucknow',
    operators: ['Uttar Pradesh Metro Rail Corporation (UPMRC)'],
    fareSystem: 'upMetro',
    lines: {},
  },
  kanpur: {
    cityName: 'Kanpur',
    operators: ['Uttar Pradesh Metro Rail Corporation (UPMRC)'],
    fareSystem: 'upMetro',
    lines: {},
  },
  agra: {
    cityName: 'Agra',
    operators: ['Uttar Pradesh Metro Rail Corporation (UPMRC)'],
    fareSystem: 'upMetro',
    lines: {},
  },
  meerut: {
    cityName: 'Meerut',
    operators: ['National Capital Region Transport Corporation (NCRTC)'],
    fareSystem: 'meerutMetro',
    lines: {
      Q138498887: { name: 'Meerut Metro', color: '#E4322B' },
      'Delhi–Meerut Regional Rapid Transit System': { name: 'Namo Bharat (RRTS)', color: '#F57B20' },
    },
  },
  nagpur: {
    cityName: 'Nagpur',
    operators: ['Maharashtra Metro Rail Corporation (MahaMetro)'],
    fareSystem: 'nagpurMetro',
    lines: {},
  },
  ahmedabad: {
    cityName: 'Ahmedabad',
    operators: ['Gujarat Metro Rail Corporation (GMRC)'],
    fareSystem: 'ahmedabadMetro',
    lines: {},
  },
  pune: {
    cityName: 'Pune',
    operators: ['Maharashtra Metro Rail Corporation (MahaMetro)'],
    fareSystem: 'puneMetro',
    lines: {},
  },
  indore: {
    cityName: 'Indore',
    operators: ['Madhya Pradesh Metro Rail Corporation (MPMRCL)'],
    fareSystem: 'mpMetro',
    lines: {},
  },
  bhopal: {
    cityName: 'Bhopal',
    operators: ['Madhya Pradesh Metro Rail Corporation (MPMRCL)'],
    fareSystem: 'mpMetro',
    lines: {},
  },
  patna: {
    cityName: 'Patna',
    operators: ['Patna Metro Rail Corporation (PMRC)'],
    fareSystem: 'patnaMetro',
    lines: {},
  },
};

/** Strip Wikidata's article-title noise from a station label. */
export function cleanStationName(raw) {
  let n = raw;
  n = n.replace(/\s*\bmetro\s+station\b\s*/gi, ' ');
  n = n.replace(/\s*\brailway\s+station\b\s*/gi, ' ');
  n = n.replace(/\s*\bmetro\b\s*$/gi, ' ');
  n = n.replace(/\s{2,}/g, ' ').trim();
  n = n.replace(/\s*,\s*$/, '').trim();
  return n || raw;
}

/** Pick a colour for a line, from its label where possible. */
export function colorForLine(label, index) {
  const lower = label.toLowerCase();
  for (const [key, hex] of Object.entries(COLOR_BY_NAME)) {
    if (lower.includes(key)) return hex;
  }
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

/** Tidy a line label for display. */
export function cleanLineName(label, cityId) {
  const override = CITY_META[cityId]?.lines?.[label];
  if (override) return override.name;
  // "Pink Line (Pune metro)" -> "Pink Line"
  return label.replace(/\s*\([^)]*\)\s*$/, '').trim();
}
