# Metrorythm

A fully offline Indian metro route planner. Search by station name, airport code,
terminal or landmark; get fastest / cheapest / fewest-interchange routes computed
with Dijkstra's algorithm over a local station graph.

**Currently ships: Delhi NCR** — Delhi Metro (Red, Yellow, Blue + Vaishali branch,
Green + Kirti Nagar branch, Violet, Pink, Magenta, Grey), the Airport Express
(Orange) line, the Gurugram Rapid Metro, and the NMRC Aqua Line.
**262 stations · 11 lines · 25 interchange stations.**

---

## The offline guarantee

Metrorythm makes **zero network requests at runtime**. There is no backend, no API,
no API key, no cloud database and no AI service. Everything — search, routing,
fare calculation and the map — runs in the browser against a JSON file that is
bundled at build time.

| | |
|---|---|
| External APIs at runtime | none |
| Backend / server | none |
| API keys | none |
| Map tiles | none — the map is a locally-rendered SVG |
| Persistence | `localStorage` only (recent searches, theme) |

The only script that ever touches the network is `scripts/fetch-coords.mjs`, an
**optional one-time developer tool** that bakes station coordinates into the
dataset. Its output is committed, so a fresh clone builds and runs with no
network access at all.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

```bash
npm run build        # typecheck + production build to dist/
npm run preview      # serve the production build
npm test             # run the unit tests
npm run test:coverage
```

Requires Node 20.19+ (developed on Node 25).

---

## Design

- **Typeface** — **Google Sans**, self-hosted in `public/fonts/` from Google's
  official Fonts API (the family is now published there). Google ships it as a
  single **variable** file per subset spanning weights 400–700, so two files
  (`latin`, `latin-ext`, ~57 KB total) cover the whole UI.
  `font-synthesis-weight: none` is set globally — verified in-browser that
  400/500/600/700 render at four distinct widths, i.e. real interpolation
  rather than a faked bold.
  The files are **self-hosted, not fetched from the API at runtime**; calling
  `fonts.googleapis.com` would break the offline guarantee.
  ⚠ Google Fonts returns no licence metadata for this family, unlike its OFL
  fonts — bundled at the project owner's direction.
- **Palette** — strictly black / white / yellow (`--color-accent: #ffd200`).
  The `ink` ramp is a pure neutral with no hue so nothing drifts blue or warm.
- **Metro line colours are exempt, deliberately.** Red Line is red, Blue Line is
  blue. Those are *data*, not decoration — recolouring them would make the map
  and the journey timeline unreadable. They come from the dataset, never from
  the palette.
- **Icons** — generated from the supplied app mark into
  `public/icons/` (16–512 px, plus a padded maskable variant and a
  multi-resolution `favicon.ico`).

---

## Fare engine

Fares are **rule-based and per-operator**, not a single generic distance table.
Each operator has an independent, versioned config in `src/data/fares/`, kept
entirely separate from routing logic.

| Operator | Basis | Confidence | Date |
|---|---|---|---|
| **DMRC** (Red/Yellow/Blue/Green/Violet/Pink/Magenta/Grey) | distance slabs ₹11/21/32/43/54/64 | **official** | effective 2025-08-25 |
| **Airport Express** | published station-to-station fares, distance slabs as fallback | **estimated** ⚠ | effective 2025-08-25 |
| **NMRC Aqua Line** | **number of stations** ₹10/15/20/30/40/50 | **official** | verified 2026-11-10 |
| **Rapid Metro Gurugram** | flat ₹20 | **official** | verified 2026-11-10 |

Supported: token fares, smart-card discounts (DMRC 10%, +10% off-peak),
Sunday/national-holiday concessional slabs, and per-operator special rules.

### The two rules that matter

1. **One fare per operator, not per line change.** A journey is split into
   fare-system segments; consecutive legs on the same operator merge into a
   single segment *before* costing. Red → Yellow → Red is one DMRC fare.
2. **Operator tables never cross.** The Airport Express is never priced with
   DMRC slabs, and the Aqua Line is never priced by distance.

### Honesty rules

