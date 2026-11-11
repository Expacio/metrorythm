# Metrorythm routing audit — ETA accuracy and transit data correctness

**Scope:** Delhi NCR dataset and the shared routing/fare engine.
**Date:** 12 November 2026.
**Code changed:** none. This is a read-only audit; no dataset or engine file was modified.

---

## 1. Method and sources

Metrorythm's output was produced by calling `createPlanner(getCity('delhi')).plan()`
directly, through a temporary Vitest harness (since removed). Every number in the
tables below is the engine's own output, not a reading off the UI.

Reference values come from **DMRC's own journey planner** ("Sarthi"), reached through
the normalising REST proxy at `dmrc-rest-api.vercel.app` / `ncr-metro.tashif.codes`,
which fronts the official DMRC and NMRC endpoints. For each pair the proxy returns
DMRC's published route, leg durations, interchange allowances, distance and fare.

### What is verified and what is not

| Quantity | Status |
|---|---|
| Station lists, line membership, interchange stations | **Verified** against DMRC's `/lines/{code}/stations` endpoint |
| Fares (DMRC, Orange Line, NMRC, RMGL) | **Verified** — these are the fares DMRC charges |
| Route distances | **Verified** — DMRC publishes chargeable route km |
| Journey times | **Verified as "the official published estimate"**, with the caveat below |
| Opening dates of Phase IV sections | **Verified** via Wikipedia / Metro Rail News |
| Real-world running times from a GTFS feed or working timetable | **Not available.** DMRC does not publish a public GTFS feed. No figure below is presented as a measured end-to-end run time. |

**Important caveat on the time reference.** Analysing DMRC's own leg durations shows
its planner computes time as `distance ÷ a fixed line speed`: Yellow, Blue, Red,
Green, Violet and Grey legs all come back at exactly **33.0 km/h**, the Orange Line
at **~59 km/h**, RMGL at **~28 km/h**. So DMRC's figure is itself a model, not a
timetable. It is still the right benchmark here, because (a) it is the number DMRC
publishes to riders, and (b) it accounts for distance, which Metrorythm does not.
Where I say a Metrorythm ETA is "wrong", I mean it disagrees with the official
published estimate, and the mechanism of disagreement is a modelling defect.

A case **passes** only if the ETA is within ±15% of official, the fare matches
exactly, and the interchange count matches.

---

## 2. Headline result

**41 origin–destination pairs across Delhi NCR.**

- Mean absolute ETA error: **17.3%**
- ETA outside ±15%: **17 / 41**
- Wrong fare: **16 / 41** (every DMRC-segment error over-charges)
- Wrong interchange count: **11 / 41**
- Fully passing: **14 / 41**

Errors are not random noise. They trace to five specific defects, listed in §3.

---

## 3. Prioritised bug report

### P0-1 · Journey time is a constant per hop and ignores distance entirely

**Files:** `src/data/cities/delhi.json` (every `edges[].seconds`), consumed by
`src/engine/graph.ts` → `buildGraph()` (line 117-118) and
`src/engine/planner.ts` → `buildJourney()` (line 178, `seconds += path[j].edge.seconds`).

All 276 Delhi ride edges carry just four values:

| Line group | seconds per hop | edges |
|---|---|---|
| All 10 DMRC lines incl. branches | 140 | 239 |
| Airport Express | 230 | 6 |
| Aqua (NMRC) | 150 | 20 |
| Rapid Metro Gurugram | 110 | 11 |

Because distance is never consulted, the *implied* speed of a single edge ranges from
**12.6 km/h to 111.4 km/h**, and varies by a factor of six **within one line**:

```
 12.6 km/h  yellow  central-secretariat -> udyog-bhawan      0.49 km / 140 s
 16.0 km/h  pink    east-vinod-nagar-mv-ii -> mandawali      0.62 km / 140 s
...
102.3 km/h  pink    delhi-cantt -> durgabai-deshmukh         3.98 km / 140 s
102.7 km/h  pink    hazrat-nizamuddin -> mayur-vihar-i       3.99 km / 140 s
111.4 km/h  airport shivaji-stadium -> dhaula-kuan           7.12 km / 230 s
```

This is the single largest source of ETA error. It is strongly directional: dense
central hops are over-estimated, long outer hops badly under-estimated.

Clearest failures:

