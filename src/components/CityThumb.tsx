import { CITY_IMAGES } from './cityImages';

/**
 * City thumbnails for the picker.
 *
 * Where a landmark illustration exists it is used — those are cut from the
 * collage in data-src by scripts/slice-city-tiles.mjs, which also generates
 * the CITY_IMAGES manifest. They are ~2 KB WebP each and the service worker
 * caches them on first fetch, so the offline guarantee survives.
 *
 * Anything not in the manifest falls back to a hand-drawn landmark silhouette
 * on a 48x32 canvas, tinted with that network's primary line colour. That
 * keeps a new city renderable the moment its dataset lands, without waiting on
 * artwork. Silhouette coordinates assume ground level at y=28, so every
 * landmark sits on the same baseline.
 */

/** Landmark art per city id, drawn in a 48x32 viewBox. */
const ART: Record<string, React.ReactNode> = {
  // India Gate — a single wide arch under a flat cornice.
  delhi: (
    <>
      <rect x="11" y="5" width="26" height="3.4" rx="1" />
      <path
        d="M14 28V9h20v19h-6V18q0-4-4-4t-4 4v10z"
        fillRule="evenodd"
      />
      <rect x="8" y="27" width="32" height="2" rx="1" />
    </>
  ),

  // Taj Mahal — onion dome, finial and a pair of minarets.
  agra: (
    <>
      <rect x="23.4" y="5" width="1.2" height="5" rx="0.6" />
      <path d="M17 19q0-9 7-9t7 9z" />
      <rect x="15" y="19" width="18" height="9" />
      <path d="M9 15q0-2 1.4-2t1.4 2z" />
      <rect x="9.2" y="15" width="2.4" height="13" />
      <path d="M36 15q0-2 1.4-2t1.4 2z" />
      <rect x="36.2" y="15" width="2.4" height="13" />
      <rect x="6" y="27" width="36" height="2" rx="1" />
    </>
  ),

  // Charminar — four minarets around an arched block.
  hyderabad: (
    <>
      <path d="M9.5 8q0-2.2 1.7-2.2T12.9 8z" />
      <rect x="9.7" y="8" width="3" height="20" />
      <rect x="35.1" y="8" width="3" height="20" />
      <path d="M34.9 8q0-2.2 1.7-2.2T38.3 8z" />
      <rect x="12" y="11" width="24" height="3" rx="1" />
      <path
        d="M13 28V14h22v14h-6v-8q0-5-5-5t-5 5v8z"
        fillRule="evenodd"
      />
      <rect x="6" y="27" width="36" height="2" rx="1" />
    </>
  ),

  // Howrah Bridge — cantilever truss with cross bracing.
  kolkata: (
    <>
      <rect x="2" y="23" width="44" height="2" rx="1" />
      <rect x="11" y="7" width="2.5" height="17" />
      <rect x="34.5" y="7" width="2.5" height="17" />
      <rect x="11" y="7" width="26" height="2" />
      <g stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round">
        <path d="M13.5 9l10 14M34.5 9l-10 14M2 23l9-14M46 23l-9-14" />
      </g>
      <rect x="2" y="27" width="44" height="2" rx="1" />
    </>
  ),

  // Gateway of India — domed central arch flanked by turrets.
  mumbai: (
    <>
      <path d="M16 9q8-8 16 0z" />
      <path
        d="M15 28V9h18v19h-6V17q0-4-3-4t-3 4v11z"
        fillRule="evenodd"
      />
      <rect x="9" y="13" width="5" height="15" rx="1" />
      <rect x="34" y="13" width="5" height="15" rx="1" />
      <rect x="6" y="27" width="36" height="2" rx="1" />
    </>
  ),

  // Vidhana Soudha — central dome over a stepped, colonnaded base.
  bengaluru: (
    <>
      <rect x="23.4" y="4" width="1.2" height="3" rx="0.6" />
      <path d="M18 15q0-8 6-8t6 8z" />
      <rect x="17" y="15" width="14" height="5" />
      <rect x="12" y="20" width="24" height="8" />
      <rect x="5" y="23" width="38" height="5" />
      <rect x="3" y="27" width="42" height="2" rx="1" />
    </>
  ),

  // Gopuram — the stepped temple tower of Kapaleeshwarar. Drawn as separate
  // tiers so the backdrop shows through as the step lines; a stroke in the
  // same colour as the fill would be invisible.
  chennai: (
    <>
      <rect x="21.3" y="7.6" width="1.2" height="2.6" />
      <rect x="23.4" y="6.8" width="1.2" height="3.4" />
      <rect x="25.5" y="7.6" width="1.2" height="2.6" />
      <path d="M20.4 12.4h7.2L26.8 10h-5.6z" />
      <path d="M18.4 17.4l1.2-4.4h8.8l1.2 4.4z" />
      <path d="M16.2 22.6L17.6 18h12.8l1.4 4.6z" />
      <path d="M14 28l1.6-4.8h16.8L34 28z" />
      <rect x="9" y="27" width="30" height="2" rx="1" />
    </>
  ),

  // Hawa Mahal — honeycomb façade rising to a point.
  jaipur: (
    <>
      <path
        d="M8 28V18L24 7l16 11v10zM10.8 19.6h3.2v3.4h-3.2zm5.6 0h3.2v3.4h-3.2zm5.6 0h3.2v3.4h-3.2zm5.6 0h3.2v3.4h-3.2zm5.6 0h3.2v3.4h-3.2zM13.6 24.6h3.2V28h-3.2zm5.6 0h3.2V28h-3.2zm5.6 0h3.2V28h-3.2zm5.6 0h3.2V28h-3.2zm-7.9-10.4h3.2v3.2h-3.2z"
        fillRule="evenodd"
      />
      <rect x="5" y="27" width="38" height="2" rx="1" />
    </>
  ),

  // Rumi Darwaza — pointed gateway under a chhatri.
  lucknow: (
    <>
      <path d="M20.5 8.4q3.5-4.4 7 0z" />
      <rect x="19.8" y="8.4" width="8.4" height="2" rx="0.6" />
      <path
        d="M14 28V10.4h20V28h-6v-7.6L24 14l-4 6.4V28z"
        fillRule="evenodd"
      />
      <rect x="9" y="27" width="30" height="2" rx="1" />
    </>
  ),

  // Shaniwar Wada — bastions either side of the gate.
  pune: (
    <>
      <path d="M9 11h2v2h2v-2h2v2h2v-2h2v17H9z" />
      <path d="M29 11h2v2h2v-2h2v2h2v-2h2v17H29z" />
      <path
        d="M19 28V15h10v13h-3v-5q0-2-2-2t-2 2v5z"
        fillRule="evenodd"
      />
      <rect x="6" y="27" width="36" height="2" rx="1" />
    </>
  ),

  // Chinese fishing net — cantilever arm, net and counterweights.
  kochi: (
    <>
      <g stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 26.5L18.5 7.5 26 26.5" />
        <path d="M18.5 7.5L40 13.5" />
        <path d="M30.5 11.5q-2.5 9 3 13.5 7-3 6.5-11.5" />
      </g>
      <circle cx="14.5" cy="13" r="1.7" />
      <circle cx="16.3" cy="17.5" r="1.7" />
      <rect x="4" y="27" width="40" height="2" rx="1" />
    </>
  ),

  // Deekshabhoomi — hemispherical stupa on a plinth.
  nagpur: (
    <>
      <rect x="23.4" y="3" width="1.2" height="3" rx="0.6" />
      <path d="M12 22a12 12 0 0124 0z" />
      <rect x="10" y="22" width="28" height="6" />
      <rect x="6" y="27" width="36" height="2" rx="1" />
    </>
  ),

  // Teen Darwaza — three arches under a low dome.
  ahmedabad: (
    <>
      <path d="M19 12q5-6 10 0z" />
      <path
        d="M7 28V12h34v16h-5v-7q0-3-3-3t-3 3v7h-4v-8q0-4-3-4t-3 4v8h-4v-7q0-3-3-3t-3 3v7z"
        fillRule="evenodd"
      />
      <rect x="4" y="27" width="40" height="2" rx="1" />
    </>
  ),

  // Taj-ul-Masajid — central dome between two minarets.
  bhopal: (
    <>
      <path d="M10 8q0-2 1.5-2T13 8z" />
      <rect x="10.2" y="8" width="2.6" height="20" />
      <path d="M35 8q0-2 1.5-2T38 8z" />
      <rect x="35.2" y="8" width="2.6" height="20" />
      <rect x="23.4" y="7" width="1.2" height="3" rx="0.6" />
      <path d="M17 20q0-10 7-10t7 10z" />
      <rect x="14" y="20" width="20" height="8" />
      <rect x="7" y="27" width="34" height="2" rx="1" />
    </>
  ),

  // Rajwada — the tiered palace façade, narrow and tall.
  indore: (
    <>
      <rect x="20" y="5" width="8" height="4" rx="1" />
      <rect x="17" y="9" width="14" height="5" />
      <rect x="14" y="14" width="20" height="5" />
      <path
        d="M11 28V19h26v9h-7v-5q0-3-3-3h-6q-3 0-3 3v5z"
        fillRule="evenodd"
      />
      <rect x="8" y="27" width="32" height="2" rx="1" />
    </>
  ),

  // JK Temple — a curved shikhara over its plinth.
  kanpur: (
    <>
      <rect x="23.4" y="3" width="1.2" height="4" rx="0.6" />
      <path d="M17 24q0-12 7-17 7 5 7 17z" />
      <rect x="13" y="24" width="22" height="4" />
      <rect x="9" y="27" width="30" height="2" rx="1" />
    </>
  ),

  // Ghanta Ghar — clock tower with a pointed cap.
  meerut: (
    <>
      <path d="M24 4l5 6H19z" />
      <path
        d="M19 28V10h10v18zm5-15a3 3 0 100 6 3 3 0 000-6z"
        fillRule="evenodd"
      />
      <rect x="16" y="26" width="16" height="2" />
      <rect x="12" y="27" width="24" height="2" rx="1" />
    </>
  ),

  // Atal Setu — a cable-stayed span across the creek.
  'navi-mumbai': (
    <>
      <rect x="2" y="21" width="44" height="2" rx="1" />
      <path d="M22.6 4h2.8v17h-2.8z" />
      <g stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round">
        <path d="M24 7L10 21M24 7l14 14M24 12L15 21M24 12l9 9" />
      </g>
      <rect x="2" y="27" width="44" height="2" rx="1" />
    </>
  ),

  // Golghar — the beehive granary with its outer stair.
  patna: (
    <>
      {/* The terraces are holes in the dome, so the backdrop draws them. */}
      <path
        d="M11 28q0-20 13-20t13 20zM12.1 20.4h23.8v1.4H12.1zm2.3-6h19.2v1.4H14.4z"
        fillRule="evenodd"
      />
      <rect x="7" y="27" width="34" height="2" rx="1" />
    </>
  ),
};

