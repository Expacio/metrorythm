/**
 * Chennai (CMRL) dataset and routing.
 *
 * Mirrors the Delhi suite's structural checks, plus the things specific to
 * Chennai: a single-operator network, and the MAA airport code that the Delhi
 * dataset deliberately cannot answer.
 */
import { describe, expect, it } from 'vitest';
import { chennai, CITIES, getCity } from '../../data';
import { buildGraph } from '../graph';
import { createPlanner, type Journey, type RideLeg } from '../planner';
import { createSearch } from '../search';
import { fareForDistance } from '../fare';
import { CMRL } from '../../data/fares';

const planner = createPlanner(chennai);
const search = createSearch(chennai);
const graph = buildGraph(chennai);
const rides = (j: Journey) => j.legs.filter((l): l is RideLeg => l.type === 'ride');

function route(a: string, b: string): Journey {
  const r = planner.plan(a, b, { modes: ['fastest'] });
  expect(r.error, `${a} -> ${b}`).toBeUndefined();
  return r.journeys[0];
}

describe('dataset shape', () => {
  it('has the three operational lines and nothing under construction', () => {
    expect(chennai.lines.map((l) => l.id).sort()).toEqual(['blue', 'green', 'yellow']);
  });

  it('has 51 unique stations', () => {
    expect(chennai.stations).toHaveLength(51);
  });

  it('matches the published per-line station counts', () => {
    const count = (id: string) => chennai.lines.find((l) => l.id === id)!.stations.length;
    expect(count('blue')).toBe(26);
    expect(count('green')).toBe(17);
    expect(count('yellow')).toBe(11);
  });

  it('has exactly the three real interchanges', () => {
    const names = chennai.stations
      .filter((s) => s.lines.length > 1)
      .map((s) => s.name)
      .sort();
    expect(names).toEqual(['Alandur', 'MGR Central', 'Vadapalani']);
  });

  it('positions every station', () => {
    expect(chennai.stations.every((s) => s.lat !== null && s.lng !== null)).toBe(true);
  });

  it('records provenance for every position', () => {
    expect(chennai.stations.every((s) => s.coordSource !== null)).toBe(true);
  });

  it('is fully connected', () => {
    const seen = new Set<string>();
    const stack = [graph.adjacency.keys().next().value!];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const e of graph.adjacency.get(cur) ?? []) if (!seen.has(e.to)) stack.push(e.to);
    }
    expect(seen.size).toBe(graph.adjacency.size);
  });
});

describe('routing', () => {
  it('routes the full length of the Blue Line without an interchange', () => {
    const j = route('wimco-nagar-depot', 'chennai-airport');
    expect(j.interchanges).toBe(0);
    expect(rides(j)[0].line.id).toBe('blue');
    expect(j.stationCount).toBe(25);
  });

  it('changes at a real interchange when crossing lines', () => {
    const j = route('chennai-airport', 'cmbt');
    expect(j.interchanges).toBe(1);
    expect(new Set(rides(j).map((l) => l.line.id))).toEqual(new Set(['blue', 'green']));
  });

  it('reaches the Yellow Line via Vadapalani', () => {
    const j = route('mgr-central', 'poonamallee-bypass');
    const lines = rides(j).map((l) => l.line.id);
    expect(lines).toContain('green');
    expect(lines).toContain('yellow');
    expect(j.legs.some((l) => l.type === 'transfer' && l.at.name === 'Vadapalani')).toBe(true);
  });

  it('names the direction of travel by terminus', () => {
    const j = route('egmore', 'cmbt');
    expect(rides(j)[0].direction).toBe('towards St. Thomas Mount');
  });

  it('keeps legs contiguous', () => {
    const j = route('chennai-airport', 'poonamallee-bypass');
    let cursor = j.origin.id;
    for (const leg of j.legs) {
      if (leg.type === 'ride') { expect(leg.from.id).toBe(cursor); cursor = leg.to.id; }
      else { expect(leg.at.id).toBe(cursor); if (leg.to) cursor = leg.to.id; }
    }
    expect(cursor).toBe(j.destination.id);
  });
});

describe('fares', () => {
  it('bills CMRL and nothing else', () => {
    const j = route('chennai-airport', 'poonamallee-bypass');
    expect(j.fare.segments.map((s) => s.fareSystemId)).toEqual(['cmrl']);
  });

  it('charges ONE fare across a two-line journey', () => {
    const j = route('chennai-airport', 'cmbt');
    expect(j.interchanges).toBe(1);
    expect(j.fare.segments).toHaveLength(1);
    expect(j.fare.multiOperator).toBe(false);
  });

  it('prices from the CMRL slab for the distance travelled', () => {
    const j = route('mgr-central', 'guindy');
    expect(j.fare.token).toBe(fareForDistance(CMRL.slabs!, j.fare.segments[0].km));
  });

  it('applies CMRL 20% smart-card discount, not DMRC 10%', () => {
    const j = route('chennai-airport', 'mgr-central');
    expect(j.fare.smartCard).toBe(Math.round(j.fare.token * 0.8));
  });

  it('is labelled estimated, because the long-distance slab is disputed', () => {
    expect(CMRL.confidence).toBe('estimated');
    expect(route('chennai-airport', 'cmbt').fare.confidence).toBe('estimated');
  });
});

describe('search', () => {
  it('resolves the MAA airport code', () => {
    expect(search.search('MAA')[0].station.id).toBe('chennai-airport');
  });

  it('resolves the official long name of MGR Central', () => {
    const ids = search.search('Puratchi Thalaivar Dr. M.G. Ramachandran Central').map((r) => r.station.id);
    expect(ids).toContain('mgr-central');
  });

  it('resolves Chennai Central', () => {
    expect(search.search('Chennai Central').map((r) => r.station.id)).toContain('mgr-central');
  });

  it('resolves CMBT from its official long name', () => {
    const ids = search.search('Jayalalithaa CMBT').map((r) => r.station.id);
    expect(ids).toContain('cmbt');
  });

  it('tolerates alternate transliterations', () => {
    expect(search.search('Thiruvottiyur').map((r) => r.station.id)).toContain('tiruvottriyur');
  });

  it('resolves a landmark', () => {
    expect(search.search('Koyambedu Bus Terminus').map((r) => r.station.id)).toContain('cmbt');
  });
});

describe('city registry', () => {
  it('exposes both cities', () => {
    expect(CITIES.map((c) => c.city.cityId)).toEqual(['delhi', 'chennai']);
  });

  it('looks a city up by id', () => {
    expect(getCity('chennai').city.cityName).toBe('Chennai');
  });

  it('falls back to the default for an unknown id', () => {
    expect(getCity('atlantis').city.cityId).toBe('delhi');
  });

  it('keeps station ids unique within each city', () => {
    for (const c of CITIES) {
      const ids = c.stations.map((s) => s.id);
      expect(new Set(ids).size, c.city.cityName).toBe(ids.length);
    }
  });
});
