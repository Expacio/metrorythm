/**
 * Hyderabad is the one network built entirely from an official GTFS feed, so
 * it is where the timing and fare engines can be checked against published
 * values rather than against our own assumptions.
 *
 * Reference: Hyderabad Metro Rail GTFS, published via Open Data Telangana,
 * feed valid from 2026-07-03. See scripts/build-hyderabad.mjs.
 */

import { describe, expect, it } from 'vitest';
import { getCity } from '../../data';
import { createPlanner } from '../planner';

const dataset = getCity('hyderabad');
const planner = createPlanner(dataset);
const pairs = dataset.lines.flatMap((l) => l.stations);

const route = (a: string, b: string) => {
  const res = planner.plan(a, b);
  expect(res.error, `${a} -> ${b}`).toBeUndefined();
  return res.journeys.find((j) => j.modes.includes('fastest'))!;
};

describe('Hyderabad dataset provenance', () => {
  it('declares its source', () => {
    expect(dataset.sources?.[0].official).toBe(true);
    expect(dataset.sources?.[0].url).toContain('telangana');
  });

  it('marks stations, distances, timings and fares as official', () => {
    expect(dataset.provenance?.stations?.confidence).toBe('OFFICIAL');
    expect(dataset.provenance?.distances?.confidence).toBe('OFFICIAL');
    expect(dataset.provenance?.timings?.confidence).toBe('OFFICIAL');
    expect(dataset.provenance?.fares?.confidence).toBe('OFFICIAL');
  });

  it('does not claim official confidence for interchange walking times', () => {
    expect(dataset.provenance?.interchanges?.confidence).toBe('ESTIMATED');
  });

  it('has the three operating corridors and 57 stations', () => {
    expect(dataset.stations).toHaveLength(57);
    expect(dataset.lines.map((l) => l.name).sort())
      .toEqual(['Blue Line', 'Green Line', 'Red Line']);
  });
});

describe('every ride edge carries measured distance and run time', () => {
  const rides = dataset.edges.filter((e) => e.kind === 'ride');

  it('covers all of them', () => {
    expect(rides.length).toBeGreaterThan(50);
    for (const e of rides) {
      expect(typeof e.km, `${e.from}->${e.to}`).toBe('number');
      expect(typeof e.runSeconds, `${e.from}->${e.to}`).toBe('number');
    }
  });

  it('produces a plausible speed on every hop, not one constant', () => {
    const speeds = rides.map((e) => (e.km! / (e.runSeconds! / 3600)));
    for (const s of speeds) {
      expect(s).toBeGreaterThan(15);
      expect(s).toBeLessThan(90);
    }
    // The point of the rebuild: hops differ from one another.
    expect(new Set(rides.map((e) => e.runSeconds)).size).toBeGreaterThan(10);
  });
});

describe('journey times are reported as separable components', () => {
  const j = route('miyapur', 'l-b-nagar');

  it('sums exactly to the total', () => {
    const t = j.timing;
    expect(t.inTrain + t.dwell + t.interchangeWalk + t.interchangeWait).toBe(t.total);
    expect(j.totalSeconds).toBe(t.total);
  });

  it('spends most of a direct journey in motion', () => {
    expect(j.interchanges).toBe(0);
    expect(j.timing.inTrain).toBeGreaterThan(j.timing.dwell);
    expect(j.timing.interchangeWait).toBe(0);
  });

  it('is built from official timings end to end', () => {
    expect(j.timeConfidence).toBe('OFFICIAL');
    expect(j.distanceConfidence).toBe('OFFICIAL');
  });
});

describe('fares come from the official matrix', () => {
  it('charges the published end-to-end Red Line fare', () => {
    const j = route('miyapur', 'l-b-nagar');
    expect(j.fare.segments[0].basisUsed).toBe('stationPair');
    expect(j.fare.token).toBe(75);
  });

  it('charges the published end-to-end Blue Line fare', () => {
    expect(route('raidurg', 'nagole').fare.token).toBe(75);
  });

  it('charges a single fare across an interchange', () => {
    const j = route('miyapur', 'nagole');
    expect(j.interchanges).toBeGreaterThanOrEqual(1);
    expect(j.fare.segments).toHaveLength(1);
  });

  it('never falls back to a slab — the matrix is complete', () => {
    const sample = ['miyapur', 'ameerpet', 'raidurg', 'l-b-nagar', 'nagole', 'jbs-parade-ground'];
    for (const a of sample) {
      for (const b of sample) {
        if (a === b) continue;
        expect(route(a, b).fare.segments[0].basisUsed, `${a}->${b}`).toBe('stationPair');
      }
    }
  });
});

describe('network topology', () => {
  it('reaches every station from every other one', () => {
    const ids = dataset.stations.map((s) => s.id);
    for (const id of ids) {
      if (id === ids[0]) continue;
      expect(planner.plan(ids[0], id).error, `${ids[0]} -> ${id}`).toBeUndefined();
    }
  });

  it('connects Blue to Green via the Parade Ground corridor', () => {
    const j = route('raidurg', 'jbs-parade-ground');
    const viaParade = j.legs.some((l) => l.type === 'transfer' && l.at.id === 'parade-ground');
    expect(viaParade).toBe(true);
  });

  it('lists every station on exactly the lines that serve it', () => {
    for (const s of dataset.stations) {
      expect(s.lines.length, s.id).toBeGreaterThan(0);
      for (const lid of s.lines) {
        expect(dataset.lines.find((l) => l.id === lid)!.stations).toContain(s.id);
      }
    }
    expect(new Set(pairs).size).toBe(dataset.stations.length);
  });
});

describe('headways and operating hours come from the timetable', () => {
  it('records a peak headway for every line', () => {
    for (const l of dataset.lines) {
      expect(l.headwaySeconds?.peak, l.name).toBeGreaterThan(0);
      expect(l.operatingHours?.first, l.name).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it('charges an expected wait when changing lines', () => {
    const j = route('miyapur', 'nagole');
    expect(j.timing.interchangeWait).toBeGreaterThan(0);
  });
});
