/**
 * Metrorythm — city registry.
 *
 * Every dataset is a plain JSON file imported at build time. There is no fetch,
 * no API and no remote database anywhere in this application.
 *
 * To add a city:
 *   1. Author data-src/<city>.source.mjs
 *   2. Extend scripts/build-data.mjs to emit src/data/cities/<city>.json
 *   3. Import it below and add it to CITIES
 */

import delhiJson from './cities/delhi.json';
import type { CityDataset } from './types';

export const delhi = delhiJson as unknown as CityDataset;

export const CITIES: Record<string, CityDataset> = {
  delhi,
};

export const DEFAULT_CITY_ID = 'delhi';

export function getCity(cityId: string = DEFAULT_CITY_ID): CityDataset {
  const city = CITIES[cityId];
  if (!city) throw new Error(`Unknown city "${cityId}". Available: ${Object.keys(CITIES).join(', ')}`);
  return city;
}

/** Cities referenced by airport codes but not present in this build. */
export function citiesNotIncluded(dataset: CityDataset): string[] {
  return dataset.airports.filter((a) => !a.inThisDataset).map((a) => a.city);
}

export type { CityDataset } from './types';
