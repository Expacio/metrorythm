import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { CityDataset } from '../data/types';
import { CityThumb, cityAccent } from './CityThumb';

/**
 * City picker.
 *
 * A native <select> cannot render anything but text, so this is a hand-rolled
 * listbox: same keyboard contract as the native control (arrows, Home/End,
 * Enter, Escape, type-to-jump), but each row carries the city's landmark tile.
 */

interface Props {
  cities: CityDataset[];
  value: string;
  onChange: (cityId: string) => void;
}

export function CityPicker({ cities, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, cities.findIndex((c) => c.city.cityId === value)));
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  /** Rolling buffer for type-to-jump, cleared after a pause in typing. */
  const typed = useRef({ text: '', at: 0 });
  const listId = useId();

  const selectedIndex = cities.findIndex((c) => c.city.cityId === value);
  const selected = cities[selectedIndex] ?? cities[0];

  // Keep the highlighted row in view, including when the list first opens.
  useLayoutEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  // ARIA's collapsible-listbox pattern puts focus on the list itself, which is
  // also what makes Escape and the arrow keys land somewhere predictable.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // Any scroll of an ancestor would leave the panel stranded.
    const onScroll = () => setOpen(false);
    document.addEventListener('pointerdown', onDocPointer);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  /** Always opens on the current city, not wherever the list was left. */
  const toggle = () => {
    setActive(Math.max(0, selectedIndex));
    setOpen((o) => !o);
  };

  const commit = (index: number) => {
    const city = cities[index];
    if (city) onChange(city.city.cityId);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((i) => (i + 1) % cities.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((i) => (i - 1 + cities.length) % cities.length);
        break;
      case 'Home':
        e.preventDefault();
        setActive(0);
        break;
      case 'End':
        e.preventDefault();
        setActive(cities.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(active);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        break;
      case 'Tab':
        setOpen(false);
        break;
      default: {
        if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
        const now = e.timeStamp;
        const text = (now - typed.current.at > 800 ? '' : typed.current.text) + e.key.toLowerCase();
        typed.current = { text, at: now };
        const hit = cities.findIndex((c) => c.city.cityName.toLowerCase().startsWith(text));
        if (hit >= 0) setActive(hit);
      }
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`City — ${selected.city.cityName}`}
        className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white py-1.5 pl-1.5 pr-2 text-[13px] font-semibold text-ink-900 outline-none transition hover:border-ink-400 focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/25 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50"
      >
        <CityThumb
          cityId={selected.city.cityId}
          color={cityAccent(selected.lines)}
          className="h-6 w-9"
        />
        <span className="truncate">{selected.city.cityName}</span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`${listId}-${active}`}
          aria-label="City"
          onKeyDown={onKeyDown}
          /*
            The panel takes focus so the arrow keys work, but it is the
            highlighted row that shows where you are — the global
            :focus-visible ring around the whole panel would just be noise.
          */
          className="absolute left-0 top-full z-50 mt-1.5 max-h-[min(70vh,24rem)] w-60 overflow-auto overscroll-contain rounded-xl border border-ink-200 bg-white p-1 focus-visible:outline-none! shadow-xl shadow-ink-900/10 dark:border-ink-700 dark:bg-ink-800 dark:shadow-black/50"
        >
          {cities.map((c, i) => {
            const isSelected = c.city.cityId === value;
            return (
              <li
                key={c.city.cityId}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={isSelected}
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(i)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition ${
                  i === active ? 'bg-accent-soft dark:bg-accent/15' : ''
                }`}
              >
                <CityThumb cityId={c.city.cityId} color={cityAccent(c.lines)} className="h-8 w-12" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink-900 dark:text-ink-50">
                  {c.city.cityName}
                </span>
                {isSelected && <Check className="size-4 shrink-0 text-ink-900 dark:text-accent" aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
