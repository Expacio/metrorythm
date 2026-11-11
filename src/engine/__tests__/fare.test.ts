/**
 * Fare engine validation.
 *
 * Covers the six journeys named in the brief plus the rules that govern them.
 * Every expected value traces to a published source recorded in
 * src/data/fares/index.ts — nothing here is back-filled from the implementation.
 */
import { describe, expect, it } from 'vitest';
import { delhi } from '../../data';
import { createPlanner, type Journey } from '../planner';
import {
  calculateSegment, computeFare, fareForDistance, fareForStations,
  isConcessionalDay, lookupStationPair, payableFare,
} from '../fare';
import { DMRC, NMRC_AQUA, RAPID_METRO, AIRPORT_EXPRESS, FARE_CONFIGS } from '../../data/fares';

const planner = createPlanner(delhi);
const route = (a: string, b: string): Journey => {
  const r = planner.plan(a, b, { modes: ['fastest'] });
  expect(r.error, `${a} -> ${b}`).toBeUndefined();
  return r.journeys[0];
};
const systems = (j: Journey) => j.fare.segments.map((s) => s.fareSystemId);

/* ------------------------------------------------------------ slab lookups */

describe('DMRC slabs (official, effective 2025-08-25)', () => {
  it('prices each distance band at the revised fare', () => {
    const cases: [number, number][] = [
      [1, 11], [2, 11], [2.1, 21], [5, 21], [5.1, 32],
      [12, 32], [12.1, 43], [21, 43], [21.1, 54], [32, 54], [45, 64],
    ];
    for (const [km, fare] of cases) {
      expect(fareForDistance(DMRC.slabs!, km), `${km} km`).toBe(fare);
    }
  });

  it('applies lower Sunday and national-holiday slabs', () => {
    expect(fareForDistance(DMRC.sundaySlabs!, 4)).toBe(11);
    expect(fareForDistance(DMRC.sundaySlabs!, 45)).toBe(54);
  });

  it('never prices a Sunday fare above the weekday fare', () => {
    for (const km of [1, 3, 8, 15, 25, 40]) {
      expect(fareForDistance(DMRC.sundaySlabs!, km))
        .toBeLessThanOrEqual(fareForDistance(DMRC.slabs!, km));
    }
  });

  it('detects Sundays and the three national holidays', () => {
    expect(isConcessionalDay(new Date('2026-01-04T10:00:00'))).toBe(true);  // Sunday
    expect(isConcessionalDay(new Date('2026-01-26T10:00:00'))).toBe(true);  // Republic Day
    expect(isConcessionalDay(new Date('2026-08-15T10:00:00'))).toBe(true);  // Independence Day
    expect(isConcessionalDay(new Date('2026-10-02T10:00:00'))).toBe(true);  // Gandhi Jayanti
    expect(isConcessionalDay(new Date('2026-01-06T10:00:00'))).toBe(false); // Tuesday
  });
});

describe('NMRC Aqua Line is priced by station count, not distance', () => {
  it('uses the published station bands', () => {
    const cases: [number, number][] = [[1, 10], [2, 15], [3, 20], [6, 20], [7, 30], [9, 30], [10, 40], [16, 40], [17, 50], [20, 50]];
    for (const [stations, fare] of cases) {
      expect(fareForStations(NMRC_AQUA.stationSlabs!, stations), `${stations} stations`).toBe(fare);
    }
  });

  it('is declared with a stationCount basis and no distance slabs', () => {
    expect(NMRC_AQUA.basis).toBe('stationCount');
    expect(NMRC_AQUA.slabs).toBeUndefined();
  });

  it('ignores distance entirely', () => {
    const near = calculateSegment({ fareSystemId: 'nmrcAqua', km: 1, stations: 18, fromStationId: 'a', toStationId: 'b' });
    const far = calculateSegment({ fareSystemId: 'nmrcAqua', km: 99, stations: 18, fromStationId: 'a', toStationId: 'b' });
    expect(near.token).toBe(far.token);
  });
});