- Every figure carries a `confidence` and a date, both shown in the UI.
- `effectiveDateIsPublished` distinguishes a real published effective date from
  "this is when we last verified it" — NMRC and Rapid Metro publish no date, so
  theirs is labelled *verified*, not *effective*.
- An operator with no config returns `unavailable` and ₹0 rather than a guess.
- Falling back from a station-pair chart to a distance slab **downgrades
  confidence to `estimated`** and says why. It is never silent.

### Known discrepancy ⚠

The **Airport Express table is an estimate.** DMRC confirmed its fares rose by
up to ₹5 on 25 Aug 2025 and now span ₹11–₹75, but no official post-revision
station-to-station chart could be sourced, and public sources conflict (one
quotes a flat ₹60, another the ₹11–₹75 range). The values here are the widely
published pre-revision fares carried forward with the announced increase and
bounded by that range. **They are labelled `estimated` everywhere in the UI.**
Drop an official chart into `stationPairs` and nothing else needs to change.

---

## Data accuracy

**Transit data verified: 2026-11-10** (see `dataVersion` in
`src/data/cities/delhi.json`, surfaced in the app footer).

### What is real, and what is estimated

| Data | Status |
|---|---|
| Line names, colours, operators | **Factual** |
| Station names and ordering | **Factual** |
| Interchange stations | **Factual** |
| Station coordinates | **Factual** — OpenStreetMap, ODbL. 224 of 262 matched; the rest carry `null` and are omitted from the map rather than guessed |
| **Journey times** | **ESTIMATED** — average running + dwell time per hop, per line. Excludes waiting for the first train |
| **Interchange walking times** | **ESTIMATED** — per-station figures for large interchanges, 180 s default elsewhere |
| **DMRC / NMRC / Rapid Metro fares** | **OFFICIAL** tables — see the fare-engine section above |
| **Airport Express fares** | **ESTIMATED** — no official post-revision chart could be sourced |
| **Which DMRC slab a journey lands in** | **ESTIMATED** — depends on distance, which is great-circle × 1.12, so a journey near a slab boundary can fall one slab either side |
| **Distances** | **ESTIMATED** — straight-line × 1.12 route factor; falls back to 1.1 km/hop when a coordinate is missing |

Everything estimated is labelled as such in the UI.

### Rules the dataset follows

- **Only operational lines.** Under-construction corridors (Phase IV extensions,
  the Golden Line) are omitted, not guessed.
- **No invented connections.** The router can only use edges present in the data.
  If no route exists, it says so instead of inventing one.
- **No invented coordinates.** A station without a verified position is left
  `null`. The map breaks the polyline at that point rather than drawing a
  straight line through territory the track does not follow.
- **Nearby ≠ interchange.** Station pairs that are close but have no signposted
  transfer (e.g. Punjabi Bagh vs Punjabi Bagh West) are deliberately *not*
  linked.
- **Out-of-station transfers are flagged.** Noida Sector 52 ↔ Sector 51 and
  Dhaula Kuan ↔ Durgabai Deshmukh South Campus require exiting the paid area;
  the UI says so and the fare engine charges both operators.

### Cities not in this build

`BOM` (Mumbai) and `MAA` (Chennai) are recognised as airport codes, and the app
tells you their networks are not included rather than producing a fake route.

---

## Architecture

Data, routing and UI are strictly separated.

```
data-src/
  delhi.source.mjs        Hand-authored topology — the source of truth
  coords.delhi.json       Cached station coordinates (committed)
scripts/
  build-data.mjs          Topology + coords -> src/data/cities/delhi.json, with validation
  fetch-coords.mjs        OPTIONAL one-time coordinate fetch (build-time only)
src/
  data/
    types.ts              Dataset types — no UI or routing concerns
    index.ts              City registry
    cities/delhi.json     GENERATED. The only data the app reads
  engine/                 Pure TypeScript. No React, no DOM
    graph.ts              (station, line) platform graph + distances
    dijkstra.ts           Binary min-heap Dijkstra, multi-source/multi-target
    planner.ts            Path -> journey: legs, directions, interchanges, fares
    fare.ts               Distance-slab fares, per operator
    search.ts             Fuzzy search / autocomplete index
    fare.ts               Per-operator, rule-based fare calculation
    __tests__/            112 unit tests
  data/
    fares/index.ts        Versioned per-operator fare configs (no routing logic)
  components/             Presentational React
  hooks/                  localStorage + theme
  App.tsx                 Composition
```

