import { useCallback, useState } from 'react';

/**
 * Thin wrapper over the browser's Geolocation API.
 *
 * This is a built-in browser capability, not a service: no API key, no
 * third-party request from our code, and the coordinates stay on the device.
 *
 * Deliberately NOT called on mount. Firing a permission prompt at someone who
 * has not asked for it is hostile, so the caller triggers `request()` from an
 * explicit user action.
 */

export type GeoStatus = 'idle' | 'locating' | 'done' | 'denied' | 'unavailable' | 'error';

export interface GeoState {
  status: GeoStatus;
  coords: { lat: number; lng: number; accuracyKm: number } | null;
  message: string | null;
}

const INITIAL: GeoState = { status: 'idle', coords: null, message: null };

export function useGeolocation() {
  const [state, setState] = useState<GeoState>(INITIAL);

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({
        status: 'unavailable',
        coords: null,
        message: 'This browser does not provide location.',
      });
      return;
    }

    setState({ status: 'locating', coords: null, message: null });

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          status: 'done',
          coords: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyKm: Math.round((pos.coords.accuracy / 1000) * 10) / 10,
          },
          message: null,
        });
      },
      (err) => {
        const status: GeoStatus = err.code === err.PERMISSION_DENIED ? 'denied' : 'error';
        setState({
          status,
          coords: null,
          message:
            status === 'denied'
              ? 'Location permission was declined. Pick a city from the menu instead.'
              : 'Could not determine your location. Pick a city from the menu instead.',
        });
      },
      // A cached fix up to 5 minutes old is fine for picking a city.
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }, []);

  const reset = useCallback(() => setState(INITIAL), []);

  return { ...state, request, reset };
}