| Case | Route | Metrorythm | Official | Error |
|---|---|---|---|---|
| T34 | Lajpat Nagar → Mayur Vihar-I (Pink, 4 hops, 8.9 km) | 9 min | 17 min | **−47%** |
| T36 | Punjabi Bagh West → Mayur Vihar Pocket-1 (Pink, 30 km) | 40 min | 55 min | −27% |
| T37 | Dwarka → Dhansa Bus Stand (Grey, 3 hops, 5.0 km) | 7 min | 10 min | −30% |
| T16 | Kirti Nagar → Inderlok | 9 min | 14 min | −36% |
| T22 | Noida Sector 51 → 142 (Aqua, 8 hops) | 20 min | 16 min | +25% |

Note T34: Metrorythm's distance for that journey (8.9 km) is *identical* to DMRC's.
The entire 8-minute gap is the time model.

**Suggested fix.** Drive edge time from distance and a per-line speed instead of a
constant. Add an optional `avgSpeedKmh` (and `dwellSeconds`) to the line record in
`src/data/types.ts`, then in `buildGraph()`:

```ts
const seconds = e.seconds ?? Math.round((km / line.avgSpeedKmh) * 3600 + line.dwellSeconds);
```

Keeping `e.seconds` as an override preserves any hop that has been individually
verified. Calibration from DMRC's own planner: **33 km/h** for every DMRC line,
**59 km/h** Orange, **28 km/h** RMGL; NMRC Aqua works out at roughly **36 km/h**
(8.7 km in 16 min including one dwell-heavy stretch — treat as estimated).

---

### P0-2 · Three corridors that opened in 2025–2026 are missing from the dataset

**File:** `src/data/cities/delhi.json`.

| Corridor | Stations | Opened | Present? |
|---|---|---|---|
| Pink Line ring closure, Majlis Park ↔ Maujpur-Babarpur (12.3 km) | 8 (Burari, Jharoda Majra, Jagatpur-Wazirabad, Soorghat, Sonia Vihar, Khajuri Khas, Bhajanpura, Yamuna Vihar) | 8 Mar 2026 | **No** |
| Magenta Line, Majlis Park ↔ Deepali Chowk (9.9 km) | 7 (Bhalaswa, Haiderpur Badli Mor, North Pitampura, Prashant Vihar, Madhuban Chowk, Deepali Chowk + Majlis Park link) | 8 Mar 2026 | **No** |
| Magenta Line, Janakpuri West ↔ Krishna Park Extension (1.81 km) | 1 | 5 Jan 2025 | **No** |

Sixteen open stations are absent, while the footer renders
*"Transit data verified 2026-11-10"* — the claim is stronger than the data supports.

Worst consequence measured:

**T20 Majlis Park → Shiv Vihar.** Official: a single Pink Line ride, **31 min, 0
changes, ₹43** (Majlis Park → Maujpur-Babarpur 10 stops / 22:30, then the branch to
Shiv Vihar). Metrorythm: **48 min, 3 changes, ₹54** — Pink → Yellow at Azadpur →
Red at Kashmere Gate → Pink at Welcome, because the direct link does not exist in its
graph. That is **+55% on time, one wrong fare, and three interchanges that a rider
would not make.**

**Suggested fix.** Add the stations, ride edges and interchange edges, then re-run
`scripts/fetch-coords.mjs` for the new coordinates. Until then, `city.notes` should
say which corridors are excluded, the same way it already does for under-construction
lines.

---

### P0-3 · Punjabi Bagh West is missing from the Green Line, so the Green↔Pink interchange does not exist

**File:** `src/data/cities/delhi.json` — `lines[green].stations`,
`stations[punjabi-bagh-west].lines`, and the `edges` array.

A station-by-station comparison of line membership against DMRC found **exactly one**
discrepancy across all 262 stations:

```
punjabi-bagh-west    DMRC [green, pink]    Metrorythm [pink]
```

DMRC lists `PUNJABI BAGH WEST [PBGW]` under both LN5 (Green) and LN7 (Pink), and its
planner routes Green↔Pink through it with a 5-minute interchange. Metrorythm has no
such link, so every Green↔Pink journey detours.

