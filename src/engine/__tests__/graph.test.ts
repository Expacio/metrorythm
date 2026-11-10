import { describe, expect, it } from 'vitest';
import { delhi } from '../../data';
import {
  buildGraph,
  haversineKm,
  nodeKey,
  parseNodeKey,
  stationDistanceKm,
  FALLBACK_HOP_KM,
} from '../graph';

const graph = buildGraph(delhi);

describe('node keys', () => {
  it('round-trips station and line', () => {
    const key = nodeKey('rajiv-chowk', 'blue');
    expect(parseNodeKey(key)).toEqual({ station: 'rajiv-chowk', line: 'blue' });
  });
});

describe('haversine', () => {
  it('returns zero for identical points', () => {
    expect(haversineKm(28.6, 77.2, 28.6, 77.2)).toBe(0);
  });

  it('is symmetric', () => {
    const a = haversineKm(28.63, 77.21, 28.57, 77.32);
    const b = haversineKm(28.57, 77.32, 28.63, 77.21);
    expect(a).toBeCloseTo(b, 9);
  });

  it('matches a known distance within tolerance', () => {
    // Rajiv Chowk to Kashmere Gate is roughly 4 km as the crow flies.
    const d = haversineKm(28.6328, 77.2197, 28.6675, 77.2281);
    expect(d).toBeGreaterThan(3);
    expect(d).toBeLessThan(5);
  });
});

describe('stationDistanceKm', () => {
  it('falls back to a documented constant when a coordinate is missing', () => {
    const a = { id: 'a', name: 'A', lines: [], aliases: [], lat: null, lng: null, coordSource: null };
    const b = { id: 'b', name: 'B', lines: [], aliases: [], lat: 28.6, lng: 77.2, coordSource: 'surveyed' as const };
    expect(stationDistanceKm(a, b)).toBe(FALLBACK_HOP_KM);
    expect(stationDistanceKm(undefined, b)).toBe(FALLBACK_HOP_KM);
  });
});

describe('graph construction', () => {
  it('creates a platform node for every (station, line) pair', () => {
    const expected = delhi.lines.reduce((sum, l) => sum + l.stations.length, 0);
    expect(graph.adjacency.size).toBe(expected);
  });

  it('makes every ride edge bidirectional', () => {
    for (const [from, edges] of graph.adjacency) {
      for (const edge of edges) {
        if (edge.kind !== 'ride') continue;
        const back = graph.adjacency.get(edge.to) ?? [];
        expect(back.some((e) => e.to === from && e.kind === 'ride')).toBe(true);
      }
    }
  });

  it('never produces an edge to a node that does not exist', () => {
    for (const edges of graph.adjacency.values()) {
      for (const edge of edges) {
        expect(graph.adjacency.has(edge.to)).toBe(true);
      }
    }
  });

  it('connects every station to the network', () => {
    const seen = new Set<string>();
    const start = graph.adjacency.keys().next().value!;
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const e of graph.adjacency.get(cur) ?? []) if (!seen.has(e.to)) stack.push(e.to);
    }
    expect(seen.size).toBe(graph.adjacency.size);
  });

  it('only references lines and stations that exist in the dataset', () => {
    for (const edges of graph.adjacency.values()) {
      for (const edge of edges) {
        expect(graph.linesById.has(edge.line)).toBe(true);
        expect(graph.stationsById.has(edge.fromStation)).toBe(true);
        expect(graph.stationsById.has(edge.toStation)).toBe(true);
      }
    }
  });
});
