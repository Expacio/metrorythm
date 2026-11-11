import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown, Search, Moon, Sun, History, X,
  AlertCircle, Info, Map as MapIcon, ListOrdered, ReceiptText, CreditCard, Ticket, BadgeCheck, TriangleAlert, LocateFixed, Loader2,
} from 'lucide-react';

import { CITIES, getCity } from './data';
import type { CityDataset, Confidence, Station } from './data/types';
import { createPlanner, type Journey, type RouteMode } from './engine/planner';
import { payableFare, type FarePreference } from './engine/fare';
import { findNearestCity, NEAREST_CITY_LIMIT_KM } from './engine/nearestCity';
import { useGeolocation } from './hooks/useGeolocation';
import { createSearch } from './engine/search';
import { useTheme } from './hooks/useTheme';
import { useRecentSearches, useLocalStorage } from './hooks/useLocalStorage';

import { StationInput } from './components/StationInput';
import { CityPicker } from './components/CityPicker';
import { RouteCard, formatDuration } from './components/RouteCard';
import { JourneyTimeline } from './components/JourneyTimeline';
import { MetroMap } from './components/MetroMap';
import { LineDot } from './components/LineDot';

/**
 * Engines are expensive to build (the Delhi graph alone is ~1,300 platform
 * nodes), so each city's is constructed once and reused.
 */
const engineCache = new Map<string, {
  dataset: CityDataset;
  planner: ReturnType<typeof createPlanner>;
  search: ReturnType<typeof createSearch>;
  stationsById: Map<string, Station>;
  linesById: Map<string, CityDataset['lines'][number]>;
}>();

function engineFor(cityId: string) {
  const cached = engineCache.get(cityId);
  if (cached) return cached;
  const dataset = getCity(cityId);
  const built = {
    dataset,
    planner: createPlanner(dataset),
    search: createSearch(dataset),
    stationsById: new Map(dataset.stations.map((s) => [s.id, s])),
    linesById: new Map(dataset.lines.map((l) => [l.id, l])),
  };
  engineCache.set(cityId, built);
  return built;
}

/**
 * How a journey's timing confidence is shown.
 *
 * These are deliberately plain words rather than a badge: the point is that a
 * reader can tell at a glance whether a number came from the operator or from
 * our own arithmetic, without having to learn a legend.
 */
const CONFIDENCE_LABEL: Record<Confidence, string> = {
  OFFICIAL: 'operator timings',
  VERIFIED_SECONDARY: 'from official distances',
  ESTIMATED: 'estimated',
  UNKNOWN: 'unverified',
};

const CONFIDENCE_NOTE: Record<Confidence, string> = {
  OFFICIAL: 'Taken from the operator\'s published timetable.',
  VERIFIED_SECONDARY:
    'Calculated from the operator\'s published distances and line speed, not a timetable.',
  ESTIMATED: 'Calculated from station positions — no published figure was available.',
  UNKNOWN: 'No reliable source for this journey\'s timings.',
};

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  OFFICIAL: 'text-ink-600 dark:text-ink-300',
  VERIFIED_SECONDARY: 'text-ink-600 dark:text-ink-300',
  ESTIMATED: 'font-semibold text-ink-900 dark:text-accent',
  UNKNOWN: 'font-semibold text-ink-900 dark:text-accent',
};

