import { CONFIG, IMG_SIZES } from './config.js';

// In-memory cache
const cache = new Map();

// Helper to call TMDB with Bearer auth
async function tmdbFetch(endpoint, params = {}) {
  const url = new URL(`${CONFIG.TMDB_BASE}${endpoint}`);
  url.searchParams.set('language', CONFIG.LANG);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const cacheKey = url.toString();
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${CONFIG.TMDB_TOKEN}`, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`TMDB Error: ${res.status}`);
  const data = await res.json();
  cache.set(cacheKey, data);
  return data;
}

// Fetch trending movies (for hero banner)
export async function fetchTrending(type = 'movie', timeWindow = 'week') {
  const data = await tmdbFetch(`/trending/${type}/${timeWindow}`);
  return data.results;
}

// Fetch popular movies or TV shows
export async function fetchPopular(type = 'movie', page = 1) {
  const data = await tmdbFetch(`/${type}/popular`, { page });
  return data.results;
}

// Fetch top rated
export async function fetchTopRated(type = 'movie', page = 1) {
  const data = await tmdbFetch(`/${type}/top_rated`, { page });
  return data.results;
}

// Fetch by genre (discover)
export async function fetchByGenre(genreId, type = 'movie', page = 1) {
  const data = await tmdbFetch(`/discover/${type}`, {
    with_genres: genreId,
    sort_by: 'popularity.desc',
    page,
  });
  return data.results;
}

// Fetch by release year (discover)
export async function fetchByYear(year, type = 'movie', page = 1) {
  const params = {
    sort_by: 'popularity.desc',
    page,
  };
  if (type === 'movie') {
    params.primary_release_year = year;
  } else {
    params.first_air_date_year = year;
  }
  const data = await tmdbFetch(`/discover/${type}`, params);
  return { results: data.results, totalPages: data.total_pages };
}

// Fetch by production company (discover)
// companyIds can be a pipe-separated string like "420|7505|19551"
export async function fetchByCompany(companyIds, type = 'movie', page = 1) {
  const data = await tmdbFetch(`/discover/${type}`, {
    with_companies: companyIds,
    sort_by: 'popularity.desc',
    page,
  });
  return { results: data.results, totalPages: data.total_pages };
}

// Fetch movie details
// `recommendations` is far more relevant than `similar` (which is genre/keyword
// based and often off-topic); we pool both and filter in buildRelated().
export async function fetchMovieDetails(id) {
  return tmdbFetch(`/movie/${id}`, { append_to_response: 'credits,videos,recommendations,similar' });
}

// Fetch TV show details
export async function fetchTVDetails(id) {
  return tmdbFetch(`/tv/${id}`, { append_to_response: 'credits,videos,recommendations,similar' });
}

// Fetch TV season details (episodes)
export async function fetchSeasonDetails(tvId, seasonNumber) {
  return tmdbFetch(`/tv/${tvId}/season/${seasonNumber}`);
}

// Search multi (movies + TV)
export async function searchMulti(query, page = 1) {
  if (!query || query.trim().length < 2) return [];
  const data = await tmdbFetch('/search/multi', { query: query.trim(), page });
  return data.results.filter(r => r.media_type === 'movie' || r.media_type === 'tv');
}

// ─── Streaming source availability ────────────────────
// vixsrc carries only part of TMDB, so a title can be perfectly real and still
// have no stream — that's exactly what the player's "Request failed with status
// code 404" means. The catalogue has no CORS headers and is far too big to ship
// to the browser, so /api/vix-availability answers per title, server-side.
//
// Returns null for "don't know": an unreachable catalogue must never read as
// "unavailable", or we'd block titles that play perfectly well.

// The set of ids that stream with Italian audio, cached locally for the day.
// Null means "couldn't load it" — callers fall back to the heuristic rather
// than showing an empty page.
const IT_CACHE_PREFIX = 'kekflix:itcatalog:';
const IT_CACHE_TTL = 6 * 60 * 60 * 1000;

export async function fetchItalianCatalog(type = 'movie') {
  const kind = type === 'tv' ? 'tv' : 'movie';
  const memKey = `itcat_${kind}`;
  if (cache.has(memKey)) return cache.get(memKey);

  try {
    const raw = localStorage.getItem(IT_CACHE_PREFIX + kind);
    if (raw) {
      const entry = JSON.parse(raw);
      if (Array.isArray(entry.ids) && entry.ids.length && Date.now() - entry.at < IT_CACHE_TTL) {
        const cached = new Set(entry.ids);
        cache.set(memKey, cached);
        return cached;
      }
    }
  } catch (e) { /* unreadable cache → refetch */ }

  try {
    const res = await fetch(`/api/vix-catalog?type=${kind}`);
    if (!res.ok) throw new Error(`catalog responded ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.ids) || data.ids.length === 0) throw new Error('empty catalog');

    const idSet = new Set(data.ids);
    cache.set(memKey, idSet);
    try {
      localStorage.setItem(IT_CACHE_PREFIX + kind, JSON.stringify({ at: Date.now(), ids: data.ids }));
    } catch (e) { /* quota → memory only */ }
    return idSet;
  } catch (e) {
    console.warn('Italian catalog unavailable:', e);
    return null;
  }
}

export async function fetchSourceAvailability(type, tmdbId, withEpisodes = false) {
  const kind = type === 'tv' ? 'tv' : 'movie';
  const memKey = `vixavail_${kind}_${tmdbId}_${withEpisodes ? 1 : 0}`;
  if (cache.has(memKey)) return cache.get(memKey);

  try {
    const url = `/api/vix-availability?type=${kind}&tmdb_id=${tmdbId}${withEpisodes ? '&episodes=1' : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`availability responded ${res.status}`);
    const data = await res.json();
    if (typeof data.available !== 'boolean') throw new Error('bad payload');

    const value = {
      available: data.available,
      // `italian` false just means no Italian track is listed — it still plays
      italian: data.italian === true,
      episodes: Array.isArray(data.episodes)
        ? new Set(data.episodes.map(([s, e]) => `${s}-${e}`))
        : null,
    };
    cache.set(memKey, value);
    return value;
  } catch (e) {
    return null;
  }
}

// Get embed URL for player
export function getEmbedUrl(type, tmdbId, season, episode, startTime) {
  const { primary, secondary } = CONFIG.PLAYER_COLORS;
  let url;
  if (type === 'tv') {
    url = `${CONFIG.VIXSRC_BASE}/tv/${tmdbId}/${season}/${episode}`;
  } else {
    url = `${CONFIG.VIXSRC_BASE}/movie/${tmdbId}`;
  }
  let full = `${url}?lang=it&primaryColor=${primary}&secondaryColor=${secondary}&autoplay=true`;
  if (startTime && startTime > 0) {
    full += `&startAt=${Math.floor(startTime)}`;
  }
  return full;
}

// Get poster URL
export function getPosterUrl(path, size = 'poster') {
  if (!path) return null;
  return `${CONFIG.TMDB_IMG}${IMG_SIZES[size]}${path}`;
}

// Get backdrop URL
export function getBackdropUrl(path, size = 'backdropSm') {
  if (!path) return null;
  return `${CONFIG.TMDB_IMG}${IMG_SIZES[size]}${path}`;
}