/** A plain platform, for any city without bespoke art yet. */
const FALLBACK = (
  <>
    <rect x="12" y="12" width="24" height="16" rx="2" />
    <rect x="6" y="27" width="36" height="2" rx="1" />
  </>
);

interface Props {
  cityId: string;
  /** The network's primary line colour — tints both the art and its backdrop. */
  color: string;
  className?: string;
}

/**
 * One 3:2 landmark tile. Decorative: the city name always sits beside it, so
 * the tile is hidden from assistive technology rather than described twice.
 */
export function CityThumb({ cityId, color, className = '' }: Props) {
  const frame = `shrink-0 rounded-md ring-1 ring-inset ring-black/10 dark:ring-white/15 ${className}`;

  if (CITY_IMAGES.has(cityId)) {
    return (
      <img
        src={`/cities/${cityId}.webp`}
        alt=""
        aria-hidden
        width={96}
        height={64}
        decoding="async"
        className={`bg-ink-900 object-cover ${frame}`}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 48 32"
      width={48}
      height={32}
      aria-hidden
      focusable="false"
      className={frame}
      style={{ background: `${color}2e`, color }}
    >
      <g fill="currentColor">{ART[cityId] ?? FALLBACK}</g>
    </svg>
  );
}

/** The colour a city is drawn in: its first non-branch line. */
export function cityAccent(lines: readonly { color: string; parentLine?: string | null }[]): string {
  return lines.find((l) => !l.parentLine)?.color ?? '#8b8b8b';
}
