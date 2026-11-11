import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Crosshair, Info, Layers } from 'lucide-react';
import type { CityDataset, Line, Station } from '../data/types';
import type { Journey } from '../engine/planner';

/**
 * Metrorythm — hand-built transit map.
 *
 * Every pixel here is drawn by this component. There is no map library, no
 * tile server, no geocoder and no network request of any kind — it renders SVG
 * straight from the station coordinates hardcoded in the dataset.
 *
 * The cartography, in order of how much it matters:
 *   1. Every line is drawn TWICE — a wide casing in the map's own background
 *      colour, then the line colour on top. That is what turns a tangle of
 *      crossings into something readable.
 *   2. Paths are Catmull-Rom smoothed. Track curves; straight segments between
 *      stations look like join-the-dots.
 *   3. Detail is revealed by zoom. 262 stations at once is noise, so plain
 *      stations and their labels fade in as you zoom.
 *   4. Interchanges are always drawn and always labelled — they are the only
 *      stations you must be able to find in order to plan a journey.
 *   5. A station with no position at all BREAKS the line rather than being
 *      bridged, because bridging would invent an alignment.
 */

interface Props {
  dataset: CityDataset;
  journey: Journey | null;
  highlight: Station | null;
  onSelectStation?: (station: Station) => void;
}

interface Pt { x: number; y: number }

const WIDTH = 1000;
const HEIGHT = 780;
const PAD = 58;

const MIN_ZOOM = 0.8;
const MAX_ZOOM = 10;

/** Zoom levels at which progressively more detail appears. */
const Z_STATION_DOTS = 1.6;
const Z_INTERCHANGE_LABELS = 1.25;
const Z_ALL_LABELS = 3.2;

/* ----------------------------------------------------------------- geometry */

/**
 * Catmull-Rom spline through the points, emitted as cubic béziers.
 * `tension` 0 = polyline, 1 = round. Metro track wants a gentle curve.
 */
function smoothPath(pts: Pt[], tension = 0.8): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const k = tension / 6;
    const c1x = p1.x + (p2.x - p0.x) * k;
    const c1y = p1.y + (p2.y - p0.y) * k;
    const c2x = p2.x - (p3.x - p1.x) * k;
    const c2y = p2.y - (p3.y - p1.y) * k;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

