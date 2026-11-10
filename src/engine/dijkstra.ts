/**
 * Metrorythm — Dijkstra's shortest-path algorithm over the local station graph.
 *
 * The graph is a (station, line) platform graph; see engine/graph.ts. The cost
 * of an edge is supplied by the caller so the same implementation serves all
 * three optimisation modes (fastest / cheapest / fewest interchanges).
 */

import type { GraphEdge, MetroGraph, NodeKey } from './graph';

/** Minimal binary min-heap. Keeps Dijkstra at O((V + E) log V). */
class MinHeap<T> {
  private heap: { key: number; value: T }[] = [];

  get size(): number {
    return this.heap.length;
  }

  push(key: number, value: T): void {
    this.heap.push({ key, value });
    let i = this.heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[parent].key <= this.heap[i].key) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  pop(): { key: number; value: T } | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < this.heap.length && this.heap[l].key < this.heap[smallest].key) smallest = l;
        if (r < this.heap.length && this.heap[r].key < this.heap[smallest].key) smallest = r;
        if (smallest === i) break;
        [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

export interface PathStep {
  edge: GraphEdge;
  from: NodeKey;
  to: NodeKey;
}

export interface DijkstraResult {
  /** Ordered edges from source to target, or null when unreachable. */
  path: PathStep[] | null;
  /** Accumulated cost under the supplied cost function. */
  cost: number;
  /** Number of nodes settled — useful in tests and diagnostics. */
  visited: number;
}

export type EdgeCostFn = (edge: GraphEdge, previous: GraphEdge | null) => number;

/**
 * Standard Dijkstra with multiple sources and multiple targets.
 *
 * Multiple sources/targets exist because a station can have several platforms
 * (one per line) and the journey may start or end on any of them.
 */
export function dijkstra(
  graph: MetroGraph,
  sources: NodeKey[],
  targets: Set<NodeKey>,
  edgeCost: EdgeCostFn,
): DijkstraResult {
  const dist = new Map<NodeKey, number>();
  const prev = new Map<NodeKey, PathStep>();
  const settled = new Set<NodeKey>();
  const heap = new MinHeap<NodeKey>();

  for (const s of sources) {
    if (!graph.adjacency.has(s)) continue;
    dist.set(s, 0);
    heap.push(0, s);
  }

  let reached: NodeKey | null = null;

  while (heap.size > 0) {
    const top = heap.pop()!;
    const node = top.value;
    if (settled.has(node)) continue;
    settled.add(node);

    if (targets.has(node)) {
      reached = node;
      break;
    }

    const currentDist = dist.get(node)!;
    const incoming = prev.get(node)?.edge ?? null;

    for (const edge of graph.adjacency.get(node) ?? []) {
      if (settled.has(edge.to)) continue;
      const next = currentDist + edgeCost(edge, incoming);
      if (next < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, next);
        prev.set(edge.to, { edge, from: node, to: edge.to });
        heap.push(next, edge.to);
      }
    }
  }

  if (reached === null) return { path: null, cost: Infinity, visited: settled.size };

  const path: PathStep[] = [];
  let cursor: NodeKey | undefined = reached;
  while (cursor !== undefined) {
    const step: PathStep | undefined = prev.get(cursor);
    if (!step) break;
    path.unshift(step);
    cursor = step.from;
  }

  return { path, cost: dist.get(reached)!, visited: settled.size };
}