| Case | Metrorythm | Official | Error |
|---|---|---|---|
| T40 Mundka → Rajouri Garden | 45 min, **2 changes** (via Ashok Park Main → Kirti Nagar branch → Blue), 19.5 km | 30 min, 1 change at Punjabi Bagh West, 13.7 km | **+50%**, one phantom change |
| T39 Madipur → Netaji Subhash Place | 19 min, 1 change at Inderlok, ₹32 | 15 min, 1 change at Punjabi Bagh West, ₹21 | +27%, fare ₹11 too high |
| T41 Punjabi Bagh → Netaji Subhash Place | 15 min, ₹32 | 12 min, ₹21 | +25%, fare ₹11 too high |

**Suggested fix.** Insert `punjabi-bagh-west` into the Green Line sequence between
`punjabi-bagh` and `shivaji-park`, add `green` to that station's `lines`, add the two
ride edges and a `green`↔`pink` interchange edge.

---

### P1-4 · Interchanges charge walking time only — no waiting for the next train, anywhere

**File:** `src/engine/planner.ts`, `INTERCHANGE_TIME_PENALTY_S = 0` (line 89) and
`costFnFor()` (lines 95-121). Also `src/data/types.ts`, which has **no headway or
frequency field at all**, so wait time cannot currently be expressed.

Metrorythm charges the platform-to-platform walk and nothing else. DMRC's planner
adds a fixed allowance per interchange. Measured across the 41 cases:

| Interchange | Metrorythm | DMRC allowance |
|---|---|---|
| Rajiv Chowk (Yellow↔Blue) | 180 s | 300 s |
| Central Secretariat (Yellow↔Violet) | 240 s | 300 s |
| Inderlok (Red↔Green) | 180 s | 300 s |
| Ashok Park Main (Green↔branch) | 120 s | 300 s |
| Dwarka (Blue↔Grey) | 180 s | 300 s |
| Kalkaji Mandir (Violet↔Magenta) | 210 s | **600 s** |
| New Delhi (Yellow↔Orange) | 420 s | **600 s** |
| Sikanderpur (Yellow↔RMGL) | 240 s | **600 s** |
| Noida Sector 52 → 51 (Blue↔Aqua, out of station) | 420 s | 360 s |

DMRC uses 5 min as standard and 10 min where the change crosses a fare boundary or a
long concourse. Metrorythm is short on 8 of the 9, by 1–6 minutes each. On a
three-change journey that is a 10-minute under-estimate before any other error.

The footer already admits times "exclude waiting for the first train". It does not
say they also exclude waiting at every interchange, which is the larger omission.

**Suggested fix.** Add `headwaySeconds` (peak/off-peak) per line to `types.ts` and the
datasets; in `costFnFor('fastest')` charge `edge.seconds + headway/2` for non-ride
edges, and surface the split in `TransferLeg` so the UI can show "3 min walk +
2 min wait". The Kirti Nagar Green branch in particular runs as a long-headway
shuttle, which is why DMRC puts T16 at 14 min against Metrorythm's 9.

---

### P1-5 · Airport Express fares use a distance slab, but DMRC publishes a non-monotonic station-pair chart

**File:** `src/data/fares/index.ts`, the `airportExpress` config (`basis: 'distance'`,
`confidence: 'estimated'`), consumed by `src/engine/fare.ts` → `calculateSegment()`.

The full official 21-pair matrix, fetched from DMRC:

| From → To | km | Fare |
|---|---|---|
| New Delhi → Shivaji Stadium | 1.99 | ₹21 |
| New Delhi → Dhaula Kuan | 8.97 | ₹43 |
| New Delhi → Delhi Aerocity | 15.94 | ₹54 |
| New Delhi → IGI T3 | 19.40 | ₹64 |
| New Delhi → Dwarka Sec-21 | 22.30 | ₹64 |
| New Delhi → Yashobhoomi Sec-25 | 24.30 | ₹75 |
| Shivaji Stadium → Dhaula Kuan | 6.98 | ₹21 |
| Shivaji Stadium → Delhi Aerocity | 13.96 | ₹32 |
| Shivaji Stadium → IGI T3 | 17.41 | ₹54 |
| Shivaji Stadium → Dwarka Sec-21 | 20.31 | ₹64 |
| Shivaji Stadium → Yashobhoomi Sec-25 | 22.31 | ₹75 |
| Dhaula Kuan → Delhi Aerocity | 6.97 | ₹21 |
| Dhaula Kuan → IGI T3 | 10.43 | ₹32 |
| Dhaula Kuan → Dwarka Sec-21 | 13.32 | ₹54 |
| Dhaula Kuan → Yashobhoomi Sec-25 | 15.32 | ₹64 |
| Delhi Aerocity → IGI T3 | 3.46 | ₹21 |
| Delhi Aerocity → Dwarka Sec-21 | 6.35 | ₹32 |
| Delhi Aerocity → Yashobhoomi Sec-25 | 8.35 | ₹43 |
| IGI T3 → Dwarka Sec-21 | 2.90 | ₹21 |
| IGI T3 → Yashobhoomi Sec-25 | 4.90 | ₹32 |
| Dwarka Sec-21 → Yashobhoomi Sec-25 | 2.00 | ₹21 |