/** A few genuinely useful starting points per city, rather than filler. */
const QUICK_PAIRS: Record<string, { label: string; from: string; to: string }[]> = {
  delhi: [
    { label: 'DEL T3 → Connaught Place', from: 'igi-airport-terminal-3', to: 'rajiv-chowk' },
    { label: 'DEL T3 → Hindon River', from: 'igi-airport-terminal-3', to: 'hindon-river' },
    { label: 'New Delhi → Gurugram', from: 'new-delhi', to: 'millennium-city-centre-gurugram' },
    { label: 'Noida City Centre → Dwarka', from: 'noida-city-centre', to: 'dwarka-sector-21' },
    { label: 'Kashmere Gate → Lotus Temple', from: 'kashmere-gate', to: 'kalkaji-mandir' },
  ],
  chennai: [
    { label: 'MAA Airport → Chennai Central', from: 'chennai-airport', to: 'mgr-central' },
    { label: 'Chennai Central → CMBT', from: 'mgr-central', to: 'cmbt' },
    { label: 'Egmore → St. Thomas Mount', from: 'egmore', to: 'st-thomas-mount' },
    { label: 'Poonamallee → Vadapalani', from: 'poonamallee-bypass', to: 'vadapalani' },
    { label: 'Guindy → Anna Nagar Tower', from: 'guindy', to: 'anna-nagar-tower' },
  ],
};

