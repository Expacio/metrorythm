/**
 * Metrorythm — extract ORDERED station lists from Wikipedia line articles.
 *
 * BUILD TIME ONLY. Output is committed; the app never runs this.
 *
 * Indian metro line articles nearly all carry a `wikitable` whose rows are the
 * stations in running order. The columns vary wildly, so this finds the station
 * column by header name rather than by position, and drops rows that describe
 * stations which are not yet open.
 *
 * Correctness strategy: this is a scraper, and scrapers lie. Every import is
 * checked against an independently-sourced expected station count. A line that
 * does not match is REPORTED AND DROPPED rather than shipped — a wrong station
 * order is far worse than a missing city.
 */

const API = 'https://en.wikipedia.org/w/api.php';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchParsed(page) {
  const params = new URLSearchParams({
    action: 'parse',
    page,
    prop: 'text',
    format: 'json',
    formatversion: '2',
    redirects: '1',
  });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await fetch(`${API}?${params}`, {
      headers: { 'User-Agent': 'Metrorythm-data-build/1.0 (offline transit planner)' },
    });
    if (res.ok) {
      const j = await res.json();
      if (j.error) throw new Error(`${page}: ${j.error.info}`);
      return j.parse.text;
    }
    if (res.status !== 429) throw new Error(`${page}: HTTP ${res.status}`);
    await sleep(2500 * (attempt + 1));
  }
  throw new Error(`${page}: rate limited`);
}

/* ------------------------------------------------------------ HTML helpers */

const stripTags = (html) => html.replace(/<[^>]*>/g, '');

function decode(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/g, ' ');
}

/** Clean a table cell down to a plain station name. */
export function cleanCell(html) {
  let t = html;
  // Drop footnote/reference superscripts and any hidden spans entirely.
  t = t.replace(/<sup[\s\S]*?<\/sup>/g, '');
  t = t.replace(/<style[\s\S]*?<\/style>/g, '');
  t = stripTags(t);
  t = decode(t);
  t = t.replace(/\[[^\]]*\]/g, '');      // [1], [note 1]
  t = t.replace(/\([^)]*\)/g, ' ');       // parenthetical qualifiers
  t = t.replace(/\s+/g, ' ').trim();
  // Articles often give the native-script name after the English one.
  t = t.split(/[ऀ-ൿ]/)[0].trim();
  return t.replace(/[,\-–—]+$/, '').trim();
}

/** Split an HTML table into rows of raw cell HTML. */
function tableRows(tableHtml) {
  const rows = [];
  for (const m of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...m[1].matchAll(/<(t[hd])[^>]*>([\s\S]*?)<\/\1>/g)].map((c) => c[2]);
    if (cells.length) rows.push({ cells, raw: m[1] });
  }
  return rows;
}

function extractTables(html) {
  return [...html.matchAll(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/g)]
    .map((m) => m[0]);
}

/** Does this row describe a station that is not yet open? */
function rowIsUnopened(raw) {
  const text = decode(stripTags(raw)).toLowerCase();
  return /under construction|approved|planned|proposed|not operational|future|yet to open/.test(text);
}

const NON_STATION = /^(station name|stations?|name|no\.?|s\.? ?no\.?|total|opening|connections?|interchange|layout|platform|$)/i;

/**
 * Pull ordered station names out of a parsed line article.
 * Returns the best candidate table's stations.
 */
export function stationsFromHtml(html, { expected } = {}) {
  const candidates = [];

  for (const table of extractTables(html)) {
    const rows = tableRows(table);
    if (rows.length < 3) continue;

    // Find the header row and the column that holds station names.
    const header = rows[0].cells.map((c) => cleanCell(c).toLowerCase());
    let col = header.findIndex((h) => /station\s*name|^station$|name of|station \(/i.test(h));
    if (col === -1) col = header.findIndex((h) => /station/i.test(h));
    if (col === -1) continue;

    const names = [];
    let dropped = 0;
    for (const row of rows.slice(1)) {
      if (row.cells.length <= col) continue;
      if (rowIsUnopened(row.raw)) { dropped += 1; continue; }
      const name = cleanCell(row.cells[col]);
      if (!name || NON_STATION.test(name)) continue;
      if (name.length > 60) continue;
      if (names[names.length - 1] === name) continue; // rowspan artefacts
      names.push(name);
    }

    if (names.length >= 3) candidates.push({ names, dropped });
  }

  if (candidates.length === 0) return { names: [], note: 'no station table found' };

  // Prefer the table whose length matches the independently-known count.
  if (expected) {
    const exact = candidates.find((c) => c.names.length === expected);
    if (exact) return { ...exact, note: 'matched expected count' };
  }
  // Otherwise the largest plausible table.
  candidates.sort((a, b) => b.names.length - a.names.length);
  return { ...candidates[0], note: 'largest table' };
}

export async function importLine(page, expected) {
  const html = await fetchParsed(page);
  const r = stationsFromHtml(html, { expected });
  await sleep(700);
  return r;
}
