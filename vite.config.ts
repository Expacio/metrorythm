import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Metrorythm makes no network requests of its own. Disabling the modulepreload
    // polyfill keeps `fetch` out of the bundle entirely, so the offline claim is
    // literally true rather than just true in spirit.
    modulePreload: { polyfill: false },
  },
});
