# Metrorythm — transit data and routing

How Metrorythm's numbers are produced, where each one comes from, and what is
still unknown. Written 12 November 2026.

This replaces the assumptions documented in `AUDIT-routing-2026-11-12.md`,
which found a mean journey-time error of 17.3% against DMRC's own planner and
16 wrong fares in 41 test journeys. Those are now **5.9%** and **1**.

---

## 1. The confidence model

Every figure carries one of four levels, and nothing is promoted because it
looks plausible.

| Level | Meaning |
|---|---|
| `OFFICIAL` | Published by the operator or a government body. |
| `VERIFIED_SECONDARY` | Derived from official data, or confirmed by a credible independent source. |
| `ESTIMATED` | Calculated by Metrorythm from what it has — typically station positions. |
| `UNKNOWN` | No reliable source. |

Levels live on the dataset (`provenance`), on each line, and on individual
edges. A journey reports the **weakest** level of everything it used, so one
estimated hop stops the whole journey claiming official timings.

Sources are recorded once per dataset in `sources[]` with organisation, URL,
retrieval date, last-verified date, coverage, whether the publisher is
official, and known limitations. `provenance` entries reference a source by id,
and the validator rejects any `OFFICIAL` claim with no source behind it.

Types: `src/data/types.ts`.

---

## 2. Source registry

### Hyderabad — complete official GTFS

| | |
|---|---|
| Publisher | Open Data Telangana, publishing Hyderabad Metro Rail / L&T Metro's feed |
| URL | `data.opencity.in` → `telangana_opendata_gtfs_hmrl_03_july_2026.zip` |
| Retrieved | 2026-11-12 · feed valid 2026-07-03 → 2030-01-01 |
| Official | Yes |
| Copy kept | `data-src/gtfs/hmrl-telangana-2026-07-03.zip` |

Gives station sequences, coordinates, **real timetabled run times**, dwell
times, `shape_dist_traveled` distances, headways, operating hours, and a
**3,080-pair station-to-station fare matrix**.

Limitations: HMRL's own open-data page (`hmrl.co.in/open-data.html`) returned
404 on 2026-11-12, so the feed came from the state portal that republishes it.
Times are scheduled, not observed. The feed publishes no walking times, so
interchange walks remain `ESTIMATED`.

### Delhi NCR — DMRC journey planner

| | |
|---|---|
| Publisher | Delhi Metro Rail Corporation |
| Reached via | `dmrc-rest-api.vercel.app`, an open REST wrapper over DMRC's own planner endpoints |
| Retrieved | 2026-11-12 |
| Official | Yes (the data); the access path is a third-party wrapper |

Gives chargeable route distance per station pair, fares, interchange
allowances, and DMRC's published journey-time estimate.

Limitations: **DMRC publishes no GTFS feed**, so no working timetable exists.
Its planner computes time as distance ÷ a fixed line speed — every regular line
returns exactly 33.0 km/h — so its times are a published *estimate*, not
measured running times. Metrorythm reproduces the same mechanism rather than
pretending to a timetable.

### Parade Ground interchange (Hyderabad)

Wikipedia, used **only** to establish that Parade Ground (Blue) and JBS Parade
Ground (Green) are connected — never for timings or fares. Marked
`VERIFIED_SECONDARY`.

### Everything else

The other 17 cities are still imported from Wikidata via
`scripts/import-wikidata.mjs`, with coordinates from Wikipedia. They have **no
`sources[]` entry**, which the validator reports as a warning, and their
timings remain `ESTIMATED`. See §7.

### Sources checked and found unusable

| Source | Outcome |
|---|---|
| Mobility Database / Transitland catalogues | Searched in full. Only two Indian **metro** GTFS feeds exist: Hyderabad and Kochi. |
| Kochi Metro GTFS (`kmrl.e-smartlab.com`) | Host does not resolve (NXDOMAIN) as of 2026-11-12. The 2018 KMRL feed is effectively gone. |
| HMRL Google Drive mirror | Requires a Google sign-in; the state portal copy was used instead. |
| CMRL, BMRCL, MMRCL, UPMRC, GMRC, NMRC | No public GTFS or documented API found. |

No endpoint in this document is invented; each was requested and the response
recorded.

---

## 3. The journey-time model

The old model gave every hop on a line the same number of seconds — 140 s for
all ten DMRC lines — regardless of distance. Implied speeds ranged from
12.6 km/h to 111.4 km/h, varying sixfold *within a single line*.

Time is now assembled from four parts, kept separate all the way to the UI:

```
total = in-train + dwell + interchange walking + interchange waiting
```