describe('Rapid Metro Gurugram is a flat fare', () => {
  it('charges ₹20 regardless of distance or stations', () => {
    const a = calculateSegment({ fareSystemId: 'rapidMetro', km: 1, stations: 1, fromStationId: 'x', toStationId: 'y' });
    const b = calculateSegment({ fareSystemId: 'rapidMetro', km: 12, stations: 10, fromStationId: 'x', toStationId: 'y' });
    expect(a.token).toBe(20);
    expect(b.token).toBe(20);
    expect(RAPID_METRO.basis).toBe('flat');
  });
});

describe('Airport Express uses its own table, never DMRC slabs', () => {
  it('prefers a published station-to-station fare', () => {
    expect(lookupStationPair(AIRPORT_EXPRESS, 'new-delhi', 'igi-airport-terminal-3')).toBe(64);
  });

  it('looks pairs up in either direction', () => {
    expect(lookupStationPair(AIRPORT_EXPRESS, 'igi-airport-terminal-3', 'new-delhi')).toBe(64);
  });

  it('is official — the full 21-pair chart was read from DMRC', () => {
    expect(AIRPORT_EXPRESS.confidence).toBe('official');
  });

  /**
   * The reason this line needs a matrix at all: its fares are not monotonic in
   * distance, so any slab table gets some pairs wrong in both directions.
   */
  it('prices a shorter hop above a longer one, as DMRC does', () => {
    const longer = lookupStationPair(AIRPORT_EXPRESS, 'shivaji-stadium', 'dhaula-kuan')!;  // 6.98 km
    const shorter = lookupStationPair(AIRPORT_EXPRESS, 'delhi-aerocity', 'dwarka-sector-21')!; // 6.35 km
    expect(longer).toBe(21);
    expect(shorter).toBe(32);
    expect(shorter).toBeGreaterThan(longer);
  });

  it('covers every pair of the line\'s seven stations', () => {
    const stations = [
      'new-delhi', 'shivaji-stadium', 'dhaula-kuan', 'delhi-aerocity',
      'igi-airport-terminal-3', 'dwarka-sector-21', 'yashobhoomi-dwarka-sector-25',
    ];
    for (const a of stations) {
      for (const b of stations) {
        if (a === b) continue;
        expect(lookupStationPair(AIRPORT_EXPRESS, a, b)).toBeTypeOf('number');
      }
    }
  });

  it('never returns a DMRC slab value for an Airport Express segment', () => {
    const seg = calculateSegment({
      fareSystemId: 'airportExpress', km: 20.2, stations: 4,
      fromStationId: 'new-delhi', toStationId: 'igi-airport-terminal-3',
    });
    expect(seg.basisUsed).toBe('stationPair');
    expect(seg.token).toBe(64);
    expect(seg.token).not.toBe(fareForDistance(DMRC.slabs!, 20.2)); // 43 under DMRC
  });

  it('downgrades confidence when it has to fall back to a slab', () => {
    // Not reachable via Airport Express any more, so this exercises the rule
    // itself: a config that publishes pairs but is missing one must say so.
    const seg = calculateSegment({
      fareSystemId: 'airportExpress', km: 6, stations: 2,
      fromStationId: 'not-a-station', toStationId: 'also-not-a-station',
    });
    expect(seg.basisUsed).toBe('distance');
    expect(seg.confidence).toBe('estimated');
    expect(seg.estimateReason).toBeTruthy();
  });
});

