import { useCallback, useEffect, useState } from 'react';

/**
 * Persist a piece of state in LocalStorage.
 *
 * Fails soft: if storage is unavailable (private browsing, quota exceeded) the
 * hook degrades to ordinary React state rather than throwing.
 */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable — keep working in memory */
    }
  }, [key, value]);

  const reset = useCallback(() => {
    setValue(initial);
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }, [initial, key]);

  return [value, setValue, reset] as const;
}

export interface RecentSearch {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  at: number;
}

const MAX_RECENTS = 8;

export function useRecentSearches() {
  const [recents, setRecents, clear] = useLocalStorage<RecentSearch[]>('metrogo.recents', []);

  const add = useCallback(
    (entry: Omit<RecentSearch, 'at'>) => {
      setRecents((prev) => {
        const without = prev.filter((r) => !(r.fromId === entry.fromId && r.toId === entry.toId));
        return [{ ...entry, at: Date.now() }, ...without].slice(0, MAX_RECENTS);
      });
    },
    [setRecents],
  );

  return { recents, add, clear };
}