Each ride edge resolves its running time in this order:

1. **Measured** `runSeconds` from a timetable → `OFFICIAL` (Hyderabad).
2. **Distance ÷ the line's published speed** → inherits the line's confidence
   (Delhi: `VERIFIED_SECONDARY`).
3. **Legacy flat seconds** → `ESTIMATED` (the other 17 cities).

Interchanges charge walking *and* waiting. Previously
`INTERCHANGE_TIME_PENALTY_S = 0`, so changing trains cost nothing but the walk.
Waiting now comes from the operator's published allowance where one exists, or
half the line's headway where a feed gives one.

Line speeds in use, each derived from the operator's own figures:

| Line | Speed | Basis |
|---|---|---|
| All ten regular DMRC lines | 33.0 km/h | Median of per-hop figures from DMRC's planner (spread ≤ 0.6) |
| Airport Express | 57.4 km/h | Same method |
| Rapid Metro Gurugram | 29.0 km/h | Same method |
| NMRC Aqua | 43.5 km/h | Fitted to three published end-to-end journeys |
| Hyderabad Red / Green / Blue | n/a | Per-hop timetabled times used directly |

The Aqua fit also showed NMRC adds a fixed ~4 minutes — a first-train
allowance, roughly half the Aqua headway — which Metrorythm deliberately
excludes, as the UI states.

Code: `src/engine/graph.ts` (`resolveEdgeKm`, `resolveEdgeTiming`,
`expectedWaitSeconds`), `src/engine/planner.ts` (`buildJourney`).

---

## 4. Fares

`src/engine/fare.ts` prefers a published station-pair fare, then a zone or
station-count rule, then a distance slab, and says which it used
(`basisUsed`). Falling back to a slab where the operator publishes a chart
downgrades confidence and gives a reason.

Two corrections:

**Airport Express** was a distance slab marked `estimated`. DMRC's fares are
not monotonic in distance — 6.98 km costs ₹21 while 6.35 km costs ₹32, and
15.94 km costs ₹54 while 15.32 km costs ₹64 — so no slab table can reproduce
them. All 21 pairs were read from DMRC and the config is now `official`.

**Hyderabad** carried a slab table (₹10/15/25/…/60) labelled `official` that did
not match the operator's own feed, whose price points are
₹12/18/30/40/50/55/60/66/70/75. Replaced by the 3,080-pair matrix in
`src/data/fares/hyderabad-station-pairs.json`.

**"Cheapest" now minimises fare.** It previously minimised distance, which is
only a proxy — on IGI T3 → Noida City Centre it returned ₹86 while another
journey on the same screen cost ₹85. The planner now generates candidates from
four strategies, builds each journey, computes its real fare, duration and
interchange count, and awards each badge to whichever journey actually wins.
A card can no longer say "Cheapest" while costing more than its neighbour.

---

## 5. Topology

- **Loops.** The Rapid Metro is a stem plus a one-way terminal ring. Intermediate
  stations now come from the path the router actually took, not from slicing
  `line.stations` — index arithmetic is wrong the moment a line is not a simple
  list. `directionOf` understands both full rings (`isLoop`) and lollipops
  (`loopsBackTo`).
- **Through services.** DMRC's planner reports *no* interchange across Yamuna
  Bank, because Blue Line branch trains run through. `throughServiceWith` marks
  such links: no wait is charged and no change is counted.
- **Out-of-station interchanges** remain explicit `transfer` edges with their own
  walking time and paid-area flag.
- **Punjabi Bagh West** was missing from the Green Line — the only line-membership
  error across all 262 Delhi stations, but it deleted the sole Green↔Pink
  interchange. Added to `data-src/delhi.source.mjs`.

---

## 6. Validation and tests

`npm run validate` checks all 19 datasets for duplicate ids, missing or
out-of-range coordinates, line-membership contradictions, missing ride edges,
missing interchange edges, broken loop topology, disconnected networks,
impossible durations and speeds, run+dwell mismatches, invalid fares, bad
provenance, and `OFFICIAL` claims with no source. It exits non-zero on any
error, so it can gate a build.

Current state: **19 datasets, 0 errors, 18 warnings** (17 of the warnings are
"no sources recorded" for the Wikidata-derived cities).

Tests — `npm test`, **563 passing**:

| Suite | What it locks in |
|---|---|
| `delhi-regression.test.ts` | The 41 audit journeys against DMRC: time, fare, interchange count, badge honesty, timing components summing to the total |
| `hyderabad.test.ts` | Every hop carries measured distance and run time; fares always resolve from the official matrix; provenance is declared |
| existing suites | Unchanged behaviour |

