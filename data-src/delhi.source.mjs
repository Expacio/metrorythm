/**
 * Metrorythm — AUTHORED SOURCE DATA: Delhi Metro + Delhi NCR connected networks
 * ---------------------------------------------------------------------------
 * This file is hand-authored and is the single source of truth for the Delhi
 * network topology (lines, station order, interchanges, fares, landmarks).
 *
 * `npm run build:data` reads this file, attaches station coordinates, and emits
 * src/data/cities/delhi.json. The application itself NEVER reads this file and
 * NEVER performs any network request — it imports only the generated JSON.
 *
 * ACCURACY RULES FOLLOWED HERE:
 *   - Only lines/sections that are OPERATIONAL are listed. Under-construction
 *     corridors (e.g. Golden Line Aerocity–Tughlakabad, Phase IV extensions)
 *     are intentionally omitted rather than guessed.
 *   - Interchanges are only listed where a real paid-area or recognised
 *     out-of-station transfer exists.
 *   - Timings and fares are clearly flagged as ESTIMATES in the UI.
 *
 * DATA VERSION: see DATA_VERSION below.
 */

export const DATA_VERSION = '2026-11-10';

export const CITY = {
  cityId: 'delhi',
  cityName: 'Delhi NCR',
  country: 'India',
  timezone: 'Asia/Kolkata',
  operators: [
    'Delhi Metro Rail Corporation (DMRC)',
    'Noida Metro Rail Corporation (NMRC)',
  ],
  notes:
    'Covers the Delhi Metro network (Phases I–III incl. operational Phase III/IV ' +
    'extensions), the Airport Express line, the Gurugram Rapid Metro, and the ' +
    'NMRC Aqua Line. Under-construction corridors are not included.',
};

/**
 * Fare systems. Delhi Metro uses distance slabs; the Airport Express and the
 * Aqua Line have their own tables. All marked ESTIMATED in the UI because
 * actual fares vary by smart-card discount, day of week and time of day.
 */
export const FARE_SYSTEMS = {
  dmrc: {
    id: 'dmrc',
    label: 'DMRC distance slabs',
    currency: 'INR',
    estimated: true,
    note: 'Standard (token) fares. Smart-card journeys are ~10% cheaper, and off-peak/Sunday fares are lower.',
    slabs: [
      { maxKm: 2, fare: 10 },
      { maxKm: 5, fare: 20 },
      { maxKm: 12, fare: 30 },
      { maxKm: 21, fare: 40 },
      { maxKm: 32, fare: 50 },
      { maxKm: Infinity, fare: 60 },
    ],
  },
  airportExpress: {
    id: 'airportExpress',
    label: 'Airport Express (Orange Line) fares',
    currency: 'INR',
    estimated: true,
    note: 'The Airport Express has its own fare table, separate from the rest of the DMRC network.',
    slabs: [
      { maxKm: 2, fare: 20 },
      { maxKm: 5, fare: 30 },
      { maxKm: 12, fare: 40 },
      { maxKm: 21, fare: 50 },
      { maxKm: 32, fare: 60 },
      { maxKm: Infinity, fare: 60 },
    ],
  },
  nmrcAqua: {
    id: 'nmrcAqua',
    label: 'NMRC Aqua Line fares',
    currency: 'INR',
    estimated: true,
    note: 'Noida Metro Rail Corporation operates the Aqua Line with its own fare table.',
    slabs: [
      { maxKm: 2, fare: 10 },
      { maxKm: 5, fare: 15 },
      { maxKm: 12, fare: 20 },
      { maxKm: 21, fare: 30 },
      { maxKm: 32, fare: 40 },
      { maxKm: Infinity, fare: 50 },
    ],
  },
  rapidMetro: {
    id: 'rapidMetro',
    label: 'Gurugram Rapid Metro fares',
    currency: 'INR',
    estimated: true,
    note: 'Rapid Metro Gurugram operates a short flat-ish fare table.',
    slabs: [
      { maxKm: 2, fare: 20 },
      { maxKm: 5, fare: 25 },
      { maxKm: 12, fare: 30 },
      { maxKm: Infinity, fare: 35 },
    ],
  },
};

