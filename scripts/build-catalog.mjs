// Bakes the vixsrc catalogue into static JSON shipped with the build.
//
// The site is served by a plain static host, so there is no server to ask at
// runtime — and vixsrc sends no CORS headers, so the browser can't ask it
// either. Snapshotting the lists at build time solves both, and they're small
// once reduced to ids: 42 KB gzip for the Italian films, 15 KB for the shows,
// 31 KB for every episode (as ranges).
//
//   npm run catalog          always refresh
//   npm run catalog -- --if-stale   refresh only if missing or older than a week
//
// A failed download is never fatal: an existing snapshot is kept and the build
// carries on, because a stale catalogue is far better than none (without one
// the app falls back to guessing which titles are dubbed).

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'catalog');
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const BASE = 'https://vixsrc.to/api/list';

const SOURCES = [
  { file: 'it-movie.json', url: `${BASE}/movie/?lang=it`, shape: 'ids' },
  { file: 'it-tv.json', url: `${BASE}/tv/?lang=it`, shape: 'ids' },
  { file: 'all-movie.json', url: `${BASE}/movie/`, shape: 'ids' },
  { file: 'all-tv.json', url: `${BASE}/tv/`, shape: 'ids' },
  { file: 'episodes-it.json', url: `${BASE}/episode/?lang=it`, shape: 'episodes' },
];

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`${url} returned no rows`);
  return rows;
}

const toIds = (rows) => [...new Set(rows.map((r) => r.tmdb_id).filter(Number.isInteger))];

// "1,2,3,7" → "1-3,7": episode numbers are almost always contiguous, so ranges
// cut the file to a tenth of its size.
function toRanges(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const out = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) { prev = sorted[i]; continue; }
    out.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = prev = sorted[i];
  }
  out.push(start === prev ? `${start}` : `${start}-${prev}`);
  return out.join(',');
}

function toEpisodeMap(rows) {
  const byShow = new Map();
  for (const row of rows) {
    if (!Number.isInteger(row.tmdb_id) || !Number.isInteger(row.s) || !Number.isInteger(row.e)) continue;
    let seasons = byShow.get(row.tmdb_id);
    if (!seasons) byShow.set(row.tmdb_id, (seasons = new Map()));
    let eps = seasons.get(row.s);
    if (!eps) seasons.set(row.s, (eps = new Set()));
    eps.add(row.e);
  }
  const out = {};
  for (const [showId, seasons] of byShow) {
    const compact = {};
    for (const [season, eps] of seasons) compact[season] = toRanges(eps);
    out[showId] = compact;
  }
  return out;
}

async function isFresh(file) {
  try {
    const info = await stat(join(OUT_DIR, file));
    return info.size > 0 && Date.now() - info.mtimeMs < MAX_AGE_MS;
  } catch {
    return false;
  }
}

async function countOf(file) {
  try {
    const parsed = JSON.parse(await readFile(join(OUT_DIR, file), 'utf8'));
    return Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
  } catch {
    return 0;
  }
}

async function main() {
  const ifStale = process.argv.includes('--if-stale');
  await mkdir(OUT_DIR, { recursive: true });

  if (ifStale && (await Promise.all(SOURCES.map((s) => isFresh(s.file)))).every(Boolean)) {
    console.log('catalog: snapshot still fresh, skipping download');
    return;
  }

  let failures = 0;
  await Promise.all(SOURCES.map(async ({ file, url, shape }) => {
    try {
      const rows = await fetchJson(url);
      const payload = shape === 'episodes' ? toEpisodeMap(rows) : toIds(rows);
      const count = Array.isArray(payload) ? payload.length : Object.keys(payload).length;
      if (count === 0) throw new Error('nothing usable in payload');
      await writeFile(join(OUT_DIR, file), JSON.stringify(payload));
      console.log(`catalog: ${file} — ${count} entries`);
    } catch (err) {
      failures++;
      const kept = await countOf(file);
      console.warn(`catalog: ${file} failed (${err.message})` + (kept ? ` — keeping previous snapshot (${kept} entries)` : ' — NO SNAPSHOT AVAILABLE'));
    }
  }));

  const generatedAt = new Date().toISOString();
  await writeFile(join(OUT_DIR, 'meta.json'), JSON.stringify({ generatedAt, failures }));

  if (failures) console.warn(`catalog: ${failures}/${SOURCES.length} list(s) not refreshed`);
}

main().catch((err) => {
  // Still not fatal: the build must produce a site even with no network.
  console.warn('catalog: generation skipped —', err.message);
});