**No distance slab can reproduce this table.** 6.98 km costs ₹21 (Shivaji Stadium →
Dhaula Kuan) while 6.35 km costs ₹32 (Delhi Aerocity → Dwarka Sec-21), and 15.94 km
costs ₹54 while 15.32 km costs ₹64. The fare is not monotonic in distance.

Resulting errors: T26 ₹43 vs ₹54, T27 ₹64 vs ₹96, T33 ₹86 vs ₹107, T03 ₹65 vs ₹64,
T04 ₹76 vs ₹75.

**Suggested fix.** `FareConfig` already supports `stationPairs`, and
`calculateSegment()` already prefers it over the slab (lines 141-146) — so this is a
data change only. Populate `airportExpress.stationPairs` with the 21 pairs above,
keyed `"<fromId>|<toId>"`, and promote `confidence` to `'official'`.

---

### P1-6 · Route distance is over-estimated, which pushes journeys into the wrong fare slab

**File:** `src/engine/graph.ts` → `stationDistanceKm()` and
`ROUTE_DISTANCE_FACTOR = 1.12` (line 55).

Distance is `haversine(a, b) × 1.12`, summed per hop. Compared with DMRC's published
chargeable distance over the 40 comparable cases, Metrorythm's figure averages
**×1.085**, with a wide spread:

| Case | Same route? | Metrorythm | Official | Ratio |
|---|---|---|---|---|
| T22 Noida Sec 51 → 142 (Aqua) | yes | 11.7 km | 8.7 km | **×1.35** |
| T23 Noida City Centre → Sec 142 | yes | 14.4 km | 10.7 km | ×1.34 |
| T13 Janakpuri West → Botanical Garden | yes | 38.1 km | 30.8 km | ×1.24 |
| T10 New Delhi → Chandni Chowk | yes | 2.2 km | 1.8 km | ×1.20 |
| T34 Lajpat Nagar → Mayur Vihar-I | yes | 8.9 km | 8.9 km | ×1.00 |

Because DMRC bills by slab, a few hundred metres of error changes the fare. Every
observed DMRC fare error is an over-charge caused by crossing a slab boundary:

| Case | MG km / fare | Official km / fare | Slab crossed |
|---|---|---|---|
| T10 | 2.2 km → ₹21 | 1.8 km → ₹11 | 2 km |
| T17 | 21.8 km → ₹54 | 19.7 km → ₹43 | 21 km |
| T02 | 33.1 km → ₹64 | 30.6 km → ₹54 | 32 km |
| T36 | 32.0 km → ₹64 | 30.1 km → ₹54 | 32 km |
| T13 | 38.1 km → ₹64 | 30.8 km → ₹54 | 32 km |

The DMRC slab table itself in `src/data/fares/index.ts` (11 / 21 / 32 / 43 / 54 / 64)
is **correct** and matches the published 2025-08-25 revision. The fare bug is entirely
upstream, in the distance.

**Suggested fix.** Carry an explicit `km` on each ride edge in the dataset, sourced
from DMRC's published inter-station distances, and have `buildGraph()` prefer it:
`const km = e.km ?? stationDistanceKm(...)`. The haversine fallback stays for cities
with no published figures, where the `distanceApproximated` flag already warns.
The Aqua Line's +35% is the most urgent single case.

---

### P2-7 · "Cheapest" mode minimises distance, not fare

**File:** `src/engine/planner.ts` → `costFnFor()`, the final branch (lines 107-120).
The comment says so explicitly: *"cheapest: minimise distance"*.

Distance is only a proxy for fare, and it is not a reliable one:

| Case | Result |
|---|---|
| T33 IGI T3 → Noida City Centre | "Cheapest" returns **₹86**, while the *fewest-interchanges* journey costs **₹85**. The cheapest mode is not the cheapest. |
| T26 Dhaula Kuan → Rajiv Chowk | "Cheapest" is **16 min slower** with one extra change, for the identical ₹43 |
| T18, T21, T13 | "Cheapest" ties on fare but is slower and adds a change |