/** Split an ordered station list into runs whose stations all have a position. */
function contiguousRuns(ids: string[], pos: Map<string, Pt>): Pt[][] {
  const runs: Pt[][] = [];
  let run: Pt[] = [];
  for (const id of ids) {
    const p = pos.get(id);
    if (p) run.push(p);
    else {
      if (run.length > 1) runs.push(run);
      run = [];
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

/* --------------------------------------------------------------- component */

export function MetroMap({ dataset, journey, highlight, onSelectStation }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pt>({ x: 0, y: 0 });
  const [hovered, setHovered] = useState<Station | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);

  const plotted = useMemo(
    () => dataset.stations.filter((s) => s.lat != null && s.lng != null),
    [dataset],
  );

  /** Equirectangular projection fitted to the viewport — fine at city scale. */
  const pos = useMemo(() => {
    const m = new Map<string, Pt>();
    if (plotted.length === 0) return m;
    const lats = plotted.map((s) => s.lat!);
    const lngs = plotted.map((s) => s.lng!);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const xSpan = (maxLng - minLng) * cos || 1;
    const ySpan = maxLat - minLat || 1;
    const scale = Math.min((WIDTH - PAD * 2) / xSpan, (HEIGHT - PAD * 2) / ySpan);
    const offX = (WIDTH - xSpan * scale) / 2;
    const offY = (HEIGHT - ySpan * scale) / 2;
    for (const s of plotted) {
      m.set(s.id, {
        x: offX + (s.lng! - minLng) * cos * scale,
        y: offY + (maxLat - s.lat!) * scale, // SVG y grows downward
      });
    }
    return m;
  }, [plotted]);

  const linesById = useMemo(() => new Map(dataset.lines.map((l) => [l.id, l])), [dataset.lines]);

  /** Base network geometry: one path per unbroken run of each line. */
  const linePaths = useMemo(() => {
    const out: { line: Line; key: string; d: string }[] = [];
    for (const line of dataset.lines as Line[]) {
      contiguousRuns(line.stations, pos).forEach((run, i) => {
        out.push({ line, key: `${line.id}-${i}`, d: smoothPath(run) });
      });
    }
    return out;
  }, [dataset.lines, pos]);

  /** Stations belonging to the selected journey. */
  const routeIds = useMemo(() => {
    if (!journey) return null;
    const ids = new Set<string>([journey.origin.id, journey.destination.id]);
    for (const leg of journey.legs) {
      if (leg.type === 'ride') {
        ids.add(leg.from.id);
        ids.add(leg.to.id);
        for (const s of leg.intermediate) ids.add(s.id);
      } else {
        ids.add(leg.at.id);
        if (leg.to) ids.add(leg.to.id);
      }
    }
    return ids;
  }, [journey]);

  const routePaths = useMemo(() => {
    if (!journey) return [];
    const out: { color: string; d: string; key: string }[] = [];
    journey.legs.forEach((leg, i) => {
      if (leg.type !== 'ride') return;
      const ids = [leg.from.id, ...leg.intermediate.map((s) => s.id), leg.to.id];
      contiguousRuns(ids, pos).forEach((run, j) => {
        out.push({ color: leg.line.color, d: smoothPath(run), key: `${i}-${j}` });
      });
    });
    return out;
  }, [journey, pos]);

  const interchanges = useMemo(() => plotted.filter((s) => s.lines.length > 1), [plotted]);

  const termini = useMemo(() => {
    const ids = new Set<string>();
    for (const l of dataset.lines) {
      ids.add(l.stations[0]);
      ids.add(l.stations[l.stations.length - 1]);
    }
    return plotted.filter((s) => ids.has(s.id));
  }, [dataset.lines, plotted]);

  /* -------------------------------------------------------------- viewport */

  const fitTo = useCallback((pts: Pt[], maxZoom = 4.5) => {
    if (pts.length === 0) return;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    const z = Math.min(maxZoom, Math.max(1, 0.7 / Math.max(spanX / WIDTH, spanY / HEIGHT)));
    setZoom(z);
    setPan({ x: WIDTH / 2 - (minX + maxX) / 2, y: HEIGHT / 2 - (minY + maxY) / 2 });
  }, []);

  useEffect(() => {
    if (!journey || !routeIds) return;
    fitTo([...routeIds].map((id) => pos.get(id)).filter((p): p is Pt => !!p));
  }, [journey, routeIds, pos, fitTo]);

  const toSvg = (clientX: number, clientY: number): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * WIDTH, y: ((clientY - r.top) / r.height) * HEIGHT };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = toSvg(e.clientX, e.clientY);
    drag.current = { x: p.x, y: p.y, px: pan.x, py: pan.y, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const p = toSvg(e.clientX, e.clientY);
    const dx = p.x - drag.current.x;
    const dy = p.y - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true;
    setPan({ x: drag.current.px + dx / zoom, y: drag.current.py + dy / zoom });
  };
  const endDrag = () => { drag.current = null; };

  /**
   * Wheel zoom, anchored on the cursor so the map grows where you point.
   *
   * This has to be a native listener registered with `{ passive: false }`.
   * React attaches `onWheel` passively at the root, where `preventDefault()`
   * is ignored — so the page kept scrolling behind the map while it zoomed.
   *
   * `view` mirrors the current zoom/pan into a ref because the listener is
   * registered once; reading state through the closure would pin it to the
   * values from first render.
   */
  const view = useRef({ zoom, pan });
  view.current = { zoom, pan };

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const p = {
        x: ((e.clientX - r.left) / r.width) * WIDTH,
        y: ((e.clientY - r.top) / r.height) * HEIGHT,
      };
      const { zoom: z, pan: current } = view.current;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * Math.exp(-e.deltaY * 0.0016)));
      if (next === z) return;
      const k = 1 / z - 1 / next;
      setPan({ x: current.x - (p.x - WIDTH / 2) * k, y: current.y - (p.y - HEIGHT / 2) * k });
      setZoom(next);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoomBy = (f: number) => setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * f)));
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  /*
   * Everything below runs before the empty-state return on purpose: React
   * requires hooks in the same order every render, and the label useMemo used
   * to sit after an early return, so a city with no coordinates changed the
   * hook count. Computing labels for an empty map is free.
   */
  /* --------------------------------------------------------------- drawing */

  // Counter-scale so strokes and markers keep a constant on-screen size.
  const k = 1 / Math.max(zoom, 0.0001);
  const dimmed = (id: string) => (routeIds ? !routeIds.has(id) : false);
  const focus = hovered ?? highlight;
  const showDots = zoom >= Z_STATION_DOTS;
  const showAllLabels = zoom >= Z_ALL_LABELS;
  const showInterchangeLabels = zoom >= Z_INTERCHANGE_LABELS;

  /**
   * Label placement.
   *
   * Labels are the difference between a readable map and a smear. Candidates
   * are ranked (busiest interchanges first, then termini, then the rest), then
   * placed greedily: try the right of the dot, then the left, and skip the
   * label entirely if both collide with something already placed.
   *
   * All of this works in un-zoomed group units. Font size is counter-scaled by
   * `k`, so a label's footprint in group units already shrinks as you zoom in —
   * which is exactly why more labels fit at higher zoom.
   */
  const labels = useMemo(() => {
    type Cand = { s: Station; p: Pt; weight: number; size: number; rank: number };
    const cands: Cand[] = [];
    const seen = new Set<string>();

    const add = (s: Station, weight: number, size: number, rank: number) => {
      if (seen.has(s.id) || dimmed(s.id)) return;
      const p = pos.get(s.id);
      if (!p) return;
      seen.add(s.id);
      cands.push({ s, p, weight, size, rank });
    };

    // Busiest interchanges first — they anchor the whole map.
    for (const s of [...interchanges].sort((a, b) => b.lines.length - a.lines.length)) {
      if (showInterchangeLabels) add(s, 700, 11, 0);
    }
    for (const s of termini) add(s, 700, 11, 1);
    if (showAllLabels) for (const s of plotted) add(s, 500, 10, 2);

    cands.sort((a, b) => a.rank - b.rank);

    const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const out: (Cand & { anchor: 'start' | 'end'; x: number; y: number })[] = [];
    const GAP = 7.5 * k;

    for (const c of cands) {
      // Google Sans averages a little over half an em per glyph.
      const w = c.s.name.length * c.size * 0.53 * k;
      const h = c.size * 1.15 * k;
      const y = c.p.y + 3.6 * k;

      const options: { anchor: 'start' | 'end'; x: number; x1: number; x2: number }[] = [
        { anchor: 'start', x: c.p.x + GAP, x1: c.p.x + GAP, x2: c.p.x + GAP + w },
        { anchor: 'end', x: c.p.x - GAP, x1: c.p.x - GAP - w, x2: c.p.x - GAP },
      ];

      for (const o of options) {
        const box = { x1: o.x1, y1: y - h, x2: o.x2, y2: y + h * 0.35 };
        const hits = placed.some(
          (q) => box.x1 < q.x2 && box.x2 > q.x1 && box.y1 < q.y2 && box.y2 > q.y1,
        );
        if (!hits) {
          placed.push(box);
          out.push({ ...c, anchor: o.anchor, x: o.x, y });
          break;
        }
      }
    }
    return out;
  }, [interchanges, termini, plotted, pos, k, showAllLabels, showInterchangeLabels, routeIds]);

  /* ------------------------------------------------------------ empty state */

  if (plotted.length === 0) {
    return (
      <div className="grid h-full min-h-72 place-items-center rounded-2xl border border-dashed border-ink-300 bg-ink-50 p-8 text-center dark:border-ink-700 dark:bg-ink-800/40">
        <div className="max-w-sm">
          <Info className="mx-auto size-6 text-ink-400" aria-hidden />
          <p className="mt-3 text-[14px] font-semibold text-ink-700 dark:text-ink-200">
            No station coordinates in this build
          </p>
          <p className="mt-1.5 text-[13px] text-ink-500 dark:text-ink-400">
            Routing and fares still work normally.
          </p>
        </div>
      </div>
    );
  }


  return (
    <div className="relative h-full overflow-hidden rounded-2xl border border-ink-200 bg-ink-50 [--map-halo:#f7f7f7] dark:border-ink-700 dark:bg-ink-950 dark:[--map-halo:#000000]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={() => { endDrag(); setHovered(null); }}
        role="img"
        aria-label={`${dataset.city.cityName} metro network map`}
      >
        <defs>
          <filter id="mr-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="mr-grid" width="44" height="44" patternUnits="userSpaceOnUse">
            <path d="M 44 0 L 0 0 0 44" fill="none" stroke="currentColor" strokeWidth="0.7" />
          </pattern>
        </defs>

        {/* Faint grid so panning has a sense of place */}
        <rect
          width={WIDTH}
          height={HEIGHT}
          fill="url(#mr-grid)"
          className="text-ink-200 dark:text-ink-800"
          opacity={0.55}
        />

        <g transform={`translate(${WIDTH / 2} ${HEIGHT / 2}) scale(${zoom}) translate(${-WIDTH / 2 + pan.x} ${-HEIGHT / 2 + pan.y})`}>
          {/* 1. Casings — a halo beneath every line so crossings read cleanly */}
          {linePaths.map(({ key, d }) => (
            <path
              key={`casing-${key}`}
              d={d}
              fill="none"
              stroke="var(--map-halo)"
              strokeWidth={(journey ? 5 : 8) * k}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={journey ? 0.55 : 1}
            />
          ))}

          {/* 2. The network */}
          {linePaths.map(({ line, key, d }) => (
            <path
              key={key}
              d={d}
              fill="none"
              stroke={line.color}
              strokeWidth={(journey ? 2.2 : 4.4) * k}
              strokeOpacity={journey ? 0.28 : 1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* 3. The selected journey, over everything, with a glow */}
          {routePaths.length > 0 && (
            <g filter="url(#mr-glow)">
              {routePaths.map(({ key, d }) => (
                <path
                  key={`rc-${key}`}
                  d={d}
                  fill="none"
                  stroke="var(--map-halo)"
                  strokeWidth={11.5 * k}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {routePaths.map(({ key, d, color }) => (
                <path
                  key={`r-${key}`}
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={6.5 * k}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </g>
          )}

          {/* 4. Plain stations, revealed on zoom */}
          {showDots && plotted.map((s) => {
            if (s.lines.length > 1) return null;
            const p = pos.get(s.id)!;
            const line = linesById.get(s.lines[0]);
            return (
              <circle
                key={s.id}
                cx={p.x}
                cy={p.y}
                r={2.7 * k}
                fill="var(--map-halo)"
                stroke={line?.color ?? '#8e8e8e'}
                strokeWidth={1.7 * k}
                opacity={dimmed(s.id) ? 0.22 : 1}
                className="cursor-pointer"
                onPointerEnter={() => setHovered(s)}
                onClick={(e) => { e.stopPropagation(); if (!drag.current?.moved) onSelectStation?.(s); }}
              >
                <title>{s.name}</title>
              </circle>
            );
          })}

          {/* 5. Interchanges — always drawn, sized by how many lines meet */}
          {interchanges.map((s) => {
            const p = pos.get(s.id)!;
            return (
              <circle
                key={s.id}
                cx={p.x}
                cy={p.y}
                r={(s.lines.length > 2 ? 6.2 : 4.9) * k}
                fill="var(--map-halo)"
                className="cursor-pointer stroke-ink-900 dark:stroke-ink-100"
                strokeWidth={2.7 * k}
                opacity={dimmed(s.id) ? 0.22 : 1}
                onPointerEnter={() => setHovered(s)}
                onClick={(e) => { e.stopPropagation(); if (!drag.current?.moved) onSelectStation?.(s); }}
              >
                <title>{`${s.name} — ${s.lines.length} lines`}</title>
              </circle>
            );
          })}

          {/* 6. Labels — de-conflicted, see `labels` above */}
          {labels.map((l) => (
            <text
              key={`lab-${l.s.id}`}
              x={l.x}
              y={l.y}
              textAnchor={l.anchor}
              fontSize={l.size * k}
              fontWeight={l.weight}
              className="pointer-events-none select-none fill-ink-900 dark:fill-ink-50"
              stroke="var(--map-halo)"
              strokeWidth={3.4 * k}
              paintOrder="stroke"
              strokeLinejoin="round"
            >
              {l.s.name}
            </text>
          ))}

          {/* 7. Journey endpoints */}
          {journey && [
            { s: journey.origin, fill: '#ffd200' },
            { s: journey.destination, fill: '#000000' },
          ].map(({ s, fill }, i) => {
            const p = pos.get(s.id);
            if (!p) return null;
            return (
              <g key={`end-${i}`}>
                <circle cx={p.x} cy={p.y} r={10.5 * k} fill="var(--map-halo)" />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={7 * k}
                  fill={fill}
                  className="stroke-ink-900 dark:stroke-ink-100"
                  strokeWidth={2.5 * k}
                />
              </g>
            );
          })}

          {/* 8. Hover / selection emphasis */}
          {focus && pos.get(focus.id) && (
            <g transform={`translate(${pos.get(focus.id)!.x} ${pos.get(focus.id)!.y})`}>
              <circle r={11.5 * k} fill="none" stroke="#ffd200" strokeWidth={2.8 * k} />
              <text
                x={15 * k}
                y={4.6 * k}
                fontSize={13 * k}
                fontWeight={700}
                className="pointer-events-none select-none fill-ink-900 dark:fill-ink-50"
                stroke="var(--map-halo)"
                strokeWidth={4.2 * k}
                paintOrder="stroke"
                strokeLinejoin="round"
              >
                {focus.name}
              </text>
            </g>
          )}
        </g>
      </svg>

      {/* ------------------------------------------------------------- chrome */}
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        {[
          { Icon: Plus, label: 'Zoom in', onClick: () => zoomBy(1.4) },
          { Icon: Minus, label: 'Zoom out', onClick: () => zoomBy(1 / 1.4) },
          { Icon: Crosshair, label: 'Reset view', onClick: reset },
          { Icon: Layers, label: 'Toggle line legend', onClick: () => setShowLegend((v) => !v) },
        ].map(({ Icon, label: l, onClick }) => (
          <button
            key={l}
            type="button"
            onClick={onClick}
            aria-label={l}
            className="grid size-9 place-items-center rounded-lg border border-ink-200 bg-white/95 text-ink-600 shadow-sm backdrop-blur transition hover:bg-white hover:text-ink-900 dark:border-ink-700 dark:bg-ink-900/95 dark:text-ink-300 dark:hover:text-ink-50"
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>

      {showLegend && (
        <div className="absolute left-3 top-3 max-w-[230px] rounded-xl border border-ink-200 bg-white/95 p-2.5 shadow-lg backdrop-blur dark:border-ink-700 dark:bg-ink-900/95">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">
            Lines
          </div>
          <ul className="space-y-1">
            {dataset.lines.filter((l) => !l.parentLine).map((l) => (
              <li key={l.id} className="flex items-center gap-2 text-[11.5px] text-ink-700 dark:text-ink-200">
                <span className="h-[3px] w-5 shrink-0 rounded-full" style={{ background: l.color }} />
                {l.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-white/90 px-2.5 py-1.5 text-[10.5px] text-ink-500 shadow-sm backdrop-blur dark:bg-ink-900/90 dark:text-ink-400">
        {dataset.stations.length} stations · {dataset.coordinates.interpolated} positions interpolated
        {zoom < Z_STATION_DOTS ? ' · zoom in for every station' : ''}
      </div>
    </div>
  );
}