/**
 * Lines. `stations` is the ordered sequence of station display names.
 * `avgHopSeconds` is the estimated in-motion + dwell time between adjacent
 * stations on that line (Airport Express is express-running, hence higher
 * speed / longer spacing).
 */
export const LINES = [
  {
    id: 'red',
    name: 'Red Line',
    code: 'Line 1',
    color: '#E4322B',
    operator: 'DMRC',
    fareSystem: 'dmrc',
    avgHopSeconds: 140,
    stations: [
      'Rithala', 'Rohini West', 'Rohini East', 'Pitampura', 'Kohat Enclave',
      'Netaji Subhash Place', 'Keshav Puram', 'Kanhaiya Nagar', 'Inderlok',
      'Shastri Nagar', 'Pratap Nagar', 'Pulbangash', 'Tis Hazari',
      'Kashmere Gate', 'Shastri Park', 'Seelampur', 'Welcome', 'Shahdara',
      'Mansarovar Park', 'Jhilmil', 'Dilshad Garden', 'Shahid Nagar',
      'Raj Bagh', 'Rajendra Nagar', 'Shyam Park', 'Mohan Nagar', 'Arthala',
      'Hindon River', 'Shaheed Sthal (New Bus Adda)',
    ],
  },
  {
    id: 'yellow',
    name: 'Yellow Line',
    code: 'Line 2',
    color: '#F7C600',
    operator: 'DMRC',
    fareSystem: 'dmrc',
    avgHopSeconds: 140,
    stations: [
      'Samaypur Badli', 'Rohini Sector 18-19', 'Haiderpur Badli Mor',
      'Jahangirpuri', 'Adarsh Nagar', 'Azadpur', 'Model Town', 'GTB Nagar',
      'Vishwavidyalaya', 'Vidhan Sabha', 'Civil Lines', 'Kashmere Gate',
      'Chandni Chowk', 'Chawri Bazar', 'New Delhi', 'Rajiv Chowk',
      'Patel Chowk', 'Central Secretariat', 'Udyog Bhawan', 'Lok Kalyan Marg',
      'Jor Bagh', 'INA', 'AIIMS', 'Green Park', 'Hauz Khas', 'Malviya Nagar',
      'Saket', 'Qutab Minar', 'Chhatarpur', 'Sultanpur', 'Ghitorni',
      'Arjan Garh', 'Guru Dronacharya', 'Sikanderpur', 'MG Road',
      'IFFCO Chowk', 'Millennium City Centre Gurugram',
    ],
  },
  {
    id: 'blue',
    name: 'Blue Line',
    code: 'Line 3',
    color: '#0A6FBA',
    operator: 'DMRC',
    fareSystem: 'dmrc',
    avgHopSeconds: 140,
    stations: [
      'Dwarka Sector 21', 'Dwarka Sector 8', 'Dwarka Sector 9',
      'Dwarka Sector 10', 'Dwarka Sector 11', 'Dwarka Sector 12',
      'Dwarka Sector 13', 'Dwarka Sector 14', 'Dwarka', 'Dwarka Mor',
      'Nawada', 'Uttam Nagar West', 'Uttam Nagar East', 'Janak Puri West',
      'Janak Puri East', 'Tilak Nagar', 'Subhash Nagar', 'Tagore Garden',
      'Rajouri Garden', 'Ramesh Nagar', 'Moti Nagar', 'Kirti Nagar',
      'Shadipur', 'Patel Nagar', 'Rajendra Place', 'Karol Bagh',
      'Jhandewalan', 'Ramakrishna Ashram Marg', 'Rajiv Chowk',
      'Barakhamba Road', 'Mandi House', 'Supreme Court', 'Indraprastha',
      'Yamuna Bank', 'Akshardham', 'Mayur Vihar-I', 'Mayur Vihar Extension',
      'New Ashok Nagar', 'Noida Sector 15', 'Noida Sector 16',
      'Noida Sector 18', 'Botanical Garden', 'Golf Course',
      'Noida City Centre', 'Noida Sector 34', 'Noida Sector 52',
      'Noida Sector 61', 'Noida Sector 59', 'Noida Sector 62',
      'Noida Electronic City',
    ],
  },
  {
    id: 'blue-branch',
    name: 'Blue Line (Vaishali Branch)',
    code: 'Line 4',
    color: '#4FA3DC',
    operator: 'DMRC',
    fareSystem: 'dmrc',
    avgHopSeconds: 140,
    parentLine: 'blue',
    stations: [
      'Yamuna Bank', 'Laxmi Nagar', 'Nirman Vihar', 'Preet Vihar',
      'Karkarduma', 'Anand Vihar ISBT', 'Kaushambi', 'Vaishali',
    ],
  },
  {
    id: 'green',
    name: 'Green Line',
    code: 'Line 5',
    color: '#31A14B',
    operator: 'DMRC',
    fareSystem: 'dmrc',
    avgHopSeconds: 140,
    stations: [
      'Inderlok', 'Ashok Park Main', 'Punjabi Bagh', 'Shivaji Park',
      'Madipur', 'Paschim Vihar East', 'Paschim Vihar West', 'Peera Garhi',
      'Udyog Nagar', 'Maharaja Surajmal Stadium', 'Nangloi',
      'Nangloi Railway Station', 'Rajdhani Park', 'Mundka',
      'Mundka Industrial Area', 'Ghevra', 'Tikri Kalan', 'Tikri Border',
      'Pandit Shree Ram Sharma', 'Bahadurgarh City',
      'Brigadier Hoshiyar Singh',
    ],
  },
  {
    id: 'green-branch',
    name: 'Green Line (Kirti Nagar Branch)',
    code: 'Line 5A',
    color: '#7CC47F',
    operator: 'DMRC',
    fareSystem: 'dmrc',
    avgHopSeconds: 140,
    parentLine: 'green',
    stations: ['Ashok Park Main', 'Satguru Ram Singh Marg', 'Kirti Nagar'],
  },
  {
    id: 'violet',
    name: 'Violet Line',
    code: 'Line 6',
    color: '#7B3F98',
    operator: 'DMRC',
    fareSystem: 'dmrc',
    avgHopSeconds: 140,
    stations: [
      'Kashmere Gate', 'Lal Qila', 'Jama Masjid', 'Delhi Gate', 'ITO',
      'Mandi House', 'Janpath', 'Central Secretariat', 'Khan Market',
      'Jawaharlal Nehru Stadium', 'Jangpura', 'Lajpat Nagar', 'Moolchand',
      'Kailash Colony', 'Nehru Place', 'Kalkaji Mandir', 'Govind Puri',
      'Harkesh Nagar Okhla', 'Jasola Apollo', 'Sarita Vihar', 'Mohan Estate',
      'Tughlakabad Station', 'Badarpur Border', 'Sarai', 'NHPC Chowk',
      'Mewala Maharajpur', 'Sector 28 Faridabad', 'Badkal Mor',
      'Old Faridabad', 'Neelam Chowk Ajronda', 'Bata Chowk',
      'Escorts Mujesar', 'Sant Surdas (Sihi)', 'Raja Nahar Singh',
    ],
  },
  {
    id: 'pink',
    name: 'Pink Line',
    code: 'Line 7',
    color: '#E6568E',
    operator: 'DMRC',
    fareSystem: 'dmrc',
    avgHopSeconds: 140,
    stations: [
      'Majlis Park', 'Azadpur', 'Shalimar Bagh', 'Netaji Subhash Place',
      'Shakurpur', 'Punjabi Bagh West', 'ESI Hospital', 'Rajouri Garden',
      'Mayapuri', 'Naraina Vihar', 'Delhi Cantt',
      'Durgabai Deshmukh South Campus', 'Sir Vishweshwaraiah Moti Bagh',
      'Bhikaji Cama Place', 'Sarojini Nagar', 'INA', 'South Extension',
      'Lajpat Nagar', 'Vinobapuri', 'Ashram', 'Hazrat Nizamuddin',
      'Mayur Vihar-I', 'Mayur Vihar Pocket 1', 'Trilokpuri Sanjay Lake',
      'East Vinod Nagar-Mayur Vihar-II', 'Mandawali-West Vinod Nagar',
      'IP Extension', 'Anand Vihar ISBT', 'Karkarduma', 'Karkarduma Court',
      'Krishna Nagar', 'East Azad Nagar', 'Welcome', 'Jaffrabad',
      'Maujpur-Babarpur', 'Gokulpuri', 'Johri Enclave', 'Shiv Vihar',
    ],
  },
  {
    id: 'magenta',
    name: 'Magenta Line',
    code: 'Line 8',
    color: '#B5338A',
    operator: 'DMRC',
    fareSystem: 'dmrc',
    avgHopSeconds: 140,
    stations: [
      'Janak Puri West', 'Dabri Mor-Janakpuri South', 'Dashrath Puri',
      'Palam', 'Sadar Bazaar Cantonment', 'Terminal 1-IGI Airport',
      'Shankar Vihar', 'Vasant Vihar', 'Munirka', 'R.K. Puram', 'IIT Delhi',
      'Hauz Khas', 'Panchsheel Park', 'Chirag Delhi', 'Greater Kailash',
      'Nehru Enclave', 'Kalkaji Mandir', 'Okhla NSIC', 'Sukhdev Vihar',
      'Jamia Millia Islamia', 'Okhla Vihar', 'Jasola Vihar Shaheen Bagh',
      'Kalindi Kunj', 'Okhla Bird Sanctuary', 'Botanical Garden',
    ],
  },
  {
    id: 'grey',
    name: 'Grey Line',
    code: 'Line 9',
    color: '#8A8D8F',
    operator: 'DMRC',
    fareSystem: 'dmrc',
    avgHopSeconds: 140,
    stations: ['Dwarka', 'Nangli', 'Najafgarh', 'Dhansa Bus Stand'],
  },
  {
    id: 'airport',
    name: 'Airport Express',
    code: 'Orange Line',
    color: '#F57B20',
    operator: 'DMRC',
    fareSystem: 'airportExpress',
    avgHopSeconds: 230,
    isExpress: true,
    stations: [
      'New Delhi', 'Shivaji Stadium', 'Dhaula Kuan', 'Delhi Aerocity',
      'IGI Airport (Terminal 3)', 'Dwarka Sector 21',
      'Yashobhoomi Dwarka Sector 25',
    ],
  },
  {
    id: 'aqua',
    name: 'Aqua Line',
    code: 'NMRC',
    color: '#00B6D3',
    operator: 'NMRC',
    fareSystem: 'nmrcAqua',
    avgHopSeconds: 150,
    stations: [
      'Noida Sector 51', 'Noida Sector 50', 'Noida Sector 76',
      'Noida Sector 101', 'Noida Sector 81', 'NSEZ', 'Noida Sector 83',
      'Noida Sector 137', 'Noida Sector 142', 'Noida Sector 143',
      'Noida Sector 144', 'Noida Sector 145', 'Noida Sector 146',
      'Noida Sector 147', 'Noida Sector 148', 'Knowledge Park II',
      'Pari Chowk', 'Alpha 1', 'Delta 1', 'GNIDA Office', 'Depot Station',
    ],
  },
  {
    id: 'rapid',
    name: 'Rapid Metro Gurugram',
    code: 'Rapid',
    color: '#00A0AF',
    operator: 'DMRC',
    fareSystem: 'rapidMetro',
    avgHopSeconds: 110,
    // The northern section is a one-way loop that returns to Sikanderpur.
    loopsBackTo: 'Sikanderpur',
    stations: [
      'Sector 55-56', 'Sector 54 Chowk', 'Sector 53-54', 'Sector 42-43',
      'Sikanderpur', 'Phase 2', 'Belvedere Towers', 'Cyber City',
      'Moulsari Avenue', 'Phase 3', 'Phase 1',
    ],
  },
];

