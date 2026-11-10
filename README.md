# Metrorythm

A fully offline Indian metro route planner. Search by station name, airport code,
terminal or landmark; get fastest / cheapest / fewest-interchange routes computed
with Dijkstra's algorithm over a local station graph.

**Every operational metro network in India**, switchable in the header —
**19 cities, 50 lines, 820 stations**.

| City | Lines | Stations | Source |
|---|---|---|---|
| **Delhi NCR** | 13 | 262 | hand-authored |
| **Bengaluru** | 3 | 83 | Wikidata import |
| **Mumbai** | 5 | 71 | Wikidata import |
| **Hyderabad** | 3 | 57 | Wikidata import |
| **Ahmedabad** | 4 | 54 | Wikidata import |
| **Chennai** | 3 | 51 | hand-authored |
| **Kolkata** | 4 | 48 | Wikidata import |
| **Nagpur** | 2 | 37 | Wikidata import |
| **Pune** | 2 | 28 | Wikidata import |
| **Kochi** | 1 | 25 | Wikidata import |
| **Lucknow** | 1 | 21 | Wikidata import |
| **Indore** | 1 | 16 | Wikidata import |
| **Kanpur** | 1 | 14 | Wikidata import |
| **Meerut** | 2 | 12 | Wikidata import |
| **Jaipur** | 1 | 11 | Wikidata import |
| **Navi Mumbai** | 1 | 11 | Wikidata import |
| **Bhopal** | 1 | 8 | Wikidata import |
| **Agra** | 1 | 6 | Wikidata import |
| **Patna** | 1 | 5 | Wikidata import |

Delhi and Chennai are hand-authored and individually verified. The other 17 are
imported from Wikidata with validated station ordering (see below). Each city
has its own dataset, fare rules and engine instance; nothing is shared but code.

### How the imported networks were built, and why you can trust the order

Station **order** is the one thing a route planner cannot get wrong, so it is
derived and then verified rather than taken on trust.

Two approaches were tried and rejected first. Overpass was unreachable.
Scraping Wikipedia's HTML tables was actively wrong — 26 stations for Kochi's
25 (a header row), a *fare* table parsed as stations for Kanpur, and nothing at
all for Bengaluru, Mumbai or Hyderabad.

Wikidata is structured rather than scraped, and carries the relation that
actually matters:

| Property | Use |
|---|---|
| `P81` connecting line | which line a station belongs to |
| `P197` adjacent station | **the ordering relation** — 1,885 statements |
| `P625` coordinates | near-complete for Indian metro stations |
| `P5817` state of use | drops the 141 under-construction/proposed stations |

For each line, the adjacency statements are assembled into a graph which must
form a **single unbroken path**: every station of degree ≤ 2, exactly two
endpoints, one connected component covering every station. Anything else is
**reported and dropped** — a missing line is far better than an invented order.

Three independent checks back this up:
1. **Station counts** are compared against an independently sourced per-city
   total. Nine cities match exactly.
2. **Geographic coherence** is asserted in the test suite: no two adjacent
   stations on any line may be more than 12 km apart. A wrong order would
   violate this immediately. All 19 cities pass.
3. **Spot checks** against reality — Kochi runs Aluva→Tripunithura, Mumbai
   Line 3 Aarey→Cuffe Parade, Kolkata Blue Kavi Subhash→Dakshineswar.

**Two lines were dropped** by this process and are absent from the app:
Pune's Pink Line and Kolkata's Purple Line, both of which have gaps in
Wikidata's adjacency data (6 and 4 endpoints respectively).

**Mumbai's network is genuinely disconnected** into 2 parts. Line 2A/7 meet
Line 1 only by walking between differently-named stations, and no verified
transfer data exists for that. The app says so and returns no route across the
gap rather than inventing a connection.

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
| **CMRL** (Chennai, all 3 lines) | distance slabs ₹10/20/30/40/50 | **estimated** ⚠ | verified 2026-11-10 |

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

