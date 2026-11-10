/**
 * Metrorythm — city registry.
 *
 * Every dataset is a plain JSON file imported at build time. There is no fetch,
 * no API and no remote database anywhere in this application.
 *
 * To add a city:
 *   1. Author data-src/<city>.source.mjs
 *   2. Add its id to CITY_IDS in scripts/build-data.mjs
 *   3. Add its fare config to src/data/fares
 *   4. Import the generated JSON below and add it to CITIES
 */

import delhiJson from './cities/delhi.json';
import chennaiJson from './cities/chennai.json';
import type { CityDataset } from './types';

export const delhi = delhiJson as unknown as CityDataset;
export const chennai = chennaiJson as unknown as CityDataset;

/** Ordered — this is the order the city switcher shows them in. */
export const CITIES: CityDataset[] = [delhi, chennai];

export const CITIES_BY_ID: Record<string, CityDataset> = Object.fromEntries(
  CITIES.map((c) => [c.city.cityId, c]),
);

export const DEFAULT_CITY_ID = 'delhi';

export function getCity(cityId: string = DEFAULT_CITY_ID): CityDataset {
  return CITIES_BY_ID[cityId] ?? CITIES_BY_ID[DEFAULT_CITY_ID];
}

/** Cities referenced by an airport code but absent from this build. */
export function citiesNotIncluded(dataset: CityDataset): string[] {
  return dataset.airports.filter((a) => !a.inThisDataset).map((a) => a.city);
}

export type { CityDataset } from './types';
