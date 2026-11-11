/**
 * Map Metrorythm's Delhi station ids to DMRC's own station codes.
 *
 * The mapping is by normalised station name against DMRC's published per-line
 * station lists, with an explicit override table for the cases where DMRC's
 * name and ours genuinely differ (renamings, abbreviations, word order).
 * Anything that cannot be matched is reported rather than guessed, because a
 * wrong code would silently attach one station's distances to another.
 *
 * Run: node scripts/fetch-delhi-codes.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DELHI = join(ROOT, 'src', 'data', 'cities', 'delhi.json');
const OUT = join(ROOT, 'data-src', 'generated', 'delhi-station-codes.json');

const DMRC_LINES = [
  'LN1', 'LN2', 'LN3', 'LN4', 'LN5', 'LN6',
  'LN7', 'LN7EXTN', 'LN8', 'LN8EXTN', 'LN9', 'LN10', 'LN11',
];
const DMRC_API = 'https://dmrc-rest-api.vercel.app/api/v1/dmrc';
const NMRC_API = 'https://dmrc-rest-api.vercel.app/api/v1/nmrc';

/**
 * Cases where DMRC's name cannot be matched to ours by normalisation alone.
 * Each is a deliberate, checkable decision rather than a fuzzy guess.
 */
const OVERRIDES = {
  'igi-airport-terminal-3': 'APOT',        // DMRC: "AIRPORT (T-3)"
  'terminal-1-igi-airport': 'IGDA',
  'noida-sector-34': 'STFN',               // DMRC writes "SECTOR - 34 NOIDA"
  'noida-sector-52': 'SFTN',
  'noida-sector-61': 'SSON',
  'noida-sector-59': 'SFNN',
  'noida-sector-62': 'SSTN',
  'gtb-nagar': 'GTBR',                     // "GURU TEG BAHADUR NAGAR"
  'lal-qila': 'LLQA',                      // DMRC spells it "LAL QUILA"
  'rajendra-nagar': 'RJNM',                // "MAJOR MOHIT SHARMA RAJENDRA NAGAR"
  'sadar-bazaar-cantonment': 'SABR',
  'ina': 'INA',                            // "DILLI HAAT - INA"
  'hazrat-nizamuddin': 'NIZM',             // "SARAI KALE KHAN - NIZAMUDDIN"
  'jaffrabad': 'JFRB',
  'iit-delhi': 'IIT',
  'esi-hospital': 'ESIH',                  // "ESI-BASAIDARAPUR"
  'sir-vishweshwaraiah-moti-bagh': 'SVMB',
  'mayur-vihar-pocket-1': 'MVPO',          // renamed "SHREE RAM MAYUR VIHAR MANDIR"
  'brigadier-hoshiyar-singh': 'CIPK',
  'udyog-bhawan': 'UDB',                   // renamed "SEVA TEERTH"
  'pitampura': 'PTP',                      // renamed "MADHUBAN CHOWK"
  'janak-puri-west': 'JPW',
  'dwarka': 'DW',                          // renamed "DWARKA-KAKROLA"
  'rohini-east': 'RHE',                    // DMRC lists it simply as "ROHINI"
  'rohini-west': 'RHW',                    // renamed "DR. BABA SAHEB AMBEDKAR HOSPITAL"
  'jawaharlal-nehru-stadium': 'JLNS',      // "JLN STADIUM"
  'sector-28-faridabad': 'STTA',           // "SECTOR-28"
  'ghevra': 'GHEM',                        // "GHEVRA METRO STATION"
  'shahid-nagar': 'SHDN',                  // "SHAHEED NAGAR"
  'knowledge-park-ii': 'NM16',             // NMRC lists it as "Knowledge Park"
  'gnida-office': 'NM20',                  // NMRC spells it "GNOIDA Office"
  'depot-station': 'NM21',                 // "Depot"
};

const norm = (s) =>
  s.toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(earlier|formerly)\b.*/g, ' ')
    .replace(/[^a-z0-9]+/g, '');

const dataset = JSON.parse(readFileSync(DELHI, 'utf8'));

const byName = new Map();
for (const line of DMRC_LINES) {
  const res = await fetch(`${DMRC_API}/lines/${line}/stations`, { signal: AbortSignal.timeout(40000) });
  const rows = await res.json();
  if (!Array.isArray(rows)) { console.warn(`  ${line}: unexpected response`); continue; }
  for (const s of rows) if (!byName.has(norm(s.station_name))) byName.set(norm(s.station_name), s.station_code);
  console.log(`  ${line}: ${rows.length} stations`);
  await new Promise((r) => setTimeout(r, 250));
}

const aqua = await (await fetch(`${NMRC_API}/lines/AQUA/stations`, { signal: AbortSignal.timeout(40000) })).json();
for (const s of aqua) if (!byName.has(norm(s.station_name))) byName.set(norm(s.station_name), s.station_code);
console.log(`  AQUA: ${aqua.length} stations`);

const map = {};
const unmatched = [];
for (const s of dataset.stations) {
  if (OVERRIDES[s.id]) { map[s.id] = OVERRIDES[s.id]; continue; }
  const code = byName.get(norm(s.name));
  if (code) map[s.id] = code;
  else unmatched.push(`${s.id} (${s.name})`);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(map, null, 1)}\n`);

console.log(`\nmapped ${Object.keys(map).length} of ${dataset.stations.length} stations`);
if (unmatched.length) {
  console.log(`unmatched (${unmatched.length}) — add an override for each before relying on hop data:`);
  for (const u of unmatched) console.log(`  ${u}`);
}
