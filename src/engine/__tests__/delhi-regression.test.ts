/**
 * Delhi NCR regression suite.
 *
 * These are the 41 origin–destination pairs from the November 2026 routing
 * audit, each with the figures DMRC's own planner returns. They exist to stop
 * the two defects the audit found from coming back: journey times that ignore
 * distance, and fares derived from a guessed distance.
 *
 * Reference values: DMRC journey planner, least-distance strategy, retrieved
 * 2026-11-12. They are DMRC's published estimate, not a measured timetable —
 * see AUDIT-routing-2026-11-12.md section 1.
 *
 * A case is NOT required to match exactly. DMRC rounds to whole minutes and
 * adds a first-train allowance Metrorythm deliberately excludes, so the bar is
 * a tolerance band, plus an exact match on fare and interchange count where
 * the route agrees.
 */

import { describe, expect, it } from 'vitest';
import { getCity } from '../../data';
import { createPlanner, type Journey } from '../planner';

const planner = createPlanner(getCity('delhi'));

interface Case {
  id: string;
  from: string;
  to: string;
  /** DMRC's published journey time, minutes. */
  refMin: number;
  /** DMRC's published fare, rupees. */
  refFare: number;
  /** Interchanges DMRC reports. */
  refChanges: number;
}

const CASES: Case[] = [
  { id: 'T01', from: 'kashmere-gate', to: 'millennium-city-centre-gurugram', refMin: 62, refFare: 64, refChanges: 0 },
  { id: 'T02', from: 'new-delhi', to: 'millennium-city-centre-gurugram', refMin: 56, refFare: 54, refChanges: 0 },
  { id: 'T03', from: 'igi-airport-terminal-3', to: 'new-delhi', refMin: 20, refFare: 64, refChanges: 0 },
  { id: 'T04', from: 'igi-airport-terminal-3', to: 'rajiv-chowk', refMin: 32, refFare: 75, refChanges: 1 },
  { id: 'T05', from: 'dwarka-sector-21', to: 'noida-electronic-city', refMin: 86, refFare: 118, refChanges: 2 },
  { id: 'T06', from: 'rithala', to: 'shaheed-sthal-new-bus-adda', refMin: 61, refFare: 64, refChanges: 0 },
  { id: 'T07', from: 'samaypur-badli', to: 'millennium-city-centre-gurugram', refMin: 86, refFare: 64, refChanges: 0 },
  { id: 'T08', from: 'rajiv-chowk', to: 'hauz-khas', refMin: 19, refFare: 32, refChanges: 0 },
  { id: 'T09', from: 'rajiv-chowk', to: 'kashmere-gate', refMin: 8, refFare: 21, refChanges: 0 },
  { id: 'T10', from: 'new-delhi', to: 'chandni-chowk', refMin: 4, refFare: 11, refChanges: 0 },
  { id: 'T11', from: 'noida-city-centre', to: 'dwarka-sector-21', refMin: 74, refFare: 107, refChanges: 2 },
  { id: 'T12', from: 'botanical-garden', to: 'hauz-khas', refMin: 32, refFare: 43, refChanges: 0 },
  { id: 'T13', from: 'janak-puri-west', to: 'botanical-garden', refMin: 56, refFare: 54, refChanges: 0 },
  { id: 'T14', from: 'vaishali', to: 'rajiv-chowk', refMin: 25, refFare: 43, refChanges: 0 },
  { id: 'T15', from: 'dwarka-sector-21', to: 'vaishali', refMin: 66, refFare: 107, refChanges: 2 },
  { id: 'T16', from: 'kirti-nagar', to: 'inderlok', refMin: 14, refFare: 21, refChanges: 1 },
  { id: 'T17', from: 'mundka', to: 'kashmere-gate', refMin: 46, refFare: 43, refChanges: 1 },
  { id: 'T18', from: 'kashmere-gate', to: 'raja-nahar-singh', refMin: 82, refFare: 64, refChanges: 1 },
  { id: 'T19', from: 'central-secretariat', to: 'raja-nahar-singh', refMin: 66, refFare: 64, refChanges: 0 },
  { id: 'T20', from: 'majlis-park', to: 'shiv-vihar', refMin: 31, refFare: 43, refChanges: 0 },
  { id: 'T21', from: 'azadpur', to: 'lajpat-nagar', refMin: 41, refFare: 43, refChanges: 1 },
  { id: 'T22', from: 'noida-sector-51', to: 'noida-sector-142', refMin: 16, refFare: 30, refChanges: 0 },
  { id: 'T23', from: 'noida-city-centre', to: 'noida-sector-142', refMin: 26, refFare: 51, refChanges: 1 },
  { id: 'T24', from: 'sikanderpur', to: 'millennium-city-centre-gurugram', refMin: 8, refFare: 21, refChanges: 0 },
  { id: 'T25', from: 'sikanderpur', to: 'rajiv-chowk', refMin: 46, refFare: 54, refChanges: 0 },
  { id: 'T26', from: 'dhaula-kuan', to: 'rajiv-chowk', refMin: 22, refFare: 54, refChanges: 1 },
  { id: 'T27', from: 'igi-airport-terminal-3', to: 'hauz-khas', refMin: 50, refFare: 96, refChanges: 1 },
  { id: 'T28', from: 'dilshad-garden', to: 'rithala', refMin: 44, refFare: 54, refChanges: 0 },
  { id: 'T29', from: 'inderlok', to: 'brigadier-hoshiyar-singh', refMin: 51, refFare: 54, refChanges: 0 },
  { id: 'T30', from: 'jahangirpuri', to: 'millennium-city-centre-gurugram', refMin: 79, refFare: 64, refChanges: 0 },
  { id: 'T31', from: 'okhla-vihar', to: 'rajiv-chowk', refMin: 46, refFare: 43, refChanges: 2 },
  { id: 'T32', from: 'kalkaji-mandir', to: 'botanical-garden', refMin: 22, refFare: 32, refChanges: 0 },
  { id: 'T33', from: 'igi-airport-terminal-3', to: 'noida-city-centre', refMin: 69, refFare: 107, refChanges: 2 },
  { id: 'T34', from: 'lajpat-nagar', to: 'mayur-vihar-i', refMin: 17, refFare: 32, refChanges: 0 },
  { id: 'T35', from: 'anand-vihar-isbt', to: 'new-delhi', refMin: 28, refFare: 43, refChanges: 1 },
  { id: 'T36', from: 'punjabi-bagh-west', to: 'mayur-vihar-pocket-1', refMin: 55, refFare: 54, refChanges: 0 },
  { id: 'T37', from: 'dwarka', to: 'dhansa-bus-stand', refMin: 10, refFare: 21, refChanges: 0 },
  { id: 'T38', from: 'cyber-city', to: 'rajiv-chowk', refMin: 63, refFare: 74, refChanges: 1 },
  { id: 'T39', from: 'madipur', to: 'netaji-subhash-place', refMin: 15, refFare: 21, refChanges: 1 },
  { id: 'T40', from: 'mundka', to: 'rajouri-garden', refMin: 30, refFare: 43, refChanges: 1 },
  { id: 'T41', from: 'punjabi-bagh', to: 'netaji-subhash-place', refMin: 12, refFare: 21, refChanges: 1 },
];