A user tapping a card badged *Cheapest* and getting a slower journey at the same price
— or a strictly more expensive one — is a correctness bug, not a presentation quirk.

**Suggested fix.** Two-pass: run the distance-minimising search as a candidate
generator, build the journey, compute the real `computeFare()` total, and keep the
minimum-fare candidate with time as the tie-break. At minimum, in
`createPlanner().plan()` drop the `cheapest` mode from a journey's `modes` array when
its fare is not strictly below the fastest journey's, so the badge disappears instead
of misleading.

---

### P2-8 · Branch junctions are modelled as forced interchanges where DMRC runs through services

**File:** `src/data/cities/delhi.json` — the `yamuna-bank` `blue`/`blue-branch`
interchange edge (120 s).

**T14 Vaishali → Rajiv Chowk.** DMRC returns a single Blue Line leg, 13 stops,
**0 interchanges, 25 min**. Metrorythm forces a change at Yamuna Bank: 1 interchange,
30 min. The same applies to T35 (Anand Vihar ISBT → New Delhi: 2 changes vs DMRC's 1)
and T15.

Blue Line branch services run through Yamuna Bank; a rider stays seated.

**Suggested fix.** Add a `throughService: true` flag to the interchange edge (or model
the branch as alternate `line.stations` patterns on one line) so the planner charges
no interchange and reports `0 changes`. This one needs confirming against the current
service pattern before changing data — DMRC's planner agreeing is good evidence but
not a timetable.

---

### P2-9 · Loop lines break the linear index arithmetic in the planner

**File:** `src/engine/planner.ts` → `directionOf()` (line 125) and `stationsBetween()`
(line 134). Both do `line.stations.indexOf(from)` / `.indexOf(to)` and slice between.

The structural check flagged:

```
EXTRA RIDE EDGE on rapid: phase-1|sikanderpur
```

Rapid Metro Gurugram is a loop — `phase-1 → sikanderpur` closes it — but it is not a
consecutive pair in `line.stations`, so for any journey using that edge
`stationsBetween()` returns the wrong intermediate list and `directionOf()` names the
wrong terminus. The same code will mis-handle the Pink Line once P0-2 is fixed and
the ring closes.

**Suggested fix.** Give `Line` an `isLoop` flag and, when set, pick the shorter of the
two arcs in both functions rather than assuming `i < j` means "forwards".

---

### P2-10 · Out-of-station / fare-boundary interchanges are not flagged `paidArea: false`

**File:** `src/data/cities/delhi.json`.

Only two edges carry `paidArea: false` (`noida-sector-52 → noida-sector-51` and
`dhaula-kuan → durgabai-deshmukh-south-campus`). These three also require exiting and
buying a second ticket, but are flagged as paid-area:

| Edge | Lines | Metrorythm |
|---|---|---|
| `new-delhi` | yellow / airport | 420 s, `paidArea` unset (defaults true) |
| `dwarka-sector-21` | blue / airport | 300 s, unset |
| `sikanderpur` | yellow / rapid | 240 s, unset |

The fare engine still bills two operators correctly, so the total is right — but
`TransferLeg.paidArea` is what the UI uses to tell a rider whether they must exit and
re-enter, and it currently says they need not.

---

### P3-11 · Station renames not reflected (affects search, not routing)

DMRC's current official names, versus Metrorythm's:

| Metrorythm | Current official name |
|---|---|
| Dwarka | Dwarka–Kakrola (formerly Dwarka) |
| Udyog Bhawan | Seva Teerth (formerly Udyog Bhawan) |
| Pitampura | Madhuban Chowk (formerly Pitampura) |
| Mayur Vihar Pocket 1 | Shree Ram Mayur Vihar Mandir |
| Rajendra Nagar | Major Mohit Sharma Rajendra Nagar |

Add the new names and keep the old ones as `aliases` so both resolve in
`src/engine/search.ts`.

---

### P3-12 · Cosmetic: "Unknown operator — estimated" appears in the footer on every city

**File:** `src/App.tsx` (footer, `Object.values(FARE_CONFIGS)`) and
`src/data/fares/index.ts` line 539, where `GENERIC_INDIA` is registered as
`'Unknown operator'`. The footer enumerates every config in the registry rather than
the ones this city actually uses, so a placeholder leaks into the UI.

### P3-13 · Pre-existing lint error unrelated to routing

`src/components/MetroMap.tsx:279` — `react-hooks(rules-of-hooks)`: a `useMemo` is
called conditionally. `npx oxlint src` reports it as an error today. Not an ETA issue,
but it is a latent crash on a render where the condition flips.

---

## 4. Answers to the specific questions asked

**Do journey times assume constant speed across lines?** It is worse than that. Times
are a constant *number of seconds per hop*, so speed is not constant even *within* a
line — it ranges from 12.6 to 111.4 km/h depending on how far apart two stations
happen to be. Different lines do get different constants (140 / 230 / 150 / 110 s),
but that does not fix the within-line variance. See P0-1.

**Are edge-by-edge and cumulative times computed correctly?** The summation itself is
correct: `buildJourney()` accumulates `rideSeconds` and `walkSeconds` and
`totalSeconds = rideSeconds + walkSeconds` with no double-counting, and consecutive
same-line edges merge into one leg properly. The inputs are what is wrong.

**Interchange penalties, waiting time, frequencies?** Walking times exist and are
plausible but are 1–6 minutes short of DMRC's allowance at 8 of 9 checked stations.
Waiting time is zero everywhere — `INTERCHANGE_TIME_PENALTY_S = 0`. Train frequency /
headway is not modelled at all; there is no field for it in `src/data/types.ts`. See P1-4.

**Duplicate stations, missing connections, invalid routes?** No duplicate station
names, no line/station membership contradictions, no station unreachable from the Red
Line, and every multi-line station has the interchange edges it needs — the structural
integrity of the dataset is sound. The missing connections are the three 2025–2026
corridors (P0-2) and the Green Line at Punjabi Bagh West (P0-3). One malformed edge:
the Rapid Metro loop closure (P2-9).

**Incorrect distances?** Yes — systematically over-estimated, mean ×1.085, worst
×1.35 on the Aqua Line. See P1-6.

**Fastest vs fewest changes?** These two work as intended: `fewest-interchanges`
applies a 1-hour penalty per change and reliably returns the lower-change journey
(T05: 77 min / 2 changes vs 114 min / 0; T31: 40 / 2 vs 44 / 1). The de-duplication
that merges identical journeys into one card with several badges also behaves
correctly. It is the third mode, `cheapest`, that is broken — see P2-7.

**Fares?** The DMRC distance slab, the NMRC Aqua station-count slab and the Rapid
Metro flat fare are all correct and match published tables. The multi-operator split
is correct, and changing lines inside one operator's network correctly costs nothing.
Two defects: the Airport Express table is the wrong *shape* (P1-5), and distance
over-estimation pushes DMRC segments into higher slabs (P1-6).

---

## 5. Suggested order of work

1. **P0-3** — one station and four edges; removes two of the largest route errors.
2. **P1-5** — pure data; 21 numbers already gathered above.
3. **P0-1** — the biggest ETA win; needs a `types.ts` field and a `buildGraph()` change.
4. **P1-4** — pairs naturally with P0-1, same data pass.
5. **P1-6** — needs DMRC inter-station distances; largest remaining fare win.
6. **P0-2** — the most work (16 stations, two corridors, coordinates), but until then
   the "verified 2026-11-10" claim in the footer should be softened.
7. **P2-7**, then the P2/P3 items.

---

## 6. Full test matrix

MG = Metrorythm `fastest` journey. Official = DMRC planner, `least-distance` strategy.
Verdict requires ETA within ±15% **and** exact fare **and** matching interchange count.

| # | Origin → Destination | MG route (changes) | MG ETA | Official ETA | Δ | Δ% | MG fare | Official fare | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| T01 | Kashmere Gate → Millennium City Centre Gurugram | Yellow (0) | 58 min | 62 min | −4 | −6% | ₹64 | ₹64 | PASS |
| T02 | New Delhi → Millennium City Centre Gurugram | Yellow (0) | 51 min | 56 min | −5 | −9% | ₹64 | ₹54 | fare FAIL |
| T03 | IGI T3 → New Delhi | Airport Express (0) | 15 min | 20 min | −5 | −25% | ₹65 | ₹64 | ETA+fare FAIL |
| T04 | IGI T3 → Rajiv Chowk | Airport Express→Yellow (1) | 25 min | 32 min | −7 | −22% | ₹76 | ₹75 | ETA+fare FAIL |
| T05 | Dwarka Sec-21 → Noida Electronic City | Airport Express→Pink→Blue (2) | 77 min | 86 min | −9 | −10% | ₹118 | ₹118 | PASS |
| T06 | Rithala → Shaheed Sthal New Bus Adda | Red (0) | 65 min | 61 min | +4 | +7% | ₹64 | ₹64 | PASS |
| T07 | Samaypur Badli → Millennium City Centre | Yellow (0) | 84 min | 86 min | −2 | −2% | ₹64 | ₹64 | PASS |
| T08 | Rajiv Chowk → Hauz Khas | Yellow (0) | 21 min | 19 min | +2 | +11% | ₹32 | ₹32 | PASS |
| T09 | Rajiv Chowk → Kashmere Gate | Yellow (0) | 9 min | 8 min | +1 | +13% | ₹21 | ₹21 | PASS |
| T10 | New Delhi → Chandni Chowk | Yellow (0) | 5 min | 4 min | +1 | +25% | ₹21 | ₹11 | ETA+fare FAIL |
| T11 | Noida City Centre → Dwarka Sec-21 | Blue→Pink→Airport Express (2) | 63 min | 74 min | −11 | −15% | ₹108 | ₹107 | fare FAIL |
| T12 | Botanical Garden → Hauz Khas | Magenta (0) | 30 min | 32 min | −2 | −6% | ₹43 | ₹43 | PASS |
| T13 | Janakpuri West → Botanical Garden | Magenta (0) | 56 min | 56 min | 0 | 0% | ₹64 | ₹54 | fare FAIL |
| T14 | Vaishali → Rajiv Chowk | Blue branch→Blue (1) | 30 min | 25 min | +5 | +20% | ₹43 | ₹43 | ETA+route FAIL |
| T15 | Dwarka Sec-21 → Vaishali | Airport Express→Yellow→Blue→Blue branch (3) | 62 min | 66 min | −4 | −6% | ₹108 | ₹107 | fare+route FAIL |
| T16 | Kirti Nagar → Inderlok | Green branch→Green (1) | 9 min | 14 min | −5 | −36% | ₹21 | ₹21 | ETA+route FAIL |
| T17 | Mundka → Kashmere Gate | Green→Red (1) | 45 min | 46 min | −1 | −2% | ₹54 | ₹43 | fare+route FAIL |
| T18 | Kashmere Gate → Raja Nahar Singh | Violet (0) | 77 min | 82 min | −5 | −6% | ₹64 | ₹64 | route FAIL |
| T19 | Central Secretariat → Raja Nahar Singh | Violet (0) | 61 min | 66 min | −5 | −8% | ₹64 | ₹64 | PASS |
| T20 | Majlis Park → Shiv Vihar | Pink→Yellow→Red→Pink (3) | 48 min | 31 min | **+17** | **+55%** | ₹54 | ₹43 | ETA+fare+route FAIL |
| T21 | Azadpur → Lajpat Nagar | Pink (0) | 37 min | 41 min | −4 | −10% | ₹54 | ₹43 | fare+route FAIL |
| T22 | Noida Sector 51 → Sector 142 | Aqua (0) | 20 min | 16 min | +4 | +25% | ₹30 | ₹30 | ETA FAIL |
| T23 | Noida City Centre → Sector 142 | Blue→Aqua (1) | 32 min | 26 min | +6 | +23% | ₹51 | ₹51 | ETA FAIL |
| T24 | Sikanderpur → Millennium City Centre | Yellow (0) | 7 min | 8 min | −1 | −13% | ₹21 | ₹21 | PASS |
| T25 | Sikanderpur → Rajiv Chowk | Yellow (0) | 42 min | 46 min | −4 | −9% | ₹54 | ₹54 | PASS |
| T26 | Dhaula Kuan → Rajiv Chowk | Airport Express→Yellow (1) | 17 min | 22 min | −5 | −23% | ₹43 | ₹54 | ETA+fare FAIL |
| T27 | IGI T3 → Hauz Khas | Airport Express→Pink→Yellow (2) | 34 min | 50 min | −16 | −32% | ₹64 | ₹96 | ETA+fare+route FAIL |
| T28 | Dilshad Garden → Rithala | Red (0) | 47 min | 44 min | +3 | +7% | ₹54 | ₹54 | PASS |
| T29 | Inderlok → Brigadier Hoshiar Singh | Green (0) | 47 min | 51 min | −4 | −8% | ₹54 | ₹54 | route FAIL |
| T30 | Jahangirpuri → Millennium City Centre | Yellow (0) | 77 min | 79 min | −2 | −3% | ₹64 | ₹64 | PASS |
| T31 | Okhla Vihar → Rajiv Chowk | Magenta→Violet→Yellow (2) | 40 min | 46 min | −6 | −13% | ₹43 | ₹43 | PASS |
| T32 | Kalkaji Mandir → Botanical Garden | Magenta (0) | 19 min | 22 min | −3 | −14% | ₹32 | ₹32 | PASS |
| T33 | IGI T3 → Noida City Centre | Airport Express→Pink→Blue (2) | 59 min | 69 min | −10 | −14% | ₹86 | ₹107 | fare FAIL |
| T34 | Lajpat Nagar → Mayur Vihar-I | Pink (0) | 9 min | 17 min | −8 | **−47%** | ₹32 | ₹32 | ETA FAIL |
| T35 | Anand Vihar ISBT → New Delhi | Blue branch→Blue→Yellow (2) | 31 min | 28 min | +3 | +11% | ₹43 | ₹43 | route FAIL |
| T36 | Punjabi Bagh West → Mayur Vihar Pocket-1 | Pink (0) | 40 min | 55 min | −15 | −27% | ₹64 | ₹54 | ETA+fare FAIL |
| T37 | Dwarka → Dhansa Bus Stand | Grey (0) | 7 min | 10 min | −3 | −30% | ₹21 | ₹21 | ETA FAIL |
| T38 | Cyber City → Rajiv Chowk | Rapid Metro→Yellow (1) | 52 min | 63 min | −11 | −17% | ₹74 | ₹74 | ETA FAIL |
| T39 | Madipur → Netaji Subhash Place | Green→Red (1) | 19 min | 15 min | +4 | +27% | ₹32 | ₹21 | ETA+fare FAIL |
| T40 | Mundka → Rajouri Garden | Green→Green branch→Blue (2) | 45 min | 30 min | **+15** | **+50%** | ₹43 | ₹43 | ETA+route FAIL |
| T41 | Punjabi Bagh → Netaji Subhash Place | Green→Red (1) | 15 min | 12 min | +3 | +25% | ₹32 | ₹21 | ETA+fare FAIL |

**41 cases · mean |ETA error| 17.3% · ETA outside ±15%: 17 · wrong fare: 16 · wrong interchange count: 11 · fully passing: 14**

### Coverage

Long routes (T01, T05, T06, T07, T18, T20, T30), short routes (T09, T10, T24, T32,
T37), multiple interchanges (T05, T11, T15, T20, T27, T31, T33, T35, T40), branch
lines (T14, T15, T16, T29, T35, T40 — Blue Vaishali branch and Green Kirti Nagar
branch), Airport Express (T03, T04, T05, T11, T15, T26, T27, T33), Aqua Line (T22,
T23), Rapid Metro Gurugram (T24, T25, T38), Grey Line (T37), Pink Line incl. the
ring (T20, T21, T36, T39, T40, T41).

---

## 7. Sources

- DMRC official journey planner and station/line endpoints, via the normalising proxy
  at `https://dmrc-rest-api.vercel.app/api` (`/api/v2/journeys/plan`,
  `/api/v1/dmrc/lines/{code}/stations`, `/api/v1/nmrc/lines/AQUA/stations`) —
  <https://github.com/tashifkhan/delhi-metro>
- Pink Line (Delhi Metro) — <https://en.wikipedia.org/wiki/Pink_Line_(Delhi_Metro)>
- Magenta Line (Delhi Metro) — <https://en.wikipedia.org/wiki/Magenta_Line_(Delhi_Metro)>
- Krishna Park Extension metro station — <https://en.wikipedia.org/wiki/Krishna_Park_Extension_metro_station>
- PM inaugurates Pink and Magenta Line extensions of Delhi Metro Phase 4, Metro Rail
  News — <https://metrorailnews.in/modi-inaugurated-2-new-sections-of-delhi-metro/>
- Delhi Metro Pink Line extension, Majlis Park–Maujpur — <https://neevilas.in/delhi-metro-pink-line-extension-majlis-park-maujpur-new-route/>
