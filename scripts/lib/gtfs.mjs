/**
 * Minimal GTFS reader.
 *
 * Deliberately dependency-free: these feeds are plain CSV inside a zip, and a
 * build step that pulls in a parser stack for that is a liability, not a
 * convenience. Unzipping is delegated to the system `unzip`, which is present
 * everywhere this builds.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Split one CSV line, honouring quoted fields and doubled quotes. */
function splitCsvLine(line) {
  const cells = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { cells.push(cur); cur = ''; }
    else cur += c;
  }
  cells.push(cur);
  return cells;
}

export function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const head = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = splitCsvLine(l);
    const row = {};
    head.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
}

/**
 * Open a GTFS zip and return `{ table(name), close() }`.
 * `table` returns [] for an absent optional file rather than throwing, since
 * most GTFS files are optional and a missing one is information, not an error.
 */
export function openGtfs(zipPath) {
  const dir = mkdtempSync(join(tmpdir(), 'gtfs-'));
  execFileSync('unzip', ['-o', '-q', zipPath, '-d', dir]);
  return {
    dir,
    table(name) {
      const p = join(dir, name);
      if (!existsSync(p)) return [];
      return parseCsv(readFileSync(p, 'utf8'));
    },
    close() { rmSync(dir, { recursive: true, force: true }); },
  };
}

/** "HH:MM:SS" to seconds after midnight. GTFS allows hours past 24. */
export function gtfsSeconds(t) {
  if (!t) return null;
  const [h, m, s] = t.split(':').map(Number);
  if ([h, m, s].some((n) => Number.isNaN(n))) return null;
  return h * 3600 + m * 60 + s;
}

export const median = (xs) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

/** Lowercase, punctuation-free slug used for station ids. */
export const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
