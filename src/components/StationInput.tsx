import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MapPin, Plane, Landmark, Search, X, AlertTriangle } from 'lucide-react';
import type { Station } from '../data/types';
import type { Search as SearchEngine, SearchResult, UnavailableCityHit } from '../engine/search';
import { LineDot } from './LineDot';
import type { Line } from '../data/types';

interface Props {
  label: string;
  value: Station | null;
  onChange: (station: Station | null) => void;
  search: SearchEngine;
  linesById: Map<string, Line>;
  placeholder?: string;
  autoFocus?: boolean;
  /** Called when the user accepts a suggested city switch. */
  onSwitchCity?: (cityId: string) => void;
  cityNameFor?: (cityId: string) => string | undefined;
}

const KIND_ICON = {
  station: MapPin,
  alias: MapPin,
  airport: Plane,
  terminal: Plane,
  landmark: Landmark,
} as const;

export function StationInput({
  label,
  value,
  onChange,
  search,
  linesById,
  placeholder = 'Station, airport code or landmark',
  autoFocus,
  onSwitchCity,
  cityNameFor,
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results: SearchResult[] = useMemo(
    () => (query.trim() ? search.search(query, 8) : []),
    [query, search],
  );

  const unavailable: UnavailableCityHit | null = useMemo(
    () => (query.trim() ? search.unavailableCity(query) : null),
    [query, search],
  );

  useEffect(() => setActive(0), [query]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const choose = (r: SearchResult) => {
    onChange(r.station);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) {
      if (e.key === 'ArrowDown') setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showDropdown = open && (results.length > 0 || !!unavailable);

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <label
        htmlFor={`${listId}-input`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-ink-400 dark:text-ink-400"
      >
        {label}
      </label>

      {value ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-ink-200 bg-white px-3.5 py-3 shadow-sm transition dark:border-ink-700 dark:bg-ink-800">
          <MapPin className="size-4 shrink-0 text-ink-400" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-ink-900 dark:text-ink-50">
              {value.name}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {value.lines.map((id) => {
                const line = linesById.get(id);
                return line ? <LineDot key={id} line={line} size="xs" /> : null;
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            aria-label={`Clear ${label}`} className="shrink-0 rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-700 dark:hover:text-ink-100"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400"
            aria-hidden
          />
          <input
            id={`${listId}-input`}
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showDropdown && results[active] ? `${listId}-${active}` : undefined}
            autoComplete="off"
            autoFocus={autoFocus}
            value={query}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown} className="w-full rounded-xl border border-ink-200 bg-white py-3 pl-10 pr-3.5 text-[15px] text-ink-900 shadow-sm outline-none transition placeholder:text-ink-400 focus:border-accent focus:ring-4 focus:ring-accent/30 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50 dark:focus:border-accent"
          />
        </div>
      )}

      {showDropdown && (
        <ul
          id={listId}
          role="listbox" className="absolute z-30 mt-1.5 max-h-80 w-full overflow-auto rounded-xl border border-ink-200 bg-white p-1 shadow-xl shadow-ink-900/8 dark:border-ink-700 dark:bg-ink-800 dark:shadow-black/40"
        >
          {unavailable && (
            <li className="m-1 flex gap-2.5 rounded-lg bg-accent-soft p-3 text-[13px] text-ink-900 dark:bg-accent/15 dark:text-accent">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <b>{unavailable.code}</b> is {unavailable.airportName}, {unavailable.city}.{' '}
                {unavailable.note}
                {unavailable.availableInCityId && onSwitchCity && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onSwitchCity(unavailable.availableInCityId!)}
                    className="mt-1.5 block rounded-md bg-ink-900 px-2 py-1 text-[11.5px] font-semibold text-white transition hover:bg-ink-700 dark:bg-white dark:text-black dark:hover:bg-ink-200"
                  >
                    Switch to {cityNameFor?.(unavailable.availableInCityId) ?? unavailable.city}
                  </button>
                )}
              </span>
            </li>
          )}
          {results.map((r, i) => {
            const Icon = KIND_ICON[r.kind];
            return (
              <li key={r.station.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(r)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                    i === active
                      ? 'bg-accent-soft dark:bg-accent/15'
                      : 'hover:bg-ink-50 dark:hover:bg-ink-700/60'
                  }`}
                >
                  <Icon className="size-4 shrink-0 text-ink-400" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-ink-900 dark:text-ink-50">
                      {r.station.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-ink-400">
                      {r.detail ?? r.station.lines.map((id) => linesById.get(id)?.name).filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {r.station.lines.slice(0, 4).map((id) => {
                      const line = linesById.get(id);
                      return line ? (
                        <span
                          key={id} className="size-2 rounded-full ring-1 ring-black/5"
                          style={{ background: line.color }}
                          aria-hidden
                        />
                      ) : null;
                    })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
