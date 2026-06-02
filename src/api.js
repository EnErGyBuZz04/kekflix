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
export async function fetchMovieDetails(id) {
  return tmdbFetch(`/movie/${id}`, { append_to_response: 'credits,videos,similar' });
}

// Fetch TV show details
export async function fetchTVDetails(id) {
  return tmdbFetch(`/tv/${id}`, { append_to_response: 'credits,videos,similar' });
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

// Fetch vixsrc.to catalog
export async function fetchVixCatalog(type = 'movie') {
  const cacheKey = `vix_${type}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  try {
    const res = await fetch(`${CONFIG.VIXSRC_BASE}/api/list/${type}`);
    const data = await res.json();
    const idSet = new Set(data.map(item => item.tmdb_id));
    cache.set(cacheKey, idSet);
    return idSet;
  } catch (e) {
    console.warn('Failed to fetch vixsrc catalog:', e);
    return new Set();
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