### Re-running the pipeline

```
npm run fetch:delhi     # ~5 min: station codes, 276 hops, 30 interchanges (cached)
npm run build:data      # regenerate all datasets, then apply Delhi + Hyderabad
npm run validate
npm test
```

Fetching is separate from building on purpose: builds stay offline and
reproducible, and no journey query ever depends on an external API.

---

## 7. What is still unknown

Listed because the alternative is implying we know it.

1. **Delhi Phase IV, opened 8 March 2026 — 16 stations missing.** The Pink Line
   ring closure (Majlis Park–Maujpur, 8 stations), the Magenta extension
   (Majlis Park–Deepali Chowk, 7 stations) and Krishna Park Extension (Jan 2025).
   This is the single largest remaining gap: Majlis Park → Shiv Vihar should be
   a direct 31-minute ride and Metrorythm still routes it the long way round.
   Adding them needs coordinates for each new station.
2. **No headway data for Delhi.** DMRC publishes none, so interchange waiting
   uses its published allowance instead. First-train waiting is not modelled
   anywhere, and the UI says so.
3. **Three Rapid Metro loop hops and two bad DMRC distances** (0 km for
   NSEZ–Noida Sector 83, 0.26 km for Greater Kailash–Nehru Enclave) keep a
   geometric estimate. They are rejected explicitly and reported, not averaged in.
4. **17 cities remain Wikidata-derived**, with flat per-hop times and no
   `sources[]`. Their journey times are `ESTIMATED` and should be read as
   rough. No official feed could be found for any of them.
5. **Interchange walking times** are Metrorythm's own everywhere. Hyderabad's
   feed publishes none; for Delhi only the combined allowance is published, so
   the walk/wait split is ours.
6. **No real-time data anywhere.** No operator was found publishing accessible
   GTFS-Realtime. The architecture keeps live data addable later — timing
   components are already separate — but nothing is fabricated in the meantime.
7. **Station renames** not yet applied: Dwarka → Dwarka-Kakrola, Udyog Bhawan →
   Seva Teerth, Pitampura → Madhuban Chowk, Mayur Vihar Pocket 1 → Shree Ram
   Mayur Vihar Mandir, Rohini West → Dr Baba Saheb Ambedkar Hospital. Affects
   search only, not routing.

---

## 8. Before and after — Delhi NCR, 41 journeys

Reference is DMRC's planner, least-distance strategy, retrieved 2026-11-12.
Bold marks an error outside ±15%.

| Metric | Before | After |
|---|---|---|
| Mean absolute ETA error | 17.3% | **5.9%** |
| Cases outside ±15% | 17 / 41 | **2 / 41** |
| Wrong fares | 16 / 41 | **1 / 41** |

The two remaining time outliers and the one fare difference are understood:

- **T20** (87%) — the missing Phase IV Pink ring. The error grew because the
  detour route now correctly charges interchange waiting; the data is the problem.
- **T10** (25%) — 3 min against DMRC's 4 min on a 1.8 km journey. One minute of
  rounding.
- **T27** fare — Metrorythm routes via the Dhaula Kuan walking link, which DMRC
  does not use. ₹64 is correct for the route taken.

