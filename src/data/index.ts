/**
 * Metrorythm — city registry.
 *
 * Every dataset is a plain JSON file imported at build time. There is no fetch,
 * no API and no remote database anywhere in this application.
 *
 * Delhi and Chennai are hand-authored and individually verified. The rest are
 * imported from Wikidata by scripts/import-wikidata.mjs, where each line's
 * station order is derived from adjacency statements and validated to form a
 * single unbroken path. See each dataset's `city.source` field.
 *
 * To add a city, see the README.
 */

import delhiJson from './cities/delhi.json';
import chennaiJson from './cities/chennai.json';
import bengaluruJson from './cities/bengaluru.json';
import mumbaiJson from './cities/mumbai.json';
import hyderabadJson from './cities/hyderabad.json';
import ahmedabadJson from './cities/ahmedabad.json';
import kolkataJson from './cities/kolkata.json';
import nagpurJson from './cities/nagpur.json';
import puneJson from './cities/pune.json';
import kochiJson from './cities/kochi.json';
import lucknowJson from './cities/lucknow.json';
import indoreJson from './cities/indore.json';
import kanpurJson from './cities/kanpur.json';
import meerutJson from './cities/meerut.json';
import jaipurJson from './cities/jaipur.json';
import navi_mumbaiJson from './cities/navi-mumbai.json';
import bhopalJson from './cities/bhopal.json';
import agraJson from './cities/agra.json';
import patnaJson from './cities/patna.json';
import type { CityDataset } from './types';

export const delhi = delhiJson as unknown as CityDataset;
export const chennai = chennaiJson as unknown as CityDataset;
export const bengaluru = bengaluruJson as unknown as CityDataset;
export const mumbai = mumbaiJson as unknown as CityDataset;
export const hyderabad = hyderabadJson as unknown as CityDataset;
export const ahmedabad = ahmedabadJson as unknown as CityDataset;
export const kolkata = kolkataJson as unknown as CityDataset;
export const nagpur = nagpurJson as unknown as CityDataset;
export const pune = puneJson as unknown as CityDataset;
export const kochi = kochiJson as unknown as CityDataset;
export const lucknow = lucknowJson as unknown as CityDataset;
export const indore = indoreJson as unknown as CityDataset;
export const kanpur = kanpurJson as unknown as CityDataset;
export const meerut = meerutJson as unknown as CityDataset;
export const jaipur = jaipurJson as unknown as CityDataset;
export const navi_mumbai = navi_mumbaiJson as unknown as CityDataset;
export const bhopal = bhopalJson as unknown as CityDataset;
export const agra = agraJson as unknown as CityDataset;
export const patna = patnaJson as unknown as CityDataset;

/** Ordered: hand-authored first, then by network size. Drives the city picker. */
export const CITIES: CityDataset[] = [delhi, chennai, bengaluru, mumbai, hyderabad, ahmedabad, kolkata, nagpur, pune, kochi, lucknow, indore, kanpur, meerut, jaipur, navi_mumbai, bhopal, agra, patna];

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