### Why a (station, line) graph?

Nodes are *platforms*, not stations. This is what makes it possible to charge a
realistic platform-to-platform walking time, count interchanges correctly, and
know which line you are physically on at each step. Three cost functions over the
same graph produce the three optimisation modes:

| Mode | Edge cost |
|---|---|
| Fastest | seconds |
| Cheapest | kilometres, plus a penalty for crossing into a separate fare table |
| Fewest changes | large constant per interchange, seconds as tie-breaker |

---

## Adding a city

1. Author `data-src/<city>.source.mjs` — lines, ordered stations, transfers,
   fare systems, airports, landmarks.
2. Extend `scripts/build-data.mjs` to emit `src/data/cities/<city>.json`.
   The build **fails** if the graph is disconnected, a line references an unknown
   fare system, or a landmark points at a station that does not exist.
3. Import it in `src/data/index.ts` and add it to `CITIES`.

No engine or UI changes are needed — both are city-agnostic.

---

## Regenerating station coordinates

Only needed if you change the station list.

```bash
npm run fetch:coords     # hits OpenStreetMap's Overpass API (rate-limited; retries with backoff)
npm run build:data       # bakes them into src/data/cities/delhi.json
```

Coordinates are © OpenStreetMap contributors, ODbL 1.0. Overpass is heavily rate
limited — if it fails, the committed cache is used and the app still works.

---

## Tests

```bash
npm test
```

112 tests over graph construction, Dijkstra, the planner, search and the fare engine, including the six validation journeys from the brief (A–F) and:

- every ride edge is bidirectional and the graph is fully connected
- journey legs are contiguous (each leg starts where the last ended)
- `fewest-interchanges` never uses more changes than `fastest`
- `cheapest` is never more expensive than the other modes
- direction of travel resolves to the correct line terminus
- crossing operators produces two fare segments
- the brief's worked example, DEL T3 → Hindon River, resolves correctly
- unknown stations and identical origin/destination are rejected
- each operator is billed **at most once** per journey, on every tested pair
- one DMRC fare however many DMRC lines are used
- the Aqua Line ignores distance entirely; Rapid Metro ignores both
- the Airport Express never returns a DMRC slab value
- a smart-card fare is never above a token fare, for any operator
- an unknown operator yields `unavailable`, never a guessed number

---

## Worked example

**DEL / VIDP Airport → Hindon River**

```
FASTEST + CHEAPEST + FEWEST CHANGES
67 min · ₹100 · 2 changes · 21 stations · ~42.7 km

  RIDE    Airport Express   IGI Airport (Terminal 3) → New Delhi
                            towards New Delhi · 4 stops · 15 min
  CHANGE  New Delhi         Airport Express → Yellow Line · ~7 min
  RIDE    Yellow Line       New Delhi → Kashmere Gate
                            towards Samaypur Badli · 3 stops · 7 min
  CHANGE  Kashmere Gate     Yellow Line → Red Line · ~5 min
  RIDE    Red Line          Kashmere Gate → Hindon River
                            towards Shaheed Sthal (New Bus Adda) · 14 stops · 33 min

  Fare    Airport Express ~20.2 km ₹50  +  DMRC ~22.5 km ₹50  =  ₹100 (estimated)
```

All three optimisation modes return this same route, so the UI shows one card
badged with all three rather than three identical cards.


Searching `DEL`, `VIDP`, `Terminal 3` or `Delhi Airport` all resolve to the
Airport Express station inside T3. `Terminal 1` resolves to the Magenta Line
station instead, which is the correct access point for that terminal.

---

## Licence and attribution

Transit topology compiled from public DMRC/NMRC network information.
Station coordinates © OpenStreetMap contributors, ODbL 1.0.

Not affiliated with DMRC, NMRC or any transit operator. **Fares and times are
estimates — check official sources before travelling.**
