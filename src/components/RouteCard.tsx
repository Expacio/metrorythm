import { Clock, IndianRupee, Repeat, Route as RouteIcon, ChevronRight, Zap, PiggyBank, Shuffle } from 'lucide-react';
import type { Journey, RouteMode } from '../engine/planner';
import { payableFare, type FarePreference } from '../engine/fare';
import { contrastOn } from './LineDot';

const MODE_META: Record<RouteMode, { label: string; Icon: typeof Zap; tone: string }> = {
  fastest: { label: 'Fastest', Icon: Zap, tone: 'bg-accent text-black' },
  cheapest: { label: 'Cheapest', Icon: PiggyBank, tone: 'bg-ink-900 text-white dark:bg-white dark:text-black' },
  'fewest-interchanges': { label: 'Fewest changes', Icon: Shuffle, tone: 'bg-ink-100 text-ink-900 ring-1 ring-ink-300 dark:bg-ink-800 dark:text-ink-100 dark:ring-ink-600' },
};

export function formatDuration(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h} hr` : `${h} hr ${rem} min`;
}

interface Props {
  journey: Journey;
  farePreference: FarePreference;
  /** Other modes that produced this identical route. */
  alsoModes: RouteMode[];
  selected: boolean;
  onSelect: () => void;
}

export function RouteCard({ journey, alsoModes, selected, onSelect, farePreference }: Props) {
  const allModes = [journey.mode, ...alsoModes];
  const fare = payableFare(journey.fare, farePreference);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected} className={`w-full rounded-2xl border p-4 text-left transition ${
        selected
          ? 'border-accent bg-white ring-4 ring-accent/25 dark:border-accent dark:bg-ink-800'
          : 'border-ink-200 bg-white hover:border-ink-300 dark:border-ink-700 dark:bg-ink-800/60 dark:hover:border-ink-600'
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {allModes.map((m) => {
          const { label, Icon, tone } = MODE_META[m];
          return (
            <span
              key={m} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}
            >
              <Icon className="size-3" aria-hidden />
              {label}
            </span>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div>
          <div className="text-[26px] font-bold leading-none tracking-tight text-ink-900 dark:text-ink-50">
            {formatDuration(journey.totalSeconds)}
          </div>
          <div className="mt-1.5 text-[12.5px] text-ink-500 dark:text-ink-400">
            {journey.interchanges === 0
              ? 'Direct — no changes'
              : `${journey.interchanges} ${journey.interchanges === 1 ? 'change' : 'changes'}`}
            {' · '}
            {journey.stationCount} stations
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end text-[22px] font-bold leading-none text-ink-900 dark:text-ink-50">
            <IndianRupee className="size-4" aria-hidden />
            {fare}
          </div>
          <div className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">
            {farePreference === 'smartCard' ? 'smart card' : 'token'}
            {journey.fare.confidence !== 'official' && ' · est.'}
          </div>
        </div>
      </div>

      {/* Line ribbon */}
      <div className="mt-3.5 flex items-center gap-1 overflow-hidden">
        {journey.legs
          .filter((l) => l.type === 'ride')
          .map((leg, i, arr) => {
            const ride = leg as Extract<typeof leg, { type: 'ride' }>;
            return (
              <span key={i} className="flex min-w-0 items-center gap-1">
                <span className="truncate rounded-md px-1.5 py-1 text-[10.5px] font-semibold leading-none ring-1 ring-black/5"
                  style={{ background: ride.line.color, color: contrastOn(ride.line.color) }}
                >
                  {ride.line.name.replace(' Line', '')}
                </span>
                {i < arr.length - 1 && (
                  <ChevronRight className="size-3 shrink-0 text-ink-400" aria-hidden />
                )}
              </span>
            );
          })}
      </div>

      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-ink-100 pt-3 text-[12px] text-ink-500 dark:border-ink-700 dark:text-ink-400">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" aria-hidden />
          {formatDuration(journey.rideSeconds)} riding
        </span>
        {journey.walkSeconds > 0 && (
          <span
            className="inline-flex items-center gap-1"
            /* Walking and waiting are very different things to a rider, so the
               split is spelled out rather than hidden behind one number. */
            title={
              `${formatDuration(journey.timing.interchangeWalk)} walking between platforms, `
              + `${formatDuration(journey.timing.interchangeWait)} waiting for connections`
            }
          >
            <Repeat className="size-3.5" aria-hidden />
            {formatDuration(journey.walkSeconds)} changing
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <RouteIcon className="size-3.5" aria-hidden />
          {journey.distanceConfidence === 'OFFICIAL' ? '' : '~'}{journey.distanceKm} km
        </span>
      </div>
    </button>
  );
}