export default function App() {
  const { theme, toggle } = useTheme();
  const { recents, add: addRecent, clear: clearRecents } = useRecentSearches();

  const [from, setFrom] = useState<Station | null>(null);
  const [to, setTo] = useState<Station | null>(null);
  const [result, setResult] = useState<ReturnType<typeof planner.plan> | null>(null);
  const [selectedMode, setSelectedMode] = useState<RouteMode>('fastest');
  const [mobileTab, setMobileTab] = useState<'route' | 'map'>('route');
  const [highlight, setHighlight] = useState<Station | null>(null);
  const [cityId, setCityId] = useLocalStorage<string>('metrogo.city', 'delhi');
  /** Set once the user has chosen a city, or declined to be located. */
  const [citySettled, setCitySettled] = useLocalStorage<boolean>('metrogo.citySettled', false);
  const geo = useGeolocation();
  const [geoNote, setGeoNote] = useState<string | null>(null);

  const { dataset, planner, search, stationsById, linesById } = useMemo(
    () => engineFor(cityId),
    [cityId],
  );
  /** Curated pairs where we have them; otherwise the two longest lines' termini. */
  const quickPairs = useMemo(() => {
    const curated = QUICK_PAIRS[cityId];
    if (curated) return curated;
    return [...dataset.lines]
      .sort((a, b) => b.stations.length - a.stations.length)
      .slice(0, 3)
      .map((l) => {
        const from = stationsById.get(l.stations[0]);
        const to = stationsById.get(l.stations[l.stations.length - 1]);
        if (!from || !to) return null;
        return { label: `${from.name} → ${to.name}`, from: from.id, to: to.id };
      })
      .filter((x): x is { label: string; from: string; to: string } => x !== null);
  }, [cityId, dataset, stationsById]);
  const [farePreference, setFarePreference] = useLocalStorage<FarePreference>(
    'metrogo.farePreference',
    'token',
  );

  const runPlan = useCallback((a: Station, b: Station) => {
    const res = planner.plan(a.id, b.id);
    setResult(res);
    if (res.journeys.length > 0) {
      setSelectedMode(res.journeys[0].mode);
      addRecent({ fromId: a.id, fromName: a.name, toId: b.id, toName: b.name });
    }
  }, [addRecent, planner]);

  const onSearch = () => {
    if (from && to) runPlan(from, to);
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
    setResult(null);
  };

  const loadPair = (fromId: string, toId: string) => {
    const a = stationsById.get(fromId);
    const b = stationsById.get(toId);
    if (!a || !b) return;
    setFrom(a);
    setTo(b);
    runPlan(a, b);
  };

  /**
   * A shared link already names its city, and switching networks would discard
   * the route it carries — so those open exactly as sent, without a prompt.
   */
  const hasDeepLink = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return !!(params.get('from') && params.get('to'));
  }, []);

  /** Ask for location on first load, so the right city is already loaded. */
  useEffect(() => {
    if (citySettled || hasDeepLink || geo.status !== 'idle') return;
    geo.request();
  }, [citySettled, hasDeepLink, geo.status, geo.request]);

  /**
   * When a fix arrives, switch to whichever network has a station closest to
   * it. All matching is local — the position is compared against the station
   * coordinates already in the bundle, never sent anywhere.
   */
  useEffect(() => {
    if (geo.status !== 'done' || !geo.coords) return;
    const hit = findNearestCity(geo.coords.lat, geo.coords.lng, CITIES);
    setCitySettled(true);
    if (!hit) {
      setGeoNote(
        `No metro network within ${NEAREST_CITY_LIMIT_KM} km of you — showing ${getCity(cityId).city.cityName}.`,
      );
      return;
    }
    setGeoNote(
      `Nearest network: ${hit.city.city.cityName} — ${hit.stationName} is about ${hit.distanceKm} km away.`,
    );
    if (hit.city.city.cityId !== cityId) {
      setCityId(hit.city.city.cityId);
      setFrom(null);
      setTo(null);
      setResult(null);
      setHighlight(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.status, geo.coords]);

  useEffect(() => {
    if (geo.status === 'denied' || geo.status === 'error' || geo.status === 'unavailable') {
      setCitySettled(true);
      setGeoNote(geo.message);
    }
  }, [geo.status, geo.message, setCitySettled]);

  const switchCity = (next: string) => {
    if (next === cityId) return;
    setCityId(next);
    setCitySettled(true);
    setGeoNote(null);
    setFrom(null);
    setTo(null);
    setResult(null);
    setHighlight(null);
  };

  // Clear a stale result when the endpoints change.
  useEffect(() => {
    setResult(null);
  }, [from?.id, to?.id]);

  /**
   * Shareable deep links: /?city=<id>&from=<stationId>&to=<stationId>
   *
   * `city` is optional — if it is missing or wrong, the city that actually
   * contains BOTH stations wins, so an old single-city link still resolves.
   * Read once on mount. Purely local, no network involved.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromId = params.get('from') ?? '';
    const toId = params.get('to') ?? '';
    if (!fromId || !toId) return;

    const wanted = params.get('city');
    const ordered = [
      ...CITIES.filter((c) => c.city.cityId === wanted),
      ...CITIES.filter((c) => c.city.cityId !== wanted),
    ];
    const host = ordered.find(
      (c) => c.stations.some((s) => s.id === fromId) && c.stations.some((s) => s.id === toId),
    );
    if (!host) return;

    const eng = engineFor(host.city.cityId);
    const a = eng.stationsById.get(fromId)!;
    const b = eng.stationsById.get(toId)!;
    setCityId(host.city.cityId);
    setFrom(a);
    setTo(b);
    // Defer so the "clear on endpoint change" effect above runs first, and so
    // the planner for the (possibly just-switched) city is the one used.
    queueMicrotask(() => {
      const res = eng.planner.plan(a.id, b.id);
      setResult(res);
      if (res.journeys.length > 0) setSelectedMode(res.journeys[0].mode);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL in sync so the current route can be copied and shared.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (from && to) {
      url.searchParams.set('city', cityId);
      url.searchParams.set('from', from.id);
      url.searchParams.set('to', to.id);
    } else {
      url.searchParams.delete('city');
      url.searchParams.delete('from');
      url.searchParams.delete('to');
    }
    window.history.replaceState(null, '', url);
  }, [from?.id, to?.id, cityId]);

  /**
   * Group journeys so a route produced by several modes shows one card with
   * multiple badges rather than three near-identical cards.
   */
  const cards = useMemo(() => {
    if (!result) return [];
    return result.journeys.map((j) => ({
      journey: j,
      alsoModes: j.modes.filter((m) => m !== j.mode),
    }));
  }, [result]);

  const selected: Journey | null = useMemo(() => {
    if (!result || result.journeys.length === 0) return null;
    return result.journeys.find((j) => j.mode === selectedMode) ?? result.journeys[0];
  }, [result, selectedMode]);

  return (
    <div className="min-h-dvh bg-ink-50 text-ink-900 transition-colors dark:bg-ink-950 dark:text-ink-50">
      {/* ------------------------------------------------------------ header */}
      <header className="sticky top-0 z-40 border-b border-ink-200/80 bg-white/85 backdrop-blur-xl dark:border-ink-800 dark:bg-ink-900/85">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <img
              src="/icons/icon-192.png"
              alt=""
              width={36}
              height={36}
              className="size-9 rounded-[10px] shadow-sm ring-1 ring-black/5"
            />
            <div className="leading-tight">
              <div className="font-display text-[18px] font-bold tracking-tight">Metrorythm</div>
              <div className="text-[11px] text-ink-400">{dataset.city.cityName}</div>
            </div>
          </div>

          {/* City picker — 19 networks is too many for a button row */}
          <div className="ml-1">
            <CityPicker cities={CITIES} value={cityId} onChange={switchCity} />
          </div>

          <button
            type="button"
            onClick={geo.request}
            disabled={geo.status === 'locating'}
            title="Find my nearest network"
            aria-label="Find my nearest network"
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-ink-200 text-ink-600 transition hover:bg-ink-100 hover:text-ink-900 disabled:opacity-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-ink-50"
          >
            {geo.status === 'locating'
              ? <Loader2 className="size-4 animate-spin" />
              : <LocateFixed className="size-4" />}
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggle}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} className="grid size-9 place-items-center rounded-lg border border-ink-200 text-ink-600 transition hover:bg-ink-100 hover:text-ink-900 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-ink-50"
            >
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7">
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-6">
          {/* ------------------------------------------------- left column */}
          <div className="min-w-0 space-y-4">
            {/* First run: the permission prompt is already up, so explain it. */}
            {!citySettled && !hasDeepLink && (geo.status === 'idle' || geo.status === 'locating') && (
              <section className="mg-animate-in rounded-2xl border border-ink-300 bg-accent-soft p-4 dark:border-ink-700 dark:bg-accent/15">
                <div className="flex items-start gap-2.5">
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-ink-900 dark:text-accent" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-ink-900 dark:text-accent">
                      Finding the network nearest you…
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-ink-600 dark:text-ink-300">
                      Allow location and Metrorythm picks your city automatically. Matched
                      on-device against {CITIES.length} networks — your position is never sent
                      anywhere, as Metrorythm has no server to send it to.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setCitySettled(true); setGeoNote(null); }}
                      className="mt-2.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
                    >
                      Not now
                    </button>
                  </div>
                </div>
              </section>
            )}

            {geoNote && (
              <div className="flex items-start gap-2 rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[12.5px] text-ink-600 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300">
                <LocateFixed className="mt-0.5 size-3.5 shrink-0 text-ink-400" aria-hidden />
                <span className="min-w-0 flex-1">{geoNote}</span>
                <button
                  type="button"
                  onClick={() => setGeoNote(null)}
                  aria-label="Dismiss"
                  className="shrink-0 rounded p-0.5 text-ink-400 transition hover:text-ink-900 dark:hover:text-white"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}

            {/* Search panel */}
            <section className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-900 sm:p-5">
              {/*
                The swap control sits in a row of its own between the two
                fields. Floating it over them only works while both are empty —
                once a station is picked the field grows and the button lands on
                top of that field's clear button.
              */}
              <div className="grid gap-2">
                <StationInput
                  label="From"
                  value={from}
                  onChange={setFrom}
                  search={search}
                  linesById={linesById}
                  onSwitchCity={switchCity}
                  cityNameFor={(id) => CITIES.find((c) => c.city.cityId === id)?.city.cityName}
                  autoFocus
                />
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-ink-200 dark:bg-ink-700" aria-hidden />
                  <button
                    type="button"
                    onClick={swap}
                    disabled={!from && !to}
                    aria-label="Swap origin and destination"
                    className="grid size-9 shrink-0 place-items-center rounded-full border border-ink-200 bg-white text-ink-500 shadow-sm transition hover:border-ink-400 hover:text-ink-900 disabled:opacity-40 dark:border-ink-600 dark:bg-ink-800 dark:text-ink-300 dark:hover:text-accent"
                  >
                    <ArrowUpDown className="size-4" />
                  </button>
                </div>
                <StationInput
                  label="To"
                  value={to}
                  onChange={setTo}
                  search={search}
                  linesById={linesById}
                  onSwitchCity={switchCity}
                  cityNameFor={(id) => CITIES.find((c) => c.city.cityId === id)?.city.cityName}
                />
              </div>

              <button
                type="button"
                onClick={onSearch}
                disabled={!from || !to} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3.5 text-[15px] font-bold text-black transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-400 dark:disabled:bg-ink-800 dark:disabled:text-ink-600"
              >
                <Search className="size-4" aria-hidden />
                Find route
              </button>

              {/* Quick picks */}
              {!result && (
                <div className="mt-4">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                    Try one of these
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {quickPairs.map((q) => (
                      <button
                        key={q.label}
                        type="button"
                        onClick={() => loadPair(q.from, q.to)} className="rounded-full border border-ink-200 px-2.5 py-1.5 text-[12px] font-medium text-ink-600 transition hover:border-ink-900 hover:bg-accent-soft hover:text-ink-900 dark:border-ink-700 dark:text-ink-300 dark:hover:border-accent dark:hover:bg-accent/15 dark:hover:text-accent"
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Recent searches */}
            {recents.length > 0 && !result && (
              <section className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-900">
                <div className="mb-2.5 flex items-center justify-between">
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                    <History className="size-3.5" aria-hidden />
                    Recent
                  </div>
                  <button
                    type="button"
                    onClick={clearRecents} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800 dark:hover:text-ink-200"
                  >
                    <X className="size-3" /> Clear
                  </button>
                </div>
                <ul className="space-y-1">
                  {recents.map((r) => (
                    <li key={`${r.fromId}-${r.toId}`}>
                      <button
                        type="button"
                        onClick={() => loadPair(r.fromId, r.toId)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13.5px] text-ink-700 transition hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800"
                      >
                        <span className="truncate">{r.fromName}</span>
                        <span className="text-ink-400" aria-hidden>→</span>
                        <span className="truncate">{r.toName}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Route options */}
            {dataset.connectivity && !dataset.connectivity.connected && (
              <div className="flex gap-2.5 rounded-2xl border border-ink-300 bg-accent-soft p-3.5 text-[12.5px] text-ink-900 dark:border-ink-700 dark:bg-accent/15 dark:text-accent">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  This network splits into {dataset.connectivity.components} parts that our data
                  does not connect — some lines meet only by walking between differently-named
                  stations, which we have no verified data for. Routes between those parts will
                  report no path rather than invent one.
                </span>
              </div>
            )}

            {result?.error && (
              <div className="flex gap-2.5 rounded-2xl border border-ink-300 bg-accent-soft p-4 text-[13.5px] text-ink-900 dark:border-ink-700 dark:bg-accent/15 dark:text-accent">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{result.error}</span>
              </div>
            )}

            {cards.length > 0 && (
              <section className="space-y-2.5">
                <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                  {cards.length} {cards.length === 1 ? 'route' : 'routes'}
                </h2>
                {cards.map(({ journey, alsoModes }) => (
                  <RouteCard
                    key={journey.mode}
                    journey={journey}
                    alsoModes={alsoModes}
                    selected={selected?.mode === journey.mode}
                    onSelect={() => setSelectedMode(journey.mode)}
                    farePreference={farePreference}
                  />
                ))}
              </section>
            )}

            {/* Network summary */}
            <section className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-900">
              <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                Network · {dataset.stations.length} stations
              </div>
              <div className="flex flex-wrap gap-1.5">
                {dataset.lines
                  .filter((l) => !l.parentLine)
                  .map((l) => (
                    <LineDot key={l.id} line={l} size="xs" />
                  ))}
              </div>
            </section>
          </div>

          {/* ------------------------------------------------ right column */}
          <div className="min-w-0 space-y-4">
            {/* Mobile tab switcher */}
            {selected && (
              <div className="flex gap-1 rounded-xl border border-ink-200 bg-white p-1 dark:border-ink-700 dark:bg-ink-900 lg:hidden">
                {([
                  { id: 'route', label: 'Journey', Icon: ListOrdered },
                  { id: 'map', label: 'Map', Icon: MapIcon },
                ] as const).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMobileTab(id)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
                      mobileTab === id
                        ? 'bg-accent text-black'
                        : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800'
                    }`}
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Journey detail */}
            {selected && (
              <section className={`mg-animate-in rounded-2xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-900 sm:p-5 ${
                  mobileTab === 'map' ? 'hidden lg:block' : ''
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="text-[17px] font-bold tracking-tight">Your journey</h2>
                  <div className="text-[13px] text-ink-500 dark:text-ink-400">
                    {formatDuration(selected.totalSeconds)} · ₹{payableFare(selected.fare, farePreference)} ·{' '}
                    {selected.interchanges === 0
                      ? 'direct'
                      : `${selected.interchanges} ${selected.interchanges === 1 ? 'change' : 'changes'}`}
                  </div>
                </div>

                {/*
                  Journey time, as its parts. A single number hides whether an
                  estimate is mostly riding or mostly waiting for a connection,
                  and the two are not equally certain.
                */}
                <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-ink-500 dark:text-ink-400">
                  <span>{formatDuration(selected.timing.inTrain)} on board</span>
                  {selected.timing.dwell > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{formatDuration(selected.timing.dwell)} at stations</span>
                    </>
                  )}
                  {selected.timing.interchangeWalk > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{formatDuration(selected.timing.interchangeWalk)} walking</span>
                    </>
                  )}
                  {selected.timing.interchangeWait > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{formatDuration(selected.timing.interchangeWait)} waiting</span>
                    </>
                  )}
                  <span aria-hidden>·</span>
                  <span
                    className={CONFIDENCE_STYLE[selected.timeConfidence]}
                    title={CONFIDENCE_NOTE[selected.timeConfidence]}
                  >
                    {CONFIDENCE_LABEL[selected.timeConfidence]}
                  </span>
                </div>
                <p className="mt-1 text-[11.5px] text-ink-400">
                  Excludes waiting for your first train.
                </p>

                <JourneyTimeline journey={selected} />

                {/* ----------------------------------------- fare breakdown */}
                <div className="mt-5 overflow-hidden rounded-xl border border-ink-200 dark:border-ink-700">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 bg-ink-50 px-3.5 py-2.5 dark:border-ink-700 dark:bg-ink-800/60">
                    <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                      <ReceiptText className="size-3.5" aria-hidden />
                      Fare
                    </div>
                    {/* Ticket type */}
                    <div className="flex gap-0.5 rounded-lg bg-ink-200 p-0.5 dark:bg-ink-700">
                      {([
                        { id: 'token' as const, label: 'Token', Icon: Ticket },
                        { id: 'smartCard' as const, label: 'Smart card', Icon: CreditCard },
                      ]).map(({ id, label, Icon }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setFarePreference(id)}
                          aria-pressed={farePreference === id}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold transition ${
                            farePreference === id
                              ? 'bg-accent text-black'
                              : 'text-ink-600 hover:text-ink-900 dark:text-ink-300 dark:hover:text-white'
                          }`}
                        >
                          <Icon className="size-3" aria-hidden />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="px-3.5 py-3">
                    <ul className="space-y-2.5">
                      {selected.fare.segments.map((seg) => (
                        <li key={seg.fareSystemId}>
                          <div className="flex items-baseline justify-between gap-3 text-[13px]">
                            <span className="min-w-0 font-medium text-ink-900 dark:text-ink-50">
                              {seg.label}
                            </span>
                            <span className="shrink-0 font-bold tabular-nums">
                              ₹{farePreference === 'smartCard' ? seg.smartCard : seg.token}
                            </span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-ink-500 dark:text-ink-400">
                            <span>
                              {seg.basisUsed === 'stationPair' && 'published station-to-station fare'}
                              {seg.basisUsed === 'distance'
                                && `distance slab · ${selected.distanceConfidence === 'OFFICIAL' ? '' : '~'}${seg.km} km`}
                              {seg.basisUsed === 'stationCount' && `${seg.stations} stations travelled`}
                              {seg.basisUsed === 'flat' && 'flat fare'}
                            </span>
                            <span aria-hidden>·</span>
                            {seg.confidence === 'official' ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-ink-700 dark:text-ink-200">
                                <BadgeCheck className="size-3" aria-hidden /> official
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-px font-semibold text-black">
                                <TriangleAlert className="size-3" aria-hidden />
                                {seg.confidence === 'estimated' ? 'estimated' : 'unavailable'}
                              </span>
                            )}
                            <span aria-hidden>·</span>
                            <span>{seg.effectiveDateIsPublished ? 'effective' : 'verified'} {seg.effectiveDate}</span>
                          </div>
                          {farePreference === 'smartCard' && seg.token !== seg.smartCard && (
                            <div className="mt-0.5 text-[11.5px] text-ink-400">
                              token ₹{seg.token} · smart card saves ₹{seg.token - seg.smartCard}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-ink-200 pt-2.5 dark:border-ink-700">
                      <span className="text-[14px] font-bold">Total payable</span>
                      <span className="text-[20px] font-bold tabular-nums">
                        ₹{payableFare(selected.fare, farePreference)}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                      {[
                        { k: 'Token', v: selected.fare.token },
                        { k: 'Smart card', v: selected.fare.smartCard },
                        { k: 'Sun / holiday', v: selected.fare.sundayToken },
                      ].map(({ k, v }) => (
                        <div key={k} className="rounded-lg bg-ink-50 px-2 py-1.5 dark:bg-ink-800/60">
                          <div className="text-[10.5px] uppercase tracking-wide text-ink-400">{k}</div>
                          <div className="text-[14px] font-bold tabular-nums">₹{v}</div>
                        </div>
                      ))}
                    </div>

                    {selected.fare.notes.map((n) => (
                      <p key={n} className="mt-2 text-[11.5px] leading-relaxed text-ink-500 dark:text-ink-400">
                        {n}
                      </p>
                    ))}
                    {selected.distanceApproximated && (
                      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-500 dark:text-ink-400">
                        Some stations on this route have no verified coordinate, so the distance used
                        for any distance-based slab is approximated from the number of stops.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Map */}
            <section className={`h-[420px] sm:h-[520px] lg:h-[640px] ${
                selected && mobileTab === 'route' ? 'hidden lg:block' : ''
              }`}
            >
              <MetroMap
                dataset={dataset}
                journey={selected}
                highlight={highlight}
                onSelectStation={(s) => {
                  setHighlight(s);
                  if (!from) setFrom(s);
                  else if (!to) setTo(s);
                }}
              />
            </section>

            {!selected && (
              <div className="flex gap-2.5 rounded-2xl border border-ink-200 bg-white p-4 text-[13px] text-ink-500 shadow-sm dark:border-ink-700 dark:bg-ink-900 dark:text-ink-400">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  Tap any station on the map to set it as your origin or destination, or search by
                  station name, airport code (<b>DEL</b>, <b>VIDP</b>), terminal (<b>Terminal 1</b>)
                  or landmark (<b>Red Fort</b>, <b>Lotus Temple</b>).
                </span>
              </div>
            )}
          </div>
        </div>
      </main>

    </div>
  );
}
