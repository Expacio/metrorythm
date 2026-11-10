/**
 * Whole-of-India dataset integrity.
 *
 * Delhi and Chennai are hand-authored; the other 17 networks are imported from
 * Wikidata. These tests hold EVERY city to the same structural standard, so an
 * import that silently degrades fails the build rather than reaching users.
 */
import { describe, expect, it } from 'vitest';
import { CITIES } from '../../data';
import { FARE_CONFIGS } from '../../data/fares';
import { buildGraph } from '../graph';
import { createPlanner } from '../planner';
import { createSearch } from '../search';

const ids = CITIES.map((c) => c.city.cityId);

describe('coverage', () => {
  it('ships 19 Indian networks', () => {
    expect(CITIES).toHaveLength(19);
  });

  it('includes every major system', () => {
    for (const expected of [
      'delhi', 'chennai', 'bengaluru', 'mumbai', 'hyderabad', 'kolkata',
      'kochi', 'ahmedabad', 'pune', 'nagpur', 'lucknow', 'jaipur',
    ]) expect(ids).toContain(expected);
  });

  it('gives every city a unique id', () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('totals over 800 stations', () => {
    const total = CITIES.reduce((n, c) => n + c.stations.length, 0);
    expect(total).toBeGreaterThan(800);
  });
});

describe.each(CITIES.map((c) => [c.city.cityName, c] as const))('%s', (_name, city) => {
  const graph = buildGraph(city);
  const planner = createPlanner(city);

  it('has at least one line and two stations', () => {
    expect(city.lines.length).toBeGreaterThan(0);
    expect(city.stations.length).toBeGreaterThan(1);
  });

  it('gives every station a unique id', () => {
    const sids = city.stations.map((s) => s.id);
    expect(new Set(sids).size).toBe(sids.length);
  });

  it('references only stations that exist', () => {
    const known = new Set(city.stations.map((s) => s.id));
    for (const line of city.lines) {
      for (const sid of line.stations) expect(known.has(sid), `${line.name}: ${sid}`).toBe(true);
    }
  });

  it('never lists a station twice on one line', () => {
    for (const line of city.lines) {
      expect(new Set(line.stations).size, line.name).toBe(line.stations.length);
    }
  });

  it('uses a fare system the engine knows', () => {
    for (const line of city.lines) {
      expect(FARE_CONFIGS[line.fareSystem], `${line.name} -> ${line.fareSystem}`).toBeDefined();
    }
  });

  it('gives every line a colour', () => {
    for (const line of city.lines) expect(line.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('positions every station, with provenance', () => {
    for (const s of city.stations) {
      expect(s.lat, s.name).not.toBeNull();
      expect(s.lng, s.name).not.toBeNull();
      expect(s.coordSource, s.name).not.toBeNull();
    }
  });

  it('places every station inside India', () => {
    for (const s of city.stations) {
      expect(s.lat!, s.name).toBeGreaterThan(6);
      expect(s.lat!, s.name).toBeLessThan(37);
      expect(s.lng!, s.name).toBeGreaterThan(68);
      expect(s.lng!, s.name).toBeLessThan(98);
    }
  });

  it('keeps each line geographically coherent', () => {
    // Adjacent stations on a line should be a few km apart at most. A much
    // larger gap means the derived ORDER is wrong, which is the one failure
    // mode an imported network must never have.
    for (const line of city.lines) {
      for (let i = 0; i < line.stations.length - 1; i += 1) {
        const a = city.stations.find((s) => s.id === line.stations[i])!;
        const b = city.stations.find((s) => s.id === line.stations[i + 1])!;
        const km = Math.hypot((a.lat! - b.lat!) * 111, (b.lng! - a.lng!) * 105);
        expect(km, `${city.city.cityName} ${line.name}: ${a.name} -> ${b.name}`).toBeLessThan(12);
      }
    }
  });

  it('builds a graph with bidirectional ride edges', () => {
    for (const [from, edges] of graph.adjacency) {
      for (const e of edges) {
        if (e.kind !== 'ride') continue;
        expect((graph.adjacency.get(e.to) ?? []).some((b) => b.to === from)).toBe(true);
      }
    }
  });

  it('records whether the network is connected', () => {
    expect(city.connectivity).toBeDefined();
    expect(typeof city.connectivity!.connected).toBe('boolean');
  });

  it('routes between the termini of its longest line', () => {
    const line = [...city.lines].sort((a, b) => b.stations.length - a.stations.length)[0];
    const res = planner.plan(line.stations[0], line.stations[line.stations.length - 1], {
      modes: ['fastest'],
    });
    expect(res.error).toBeUndefined();
    const j = res.journeys[0];
    expect(j.totalSeconds).toBeGreaterThan(0);
    expect(j.fare.token).toBeGreaterThan(0);
    // NOT an equality check against the line length: the fastest route between
    // two termini may legitimately leave that line and come back (Delhi's Blue
    // Line termini are quicker via other lines).
    expect(j.stationCount).toBeGreaterThan(0);
    expect(j.stationCount).toBeLessThanOrEqual(line.stations.length - 1);
  });

  it('routes along the line itself when changes are minimised', () => {
    const line = [...city.lines].sort((a, b) => b.stations.length - a.stations.length)[0];
    const res = planner.plan(line.stations[0], line.stations[line.stations.length - 1], {
      modes: ['fewest-interchanges'],
    });
    expect(res.error).toBeUndefined();
    expect(res.journeys[0].interchanges).toBe(0);
  });

  it('finds its own stations by name', () => {
    const search = createSearch(city);
    for (const s of city.stations.slice(0, 5)) {
      expect(search.search(s.name).map((r) => r.station.id), s.name).toContain(s.id);
    }
  });
});