/**
 * Out-of-station / walking interchanges. Stations that share the SAME NAME
 * across lines are automatically treated as paid-area interchanges by the
 * build script, so they are not repeated here.
 *
 * Only real, signposted transfers are listed. Pairs of nearby-but-unconnected
 * stations (e.g. Punjabi Bagh vs Punjabi Bagh West) are deliberately NOT listed.
 */
export const TRANSFERS = [
  {
    a: 'Noida Sector 52',
    b: 'Noida Sector 51',
    walkSeconds: 420,
    paidArea: false,
    note: 'Blue Line ↔ Aqua Line via the ~300 m foot overbridge. Separate ticketing — you must exit and re-enter.',
  },
  {
    a: 'Dhaula Kuan',
    b: 'Durgabai Deshmukh South Campus',
    walkSeconds: 360,
    paidArea: false,
    note: 'Airport Express ↔ Pink Line via the Dhaula Kuan skywalk. Requires exiting and re-entering.',
  },
];

/**
 * Interchanges that exist because two lines share a station NAME, annotated
 * with a realistic platform-to-platform walking time. Anything not listed
 * here gets the default of 180 s.
 */
export const INTERCHANGE_WALK_SECONDS = {
  'Kashmere Gate': 300,
  'Rajiv Chowk': 180,
  'Central Secretariat': 240,
  'Mandi House': 180,
  'Hauz Khas': 300,
  'Kalkaji Mandir': 210,
  'Botanical Garden': 240,
  'Janak Puri West': 240,
  'Azadpur': 240,
  'INA': 210,
  'Lajpat Nagar': 240,
  'Welcome': 210,
  'Netaji Subhash Place': 210,
  'Rajouri Garden': 210,
  'Inderlok': 180,
  'Kirti Nagar': 210,
  'Mayur Vihar-I': 210,
  'Anand Vihar ISBT': 240,
  'Karkarduma': 210,
  'Dwarka Sector 21': 300,
  'New Delhi': 420, // Yellow Line ↔ Airport Express involves a long walk
  'Dwarka': 180,
  'Sikanderpur': 240,
  'Yamuna Bank': 120,
  'Ashok Park Main': 120,
};

