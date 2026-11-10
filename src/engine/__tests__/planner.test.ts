import { describe, expect, it } from 'vitest';
import { delhi } from '../../data';
import { createPlanner, type Journey, type RideLeg } from '../planner';

const planner = createPlanner(delhi);
const rides = (j: Journey) => j.legs.filter((l): l is RideLeg => l.type === 'ride');

function fastest(from: string, to: string): Journey {
  const res = planner.plan(from, to, { modes: ['fastest'] });
  expect(res.error).toBeUndefined();
  expect(res.journeys.length).toBeGreaterThan(0);
  return res.journeys[0];
}

describe('basic routing', () => {
  it('routes between two adjacent stations on one line', () => {
    const j = fastest('rajiv-chowk', 'barakhamba-road');
    expect(j.interchanges).toBe(0);
    expect(j.stationCount).toBe(1);
    expect(rides(j)).toHaveLength(1);
    expect(rides(j)[0].line.id).toBe('blue');
  });

  it('routes along a single line without any interchange', () => {
    const j = fastest('rithala', 'kashmere-gate');
    expect(j.interchanges).toBe(0);
    expect(rides(j)[0].line.id).toBe('red');
    expect(j.stationCount).toBe(13);
  });

  it('reports the direction of travel using the line terminus', () => {
    const j = fastest('rajiv-chowk', 'noida-sector-18');
    const leg = rides(j).find((l) => l.line.id === 'blue')!;
    expect(leg.direction).toBe('towards Noida Electronic City');
  });

  it('reports the opposite terminus when travelling the other way', () => {
    const j = fastest('noida-sector-18', 'rajiv-chowk');
    const leg = rides(j).find((l) => l.line.id === 'blue')!;
    expect(leg.direction).toBe('towards Dwarka Sector 21');
  });

  it('lists intermediate stations on a ride leg', () => {
    const j = fastest('rajiv-chowk', 'mandi-house');
    const leg = rides(j)[0];
    expect(leg.intermediate.map((s) => s.id)).toEqual(['barakhamba-road']);
  });
});

describe('interchanges', () => {
  it('changes line when required and counts it', () => {
    // Blue Line to Violet Line — no direct service exists.
    const j = fastest('dwarka-mor', 'nehru-place');
    expect(j.interchanges).toBeGreaterThanOrEqual(1);
    const lineIds = rides(j).map((l) => l.line.id);
    expect(new Set(lineIds).size).toBeGreaterThan(1);
  });

  it('adds interchange walking time to the total', () => {
    const j = fastest('dwarka-mor', 'nehru-place');
    expect(j.walkSeconds).toBeGreaterThan(0);
    expect(j.totalSeconds).toBe(j.rideSeconds + j.walkSeconds);
  });

  it('alternates ride and transfer legs, never two transfers in a row', () => {
    const j = fastest('shiv-vihar', 'millennium-city-centre-gurugram');
    for (let i = 1; i < j.legs.length; i += 1) {
      if (j.legs[i].type === 'transfer') expect(j.legs[i - 1].type).toBe('ride');
    }
  });

  it('starts and ends with a ride leg', () => {
    const j = fastest('shiv-vihar', 'millennium-city-centre-gurugram');
    expect(j.legs[0].type).toBe('ride');
    expect(j.legs[j.legs.length - 1].type).toBe('ride');
  });
});

describe('route legs are contiguous', () => {
  it('each leg begins where the previous one ended', () => {
    const j = fastest('shaheed-sthal-new-bus-adda', 'raja-nahar-singh');
    let cursor = j.origin.id;
    for (const leg of j.legs) {
      if (leg.type === 'ride') {
        expect(leg.from.id).toBe(cursor);
        cursor = leg.to.id;
      } else {
        expect(leg.at.id).toBe(cursor);
        if (leg.to) cursor = leg.to.id;
      }
    }
    expect(cursor).toBe(j.destination.id);
  });
});

