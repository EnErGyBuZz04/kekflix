// The list of TMDB ids the source streams **with an Italian track**.
//
// This is what the whole app filters on: anything not in here would open the
// player in the original language, which is not what we want. Returned as bare
// ids (~110 KB for films, ~40 KB for shows) because the raw vixsrc payload also
// carries imdb ids and has no CORS headers.

const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map();   // type → { at, ids }

async function loadIds(type) {
  const hit = cache.get(type);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ids;

  const res = await fetch(`https://vixsrc.to/api/list/${type}/?lang=it`);
  if (!res.ok) throw new Error(`vixsrc responded ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('empty catalog');

  const ids = rows.map((r) => r.tmdb_id).filter((n) => Number.isInteger(n));
  cache.set(type, { at: Date.now(), ids });
  return ids;
}

export default async function handler(req, res) {
  const type = new URL(req.url, 'http://x').searchParams.get('type') === 'tv' ? 'tv' : 'movie';

  try {
    const ids = await loadIds(type);
    res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
    res.status(200).json({ type, ids });
  } catch (err) {
    // The client falls back to its heuristic rather than emptying the page
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'catalog unavailable' });
  }
}
