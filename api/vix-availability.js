// Does the streaming source actually have this title?
//
// vixsrc publishes its catalogue as plain JSON lists, but with no CORS headers
// and at a size the browser shouldn't download (the episode list alone is
// ~6 MB). So we answer the question server-side and let the CDN cache it.
//
// Two catalogues matter, and conflating them is a trap: the default list is
// everything the source carries (~40k films, ~12k shows), while `?lang=it`
// is only what has an Italian track (~13.6k / ~4.8k). A title missing from the
// Italian list usually still plays — in its original language.

const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map();   // url → { at, value }

async function loadList(url, shape) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`vixsrc responded ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('unexpected payload');

  let value;
  if (shape === 'episodes') {
    value = new Map();
    for (const row of rows) {
      const list = value.get(row.tmdb_id);
      if (list) list.push([row.s, row.e]);
      else value.set(row.tmdb_id, [[row.s, row.e]]);
    }
  } else {
    value = new Set(rows.map((r) => r.tmdb_id));
  }

  cache.set(url, { at: Date.now(), value });
  return value;
}

export default async function handler(req, res) {
  const params = new URL(req.url, 'http://x').searchParams;
  const type = params.get('type') === 'tv' ? 'tv' : 'movie';
  const tmdbId = parseInt(params.get('tmdb_id'), 10);
  const wantEpisodes = params.get('episodes') === '1' && type === 'tv';

  if (!Number.isInteger(tmdbId)) {
    res.status(400).json({ error: 'tmdb_id required' });
    return;
  }

  try {
    const [all, italian] = await Promise.all([
      loadList(`https://vixsrc.to/api/list/${type}/`, 'ids'),
      loadList(`https://vixsrc.to/api/list/${type}/?lang=it`, 'ids'),
    ]);

    const payload = {
      tmdb_id: tmdbId,
      available: all.has(tmdbId),
      italian: italian.has(tmdbId),
    };

    if (wantEpisodes) {
      const byShow = await loadList('https://vixsrc.to/api/list/episode/?lang=it', 'episodes');
      payload.episodes = byShow.get(tmdbId) || [];
    }

    res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
    res.status(200).json(payload);
  } catch (err) {
    // Unknown, not "unavailable" — the client must never block playback on this
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'catalog unavailable' });
  }
}
