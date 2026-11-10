/**
 * Metrorythm — AUTHORED SOURCE DATA: Chennai Metro (CMRL)
 * ---------------------------------------------------------------------------
 * Hand-authored, same rules as the Delhi dataset:
 *   - Only OPERATIONAL lines and sections. Phase 2's Red and Purple lines, and
 *     the Yellow Line beyond Vadapalani, are under construction and omitted.
 *   - Interchanges only where a real transfer exists today. Stations listed on
 *     Wikipedia as "interchange with <line> (under construction)" are NOT
 *     treated as interchanges, because that line does not yet run.
 *   - Suburban-rail and MRTS interchanges are noted as aliases/landmarks only;
 *     this app routes metro, so they are not graph edges.
 *
 * Network as of DATA_VERSION: 3 lines, 51 unique stations.
 *   Blue   26 stations  Wimco Nagar Depot - Chennai Airport
 *   Green  17 stations  MGR Central - St. Thomas Mount
 *   Yellow 11 stations  Poonamallee Bypass - Vadapalani (opened 11 Oct 2026)
 * Shared: MGR Central and Alandur (Blue/Green), Vadapalani (Green/Yellow).
 */

export const DATA_VERSION = '2026-11-10';

export const CITY = {
  cityId: 'chennai',
  cityName: 'Chennai',
  country: 'India',
  timezone: 'Asia/Kolkata',
  operators: ['Chennai Metro Rail Limited (CMRL)'],
  notes:
    'Covers the operational Chennai Metro network: Phase 1 (Blue and Green lines) '
    + 'and the Poonamallee Bypass - Vadapalani section of the Phase 2 Yellow Line, '
    + 'which opened on 11 October 2026. Under-construction corridors are not included.',
};

export const LINES = [
  {
    id: 'blue',
    name: 'Blue Line',
    code: 'Line 1',
    color: '#0A6FBA',
    operator: 'CMRL',
    fareSystem: 'cmrl',
    avgHopSeconds: 135,
    stations: [
      'Wimco Nagar Depot', 'Wimco Nagar', 'Tiruvottriyur', 'Tiruvottriyur Theradi',
      'Kaladipet', 'Tollgate', 'New Washermanpet', 'Tondiarpet',
      'Sir Theagaraya College', 'Washermanpet', 'Mannadi', 'High Court',
      'MGR Central', 'Government Estate', 'LIC', 'Thousand Lights', 'AG-DMS',
      'Teynampet', 'Nandanam', 'Saidapet', 'Little Mount', 'Guindy', 'Alandur',
      'Nanganallur Road', 'Meenambakkam', 'Chennai Airport',
    ],
  },
  {
    id: 'green',
    name: 'Green Line',
    code: 'Line 2',
    color: '#31A14B',
    operator: 'CMRL',
    fareSystem: 'cmrl',
    avgHopSeconds: 135,
    stations: [
      'MGR Central', 'Egmore', 'Nehru Park', 'Kilpauk Medical College',
      "Pachaiyappa's College", 'Shenoy Nagar', 'Anna Nagar East',
      'Anna Nagar Tower', 'Thirumangalam', 'Koyambedu', 'CMBT', 'Arumbakkam',
      'Vadapalani', 'Ashok Nagar', 'Ekkattuthangal', 'Alandur',
      'St. Thomas Mount',
    ],
  },
  {
    id: 'yellow',
    name: 'Yellow Line',
    code: 'Line 5',
    color: '#F7C600',
    operator: 'CMRL',
    fareSystem: 'cmrl',
    avgHopSeconds: 135,
    stations: [
      'Poonamallee Bypass', 'Poonamallee Bus Stand',
      'Poonamallee Government Hospital', 'Karayanchavadi', 'Kumananchavadi',
      'Kattupakkam', 'Iyyapanthangal', 'Thelliyaragaram', 'Porur Bypass',
      'Porur Junction', 'Vadapalani',
    ],
  },
];

/**
 * No out-of-station walking transfers exist on the operational network — every
 * interchange is a same-name, paid-area transfer, which the build script
 * derives automatically.
 */
export const TRANSFERS = [];

export const INTERCHANGE_WALK_SECONDS = {
  'MGR Central': 240,
  Alandur: 240,
  Vadapalani: 180,
};

export const AIRPORTS = [
  {
    iata: 'MAA',
    icao: 'VOMM',
    name: 'Chennai International Airport',
    city: 'Chennai',
    inThisDataset: true,
    terminals: [
      {
        terminal: 'All terminals',
        aliases: ['Chennai Airport', 'MAA Airport', 'Meenambakkam Airport'],
        station: 'Chennai Airport',
        note: 'The Blue Line terminates inside the airport complex, serving both the domestic and international terminals.',
      },
    ],
  },
];

export const LANDMARKS = [
  ['Chennai Central Railway Station', 'MGR Central'],
  ['Egmore Railway Station', 'Egmore'],
  ['Koyambedu Bus Terminus', 'CMBT'],
  ['Chennai Mofussil Bus Terminus', 'CMBT'],
  ['Guindy Railway Station', 'Guindy'],
  ['Vadapalani Murugan Temple', 'Vadapalani'],
  ['Anna Nagar Tower Park', 'Anna Nagar Tower'],
  ['Thousand Lights Mosque', 'Thousand Lights'],
  ['St. Thomas Mount Church', 'St. Thomas Mount'],
  ['Porur Lake', 'Porur Junction'],
];

export const STATION_ALIASES = {
  'MGR Central': [
    'Chennai Central',
    'Central',
    'Puratchi Thalaivar Dr. M.G. Ramachandran Central',
    'MGR Chennai Central',
  ],
  CMBT: [
    'Puratchi Thalaivi Dr. J. Jayalalithaa CMBT',
    'Koyambedu Bus Terminus',
    'Chennai Mofussil Bus Terminus',
  ],
  Alandur: ['Arignar Anna Alandur'],
  'Chennai Airport': ['Airport', 'MAA', 'Meenambakkam Airport'],
  Tiruvottriyur: ['Thiruvottiyur'],
  'Tiruvottriyur Theradi': ['Thiruvottiyur Theradi'],
  'New Washermanpet': ['New Washermenpet'],
  Washermanpet: ['Washermenpet'],
  'AG-DMS': ['AG DMS', 'Anna Government Hospital'],
  "Pachaiyappa's College": ['Pachaiyappas College', 'Pachaiyappa College'],
  'St. Thomas Mount': ['St Thomas Mount', 'Parangi Malai'],
  'Government Estate': ['Govt Estate'],
};