| # | Official | Before | After | Was | Now | Fare was | Fare now |
|---|---|---|---|---|---|---|---|
| T01 | 62m ₹64 | 58m | 61m | 6% | 2% | ₹64 ✓ | ₹64 ✓ |
| T02 | 56m ₹54 | 51m | 56m | 9% | 0% | ₹64 ✗ | ₹54 ✓ |
| T03 | 20m ₹64 | 15m | 20m | **25%** | 0% | ₹65 ✗ | ₹64 ✓ |
| T04 | 32m ₹75 | 25m | 33m | **22%** | 3% | ₹76 ✗ | ₹75 ✓ |
| T05 | 86m ₹118 | 77m | 86m | 10% | 0% | ₹118 ✓ | ₹118 ✓ |
| T06 | 61m ₹64 | 65m | 61m | 7% | 0% | ₹64 ✓ | ₹64 ✓ |
| T07 | 86m ₹64 | 84m | 86m | 2% | 0% | ₹64 ✓ | ₹64 ✓ |
| T08 | 19m ₹32 | 21m | 18m | 11% | 5% | ₹32 ✓ | ₹32 ✓ |
| T09 | 8m ₹21 | 9m | 8m | 13% | 0% | ₹21 ✓ | ₹21 ✓ |
| T10 | 4m ₹11 | 5m | 3m | **25%** | **25%** | ₹21 ✗ | ₹11 ✓ |
| T11 | 74m ₹107 | 63m | 73m | 15% | 1% | ₹108 ✗ | ₹107 ✓ |
| T12 | 32m ₹43 | 30m | 31m | 6% | 3% | ₹43 ✓ | ₹43 ✓ |
| T13 | 56m ₹54 | 56m | 56m | 0% | 0% | ₹64 ✗ | ₹54 ✓ |
| T14 | 25m ₹43 | 30m | 26m | **20%** | 4% | ₹43 ✓ | ₹43 ✓ |
| T15 | 66m ₹107 | 62m | 67m | 6% | 2% | ₹108 ✗ | ₹107 ✓ |
| T16 | 14m ₹21 | 9m | 13m | **36%** | 7% | ₹21 ✓ | ₹21 ✓ |
| T17 | 46m ₹43 | 45m | 41m | 2% | 11% | ₹54 ✗ | ₹43 ✓ |
| T18 | 82m ₹64 | 77m | 82m | 6% | 0% | ₹64 ✓ | ₹64 ✓ |
| T19 | 66m ₹64 | 61m | 65m | 8% | 2% | ₹64 ✓ | ₹64 ✓ |
| T20 | 31m ₹43 | 48m | 58m | **55%** | **87%** | ₹54 ✗ | ₹43 ✓ |
| T21 | 41m ₹43 | 37m | 41m | 10% | 0% | ₹54 ✗ | ₹43 ✓ |
| T22 | 16m ₹30 | 20m | 14m | **25%** | 13% | ₹30 ✓ | ₹30 ✓ |
| T23 | 26m ₹51 | 32m | 24m | **23%** | 8% | ₹51 ✓ | ₹51 ✓ |
| T24 | 8m ₹21 | 7m | 8m | 13% | 0% | ₹21 ✓ | ₹21 ✓ |
| T25 | 46m ₹54 | 42m | 46m | 9% | 0% | ₹54 ✓ | ₹54 ✓ |
| T26 | 22m ₹54 | 17m | 22m | **23%** | 0% | ₹43 ✗ | ₹54 ✓ |
| T27 | 50m ₹96 | 34m | 43m | **32%** | 14% | ₹64 ✗ | ₹64 ✗ |
| T28 | 44m ₹54 | 47m | 44m | 7% | 0% | ₹54 ✓ | ₹54 ✓ |
| T29 | 51m ₹54 | 47m | 45m | 8% | 12% | ₹54 ✓ | ₹54 ✓ |
| T30 | 79m ₹64 | 77m | 79m | 3% | 0% | ₹64 ✓ | ₹64 ✓ |
| T31 | 46m ₹43 | 40m | 46m | 13% | 0% | ₹43 ✓ | ₹43 ✓ |
| T32 | 22m ₹32 | 19m | 21m | 14% | 5% | ₹32 ✓ | ₹32 ✓ |
| T33 | 69m ₹107 | 59m | 70m | 14% | 1% | ₹86 ✗ | ₹107 ✓ |
| T34 | 17m ₹32 | 9m | 16m | **47%** | 6% | ₹32 ✓ | ₹32 ✓ |
| T35 | 28m ₹43 | 31m | 29m | 11% | 4% | ₹43 ✓ | ₹43 ✓ |
| T36 | 55m ₹54 | 40m | 54m | **27%** | 2% | ₹64 ✗ | ₹54 ✓ |
| T37 | 10m ₹21 | 7m | 9m | **30%** | 10% | ₹21 ✓ | ₹21 ✓ |
| T38 | 63m ₹74 | 52m | 61m | **17%** | 3% | ₹74 ✓ | ₹74 ✓ |
| T39 | 15m ₹21 | 19m | 14m | **27%** | 7% | ₹32 ✗ | ₹21 ✓ |
| T40 | 30m ₹43 | 45m | 30m | **50%** | 0% | ₹43 ✓ | ₹43 ✓ |
| T41 | 12m ₹21 | 15m | 11m | **25%** | 8% | ₹32 ✗ | ₹21 ✓ |

Three interchange counts (T16, T17, T29) deliberately differ from DMRC's. Its
Green Line labelling is inverted — it calls Inderlok–Ashok Park Main a "branch"
and inserts a change at Ashok Park Main even for Inderlok–Mundka journeys that
run through. The real branch is the Kirti Nagar shuttle.

---

## 9. Offline guarantee

Unchanged. All routing, search and fare calculation runs in the browser against
pre-generated local datasets. Data acquisition happens only at build time, in
scripts that are never shipped. There are no API keys in the client, no
runtime network dependency for planning a journey, and the service worker
continues to cache the app shell and assets.
