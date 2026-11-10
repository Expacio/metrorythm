/**
 * Metrorythm — find the metro network nearest a position.
 *
 * Entirely local. There is no reverse-geocoding service and no lookup API: the
 * position is compared against the station coordinates already bundled in the
 * datasets. Your coordinates never leave the device.
 *
 * Distance is measured to each city's NEAREST STATION rather than to a city
 * centroid, because several Indian networks overlap geographically. From Vashi,
 * the nearest Navi Mumbai station is a couple of km away while the nearest
 * Mumbai Metro station is much further — a centroid comparison would get that
 * backwards.
 */

import type { CityDataset } from '../data/types';
import { haversineKm } from './graph';

export interface NearestCityResult {
  city: CityDataset;
  /** Straight-line km to that city's closest station. */
  distanceKm: number;
  /** The closest station itself — useful for "You look close to X". */
  stationName: string;
}

/**
 * Beyond this, we treat the user as "not near any network" rather than
 * silently dropping them into a city hundreds of km away.
 */
export const NEAREST_CITY_LIMIT_KM = 120;

export function findNearestCity(
  lat: number,
  lng: number,
  cities: CityDataset[],
): NearestCityResult | null {
  let best: NearestCityResult | null = null;

  for (const city of cities) {
    for (const station of city.stations) {
      if (station.lat == null || station.lng == null) continue;
      const d = haversineKm(lat, lng, station.lat, station.lng);
      if (!best || d < best.distanceKm) {
        best = { city, distanceKm: d, stationName: station.name };
      }
    }
  }

  if (!best || best.distanceKm > NEAREST_CITY_LIMIT_KM) return null;
  return { ...best, distanceKm: Math.round(best.distanceKm * 10) / 10 };
}
