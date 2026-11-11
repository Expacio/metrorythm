/**
 * Slice the city collage into one thumbnail per network.
 *
 * Input:  data-src/city-collage.png — a grid of labelled landmark tiles on a
 *         black background, rows separated by gaps.
 * Output: public/cities/<cityId>.webp, cropped to the artwork (the printed
 *         label is dropped, since the picker renders the city name as text).
 *
 * Tile bounds are detected rather than hard-coded, so the script survives a
 * re-export at a different resolution. Rows are found first, then columns are
 * found *within each row* — the last row holds fewer tiles and is centred.
 *
 * Requires ffmpeg and cwebp on PATH. Run: node scripts/slice-city-tiles.mjs
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'data-src', 'India Metro Landmarks Skyline Collage.png');
const OUT_DIR = join(ROOT, 'public', 'cities');
const TMP = join(ROOT, 'node_modules', '.cache', 'city-tiles');

/**
 * Tiles in reading order. `null` skips a tile whose city is not a separate
 * network in the dataset — Noida and Gurugram are part of Delhi NCR, and
 * Gandhinagar is served by the Ahmedabad dataset.
 */
const TILE_ORDER = [
  'delhi', 'chennai', 'bengaluru', 'mumbai', 'hyderabad',
  'ahmedabad', 'kolkata', 'nagpur', 'pune', 'kochi',
  'lucknow', 'indore', 'kanpur', 'meerut', 'jaipur',
  'navi-mumbai', 'bhopal', 'agra', 'patna', null /* Noida */,
  null /* Gurugram */, null /* Gandhinagar */, null /* Surat */,
];

/** A pixel this dark is background, not tile. */
const DARK = 26;
/** A band must be at least this many pixels to count as a tile, not a seam. */
const MIN_BAND = 24;
/** Fraction of tile height kept — the rest is the printed label. */
const ARTWORK_FRACTION = 0.76;
/** Output size: 2x the 48x32 the picker draws, for high-density screens. */
const OUT_W = 96;
const OUT_H = 64;

function probe() {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0', SOURCE,
  ]).toString().trim();
  const [width, height] = out.split(',').map(Number);
  return { width, height };
}

/** Decode to 8-bit grayscale so brightness can be scanned directly. */
function grayPixels(width, height) {
  const raw = execFileSync('ffmpeg', [
    '-v', 'error', '-i', SOURCE, '-pix_fmt', 'gray', '-f', 'rawvideo', '-',
  ], { maxBuffer: 1 << 28 });
  if (raw.length < width * height) {
    throw new Error(`decoded ${raw.length} bytes, expected ${width * height}`);
  }
  return raw;
}

/**
 * Collapse a run of "has content" flags into bands, dropping anything too thin
 * to be a tile (anti-aliased corners leave one- or two-pixel specks).
 */
function bands(flags) {
  const found = [];
  let start = -1;
  for (let i = 0; i <= flags.length; i++) {
    if (flags[i]) {
      if (start === -1) start = i;
    } else if (start !== -1) {
      if (i - start >= MIN_BAND) found.push([start, i]);
      start = -1;
    }
  }
  return found;
}

function main() {
  if (!existsSync(SOURCE)) {
    console.error(`Missing ${SOURCE}\nSave the collage there and re-run.`);
    process.exit(1);
  }

  const { width, height } = probe();
  const px = grayPixels(width, height);
  console.log(`source ${width}x${height}`);

  // Rows: a row of pixels belongs to a tile if anything in it is above black.
  const rowHasContent = new Uint8Array(height);
  for (let y = 0; y < height; y++) {
    const base = y * width;
    for (let x = 0; x < width; x++) {
      if (px[base + x] > DARK) { rowHasContent[y] = 1; break; }
    }
  }
  const rows = bands(rowHasContent);
  console.log(`rows: ${rows.length} -> ${rows.map(([a, b]) => `${a}-${b}`).join(', ')}`);

  // Columns are detected per row, because the final row is centred.
  const tiles = [];
  for (const [y0, y1] of rows) {
    const colHasContent = new Uint8Array(width);
    for (let x = 0; x < width; x++) {
      for (let y = y0; y < y1; y++) {
        if (px[y * width + x] > DARK) { colHasContent[x] = 1; break; }
      }
    }
    for (const [x0, x1] of bands(colHasContent)) {
      tiles.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  }

  console.log(`tiles: ${tiles.length} (expected ${TILE_ORDER.length})`);
  if (tiles.length !== TILE_ORDER.length) {
    console.error(
      'Tile count does not match TILE_ORDER. Detected geometry:\n' +
      tiles.map((t, i) => `  ${i}: ${t.w}x${t.h} @ ${t.x},${t.y}`).join('\n') +
      '\nAdjust DARK / MIN_BAND, or correct TILE_ORDER, then re-run.',
    );
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  const written = [];
  tiles.forEach((t, i) => {
    const cityId = TILE_ORDER[i];
    if (!cityId) return;

    // Drop the label band, then centre-crop to 3:2 so every thumbnail has the
    // same aspect as the slot the picker draws it into.
    const artH = Math.round(t.h * ARTWORK_FRACTION);
    let cw = t.w;
    let ch = Math.round((t.w * OUT_H) / OUT_W);
    if (ch > artH) { ch = artH; cw = Math.round((artH * OUT_W) / OUT_H); }
    const cx = t.x + Math.round((t.w - cw) / 2);
    const cy = t.y + Math.round((artH - ch) / 2);

    const png = join(TMP, `${cityId}.png`);
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-i', SOURCE,
      '-vf', `crop=${cw}:${ch}:${cx}:${cy},scale=${OUT_W}:${OUT_H}:flags=lanczos`,
      png,
    ]);
    execFileSync('cwebp', ['-quiet', '-q', '82', png, '-o', join(OUT_DIR, `${cityId}.webp`)]);
    written.push(cityId);
  });

  // A manifest keeps CityThumb from requesting a tile that was never produced.
  writeFileSync(
    join(ROOT, 'src', 'components', 'cityImages.ts'),
    '/* Generated by scripts/slice-city-tiles.mjs — do not edit by hand. */\n'
    + 'export const CITY_IMAGES: ReadonlySet<string> = new Set([\n'
    + written.map((id) => `  '${id}',`).join('\n')
    + '\n]);\n',
  );

  rmSync(TMP, { recursive: true, force: true });
  console.log(`wrote ${written.length} thumbnails to public/cities/`);
}

main();
