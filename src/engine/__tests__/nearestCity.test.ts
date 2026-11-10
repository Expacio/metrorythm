/**
 * Nearest-network detection.
 *
 * Pure geometry against the bundled station coordinates — no service, no
 * network. These cases use real landmark positions to prove the matching
 * actually discriminates between the overlapping networks.
 */
import { describe, expect, it } from 'vitest';
import { CITIES } from '../../data';
import { findNearestCity, NEAREST_CITY_LIMIT_KM } from '../nearestCity';

const at = (lat: number, lng: number) => findNearestCity(lat, lng, CITIES);

describe('picks the right network', () => {
  const cases: [string, number, number, string][] = [
    ['Connaught Place, Delhi', 28.6315, 77.2167, 'delhi'],
    ['Marina Beach, Chennai', 13.0500, 80.2824, 'chennai'],
    ['MG Road, Bengaluru', 12.9756, 77.6068, 'bengaluru'],
    ['Charminar, Hyderabad', 17.3616, 78.4747, 'hyderabad'],
    ['Victoria Memorial, Kolkata', 22.5448, 88.3426, 'kolkata'],
    ['Marine Drive, Kochi', 9.9816, 76.2762, 'kochi'],
    ['Hawa Mahal, Jaipur', 26.9239, 75.8267, 'jaipur'],
    ['Taj Mahal, Agra', 27.1751, 78.0421, 'agra'],
    ['Sabarmati Ashram, Ahmedabad', 23.0606, 72.5809, 'ahmedabad'],
    ['Shaniwar Wada, Pune', 18.5195, 73.8553, 'pune'],
  ];

  it.each(cases)('%s -> %s', (_label, lat, lng, expected) => {
    const hit = at(lat, lng);
    expect(hit).not.toBeNull();
    expect(hit!.city.city.cityId).toBe(expected);
  });
});

describe('overlapping networks', () => {
  it('prefers Navi Mumbai over Mumbai when in Navi Mumbai', () => {
    // Belapur, Navi Mumbai — both networks are in range, Navi Mumbai is nearer.
    const hit = at(19.0237, 73.0400);
    expect(hit!.city.city.cityId).toBe('navi-mumbai');
  });

  it('prefers Mumbai proper when in Andheri', () => {
    const hit = at(19.1197, 72.8464);
    expect(hit!.city.city.cityId).toBe('mumbai');
  });

  it('prefers Meerut over Delhi when in Meerut', () => {
    const hit = at(28.9845, 77.7064);
    expect(hit!.city.city.cityId).toBe('meerut');
  });
});

describe('out of range', () => {
  it('returns null in the middle of the Arabian Sea', () => {
    expect(at(15.0, 65.0)).toBeNull();
  });

  it('returns null for London', () => {
    expect(at(51.5072, -0.1276)).toBeNull();
  });

  it('returns null for a city with no metro', () => {
    expect(at(26.1445, 91.7362)).toBeNull(); // Guwahati
  });
});

describe('result shape', () => {
  it('reports the closest station and a sane distance', () => {
    const hit = at(28.6315, 77.2167)!;
    expect(hit.stationName).toBeTruthy();
    expect(hit.distanceKm).toBeGreaterThanOrEqual(0);
    expect(hit.distanceKm).toBeLessThan(NEAREST_CITY_LIMIT_KM);
  });

  it('is essentially zero when standing on a station', () => {
    const station = CITIES[0].stations.find((s) => s.lat != null)!;
    const hit = at(station.lat!, station.lng!)!;
    expect(hit.distanceKm).toBeLessThan(1);
  });
});
