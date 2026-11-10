import { useState } from 'react';
import { ChevronDown, Footprints, TrainFront, Flag, CircleDot, LogOut } from 'lucide-react';
import type { Journey, RideLeg, TransferLeg } from '../engine/planner';
import { contrastOn } from './LineDot';

const mins = (s: number) => Math.max(1, Math.round(s / 60));

function RideStep({ leg }: { leg: RideLeg }) {
  const [open, setOpen] = useState(false);
  const fg = contrastOn(leg.line.color);

  return (
    <li className="relative pl-12">
      {/* Coloured spine for this leg */}
      <span className="absolute left-[19px] top-2 bottom-0 w-[3px] rounded-full"
        style={{ background: leg.line.color }}
        aria-hidden
      />
      <span className="absolute left-3 top-1 grid size-6 place-items-center rounded-full ring-2 ring-white dark:ring-ink-900"
        style={{ background: leg.line.color, color: fg }}
        aria-hidden
      >
        <TrainFront className="size-3.5" />
      </span>

      <div className="pb-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ring-1 ring-black/5"
            style={{ background: leg.line.color, color: fg }}
          >
            {leg.line.name}
          </span>
          <span className="text-[13px] font-medium text-ink-500 dark:text-ink-300">
            {leg.direction}
          </span>
        </div>

        <div className="mt-2 text-[15px] font-semibold text-ink-900 dark:text-ink-50">
          {leg.from.name}
          <span className="mx-1.5 font-normal text-ink-400">→</span>
          {leg.to.name}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-500 dark:text-ink-400">
          <span>
            {leg.stationCount} {leg.stationCount === 1 ? 'stop' : 'stops'}
          </span>
          <span aria-hidden>·</span>
          <span>{mins(leg.seconds)} min</span>
          {leg.line.isExpress && (
            <>
              <span aria-hidden>·</span>
              <span className="font-medium text-ink-900 dark:text-accent">express</span>
            </>
          )}
        </div>

        {leg.intermediate.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open} className="mt-2 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 -ml-1.5 text-[12.5px] font-medium text-ink-700 transition hover:bg-accent-soft dark:text-accent dark:hover:bg-accent/15"
            >
              <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
              {open ? 'Hide' : 'Show'} {leg.intermediate.length} intermediate{' '}
              {leg.intermediate.length === 1 ? 'station' : 'stations'}
            </button>
            {open && (
              <ol className="mt-1.5 space-y-1.5 border-l-2 border-dashed border-ink-200 pl-3.5 dark:border-ink-700">
                {leg.intermediate.map((s) => (
                  <li key={s.id} className="text-[13px] text-ink-500 dark:text-ink-400">
                    {s.name}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function TransferStep({ leg }: { leg: TransferLeg }) {
  return (
    <li className="relative pl-12">
      <span className="absolute left-[19px] top-0 bottom-0 w-[3px] rounded-full border-l-[3px] border-dashed border-ink-300 dark:border-ink-600"
        aria-hidden
      />
      <span className="absolute left-3 top-1 grid size-6 place-items-center rounded-full bg-ink-200 text-ink-700 ring-2 ring-white dark:bg-ink-700 dark:text-ink-100 dark:ring-ink-900" aria-hidden>
        {leg.paidArea ? <Footprints className="size-3.5" /> : <LogOut className="size-3.5" />}
      </span>

      <div className="pb-6">
        <div className="rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-3 dark:border-ink-700 dark:bg-ink-800/60">
          <div className="text-[14px] font-semibold text-ink-900 dark:text-ink-50">
            Change at {leg.at.name}
            {leg.to && <span className="font-normal text-ink-500"> → walk to {leg.to.name}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-500 dark:text-ink-400">
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
              style={{ background: leg.fromLine.color, color: contrastOn(leg.fromLine.color) }}
            >
              {leg.fromLine.name}
            </span>
            <span aria-hidden>→</span>
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
              style={{ background: leg.toLine.color, color: contrastOn(leg.toLine.color) }}
            >
              {leg.toLine.name}
            </span>
            <span aria-hidden>·</span>
            <span>~{mins(leg.seconds)} min walk</span>
          </div>
          {!leg.paidArea && (
            <div className="mt-2 rounded-lg bg-accent-soft px-2.5 py-2 text-[12px] text-ink-900 dark:bg-accent/15 dark:text-accent">
              {leg.note ?? 'You must exit the paid area and buy a new ticket for the next leg.'}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export function JourneyTimeline({ journey }: { journey: Journey }) {
  return (
    <ol className="relative mt-1">
      {/* Origin */}
      <li className="relative pl-12">
        <span className="absolute left-[19px] top-4 bottom-0 w-[3px] rounded-full"
          style={{ background: journey.linesUsed[0]?.color ?? '#94a3b8' }}
          aria-hidden
        />
        <span className="absolute left-3 top-1 grid size-6 place-items-center rounded-full bg-accent text-black ring-2 ring-white dark:ring-ink-900" aria-hidden>
          <CircleDot className="size-3.5" />
        </span>
        <div className="pb-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">From</div>
          <div className="text-[16px] font-bold text-ink-900 dark:text-ink-50">{journey.origin.name}</div>
        </div>
      </li>

      {journey.legs.map((leg, i) =>
        leg.type === 'ride' ? (
          <RideStep key={`r${i}`} leg={leg} />
        ) : (
          <TransferStep key={`t${i}`} leg={leg} />
        ),
      )}

      {/* Destination */}
      <li className="relative pl-12">
        <span className="absolute left-3 top-1 grid size-6 place-items-center rounded-full bg-ink-950 text-white ring-2 dark:bg-white dark:text-black ring-white dark:ring-ink-900" aria-hidden>
          <Flag className="size-3.5" />
        </span>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">To</div>
          <div className="text-[16px] font-bold text-ink-900 dark:text-ink-50">
            {journey.destination.name}
          </div>
        </div>
      </li>
    </ol>
  );
}