/**
 * Three interchange counts above deliberately differ from what DMRC's planner
 * reports, because its Green Line labelling is inverted: it calls the
 * Inderlok–Ashok Park Main section a "branch" and inserts a 5-minute change at
 * Ashok Park Main even for Inderlok–Mundka journeys, which run through. The
 * real branch is the Kirti Nagar shuttle. T16/T17/T29 use the physical answer.
 *
 * Cases whose route legitimately differs from DMRC's, with the reason. These
 * are still checked — just not against a figure for a route we do not take.
 */
const DIFFERENT_ROUTE: Record<string, string> = {
  T05: 'Metrorythm offers the faster Airport Express route; DMRC returns the all-Blue one.',
  T11: 'As T05, in reverse.',
  T15: 'As T05.',
  T27: 'Metrorythm routes via the Dhaula Kuan out-of-station link, which DMRC does not use.',
  T33: 'As T27.',
  T20: 'The Phase IV Pink Line ring is not yet in the dataset — see the data-gaps section.',
  T36: 'A 3-change route comes out ~40 s faster than the direct Pink Line one; both are '
    + 'offered, and the direct route is checked separately below.',
};

const fastest = (from: string, to: string): Journey => {
  const res = planner.plan(from, to);
  expect(res.error, `${from} -> ${to}`).toBeUndefined();
  const j = res.journeys.find((x) => x.modes.includes('fastest'));
  expect(j, `no fastest journey for ${from} -> ${to}`).toBeDefined();
  return j!;
};

describe('Delhi NCR — journey time against DMRC', () => {
  /**
   * 20% rather than something tighter: DMRC rounds to whole minutes, which on
   * a 4-minute journey is already 12%, and it adds allowances we exclude.
   */
  const TOLERANCE = 0.2;
  const FLOOR_MINUTES = 3;

  for (const c of CASES) {
    if (DIFFERENT_ROUTE[c.id]) continue;
    it(`${c.id} ${c.from} -> ${c.to} is within 20% of ${c.refMin} min`, () => {
      const mins = fastest(c.from, c.to).totalSeconds / 60;
      const slack = Math.max(c.refMin * TOLERANCE, FLOOR_MINUTES);
      expect(Math.abs(mins - c.refMin)).toBeLessThanOrEqual(slack);
    });
  }
});

