/**
 * Metrorythm — local fuzzy search / autocomplete.
 *
 * Entirely offline: builds an in-memory index over station names, aliases,
 * airport IATA/ICAO codes, airport terminal names and popular landmarks.
 * There is no search API and no network call.
 *
 * Scoring is a deterministic blend of exact match, prefix match, word-prefix
 * match, substring match and a bounded Levenshtein distance for typos.
 */

import type { CityDataset, Station, StationId } from '../data/types';

export type MatchKind = 'station' | 'alias' | 'airport' | 'terminal' | 'landmark';

export interface SearchEntry {
  /** The text that is matched against. */
  text: string;
  kind: MatchKind;
  station: StationId;
  /** Extra context shown in the dropdown, e.g. "Terminal 3 · DEL". */
  detail?: string;
}

export interface SearchResult {
  station: Station;
  score: number;
  matchedOn: string;
  kind: MatchKind;
  detail?: string;
}

/** Cities referenced by an airport code but absent from this data build. */
export interface UnavailableCityHit {
  kind: 'unavailable-city';
  code: string;
  city: string;
  airportName: string;
  note: string;
}

export function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Levenshtein distance, early-exiting once it exceeds `max`. */
export function levenshtein(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = curr;
  }
  return prev[b.length];
}

export function buildSearchIndex(dataset: CityDataset): SearchEntry[] {
  const entries: SearchEntry[] = [];

  for (const st of dataset.stations) {
    entries.push({ text: st.name, kind: 'station', station: st.id });
    for (const alias of st.aliases) {
      entries.push({ text: alias, kind: 'alias', station: st.id, detail: `also ${st.name}` });
    }
  }

  for (const airport of dataset.airports) {
    if (!airport.inThisDataset) continue;
    for (const t of airport.terminals) {
      entries.push({
        text: `${airport.iata} ${t.terminal}`,
        kind: 'airport',
        station: t.station,
        detail: `${airport.name} · ${t.terminal}`,
      });
      entries.push({
        text: airport.iata,
        kind: 'airport',
        station: airport.terminals[0].station,
        detail: `${airport.name} (${airport.city})`,
      });
      entries.push({
        text: airport.icao,
        kind: 'airport',
        station: airport.terminals[0].station,
        detail: `${airport.name} · ICAO`,
      });
      for (const alias of t.aliases) {
        entries.push({
          text: alias,
          kind: 'terminal',
          station: t.station,
          detail: `${airport.iata} ${t.terminal}`,
        });
      }
    }
  }

  for (const lm of dataset.landmarks) {
    entries.push({ text: lm.label, kind: 'landmark', station: lm.station, detail: 'landmark' });
  }

  return entries;
}

const KIND_WEIGHT: Record<MatchKind, number> = {
  station: 1.0,
  airport: 0.98,
  terminal: 0.95,
  alias: 0.92,
  landmark: 0.88,
};

function scoreEntry(query: string, entryText: string): number {
  const q = normalise(query);
  const t = normalise(entryText);
  if (!q) return 0;

  if (t === q) return 1000;
  if (t.startsWith(q)) return 800 - (t.length - q.length) * 0.5;

  // Word-prefix: "noi sec 18" style queries.
  const qWords = q.split(' ');
  const tWords = t.split(' ');
  if (qWords.length > 1 && qWords.every((qw, i) => tWords[i]?.startsWith(qw))) {
    return 700 - (t.length - q.length) * 0.5;
  }
  if (qWords.every((qw) => tWords.some((tw) => tw.startsWith(qw)))) {
    return 600 - (t.length - q.length) * 0.5;
  }

  if (t.includes(q)) return 500 - (t.length - q.length) * 0.5;

  // Typo tolerance scaled to query length.
  const max = q.length <= 4 ? 1 : q.length <= 7 ? 2 : 3;
  const d = levenshtein(q, t, max);
  if (d <= max) return 400 - d * 60;

  // Typo tolerance against the closest single word.
  let bestWord = max + 1;
  for (const tw of tWords) {
    const dw = levenshtein(q, tw, max);
    if (dw < bestWord) bestWord = dw;
  }
  if (bestWord <= max) return 300 - bestWord * 60;

  return 0;
}

export function createSearch(dataset: CityDataset) {
  const index = buildSearchIndex(dataset);
  const stationsById = new Map(dataset.stations.map((s) => [s.id, s]));

  /** Airport codes whose city is not part of this data build. */
  function unavailableCity(query: string): UnavailableCityHit | null {
    const q = normalise(query);
    for (const a of dataset.airports) {
      if (a.inThisDataset) continue;
      if (q === normalise(a.iata) || q === normalise(a.icao) || normalise(a.city) === q) {
        return {
          kind: 'unavailable-city',
          code: a.iata,
          city: a.city,
          airportName: a.name,
          note: a.note ?? `${a.city} is not included in this data build.`,
        };
      }
    }
    return null;
  }

  function search(query: string, limit = 8): SearchResult[] {
    if (!query.trim()) return [];
    const scored: SearchResult[] = [];
    const bestPerStation = new Map<StationId, SearchResult>();

    for (const entry of index) {
      const raw = scoreEntry(query, entry.text);
      if (raw <= 0) continue;
      const score = raw * KIND_WEIGHT[entry.kind];
      const station = stationsById.get(entry.station);
      if (!station) continue;
      const candidate: SearchResult = {
        station,
        score,
        matchedOn: entry.text,
        kind: entry.kind,
        detail: entry.detail,
      };
      const existing = bestPerStation.get(station.id);
      if (!existing || candidate.score > existing.score) {
        bestPerStation.set(station.id, candidate);
      }
    }

    scored.push(...bestPerStation.values());
    scored.sort((a, b) => b.score - a.score || a.station.name.localeCompare(b.station.name));
    return scored.slice(0, limit);
  }

  return { search, unavailableCity, index };
}

export type Search = ReturnType<typeof createSearch>;