### Known discrepancies ⚠

The **Airport Express table is an estimate.** DMRC confirmed its fares rose by
up to ₹5 on 25 Aug 2025 and now span ₹11–₹75, but no official post-revision
station-to-station chart could be sourced, and public sources conflict (one
quotes a flat ₹60, another the ₹11–₹75 range). The values here are the widely
published pre-revision fares carried forward with the announced increase and
bounded by that range. **They are labelled `estimated` everywhere in the UI.**
Drop an official chart into `stationPairs` and nothing else needs to change.

**CMRL's over-32 km slab is disputed.** Published sources give ₹10/20/30/40/50
up to 32 km consistently, but disagree beyond it — some list ₹50, others quote a
₹60 network maximum. Long Chennai journeys may therefore be ₹10 out, and the
whole CMRL config is marked `estimated` because of it. CMRL's flat 20%
smart-card/QR discount is well attested and applied.

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
| Station coordinates | **Mixed, and tagged per station.** `surveyed` = from OpenStreetMap or Wikipedia article coordinates. `interpolated` = placed proportionally between known neighbours on the line. Delhi: 255 surveyed + 7 interpolated. Chennai: 34 surveyed + 17 interpolated. Nothing is guessed |
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
- **No invented coordinates.** A position is either `surveyed`, `interpolated`
  from its known neighbours on the line, or `null` — and the dataset records
  which. A `null` BREAKS the line on the map rather than bridging it, because
  bridging would invent an alignment.
- **Nearby ≠ interchange.** Station pairs that are close but have no signposted
  transfer (e.g. Punjabi Bagh vs Punjabi Bagh West) are deliberately *not*
  linked.
- **Out-of-station transfers are flagged.** Noida Sector 52 ↔ Sector 51 and
  Dhaula Kuan ↔ Durgabai Deshmukh South Campus require exiting the paid area;
  the UI says so and the fare engine charges both operators.

### Cities not in this build

`BOM` (Mumbai) is recognised as an airport code, and the app says its network is
not included rather than producing a fake route. Searching `MAA` from the Delhi
dataset now offers a one-click switch to Chennai instead.

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
    __tests__/            409 unit tests
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
   interchange walk times, airports, landmarks, aliases.
2. Add its id to `CITY_IDS` in `scripts/build-data.mjs`, and a bounding box in
   `scripts/fetch-coords.mjs` if you want OSM coordinates. The build **fails**
   if the graph is disconnected, a line references an unknown fare system, or a
   landmark points at a station that does not exist.
3. Add the operator's fare config to `src/data/fares/index.ts`.
4. Import the generated JSON in `src/data/index.ts` and add it to `CITIES`.

No engine or UI changes are needed — both are city-agnostic, and the city
switcher is driven entirely by the `CITIES` array. Chennai was added in exactly
these four steps.

---

## Regenerating station coordinates

Only needed if you change the station list.

```bash
node scripts/fetch-coords-wikipedia.mjs delhi     # Wikipedia article coordinates (preferred)
node scripts/fetch-coords-wikipedia.mjs chennai
npm run fetch:coords [city]                       # OpenStreetMap/Overpass (often unreachable)
npm run build:data                                # bake into src/data/cities/*.json
```

Wikipedia's API is the better source: stable, batched, follows redirects (so
alternative station spellings resolve themselves) and far less rate-limited than
Overpass. Both scripts MERGE rather than clobber, and both leave an unresolved
station out rather than guessing — `build:data` then interpolates it from its
neighbours and tags it as such.

Coordinates: © OpenStreetMap contributors (ODbL 1.0) and © Wikipedia
contributors (CC BY-SA 4.0).

---

## Tests

```bash
npm test
```

409 tests covering all 19 networks — graph construction, Dijkstra, the planner, search and the fare engine, including the six fare validation journeys and:

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