describe('Delhi NCR — fare against DMRC', () => {
  for (const c of CASES) {
    if (DIFFERENT_ROUTE[c.id]) continue;
    it(`${c.id} ${c.from} -> ${c.to} costs the published ₹${c.refFare}`, () => {
      expect(fastest(c.from, c.to).fare.token).toBe(c.refFare);
    });
  }
});

describe('Delhi NCR — interchange count against DMRC', () => {
  for (const c of CASES) {
    if (DIFFERENT_ROUTE[c.id]) continue;
    it(`${c.id} ${c.from} -> ${c.to} reports ${c.refChanges} change(s)`, () => {
      expect(fastest(c.from, c.to).interchanges).toBe(c.refChanges);
    });
  }
});

describe('routes that legitimately differ from DMRC still behave', () => {
  for (const [id, why] of Object.entries(DIFFERENT_ROUTE)) {
    const c = CASES.find((x) => x.id === id)!;
    it(`${id} resolves and is self-consistent — ${why}`, () => {
      const j = fastest(c.from, c.to);
      expect(j.totalSeconds).toBeGreaterThan(0);
      const t = j.timing;
      expect(t.inTrain + t.dwell + t.interchangeWalk + t.interchangeWait).toBe(t.total);
      expect(j.fare.token).toBeGreaterThan(0);
    });
  }
});

describe('properties that must hold for every case', () => {
  it('reports a timing breakdown that sums to the total', () => {
    for (const c of CASES) {
      const t = fastest(c.from, c.to).timing;
      expect(t.inTrain + t.dwell + t.interchangeWalk + t.interchangeWait, c.id).toBe(t.total);
    }
  });

  it('charges real interchange overhead whenever a journey changes line', () => {
    for (const c of CASES) {
      const j = fastest(c.from, c.to);
      if (j.interchanges === 0) continue;
      // Wait can legitimately be zero where the walk already uses up DMRC's
      // whole allowance (Kashmere Gate yellow/violet is a 5-minute walk), so
      // the guarantee is on the combined overhead.
      expect(j.timing.interchangeWalk + j.timing.interchangeWait, `${c.id}`).toBeGreaterThan(0);
    }
  });

  it('adds a wait at the great majority of interchanges', () => {
    const changing = CASES.map((c) => fastest(c.from, c.to)).filter((j) => j.interchanges > 0);
    const waited = changing.filter((j) => j.timing.interchangeWait > 0);
    expect(waited.length / changing.length).toBeGreaterThan(0.8);
  });

  it('offers the direct Pink Line run for T36 as the fewest-changes option', () => {
    const res = planner.plan('punjabi-bagh-west', 'mayur-vihar-pocket-1');
    const direct = res.journeys.find((j) => j.modes.includes('fewest-interchanges'))!;
    expect(direct.interchanges).toBe(0);
    expect(Math.abs(direct.totalSeconds / 60 - 55)).toBeLessThanOrEqual(5);
  });

  it('never badges a journey "cheapest" when a cheaper one was found', () => {
    for (const c of CASES) {
      const res = planner.plan(c.from, c.to);
      const cheapest = res.journeys.find((j) => j.modes.includes('cheapest'));
      if (!cheapest) continue;
      for (const other of res.journeys) {
        expect(cheapest.fare.token, `${c.id}: cheapest is dearer than another option`)
          .toBeLessThanOrEqual(other.fare.token);
      }
    }
  });

  it('never badges a journey "fastest" when a quicker one was found', () => {
    for (const c of CASES) {
      const res = planner.plan(c.from, c.to);
      const quickest = res.journeys.find((j) => j.modes.includes('fastest'));
      if (!quickest) continue;
      for (const other of res.journeys) {
        expect(quickest.totalSeconds, `${c.id}`).toBeLessThanOrEqual(other.totalSeconds);
      }
    }
  });

  /**
   * Two hops have no usable published distance: DMRC returns 0 km for
   * NSEZ–Noida Sector 83 and 0.26 km for Greater Kailash–Nehru Enclave, and
   * the three Rapid Metro loop hops confuse its planner. Those keep a
   * geometric estimate, and the journey says so rather than claiming official.
   */
  it('derives distance from official figures except where none exists', () => {
    const estimated = CASES.filter((c) => fastest(c.from, c.to).distanceConfidence !== 'OFFICIAL');
    expect(estimated.length / CASES.length).toBeLessThan(0.15);
    for (const c of estimated) {
      // The point is that nothing claims OFFICIAL without backing — a walking
      // link sourced from DMRC's planner is legitimately VERIFIED_SECONDARY.
      expect(['ESTIMATED', 'VERIFIED_SECONDARY'], c.id)
        .toContain(fastest(c.from, c.to).distanceConfidence);
    }
  });
});