/**
 * Airports and their metro access points. `station` must exist in a line above.
 */
export const AIRPORTS = [
  {
    iata: 'DEL',
    icao: 'VIDP',
    name: 'Indira Gandhi International Airport',
    city: 'Delhi',
    inThisDataset: true,
    terminals: [
      {
        terminal: 'T3',
        aliases: ['Terminal 3', 'T3', 'DEL T3', 'International Terminal'],
        station: 'IGI Airport (Terminal 3)',
        note: 'Direct Airport Express station inside Terminal 3.',
      },
      {
        terminal: 'T2',
        aliases: ['Terminal 2', 'T2', 'DEL T2'],
        station: 'IGI Airport (Terminal 3)',
        note: 'No dedicated station. Alight at IGI Airport (Terminal 3) and use the free inter-terminal shuttle to T2 (~5 min).',
      },
      {
        terminal: 'T1',
        aliases: ['Terminal 1', 'T1', 'DEL T1', 'Domestic Terminal'],
        station: 'Terminal 1-IGI Airport',
        note: 'Served directly by the Magenta Line station Terminal 1-IGI Airport.',
      },
    ],
  },
  {
    iata: 'BOM',
    icao: 'VABB',
    name: 'Chhatrapati Shivaji Maharaj International Airport',
    city: 'Mumbai',
    inThisDataset: false,
    note: 'Mumbai Metro is not included in this data build. No route can be planned.',
    terminals: [],
  },
  {
    iata: 'MAA',
    icao: 'VOMM',
    name: 'Chennai International Airport',
    city: 'Chennai',
    inThisDataset: false,
    note: 'Chennai Metro is not included in this data build. No route can be planned.',
    terminals: [],
  },
  {
    iata: 'HDO',
    icao: 'VIDX',
    name: 'Hindon Airport',
    city: 'Ghaziabad',
    inThisDataset: true,
    terminals: [
      {
        terminal: 'Main',
        aliases: ['Hindon Airport', 'Hindon Domestic'],
        station: 'Shaheed Sthal (New Bus Adda)',
        note: 'Nearest metro railhead. Hindon Airport itself is ~6 km away by road — the metro does not reach the terminal.',
      },
    ],
  },
];