describe('operator isolation', () => {
  it('never applies one operator table to another', () => {
    for (const [id, config] of Object.entries(FARE_CONFIGS)) {
      const seg = calculateSegment({ fareSystemId: id, km: 10, stations: 5, fromStationId: 'a', toStationId: 'b' });
      expect(seg.fareSystemId).toBe(id);
      expect(seg.operator).toBe(config.operator);
    }
  });

  it('marks an unknown operator unavailable instead of guessing', () => {
    const seg = calculateSegment({ fareSystemId: 'does-not-exist', km: 10, stations: 5, fromStationId: 'a', toStationId: 'b' });
    expect(seg.confidence).toBe('unavailable');
    expect(seg.token).toBe(0);
  });

  it('gives every operator an effective date', () => {
    for (const config of Object.values(FARE_CONFIGS)) {
      expect(config.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('smart-card discounts', () => {
  it('applies DMRC 10% off, and 20% off-peak', () => {
    const seg = calculateSegment({ fareSystemId: 'dmrc', km: 25, stations: 12, fromStationId: 'a', toStationId: 'b' });
    expect(seg.token).toBe(54);
    expect(seg.smartCard).toBe(Math.round(54 * 0.9));
    expect(seg.smartCardOffPeak).toBe(Math.round(54 * 0.8));
  });

  it('never prices a smart card above a token', () => {
    for (const id of Object.keys(FARE_CONFIGS)) {
      const seg = calculateSegment({ fareSystemId: id, km: 15, stations: 8, fromStationId: 'a', toStationId: 'b' });
      expect(seg.smartCard).toBeLessThanOrEqual(seg.token);
    }
  });

  it('payableFare selects the chosen ticket type', () => {
    const b = computeFare([{ fareSystemId: 'dmrc', km: 25, stations: 12, fromStationId: 'a', toStationId: 'b' }]);
    expect(payableFare(b, 'token')).toBe(b.token);
    expect(payableFare(b, 'smartCard')).toBe(b.smartCard);
  });
});

/* ------------------------------------------- the brief's validation journeys */

describe('VALIDATION A — IGI Airport T3 → Hindon River', () => {
  const j = route('igi-airport-terminal-3', 'hindon-river');

  it('bills exactly two operators: Airport Express and DMRC', () => {
    expect(systems(j).sort()).toEqual(['airportExpress', 'dmrc']);
  });

  it('charges the Airport Express leg from its own published pair fare', () => {
    const ael = j.fare.segments.find((s) => s.fareSystemId === 'airportExpress')!;
    expect(ael.basisUsed).toBe('stationPair');
    expect(ael.token).toBe(64);
  });

  it('charges ONE DMRC fare despite the Yellow→Red line change', () => {
    expect(j.fare.segments.filter((s) => s.fareSystemId === 'dmrc')).toHaveLength(1);
    expect(j.interchanges).toBe(2); // AEL→Yellow, Yellow→Red
  });

  it('prices the DMRC leg at the top slab for its distance', () => {
    const dmrc = j.fare.segments.find((s) => s.fareSystemId === 'dmrc')!;
    expect(dmrc.token).toBe(fareForDistance(DMRC.slabs!, dmrc.km));
  });

  it('totals the two operator fares and nothing more', () => {
    expect(j.fare.token).toBe(j.fare.segments.reduce((a, s) => a + s.token, 0));
  });

  it('is fully official now that the Airport Express chart is published', () => {
    expect(j.fare.confidence).toBe('official');
  });
});

describe('VALIDATION B — New Delhi → Kashmere Gate (single operator)', () => {
  const j = route('new-delhi', 'kashmere-gate');

  it('bills DMRC only', () => {
    expect(systems(j)).toEqual(['dmrc']);
  });

  it('is a direct Yellow Line ride with no interchange', () => {
    expect(j.interchanges).toBe(0);
  });

  it('charges a single short-distance DMRC fare', () => {
    expect(j.fare.token).toBe(fareForDistance(DMRC.slabs!, j.fare.segments[0].km));
    expect(j.fare.token).toBeLessThanOrEqual(32);
  });

  it('is fully official — no estimated component', () => {
    expect(j.fare.confidence).toBe('official');
    expect(j.fare.multiOperator).toBe(false);
  });
});

describe('VALIDATION C — IGI Airport T3 → New Delhi (Airport Express only)', () => {
  const j = route('igi-airport-terminal-3', 'new-delhi');

  it('bills the Airport Express alone', () => {
    expect(systems(j)).toEqual(['airportExpress']);
  });

  it('uses the published ₹64 pair fare, not a DMRC slab', () => {
    expect(j.fare.token).toBe(64);
    expect(j.fare.segments[0].basisUsed).toBe('stationPair');
  });

  it('applies the 10% stored-value discount', () => {
    expect(j.fare.smartCard).toBe(Math.round(64 * 0.9));
  });
});

describe('VALIDATION D — Kashmere Gate → Hindon River (one operator, one line)', () => {
  const j = route('kashmere-gate', 'hindon-river');

  it('bills DMRC once', () => {
    expect(systems(j)).toEqual(['dmrc']);
    expect(j.fare.segments).toHaveLength(1);
  });

  it('needs no interchange at all', () => {
    expect(j.interchanges).toBe(0);
  });

  it('is cheaper than the same trip starting at the airport', () => {
    expect(j.fare.token).toBeLessThan(route('igi-airport-terminal-3', 'hindon-river').fare.token);
  });
});

describe('VALIDATION E — journey involving Noida Metro (Aqua Line)', () => {
  const j = route('rajiv-chowk', 'pari-chowk');

  it('bills DMRC and NMRC separately', () => {
    expect(systems(j).sort()).toEqual(['dmrc', 'nmrcAqua']);
  });

  it('prices the Aqua leg by station count', () => {
    const aqua = j.fare.segments.find((s) => s.fareSystemId === 'nmrcAqua')!;
    expect(aqua.basisUsed).toBe('stationCount');
    expect(aqua.token).toBe(fareForStations(NMRC_AQUA.stationSlabs!, aqua.stations));
  });

  it('explains why two fares apply', () => {
    expect(j.fare.multiOperator).toBe(true);
    expect(j.fare.notes.some((n) => n.includes('fare-system boundary'))).toBe(true);
  });

  it('charges one DMRC fare across all the DMRC lines used', () => {
    expect(j.fare.segments.filter((s) => s.fareSystemId === 'dmrc')).toHaveLength(1);
  });
});

describe('VALIDATION F — journey involving Rapid Metro Gurugram', () => {
  const j = route('rajiv-chowk', 'cyber-city');

  it('bills DMRC and Rapid Metro separately', () => {
    expect(systems(j).sort()).toEqual(['dmrc', 'rapidMetro']);
  });

  it('charges the flat ₹20 Rapid Metro fare', () => {
    expect(j.fare.segments.find((s) => s.fareSystemId === 'rapidMetro')!.token).toBe(20);
  });

  it('states the combined-fare rule for Sikanderpur', () => {
    expect(j.fare.notes.some((n) => n.toLowerCase().includes('combined fare'))).toBe(true);
  });
});

/* ------------------------------------------------- no duplicate fare charges */

describe('no duplicate fare charges', () => {
  it('bills each operator at most once per journey', () => {
    const pairs: [string, string][] = [
      ['igi-airport-terminal-3', 'hindon-river'],
      ['shiv-vihar', 'millennium-city-centre-gurugram'],
      ['rithala', 'raja-nahar-singh'],
      ['dwarka-sector-21', 'noida-electronic-city'],
      ['brigadier-hoshiyar-singh', 'vaishali'],
      ['rajiv-chowk', 'pari-chowk'],
    ];
    for (const [a, b] of pairs) {
      const ids = systems(route(a, b));
      expect(new Set(ids).size, `${a} -> ${b}`).toBe(ids.length);
    }
  });

  it('charges one DMRC fare however many DMRC lines are used', () => {
    const j = route('shiv-vihar', 'millennium-city-centre-gurugram');
    expect(j.interchanges).toBeGreaterThan(0);
    expect(j.fare.segments.filter((s) => s.fareSystemId === 'dmrc')).toHaveLength(1);
  });

  it('keeps the total equal to the sum of its segments', () => {
    for (const [a, b] of [['rithala', 'raja-nahar-singh'], ['igi-airport-terminal-3', 'hindon-river']] as [string, string][]) {
      const j = route(a, b);
      expect(j.fare.token).toBe(j.fare.segments.reduce((t, s) => t + s.token, 0));
      expect(j.fare.smartCard).toBe(j.fare.segments.reduce((t, s) => t + s.smartCard, 0));
    }
  });
});