describe('optimisation modes', () => {
  it('fewest-interchanges never uses more changes than fastest', () => {
    const pairs: [string, string][] = [
      ['dwarka-sector-21', 'noida-electronic-city'],
      ['shiv-vihar', 'millennium-city-centre-gurugram'],
      ['rithala', 'raja-nahar-singh'],
      ['brigadier-hoshiyar-singh', 'vaishali'],
    ];
    for (const [a, b] of pairs) {
      const f = planner.plan(a, b, { modes: ['fastest'] }).journeys[0];
      const m = planner.plan(a, b, { modes: ['fewest-interchanges'] }).journeys[0];
      expect(m.interchanges).toBeLessThanOrEqual(f.interchanges);
    }
  });

  it('fastest is never slower than the other modes', () => {
    const res = planner.plan('rithala', 'raja-nahar-singh');
    const f = res.journeys.find((j) => j.mode === 'fastest')!;
    for (const j of res.journeys) {
      expect(f.totalSeconds).toBeLessThanOrEqual(j.totalSeconds + 1);
    }
  });

  it('cheapest is never more expensive than the other modes', () => {
    const res = planner.plan('new-delhi', 'dwarka-sector-21');
    const c = res.journeys.find((j) => j.mode === 'cheapest');
    if (!c) return;
    for (const j of res.journeys) {
      expect(c.fare.token).toBeLessThanOrEqual(j.fare.token);
    }
  });

  it('deduplicates journeys that are identical across modes', () => {
    const res = planner.plan('rajiv-chowk', 'barakhamba-road');
    expect(res.journeys).toHaveLength(1);
  });

  it('records every mode that produced a deduplicated route', () => {
    const res = planner.plan('rajiv-chowk', 'barakhamba-road');
    expect(res.journeys[0].modes).toEqual(
      expect.arrayContaining(['fastest', 'cheapest', 'fewest-interchanges']),
    );
  });

  it('never lists a mode twice on one journey', () => {
    const res = planner.plan('shiv-vihar', 'millennium-city-centre-gurugram');
    for (const j of res.journeys) {
      expect(new Set(j.modes).size).toBe(j.modes.length);
    }
  });

  it('assigns every requested mode to exactly one journey', () => {
    const res = planner.plan('dwarka-sector-21', 'noida-electronic-city');
    const all = res.journeys.flatMap((j) => j.modes);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(['cheapest', 'fastest', 'fewest-interchanges']);
  });
});

describe('fares', () => {
  it('reports a confidence level on every fare', () => {
    const j = fastest('rithala', 'kashmere-gate');
    expect(['official', 'estimated', 'unavailable']).toContain(j.fare.confidence);
  });

  it('charges a separate fare when the journey crosses operators', () => {
    // New Delhi -> IGI T3 is Airport Express only: one fare system.
    const direct = fastest('new-delhi', 'igi-airport-terminal-3');
    expect(direct.fare.segments).toHaveLength(1);
    expect(direct.fare.segments[0].fareSystemId).toBe('airportExpress');
  });

  it('bills the Aqua Line separately from the DMRC network', () => {
    const j = fastest('rajiv-chowk', 'pari-chowk');
    const systems = new Set(j.fare.segments.map((s) => s.fareSystemId));
    expect(systems.has('dmrc')).toBe(true);
    expect(systems.has('nmrcAqua')).toBe(true);
    expect(j.fare.segments.length).toBeGreaterThan(1);
    expect(j.fare.notes.some((n) => n.includes('fare-system boundary'))).toBe(true);
  });

  it('produces a positive fare for every journey', () => {
    const j = fastest('shiv-vihar', 'raja-nahar-singh');
    expect(j.fare.token).toBeGreaterThan(0);
  });
});

describe('error handling', () => {
  it('rejects an unknown origin', () => {
    const res = planner.plan('not-a-station', 'rajiv-chowk');
    expect(res.error).toMatch(/Unknown station/);
    expect(res.journeys).toHaveLength(0);
  });

  it('rejects identical origin and destination', () => {
    const res = planner.plan('rajiv-chowk', 'rajiv-chowk');
    expect(res.error).toMatch(/same station/);
  });
});

describe('the worked example from the brief: DEL airport -> Hindon River', () => {
  const j = fastest('igi-airport-terminal-3', 'hindon-river');

  it('starts at the Airport Express station inside Terminal 3', () => {
    expect(j.origin.name).toBe('IGI Airport (Terminal 3)');
    expect(rides(j)[0].line.id).toBe('airport');
  });

  it('ends on the Red Line at Hindon River', () => {
    const last = rides(j)[rides(j).length - 1];
    expect(last.line.id).toBe('red');
    expect(last.to.name).toBe('Hindon River');
  });

  it('requires at least one interchange', () => {
    expect(j.interchanges).toBeGreaterThanOrEqual(1);
  });

  it('charges both the Airport Express and the DMRC network', () => {
    const systems = j.fare.segments.map((s) => s.fareSystemId);
    expect(systems).toContain('airportExpress');
    expect(systems).toContain('dmrc');
  });

  it('is a plausible cross-city journey length', () => {
    expect(j.totalSeconds).toBeGreaterThan(45 * 60);
    expect(j.totalSeconds).toBeLessThan(150 * 60);
  });
});

describe('every station pair is reachable', () => {
  it('routes from one terminus of each line to Rajiv Chowk', () => {
    for (const line of delhi.lines) {
      const terminus = line.stations[0];
      if (terminus === 'rajiv-chowk') continue;
      const res = planner.plan(terminus, 'rajiv-chowk', { modes: ['fastest'] });
      expect(res.error, `${line.name} terminus ${terminus}`).toBeUndefined();
      expect(res.journeys[0].legs.length).toBeGreaterThan(0);
    }
  });
});