/**
 * Popular landmarks → nearest station. Used by search only; never used for routing.
 */
export const LANDMARKS = [
  ['Connaught Place', 'Rajiv Chowk'],
  ['CP', 'Rajiv Chowk'],
  ['Red Fort', 'Lal Qila'],
  ['Qutub Minar', 'Qutab Minar'],
  ['India Gate', 'Supreme Court'],
  ['Lotus Temple', 'Kalkaji Mandir'],
  ['Akshardham Temple', 'Akshardham'],
  ['Humayuns Tomb', 'Jawaharlal Nehru Stadium'],
  ['Jama Masjid', 'Jama Masjid'],
  ['Chandni Chowk Market', 'Chandni Chowk'],
  ['Sarojini Nagar Market', 'Sarojini Nagar'],
  ['Dilli Haat', 'INA'],
  ['Khan Market', 'Khan Market'],
  ['Hauz Khas Village', 'Hauz Khas'],
  ['Select Citywalk', 'Malviya Nagar'],
  ['Lodhi Garden', 'Jor Bagh'],
  ['Pragati Maidan', 'Supreme Court'],
  ['New Delhi Railway Station', 'New Delhi'],
  ['NDLS', 'New Delhi'],
  ['Old Delhi Railway Station', 'Chandni Chowk'],
  ['Hazrat Nizamuddin Railway Station', 'Hazrat Nizamuddin'],
  ['Anand Vihar Railway Terminal', 'Anand Vihar ISBT'],
  ['Kashmere Gate ISBT', 'Kashmere Gate'],
  ['Sarai Kale Khan', 'Hazrat Nizamuddin'],
  ['AIIMS Hospital', 'AIIMS'],
  ['Safdarjung Hospital', 'AIIMS'],
  ['IIT Delhi Campus', 'IIT Delhi'],
  ['JNU', 'Munirka'],
  ['Jawaharlal Nehru University', 'Munirka'],
  ['Delhi University North Campus', 'Vishwavidyalaya'],
  ['Delhi University South Campus', 'Durgabai Deshmukh South Campus'],
  ['Jamia Millia Islamia University', 'Jamia Millia Islamia'],
  ['DLF Cyber City', 'Cyber City'],
  ['DLF CyberHub', 'Cyber City'],
  ['Ambience Mall Gurgaon', 'Moulsari Avenue'],
  ['Kingdom of Dreams', 'IFFCO Chowk'],
  ['DLF Mall of India', 'Noida Sector 18'],
  ['Noida Sector 18 Market', 'Noida Sector 18'],
  ['Worlds of Wonder', 'Noida Sector 18'],
  ['Nehru Place Market', 'Nehru Place'],
  ['Okhla Bird Sanctuary Park', 'Okhla Bird Sanctuary'],
  ['Gandhi Smriti', 'Lok Kalyan Marg'],
  ['Rashtrapati Bhavan', 'Central Secretariat'],
  ['Parliament House', 'Central Secretariat'],
  ['Supreme Court of India', 'Supreme Court'],
  ['Jantar Mantar', 'Patel Chowk'],
  ['Karol Bagh Market', 'Karol Bagh'],
  ['Lajpat Nagar Central Market', 'Lajpat Nagar'],
  ['Garden of Five Senses', 'Saket'],
  ['Siri Fort', 'Panchsheel Park'],
  ['Thyagaraj Stadium', 'INA'],
  ['Feroz Shah Kotla', 'Delhi Gate'],
  ['Arun Jaitley Stadium', 'Delhi Gate'],
  ['Mahatma Gandhi Marg', 'MG Road'],
];

/**
 * Additional station aliases / common abbreviations and spellings.
 * Key = canonical station name from the LINES arrays above.
 */
export const STATION_ALIASES = {
  'Rajiv Chowk': ['Connaught Place', 'CP', 'Rajeev Chowk'],
  'Millennium City Centre Gurugram': ['HUDA City Centre', 'HUDA City Center', 'Gurgaon HUDA', 'MCC Gurugram'],
  'Supreme Court': ['Pragati Maidan', 'Supreme Court (Pragati Maidan)'],
  'Lok Kalyan Marg': ['Race Course'],
  'Vishwavidyalaya': ['Delhi University', 'DU North Campus', 'Vishwa Vidyalaya'],
  'Durgabai Deshmukh South Campus': ['South Campus', 'DU South Campus'],
  'Shaheed Sthal (New Bus Adda)': ['New Bus Adda', 'Shaheed Sthal', 'Ghaziabad New Bus Adda'],
  'IGI Airport (Terminal 3)': ['Airport', 'IGI Airport', 'Terminal 3', 'T3', 'DEL Airport', 'Delhi Airport'],
  'Terminal 1-IGI Airport': ['Terminal 1', 'T1 IGI', 'Domestic Airport', 'Airport Terminal 1'],
  'Delhi Aerocity': ['Aerocity'],
  'Kashmere Gate': ['Kashmiri Gate', 'ISBT Kashmere Gate'],
  'Netaji Subhash Place': ['NSP', 'Netaji Subhash Place Pitampura'],
  'Jawaharlal Nehru Stadium': ['JLN Stadium'],
  'Hazrat Nizamuddin': ['Nizamuddin', 'Sarai Kale Khan Nizamuddin'],
  'Anand Vihar ISBT': ['Anand Vihar'],
  'Janak Puri West': ['Janakpuri West'],
  'Janak Puri East': ['Janakpuri East'],
  'Escorts Mujesar': ['Mujesar'],
  'Mundka Industrial Area': ['MIA', 'Mundka Industrial Area (MIA)'],
  'Sector 28 Faridabad': ['Sector 28'],
  'Qutab Minar': ['Qutub Minar'],
  'Okhla NSIC': ['NSIC'],
  'Noida Sector 51': ['Sector 51 Noida'],
  'Noida Sector 52': ['Sector 52 Noida'],
  'Cyber City': ['DLF Cyber City', 'Cybercity'],
  'Millennium City Centre Gurugram ': [],
  'Brigadier Hoshiyar Singh': ['Bahadurgarh', 'Brig Hoshiyar Singh'],
  'Shaheed Nagar': [],
  'Depot Station': ['Greater Noida Depot'],
  'Pandit Shree Ram Sharma': ['Pt Shree Ram Sharma'],
  'Sant Surdas (Sihi)': ['Sant Surdas', 'Sihi'],
  'Raja Nahar Singh': ['Ballabgarh', 'Raja Nahar Singh Ballabgarh'],
  'Dwarka Sector 21': ['Dwarka Sec 21'],
  'Yashobhoomi Dwarka Sector 25': ['Yashobhoomi', 'Dwarka Sector 25', 'India International Convention Centre'],
  'Shivaji Stadium': ['Shivaji Stadium Metro Station'],
  'Trilokpuri Sanjay Lake': ['Trilokpuri'],
  'East Vinod Nagar-Mayur Vihar-II': ['Mayur Vihar II', 'East Vinod Nagar'],
  'Mandawali-West Vinod Nagar': ['Mandawali', 'West Vinod Nagar'],
  'Maujpur-Babarpur': ['Maujpur', 'Babarpur'],
  'Dabri Mor-Janakpuri South': ['Dabri Mor', 'Janakpuri South'],
  'Sadar Bazaar Cantonment': ['Sadar Bazar Cantonment'],
  'Haiderpur Badli Mor': ['Badli Mor', 'Haiderpur'],
  'Rohini Sector 18-19': ['Rohini Sector 18', 'Rohini Sector 19'],
};
