import { GENRES_MAP, TV_GENRES_MAP, FEATURED_GENRES, MOVIE_GENRE_LIST, TV_GENRE_LIST, COMPANY_LIST, TV_COMPANY_LIST } from './config.js';
import {
  fetchTrending,
  fetchPopular,
  fetchTopRated,
  fetchByGenre,
  fetchByYear,
  fetchByCompany,
  fetchMovieDetails,
  fetchTVDetails,
  fetchSeasonDetails,
  searchMulti,
  getEmbedUrl,
  getPosterUrl,
  getBackdropUrl,
} from './api.js';
import { saveWatchProgress, getWatchHistory, markWatchCompleted, getEpisodeProgress, getCurrentProfile } from './supabase.js';

// ─── DOM References ───────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Escape user/API strings injected in HTML templates (titles can contain " or <)
function esc(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const heroSection = $('#hero-section');
const heroBackdrop = $('#hero-backdrop');
const heroContent = $('#hero-content');
const contentRows = $('#content-rows');
const searchOverlay = $('#search-overlay');
const searchGrid = $('#search-grid');
const searchTitle = $('#search-title');
const modalOverlay = $('#modal-overlay');
const modal = $('#modal');
const modalClose = $('#modal-close');
const modalBackdropWrap = $('#modal-backdrop-wrap');
const modalBody = $('#modal-body');

// ─── State ────────────────────────────────────────────
let currentPage = 'home';
let currentHeroItem = null;
let activeGenreFilter = null; // { id, type } or null for 'Tutti'
let currentModalDetail = null; // { title, posterPath } — set when detail modal opens
let currentModal = null; // { id, type } — open detail modal (for routing)
let currentPlayer = null; // { type, id, season, episode } — open player (for routing)

// ─── Italian Language Filter ──────────────────────────
// Keeps only content likely available in Italian audio/subtitles
function hasItalianAvailable(item) {
  // Italian originals — always available
  if (item.original_language === 'it') return true;
  // English content — almost universally dubbed to Italian
  if (item.original_language === 'en') return true;
  // For other languages: if TMDB has a localized Italian title, dubbing likely exists
  const title = (item.title || item.name || '');
  const originalTitle = (item.original_title || item.original_name || '');
  if (title && originalTitle && title !== originalTitle) return true;
  // Very popular content from any language usually gets Italian dubbing
  if ((item.vote_count || 0) > 300) return true;
  return false;
}

function filterItalian(items) {
  if (!items) return [];
  return items.filter(hasItalianAvailable);
}

// ─── Hero ─────────────────────────────────────────────
export async function renderHero(type = 'movie') {
  try {
    const items = await fetchTrending(type, 'week');
    if (!items || items.length === 0) return;

    // Pick a random item from top 10 that has a backdrop
    const candidates = filterItalian(items).filter((i) => i.backdrop_path).slice(0, 10);
    const item = candidates[Math.floor(Math.random() * candidates.length)];
    if (!item) return;

    currentHeroItem = { ...item, media_type: item.media_type || type };
    const backdropUrl = getBackdropUrl(item.backdrop_path, 'backdrop');
    const title = item.title || item.name;
    const overview = item.overview || '';
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);
    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
    const genreNames = (item.genre_ids || [])
      .map((id) => GENRES_MAP[id])
      .filter(Boolean)
      .slice(0, 3);

    heroBackdrop.style.backgroundImage = `url(${backdropUrl})`;
    heroSection.classList.remove('hidden');

    heroContent.innerHTML = `
      <div class="hero-meta">
        <span class="hero-rating">★ ${rating}</span>
        <span class="hero-year">${year}</span>
        ${genreNames.map((g) => `<span class="hero-genre">${esc(g)}</span>`).join('')}
      </div>
      <h1 class="hero-title">${esc(title)}</h1>
      <p class="hero-overview">${esc(overview)}</p>
      <div class="hero-actions">
        <button class="btn btn-play" id="hero-play">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          Guarda
        </button>
        <button class="btn btn-info" id="hero-info">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          Info
        </button>
      </div>
    `;

    // Hero button events
    $('#hero-play')?.addEventListener('click', () => {
      const mediaType = currentHeroItem.media_type === 'tv' ? 'tv' : 'movie';
      if (mediaType === 'tv') {
        openDetail(currentHeroItem.id, 'tv');
      } else {
        openPlayer('movie', currentHeroItem.id, undefined, undefined, currentHeroItem.title || currentHeroItem.name, currentHeroItem.poster_path);
      }
    });
    $('#hero-info')?.addEventListener('click', () => {
      const mediaType = currentHeroItem.media_type === 'tv' ? 'tv' : 'movie';
      openDetail(currentHeroItem.id, mediaType);
    });
  } catch (err) {
    console.error('Hero render error:', err);
  }
}

// ─── Content Rows ─────────────────────────────────────
function createRowHTML(title, items, mediaType = 'movie') {
  if (!items || items.length === 0) return '';

  const cards = filterItalian(items)
    .filter((item) => item.poster_path)
    .map((item) => {
      const poster = getPosterUrl(item.poster_path);
      const name = item.title || item.name || 'Senza titolo';
      const year = (item.release_date || item.first_air_date || '').slice(0, 4);
      const rating = item.vote_average ? item.vote_average.toFixed(1) : '';
      const type = item.media_type || mediaType;

      return `
        <div class="card" data-id="${item.id}" data-type="${type}" tabindex="0">
          <img class="card-poster" src="${poster}" alt="${esc(name)}" loading="lazy" />
          <div class="card-overlay">
            <div class="card-rating">${rating ? `★ ${rating}` : ''}</div>
            <div class="card-title">${esc(name)}</div>
            <div class="card-info">${year}</div>
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="content-row fade-in">
      <h2 class="row-title">${esc(title)}</h2>
      <div class="row-slider-wrap">
        <button class="row-arrow row-arrow-left" aria-label="Scorri a sinistra">‹</button>
        <div class="row-slider">${cards}</div>
        <button class="row-arrow row-arrow-right" aria-label="Scorri a destra">›</button>
      </div>
    </div>
  `;
}

function createSkeletonRow() {
  const skeletons = Array(8)
    .fill(
      '<div class="card skeleton-card"><div class="skeleton skeleton-poster"></div></div>'
    )
    .join('');
  return `
    <div class="content-row">
      <div class="skeleton skeleton-text" style="width:200px;height:20px;margin-bottom:14px;margin-left:4%"></div>
      <div class="row-slider" style="padding-left:4%">${skeletons}</div>
    </div>
  `;
}

export async function renderHomePage() {
  currentPage = 'home';
  heroSection.classList.remove('hidden');
  contentRows.innerHTML = Array(3).fill(createSkeletonRow()).join('');

  // Fire hero + all data fetches in parallel
  const heroPromise = renderHero('movie');
  const dataPromises = Promise.allSettled([
    fetchTrending('movie', 'day'),
    fetchPopular('movie'),
    fetchPopular('tv'),
    fetchTopRated('movie'),
    ...FEATURED_GENRES.slice(0, 3).map(g => fetchByGenre(g, 'movie')),
  ]);

  // Fetch continue watching in parallel
  const profile = getCurrentProfile();
  const cwPromise = profile ? getWatchHistory(profile.id).catch(() => []) : Promise.resolve([]);

  await heroPromise;
  const [results, cwItems] = await Promise.all([dataPromises, cwPromise]);

  const labels = [
    'Trending Oggi',
    'Film Popolari',
    'Serie TV Popolari',
    'I Più Votati',
    ...FEATURED_GENRES.slice(0, 3).map(g => GENRES_MAP[g]),
  ];
  const types = ['movie', 'movie', 'tv', 'movie', 'movie', 'movie', 'movie'];

  // Deduplicate: each row only shows items not already shown in a previous row
  const globalSeen = new Set();
  const rows = [];

  // "Continua a guardare" row first
  if (cwItems && cwItems.length > 0) {
    rows.push(createContinueWatchingRow(cwItems));
  }

  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value?.length) {
      // Filter out items already shown in previous rows
      const unique = r.value.filter(item => {
        const key = `${types[i]}_${item.id}`;
        if (globalSeen.has(key)) return false;
        globalSeen.add(key);
        return true;
      });
      if (unique.length > 0) {
        rows.push(createRowHTML(labels[i], unique, types[i]));
      }
    }
  });

  contentRows.innerHTML = rows.join('');
  attachRowArrows();
  observeFadeIns();
}

// ─── Continue Watching Row ────────────────────────────
function createContinueWatchingRow(items) {
  const cards = items.map(item => {
    const poster = getPosterUrl(item.poster_path);
    const progress = item.duration_seconds > 0
      ? Math.min(Math.round((item.progress_seconds / item.duration_seconds) * 100), 99)
      : 0;
    const remaining = item.duration_seconds > 0
      ? Math.max(0, Math.round((item.duration_seconds - item.progress_seconds) / 60))
      : 0;
    const subtitle = item.media_type === 'tv' && item.season
      ? `S${item.season}:E${item.episode}`
      : '';

    return `
      <div class="card cw-card" data-id="${item.tmdb_id}" data-type="${item.media_type}"
           data-season="${item.season || ''}" data-episode="${item.episode || ''}"
           data-title="${esc(item.title)}" data-poster="${esc(item.poster_path || '')}"
           data-progress="${item.progress_seconds || 0}"
           tabindex="0">
        <img class="card-poster" src="${poster}" alt="${esc(item.title)}" loading="lazy" />
        <div class="cw-overlay">
          <button class="cw-play-btn" aria-label="Riproduci">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          </button>
          <button class="cw-remove-btn" aria-label="Rimuovi" data-tmdb="${item.tmdb_id}" data-type="${item.media_type}" data-season="${item.season || ''}" data-episode="${item.episode || ''}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="cw-info">
          <div class="cw-title">${esc(item.title)}</div>
          ${subtitle ? `<div class="cw-subtitle">${subtitle}</div>` : ''}
          <div class="cw-time">${remaining} min rimasti</div>
        </div>
        <div class="cw-progress-bar">
          <div class="cw-progress-fill" style="width: ${progress}%"></div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="content-row cw-row fade-in">
      <h2 class="row-title">Continua a guardare</h2>
      <div class="row-slider-wrap">
        <button class="row-arrow row-arrow-left" aria-label="Scorri a sinistra">‹</button>
        <div class="row-slider">${cards}</div>
        <button class="row-arrow row-arrow-right" aria-label="Scorri a destra">›</button>
      </div>
    </div>
  `;
}

// Continue-watching actions handled by the delegated card handler below

async function handleCwRemove(removeBtn, card) {
  const profile = getCurrentProfile();
  if (!profile) return;

  const tmdbId = parseInt(removeBtn.dataset.tmdb);
  const mediaType = removeBtn.dataset.type;
  const season = removeBtn.dataset.season ? parseInt(removeBtn.dataset.season) : null;
  const episode = removeBtn.dataset.episode ? parseInt(removeBtn.dataset.episode) : null;

  // Animate removal
  card.style.transition = 'opacity 0.3s, transform 0.3s';
  card.style.opacity = '0';
  card.style.transform = 'scale(0.9)';

  await markWatchCompleted(profile.id, tmdbId, mediaType, season, episode);

  setTimeout(() => {
    card.remove();
    const cwRow = document.querySelector('.cw-row');
    if (cwRow && cwRow.querySelectorAll('.cw-card').length === 0) {
      cwRow.remove();
    }
  }, 300);
}

// ─── Filter Bar (Genres + Companies) ──────────────────
function createGenreFilterHTML(genreList, companyList, mediaType) {
  const genrePills = genreList
    .map(
      (g) => `<button class="genre-pill" data-genre-id="${g.id}" data-media-type="${mediaType}">${g.name}</button>`
    )
    .join('');

  const companyPills = companyList
    .map(
      (c) => `<button class="company-pill" data-company-ids="${c.ids.join('|')}" data-company-name="${c.name}" data-media-type="${mediaType}">${c.name}</button>`
    )
    .join('');

  const currentYear = new Date().getFullYear();
  const newReleasesPill = mediaType === 'movie'
    ? `<button class="genre-pill genre-pill-new" data-genre-id="new-releases" data-media-type="${mediaType}">Novità ${currentYear}</button>`
    : '';

  return `
    <div class="genre-filter-bar" id="genre-filter-bar">
      <div class="filter-row">
        <div class="filter-row-label">Generi</div>
        <div class="genre-filter-scroll" id="genre-scroll">
          <button class="genre-pill active" data-genre-id="all" data-media-type="${mediaType}">Tutti</button>
          ${newReleasesPill}
          ${genrePills}
        </div>
      </div>
      <div class="filter-row">
        <div class="filter-row-label">Case di Produzione</div>
        <div class="genre-filter-scroll" id="company-scroll">
          ${companyPills}
        </div>
      </div>
    </div>
  `;
}

function attachGenreFilterEvents(mediaType) {
  const genrePills = $$('#genre-scroll .genre-pill');
  const companyPills = $$('#company-scroll .company-pill');

  genrePills.forEach((pill) => {
    pill.addEventListener('click', () => {
      // Deactivate all genre + company pills
      genrePills.forEach((p) => p.classList.remove('active'));
      companyPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');

      const genreId = pill.dataset.genreId;
      if (genreId === 'all') {
        activeGenreFilter = null;
        if (mediaType === 'movie') renderMoviesAllRows();
        else renderTVAllRows();
      } else if (genreId === 'new-releases') {
        activeGenreFilter = { id: 'new-releases', type: mediaType };
        renderNewReleasesGrid(mediaType);
      } else {
        activeGenreFilter = { id: parseInt(genreId), type: mediaType };
        renderGenreGrid(parseInt(genreId), mediaType);
      }
      writeRoute();
    });
  });

  companyPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      genrePills.forEach((p) => p.classList.remove('active'));
      companyPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');

      const companyIds = pill.dataset.companyIds; // pipe-separated string
      const companyName = pill.dataset.companyName;
      activeGenreFilter = { ids: companyIds, type: mediaType, isCompany: true };
      renderCompanyGrid(companyIds, companyName, mediaType);
      writeRoute();
    });
  });
}

async function renderGenreGrid(genreId, mediaType) {
  const genreName = (mediaType === 'tv' ? TV_GENRES_MAP[genreId] : GENRES_MAP[genreId]) || 'Genere';

  // Render into the rows content container (keeping filter bar)
  let target = $('#genre-rows-content');
  if (!target) {
    const filterBar = $('#genre-filter-bar');
    const filterHTML = filterBar ? filterBar.outerHTML : createGenreFilterHTML(mediaType === 'tv' ? TV_GENRE_LIST : MOVIE_GENRE_LIST, mediaType === 'tv' ? TV_COMPANY_LIST : COMPANY_LIST, mediaType);
    contentRows.innerHTML = filterHTML + '<div id="genre-rows-content"></div>';
    attachGenreFilterEvents(mediaType);
    const pills = $$('#genre-filter-bar .genre-pill');
    pills.forEach(p => {
      p.classList.toggle('active', parseInt(p.dataset.genreId) === genreId);
    });
    target = $('#genre-rows-content');
  }

  // Show skeleton grid
  target.innerHTML = `
    <div class="genre-grid-section fade-in visible">
      <h2 class="genre-grid-title">${genreName}</h2>
      <div class="genre-results-grid" id="genre-results-grid">
        ${Array(30).fill('<div class="skeleton skeleton-poster" style="width:100%;aspect-ratio:2/3"></div>').join('')}
      </div>
    </div>
  `;

  try {
    // Load 8 pages in parallel (~160 titles) for the initial batch
    const INITIAL_PAGES = 8;
    const pagePromises = [];
    for (let p = 1; p <= INITIAL_PAGES; p++) {
      pagePromises.push(fetchByGenre(genreId, mediaType, p));
    }
    const pages = await Promise.all(pagePromises);

    // Flatten and deduplicate by ID
    const seenIds = new Set();
    const items = [];
    for (const pageItems of pages) {
      if (!pageItems) continue;
      for (const item of pageItems) {
        if (!seenIds.has(item.id) && item.poster_path) {
          seenIds.add(item.id);
          items.push(item);
        }
      }
    }

    const grid = $('#genre-results-grid');
    if (items.length === 0) {
      grid.innerHTML = `
        <div class="no-results" style="grid-column:1/-1">
          <div class="no-results-icon">🎬</div>
          <p class="no-results-text">Nessun titolo trovato per questo genere.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = renderCardGrid(items, mediaType);

    // "Load more" button + count
    const countEl = document.createElement('div');
    countEl.className = 'genre-grid-footer';
    countEl.innerHTML = `
      <span class="genre-count">${items.length} titoli</span>
      <button class="btn btn-load-more" id="load-more-btn">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        Carica altri
      </button>
    `;
    target.querySelector('.genre-grid-section').appendChild(countEl);

    // Pagination state
    let nextPage = INITIAL_PAGES + 1;
    let isLoading = false;

    const loadMoreBtn = $('#load-more-btn');
    loadMoreBtn.addEventListener('click', async () => {
      if (isLoading) return;
      isLoading = true;
      loadMoreBtn.disabled = true;
      loadMoreBtn.innerHTML = `
        <div class="spinner"></div>
        Caricamento...
      `;

      try {
        // Load 3 more pages per click
        const morePromises = [];
        for (let p = nextPage; p < nextPage + 3; p++) {
          morePromises.push(fetchByGenre(genreId, mediaType, p));
        }
        const morePages = await Promise.all(morePromises);

        const newItems = [];
        for (const pageItems of morePages) {
          if (!pageItems) continue;
          for (const item of pageItems) {
            if (!seenIds.has(item.id) && item.poster_path) {
              seenIds.add(item.id);
              newItems.push(item);
            }
          }
        }

        if (newItems.length === 0) {
          loadMoreBtn.innerHTML = 'Non ci sono altri titoli';
          loadMoreBtn.disabled = true;
          loadMoreBtn.classList.add('btn-exhausted');
          return;
        }

        // Append new cards to the grid
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = renderCardGrid(newItems, mediaType);
        const newCards = tempDiv.querySelectorAll('.card');
        newCards.forEach(card => grid.appendChild(card));

        nextPage += 3;
        const totalCount = seenIds.size;
        countEl.querySelector('.genre-count').textContent = `${totalCount} titoli`;

        loadMoreBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          Carica altri
        `;
        loadMoreBtn.disabled = false;
      } catch (err) {
        console.error('Load more error:', err);
        loadMoreBtn.innerHTML = 'Errore — Riprova';
        loadMoreBtn.disabled = false;
      } finally {
        isLoading = false;
      }
    });

  } catch (err) {
    console.error('Genre grid error:', err);
    const grid = $('#genre-results-grid');
    if (grid) {
      grid.innerHTML = `
        <div class="no-results" style="grid-column:1/-1">
          <div class="no-results-icon">⚠️</div>
          <p class="no-results-text">Errore nel caricamento. Riprova.</p>
        </div>
      `;
    }
  }
}

// Helper: render card HTML for a list of items (pre-filtered for Italian)
function renderCardGrid(items, mediaType) {
  return filterItalian(items)
    .map((item) => {
      const poster = getPosterUrl(item.poster_path);
      const name = item.title || item.name || 'Senza titolo';
      const year = (item.release_date || item.first_air_date || '').slice(0, 4);
      const rating = item.vote_average ? item.vote_average.toFixed(1) : '';

      return `
        <div class="card" data-id="${item.id}" data-type="${mediaType}" tabindex="0">
          <img class="card-poster" src="${poster}" alt="${esc(name)}" loading="lazy" />
          <div class="card-overlay">
            <div class="card-rating">${rating ? `★ ${rating}` : ''}</div>
            <div class="card-title">${esc(name)}</div>
            <div class="card-info">${year}</div>
          </div>
        </div>
      `;
    })
    .join('');
}

// ─── Company Grid (loads ALL pages) ───────────────────
async function renderCompanyGrid(companyIds, companyName, mediaType) {
  let target = $('#genre-rows-content');
  if (!target) {
    const filterBar = $('#genre-filter-bar');
    const filterHTML = filterBar ? filterBar.outerHTML : createGenreFilterHTML(
      mediaType === 'tv' ? TV_GENRE_LIST : MOVIE_GENRE_LIST,
      mediaType === 'tv' ? TV_COMPANY_LIST : COMPANY_LIST,
      mediaType
    );
    contentRows.innerHTML = filterHTML + '<div id="genre-rows-content"></div>';
    attachGenreFilterEvents(mediaType);
    target = $('#genre-rows-content');
  }

  target.innerHTML = `
    <div class="genre-grid-section fade-in visible">
      <h2 class="genre-grid-title">${companyName}</h2>
      <p class="genre-loading-status" id="loading-status">Caricamento titoli...</p>
      <div class="genre-results-grid" id="genre-results-grid">
        ${Array(30).fill('<div class="skeleton skeleton-poster" style="width:100%;aspect-ratio:2/3"></div>').join('')}
      </div>
    </div>
  `;

  try {
    // First call to discover total pages
    const firstPage = await fetchByCompany(companyIds, mediaType, 1);
    const totalPages = Math.min(firstPage.totalPages || 1, 25); // Cap at 25 pages (500 titles)
    const statusEl = $('#loading-status');

    // Collect results from page 1
    const seenIds = new Set();
    const items = [];
    for (const item of (firstPage.results || [])) {
      if (!seenIds.has(item.id) && item.poster_path) {
        seenIds.add(item.id);
        items.push(item);
      }
    }

    // Load remaining pages in parallel batches of 5
    if (totalPages > 1) {
      const BATCH_SIZE = 5;
      for (let batchStart = 2; batchStart <= totalPages; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages);
        const promises = [];
        for (let p = batchStart; p <= batchEnd; p++) {
          promises.push(fetchByCompany(companyIds, mediaType, p));
        }
        const batchResults = await Promise.all(promises);

        for (const res of batchResults) {
          if (!res || !res.results) continue;
          for (const item of res.results) {
            if (!seenIds.has(item.id) && item.poster_path) {
              seenIds.add(item.id);
              items.push(item);
            }
          }
        }

        // Update loading status
        if (statusEl) {
          const pct = Math.round((batchEnd / totalPages) * 100);
          statusEl.textContent = `Caricamento: ${items.length} titoli trovati (${pct}%)...`;
        }
      }
    }

    const grid = $('#genre-results-grid');
    if (statusEl) statusEl.remove();

    if (items.length === 0) {
      grid.innerHTML = `
        <div class="no-results" style="grid-column:1/-1">
          <div class="no-results-icon">🎬</div>
          <p class="no-results-text">Nessun titolo trovato per ${companyName}.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = renderCardGrid(items, mediaType);

    // Footer with count
    const countEl = document.createElement('div');
    countEl.className = 'genre-grid-footer';

    if (totalPages >= 25) {
      // There might be more pages beyond our cap
      countEl.innerHTML = `
        <span class="genre-count">${items.length} titoli caricati</span>
        <button class="btn btn-load-more" id="load-more-btn">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          Carica altri
        </button>
      `;
      target.querySelector('.genre-grid-section').appendChild(countEl);

      let nextPage = 26;
      let isLoading = false;
      const loadMoreBtn = $('#load-more-btn');

      loadMoreBtn.addEventListener('click', async () => {
        if (isLoading) return;
        isLoading = true;
        loadMoreBtn.disabled = true;
        loadMoreBtn.innerHTML = '<div class="spinner"></div> Caricamento...';

        try {
          const morePromises = [];
          for (let p = nextPage; p < nextPage + 5; p++) {
            morePromises.push(fetchByCompany(companyIds, mediaType, p));
          }
          const morePages = await Promise.all(morePromises);

          const newItems = [];
          for (const res of morePages) {
            if (!res || !res.results) continue;
            for (const item of res.results) {
              if (!seenIds.has(item.id) && item.poster_path) {
                seenIds.add(item.id);
                newItems.push(item);
              }
            }
          }

          if (newItems.length === 0) {
            loadMoreBtn.innerHTML = 'Non ci sono altri titoli';
            loadMoreBtn.disabled = true;
            loadMoreBtn.classList.add('btn-exhausted');
            return;
          }

          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = renderCardGrid(newItems, mediaType);
          tempDiv.querySelectorAll('.card').forEach(card => grid.appendChild(card));

          nextPage += 5;
          countEl.querySelector('.genre-count').textContent = `${seenIds.size} titoli caricati`;
          loadMoreBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg> Carica altri';
          loadMoreBtn.disabled = false;
        } catch (err) {
          console.error('Load more error:', err);
          loadMoreBtn.innerHTML = 'Errore — Riprova';
          loadMoreBtn.disabled = false;
        } finally {
          isLoading = false;
        }
      });
    } else {
      // All content loaded
      countEl.innerHTML = `<span class="genre-count">${items.length} titoli — catalogo completo</span>`;
      target.querySelector('.genre-grid-section').appendChild(countEl);
    }

  } catch (err) {
    console.error('Company grid error:', err);
    const grid = $('#genre-results-grid');
    if (grid) {
      grid.innerHTML = `
        <div class="no-results" style="grid-column:1/-1">
          <div class="no-results-icon">⚠️</div>
          <p class="no-results-text">Errore nel caricamento. Riprova.</p>
        </div>
      `;
    }
  }
}

// ─── New Releases Grid ────────────────────────────────
async function renderNewReleasesGrid(mediaType) {
  const currentYear = new Date().getFullYear();
  const title = `Novità ${currentYear}`;

  let target = $('#genre-rows-content');
  if (!target) {
    const filterBar = $('#genre-filter-bar');
    const filterHTML = filterBar ? filterBar.outerHTML : createGenreFilterHTML(
      mediaType === 'tv' ? TV_GENRE_LIST : MOVIE_GENRE_LIST,
      mediaType === 'tv' ? TV_COMPANY_LIST : COMPANY_LIST,
      mediaType
    );
    contentRows.innerHTML = filterHTML + '<div id="genre-rows-content"></div>';
    attachGenreFilterEvents(mediaType);
    target = $('#genre-rows-content');
  }

  target.innerHTML = `
    <div class="genre-grid-section fade-in visible">
      <h2 class="genre-grid-title">${title}</h2>
      <p class="genre-loading-status" id="loading-status">Caricamento titoli...</p>
      <div class="genre-results-grid" id="genre-results-grid">
        ${Array(30).fill('<div class="skeleton skeleton-poster" style="width:100%;aspect-ratio:2/3"></div>').join('')}
      </div>
    </div>
  `;

  try {
    const firstPage = await fetchByYear(currentYear, mediaType, 1);
    const totalPages = Math.min(firstPage.totalPages || 1, 25);
    const statusEl = $('#loading-status');

    const seenIds = new Set();
    const items = [];
    for (const item of (firstPage.results || [])) {
      if (!seenIds.has(item.id) && item.poster_path) {
        seenIds.add(item.id);
        items.push(item);
      }
    }

    if (totalPages > 1) {
      const BATCH_SIZE = 5;
      for (let batchStart = 2; batchStart <= totalPages; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, totalPages);
        const promises = [];
        for (let p = batchStart; p <= batchEnd; p++) {
          promises.push(fetchByYear(currentYear, mediaType, p));
        }
        const batchResults = await Promise.all(promises);

        for (const res of batchResults) {
          if (!res || !res.results) continue;
          for (const item of res.results) {
            if (!seenIds.has(item.id) && item.poster_path) {
              seenIds.add(item.id);
              items.push(item);
            }
          }
        }

        if (statusEl) {
          const pct = Math.round((batchEnd / totalPages) * 100);
          statusEl.textContent = `Caricamento: ${items.length} titoli trovati (${pct}%)...`;
        }
      }
    }

    const grid = $('#genre-results-grid');
    if (statusEl) statusEl.remove();

    if (items.length === 0) {
      grid.innerHTML = `
        <div class="no-results" style="grid-column:1/-1">
          <div class="no-results-icon">🎬</div>
          <p class="no-results-text">Nessuna uscita trovata per il ${currentYear}.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = renderCardGrid(items, mediaType);

    const countEl = document.createElement('div');
    countEl.className = 'genre-grid-footer';

    if (totalPages >= 25) {
      countEl.innerHTML = `
        <span class="genre-count">${items.length} titoli caricati</span>
        <button class="btn btn-load-more" id="load-more-btn">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          Carica altri
        </button>
      `;
      target.querySelector('.genre-grid-section').appendChild(countEl);

      let nextPage = 26;
      let isLoading = false;
      const loadMoreBtn = $('#load-more-btn');

      loadMoreBtn.addEventListener('click', async () => {
        if (isLoading) return;
        isLoading = true;
        loadMoreBtn.disabled = true;
        loadMoreBtn.innerHTML = '<div class="spinner"></div> Caricamento...';

        try {
          const morePromises = [];
          for (let p = nextPage; p < nextPage + 5; p++) {
            morePromises.push(fetchByYear(currentYear, mediaType, p));
          }
          const morePages = await Promise.all(morePromises);

          const newItems = [];
          for (const res of morePages) {
            if (!res || !res.results) continue;
            for (const item of res.results) {
              if (!seenIds.has(item.id) && item.poster_path) {
                seenIds.add(item.id);
                newItems.push(item);
              }
            }
          }

          if (newItems.length === 0) {
            loadMoreBtn.innerHTML = 'Non ci sono altri titoli';
            loadMoreBtn.disabled = true;
            loadMoreBtn.classList.add('btn-exhausted');
            return;
          }

          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = renderCardGrid(newItems, mediaType);
          tempDiv.querySelectorAll('.card').forEach(card => grid.appendChild(card));

          nextPage += 5;
          countEl.querySelector('.genre-count').textContent = `${seenIds.size} titoli caricati`;
          loadMoreBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg> Carica altri';
          loadMoreBtn.disabled = false;
        } catch (err) {
          loadMoreBtn.innerHTML = 'Errore — Riprova';
          loadMoreBtn.disabled = false;
        } finally {
          isLoading = false;
        }
      });
    } else {
      countEl.innerHTML = `<span class="genre-count">${items.length} titoli — catalogo completo ${currentYear}</span>`;
      target.querySelector('.genre-grid-section').appendChild(countEl);
    }

  } catch (err) {
    console.error('New releases error:', err);
    const grid = $('#genre-results-grid');
    if (grid) {
      grid.innerHTML = `
        <div class="no-results" style="grid-column:1/-1">
          <div class="no-results-icon">⚠️</div>
          <p class="no-results-text">Errore nel caricamento. Riprova.</p>
        </div>
      `;
    }
  }
}

// ─── Movies Page ──────────────────────────────────────
export async function renderMoviesPage() {
  currentPage = 'movies';
  activeGenreFilter = null;
  heroSection.classList.add('hidden');

  // Insert genre filter bar + skeleton rows
  const filterBar = createGenreFilterHTML(MOVIE_GENRE_LIST, COMPANY_LIST, 'movie');
  contentRows.innerHTML = filterBar + Array(6).fill(createSkeletonRow()).join('');
  attachGenreFilterEvents('movie');

  await renderMoviesAllRows();
}

async function renderMoviesAllRows() {
  // Keep the filter bar, replace only content
  const filterBar = $('#genre-filter-bar');
  const filterHTML = filterBar ? filterBar.outerHTML : '';

  const rowsContainer = document.createElement('div');
  rowsContainer.id = 'genre-rows-content';
  rowsContainer.innerHTML = Array(6).fill(createSkeletonRow()).join('');

  // Remove old content but keep filter
  const existingContent = $('#genre-rows-content');
  if (existingContent) {
    existingContent.replaceWith(rowsContainer);
  } else {
    // First load: filter bar already in contentRows, append rows container
    contentRows.innerHTML = filterHTML + '<div id="genre-rows-content">' + Array(6).fill(createSkeletonRow()).join('') + '</div>';
    attachGenreFilterEvents('movie');
  }

  const rows = [];
  const globalSeen = new Set();

  function dedup(items) {
    return items.filter(item => {
      const key = `movie_${item.id}`;
      if (globalSeen.has(key)) return false;
      globalSeen.add(key);
      return true;
    });
  }

  // All rows fetched in parallel — the page renders in one network round-trip
  const sources = [
    { label: 'Popolari', fetch: () => fetchPopular('movie') },
    { label: 'I Più Votati', fetch: () => fetchTopRated('movie') },
    { label: 'Trending Questa Settimana', fetch: () => fetchTrending('movie', 'week') },
    ...FEATURED_GENRES.map(genreId => ({
      label: GENRES_MAP[genreId],
      fetch: () => fetchByGenre(genreId, 'movie'),
    })),
  ];

  const results = await Promise.allSettled(sources.map(s => s.fetch()));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value?.length) {
      const unique = dedup(r.value);
      if (unique.length) rows.push(createRowHTML(sources[i].label, unique));
    } else if (r.status === 'rejected') {
      console.warn(r.reason);
    }
  });

  const target = $('#genre-rows-content');
  if (target) target.innerHTML = rows.join('');
  else contentRows.innerHTML = createGenreFilterHTML(MOVIE_GENRE_LIST, COMPANY_LIST, 'movie') + rows.join('');

  attachRowArrows();
  observeFadeIns();
  // Re-attach filter events if needed
  if (!$('#genre-filter-bar')) attachGenreFilterEvents('movie');
}

// ─── TV Page ──────────────────────────────────────────
export async function renderTVPage() {
  currentPage = 'tv';
  activeGenreFilter = null;
  heroSection.classList.add('hidden');

  const filterBar = createGenreFilterHTML(TV_GENRE_LIST, TV_COMPANY_LIST, 'tv');
  contentRows.innerHTML = filterBar + Array(6).fill(createSkeletonRow()).join('');
  attachGenreFilterEvents('tv');

  await renderHero('tv');
  heroSection.classList.remove('hidden');

  await renderTVAllRows();
}

async function renderTVAllRows() {
  const filterBar = $('#genre-filter-bar');
  const filterHTML = filterBar ? filterBar.outerHTML : '';

  const existingContent = $('#genre-rows-content');
  if (existingContent) {
    existingContent.innerHTML = Array(6).fill(createSkeletonRow()).join('');
  } else {
    contentRows.innerHTML = filterHTML + '<div id="genre-rows-content">' + Array(6).fill(createSkeletonRow()).join('') + '</div>';
    attachGenreFilterEvents('tv');
  }

  const rows = [];
  const globalSeen = new Set();

  function dedup(items) {
    return items.filter(item => {
      const key = `tv_${item.id}`;
      if (globalSeen.has(key)) return false;
      globalSeen.add(key);
      return true;
    });
  }

  // All rows fetched in parallel — the page renders in one network round-trip
  const sources = [
    { label: 'Popolari', fetch: () => fetchPopular('tv') },
    { label: 'Le Più Votate', fetch: () => fetchTopRated('tv') },
    { label: 'Trending', fetch: () => fetchTrending('tv', 'week') },
    ...[18, 35, 10765, 80, 10759].map(genreId => ({
      label: TV_GENRES_MAP[genreId] || GENRES_MAP[genreId] || 'Genere',
      fetch: () => fetchByGenre(genreId, 'tv'),
    })),
  ];

  const results = await Promise.allSettled(sources.map(s => s.fetch()));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value?.length) {
      const unique = dedup(r.value);
      if (unique.length) rows.push(createRowHTML(sources[i].label, unique, 'tv'));
    } else if (r.status === 'rejected') {
      console.warn(r.reason);
    }
  });

  const target = $('#genre-rows-content');
  if (target) target.innerHTML = rows.join('');
  else contentRows.innerHTML = createGenreFilterHTML(TV_GENRE_LIST, TV_COMPANY_LIST, 'tv') + rows.join('');

  attachRowArrows();
  observeFadeIns();
  if (!$('#genre-filter-bar')) attachGenreFilterEvents('tv');
}

// ─── Search ───────────────────────────────────────────
let searchTimeout = null;

export function initSearch() {
  const input = $('#search-input');
  if (!input) return;

  const wrap = $('#nav-search-wrap');
  const toggle = $('#search-toggle');
  const navbar = $('#navbar');

  const openNavSearch = () => {
    wrap?.classList.add('open');
    navbar?.classList.add('searching');
    input.classList.add('active');
    input.focus();
  };

  // Toggle button: open when collapsed, collapse when open & empty
  toggle?.addEventListener('click', (e) => {
    e.preventDefault();
    if (wrap?.classList.contains('open')) {
      if (!input.value.trim()) {
        input.value = '';
        closeSearch();
        input.blur();
      } else {
        input.focus();
      }
    } else {
      openNavSearch();
    }
  });

  // Collapse the field on blur when there's nothing typed
  input.addEventListener('blur', () => {
    if (!input.value.trim()) {
      wrap?.classList.remove('open');
      navbar?.classList.remove('searching');
      input.classList.remove('active');
    }
  });

  input.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length < 2) {
      searchOverlay.classList.remove('active');
      searchGrid.innerHTML = '';
      return;
    }
    searchTimeout = setTimeout(() => performSearch(query), 400);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      closeSearch();
      input.blur();
    }
  });
}

async function performSearch(query) {
  searchOverlay.classList.add('active');
  searchTitle.textContent = `Risultati per "${query}"`;
  searchGrid.innerHTML = Array(12)
    .fill('<div class="skeleton skeleton-poster" style="width:100%;aspect-ratio:2/3"></div>')
    .join('');

  try {
    const results = await searchMulti(query);
    if (results.length === 0) {
      searchGrid.innerHTML = `
        <div class="no-results" style="grid-column:1/-1">
          <div class="no-results-icon">🔍</div>
          <p class="no-results-text">Nessun risultato per "${esc(query)}"</p>
        </div>
      `;
      return;
    }

    searchGrid.innerHTML = filterItalian(results)
      .filter((r) => r.poster_path)
      .map((item) => {
        const poster = getPosterUrl(item.poster_path);
        const name = item.title || item.name || '';
        const year = (item.release_date || item.first_air_date || '').slice(0, 4);
        const type = item.media_type || 'movie';
        const rating = item.vote_average ? item.vote_average.toFixed(1) : '';

        return `
          <div class="card" data-id="${item.id}" data-type="${type}" tabindex="0">
            <img class="card-poster" src="${poster}" alt="${esc(name)}" loading="lazy" />
            <div class="card-overlay">
              <div class="card-rating">${rating ? `★ ${rating}` : ''}</div>
              <div class="card-title">${esc(name)}</div>
              <div class="card-info">${year}${type === 'tv' ? ' • Serie TV' : ''}</div>
            </div>
          </div>
        `;
      })
      .join('');

  } catch (err) {
    console.error('Search error:', err);
    searchGrid.innerHTML = `
      <div class="no-results" style="grid-column:1/-1">
        <div class="no-results-icon">⚠️</div>
        <p class="no-results-text">Errore nella ricerca. Riprova.</p>
      </div>
    `;
  }
}

function closeSearch() {
  searchOverlay.classList.remove('active');
  searchGrid.innerHTML = '';
  // Collapse the navbar search field
  $('#nav-search-wrap')?.classList.remove('open');
  $('#navbar')?.classList.remove('searching');
  $('#search-input')?.classList.remove('active');
}

export function isSearchOpen() {
  return searchOverlay.classList.contains('active');
}

// ─── Detail Modal ─────────────────────────────────────
let savedScrollY = 0;

/**
 * Build a relevant "you might also like" list from a detail payload.
 * TMDB's recommendations/similar are noisy (obscure / off-theme / softcore
 * titles slip in), so we pool both and keep only titles that share a genre and
 * clear a vote threshold, sorted by popularity, with graceful fallbacks.
 */
function buildRelated(detail, type, limit = 12) {
  const genreIds = new Set((detail.genres || []).map((g) => g.id));
  const pool = [
    ...(detail.recommendations?.results || []),
    ...(detail.similar?.results || []),
  ];

  // De-duplicate, drop the title itself and anything without a poster
  const seen = new Set([detail.id]);
  const unique = [];
  for (const r of pool) {
    if (seen.has(r.id) || !r.poster_path) continue;
    seen.add(r.id);
    unique.push(r);
  }

  const sharesGenre = (r) => (r.genre_ids || []).some((id) => genreIds.has(id));
  // TV vote counts run much lower than film, so use a gentler floor
  const minVotes = type === 'tv' ? 40 : 120;
  const byPopularity = (a, b) => (b.popularity || 0) - (a.popularity || 0);

  // Tier 1: on-genre and reputable. Tier 2: on-genre (any votes).
  // Tier 3: whatever's left, so the row is never suspiciously empty.
  const tier1 = unique.filter((r) => sharesGenre(r) && (r.vote_count || 0) >= minVotes);
  const tier2 = unique.filter((r) => sharesGenre(r) && !tier1.includes(r));
  const tier3 = unique.filter((r) => !sharesGenre(r));

  tier1.sort(byPopularity);
  tier2.sort(byPopularity);
  tier3.sort(byPopularity);

  return [...tier1, ...tier2, ...tier3].slice(0, limit);
}

export async function openDetail(id, type = 'movie') {
  modalOverlay.classList.add('active');
  currentModal = { id, type };
  writeRoute();
  // iOS Safari needs position:fixed to prevent background scroll
  savedScrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${savedScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.overflow = 'hidden';

  // Show loading state
  modalBackdropWrap.innerHTML = '<div class="skeleton" style="width:100%;height:100%;position:absolute;inset:0"></div>';
  modalBody.innerHTML = '<div class="skeleton skeleton-text" style="width:60%;height:28px;margin-bottom:16px"></div><div class="skeleton skeleton-text" style="width:40%;height:16px;margin-bottom:12px"></div><div class="skeleton skeleton-text" style="width:90%;height:60px"></div>';

  try {
    let detail;
    if (type === 'tv') {
      detail = await fetchTVDetails(id);
    } else {
      detail = await fetchMovieDetails(id);
    }

    const backdrop = getBackdropUrl(detail.backdrop_path, 'backdrop');
    const title = detail.title || detail.name;
    currentModalDetail = { title, posterPath: detail.poster_path || '' };
    const year = (detail.release_date || detail.first_air_date || '').slice(0, 4);
    const rating = detail.vote_average ? detail.vote_average.toFixed(1) : 'N/A';
    const runtime = detail.runtime ? `${detail.runtime} min` : '';
    const genres = (detail.genres || []).map((g) => g.name);
    const overview = detail.overview || 'Descrizione non disponibile.';
    const seasons = detail.seasons || [];
    const numberOfSeasons = detail.number_of_seasons || 0;

    // ── Find best trailer (Italian preferred, English fallback) ──
    const allVideos = detail.videos?.results || [];
    const findTrailer = (lang) => {
      // Prefer official Trailers, then Teasers
      const trailers = allVideos.filter(v => v.site === 'YouTube' && v.iso_639_1 === lang);
      return trailers.find(v => v.type === 'Trailer')
        || trailers.find(v => v.type === 'Teaser')
        || trailers[0]
        || null;
    };
    const trailer = findTrailer('it') || findTrailer('en');
    const trailerUrl = trailer ? `https://www.youtube.com/embed/${trailer.key}?autoplay=1&rel=0` : null;
    const trailerLang = trailer?.iso_639_1 === 'it' ? '🇮🇹' : (trailer ? '🇬🇧' : '');

    // Backdrop
    if (backdrop) {
      modalBackdropWrap.innerHTML = `
        <img src="${backdrop}" alt="${esc(title)}" />
        <div class="modal-backdrop-gradient"></div>
        <div class="modal-backdrop-play">
          <button class="btn btn-play btn-play-lg" id="modal-play-btn" data-type="${type}" data-id="${id}">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            Guarda ora
          </button>
          ${trailerUrl ? `
          <button class="btn btn-trailer" id="modal-trailer-btn">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2"/><polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none"/></svg>
            Trailer ${trailerLang}
          </button>
          ` : ''}
        </div>
      `;
    }

    // Body content
    let bodyHTML = `
      <h2 class="modal-title">${esc(title)}</h2>
      <div class="modal-meta">
        <span class="modal-rating">★ ${rating}</span>
        <span>${year}</span>
        ${runtime ? `<span>${runtime}</span>` : ''}
        ${numberOfSeasons ? `<span>${numberOfSeasons} Stagion${numberOfSeasons > 1 ? 'i' : 'e'}</span>` : ''}
      </div>
      <div class="modal-genres">
        ${genres.map((g) => `<span>${esc(g)}</span>`).join('')}
      </div>
      <div id="modal-progress-bar"></div>
      <p class="modal-overview">${esc(overview)}</p>
    `;

    // Cast strip (credits are already in the detail payload)
    const cast = (detail.credits?.cast || []).filter(c => c.profile_path).slice(0, 12);
    if (cast.length > 0) {
      bodyHTML += `
        <div class="cast-section">
          <h3 class="cast-section-title">Cast</h3>
          <div class="cast-strip">
            ${cast.map(c => `
              <div class="cast-member">
                <img class="cast-photo" src="${getPosterUrl(c.profile_path, 'profile')}" alt="${esc(c.name)}" loading="lazy" />
                <div class="cast-name">${esc(c.name)}</div>
                ${c.character ? `<div class="cast-character">${esc(c.character)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Fetch and display watch progress for this content
    const progressProfile = getCurrentProfile();
    let activeSeasonNum = null;
    let activeEpisodeNum = 1;
    let activeStartTime = 0;
    let isMovieCompleted = false;

    if (progressProfile) {
      try {
        const progressData = await getEpisodeProgress(progressProfile.id, id);
        if (progressData && progressData.length > 0) {
          const movieProgress = progressData.find(p => !p.season && !p.episode);
          if (movieProgress && type === 'movie') {
            isMovieCompleted = movieProgress.completed;
            const pct = movieProgress.duration_seconds > 0
              ? Math.min(Math.round((movieProgress.progress_seconds / movieProgress.duration_seconds) * 100), 100)
              : 0;
            const remaining = movieProgress.duration_seconds > 0
              ? Math.max(0, Math.round((movieProgress.duration_seconds - movieProgress.progress_seconds) / 60))
              : 0;
            const label = movieProgress.completed ? '✓ Visto' : `${remaining} min rimasti`;

            setTimeout(() => {
              const progressContainer = document.getElementById('modal-progress-bar');
              if (progressContainer) {
                progressContainer.innerHTML = `
                  <div class="modal-watch-progress">
                    <div class="modal-wp-bar">
                      <div class="modal-wp-fill${movieProgress.completed ? ' modal-wp-completed' : ''}" style="width:${movieProgress.completed ? 100 : pct}%"></div>
                    </div>
                    <span class="modal-wp-label">${label}</span>
                  </div>
                `;
              }
            }, 0);

            if (!movieProgress.completed && movieProgress.progress_seconds > 30) {
              activeStartTime = movieProgress.progress_seconds;
            }
          }

          if (type === 'tv') {
            const tvProg = progressData.filter(p => p.season && p.episode);
            if (tvProg.length > 0) {
              // TV Progress is returned in PK order (season, episode ASC).
              // We must sort by updated_at DESC (if available) or fallback to highest season/episode
              tvProg.sort((a, b) => {
                if (a.updated_at && b.updated_at) {
                  return new Date(b.updated_at) - new Date(a.updated_at);
                }
                if (b.season !== a.season) return b.season - a.season;
                return b.episode - a.episode;
              });

              const last = tvProg[0];
              activeSeasonNum = last.season;
              activeEpisodeNum = last.episode;
              if (!last.completed && last.progress_seconds > 30) {
                activeStartTime = last.progress_seconds;
              }
            }
          }
        }
      } catch (err) {}

      // Prefer the instant local cache when it's further along, so reopening
      // from the modal / Continue Watching also resumes at the exact moment.
      const localPos = type === 'tv'
        ? (activeSeasonNum ? readLivePosition(progressProfile.id, 'tv', id, activeSeasonNum, activeEpisodeNum) : 0)
        : readLivePosition(progressProfile.id, 'movie', id);
      if (localPos > activeStartTime) activeStartTime = localPos;
    }

    // Trailer section
    if (trailerUrl) {
      bodyHTML += `
        <div class="trailer-section" id="trailer-section">
          <h3 class="trailer-section-title">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2"/><polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none"/></svg>
            Trailer ${trailer.iso_639_1 === 'it' ? 'Italiano' : 'Inglese'}
            <span class="trailer-lang-badge">${trailerLang}</span>
          </h3>
          <div class="trailer-player" id="trailer-player">
            <div class="trailer-placeholder" id="trailer-placeholder">
              <img src="https://img.youtube.com/vi/${trailer.key}/hqdefault.jpg" alt="Trailer ${esc(title)}" />
              <button class="trailer-play-overlay" id="trailer-play-overlay">
                <svg viewBox="0 0 68 48" width="68" height="48"><path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.64 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="#e50914"/><path d="M 45,24 27,14 27,34" fill="#fff"/></svg>
              </button>
            </div>
          </div>
          ${trailer.name ? `<p class="trailer-name">${esc(trailer.name)}</p>` : ''}
        </div>
      `;
    }

    // Player section (hidden initially for movies, shown on play)
    bodyHTML += `<div id="player-wrap" class="player-container hidden"></div>`;

    // Season/Episode selector for TV
    if (type === 'tv' && seasons.length > 0) {
      const filteredSeasons = seasons.filter(s => s.season_number > 0);
      const targetSeason = activeSeasonNum || (filteredSeasons[0] ? filteredSeasons[0].season_number : 1);
      bodyHTML += `
        <div class="season-selector" id="season-selector">
          <div class="season-tabs" id="season-tabs">
            ${filteredSeasons
              .map(
                (s) => `
              <button class="season-tab ${s.season_number === targetSeason ? 'active' : ''}" 
                      data-season="${s.season_number}" 
                      data-tv-id="${id}">
                Stagione ${s.season_number}
              </button>
            `
              )
              .join('')}
          </div>
          <div class="episode-grid" id="episode-grid">
            <div class="skeleton skeleton-text" style="width:100%;height:80px"></div>
          </div>
        </div>
      `;
    }

    // Related content. TMDB's `recommendations` and `similar` are both noisy
    // (they happily surface obscure, off-theme — even softcore — titles). We
    // pool both, then keep only titles that share a genre with this one and
    // clear a vote floor, sorted by popularity. See buildRelated().
    const similar = buildRelated(detail, type);
    if (similar.length > 0) {
      bodyHTML += `
        <div class="modal-similar">
          <h3 class="row-title" style="margin-top:32px">Ti potrebbe piacere</h3>
          <div class="row-slider">
            ${similar.map(item => {
              const p = getPosterUrl(item.poster_path);
              const n = item.title || item.name || '';
              return `
                <div class="card" data-id="${item.id}" data-type="${type}" tabindex="0">
                  <img class="card-poster" src="${p}" alt="${esc(n)}" loading="lazy" />
                  <div class="card-overlay">
                    <div class="card-title">${esc(n)}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    modalBody.innerHTML = bodyHTML;

    // Play button event
    const playBtn = $('#modal-play-btn');
    const _modalTitle = title;
    const _modalPoster = detail.poster_path;
    if (playBtn) {
      if (activeStartTime > 0) {
        playBtn.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Continua a guardare`;
      }
      playBtn.addEventListener('click', () => {
        if (type === 'tv') {
          const firstSeason = seasons.find(s => s.season_number > 0);
          const sNum = activeSeasonNum || (firstSeason ? firstSeason.season_number : 1);
          openPlayer('tv', id, sNum, activeEpisodeNum, _modalTitle, _modalPoster, activeStartTime);
        } else {
          openPlayer('movie', id, undefined, undefined, _modalTitle, _modalPoster, activeStartTime);
        }
      });
    }

    // Trailer button events
    const trailerBtn = $('#modal-trailer-btn');
    if (trailerBtn) {
      trailerBtn.addEventListener('click', () => {
        const section = $('#trailer-section');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Auto-play the trailer
        const placeholder = $('#trailer-placeholder');
        if (placeholder) {
          const playerDiv = $('#trailer-player');
          playerDiv.innerHTML = `<iframe src="${trailerUrl}" allowfullscreen allow="autoplay; encrypted-media" frameborder="0"></iframe>`;
        }
      });
    }

    // Trailer placeholder click to play
    const trailerPlayOverlay = $('#trailer-play-overlay');
    if (trailerPlayOverlay) {
      trailerPlayOverlay.addEventListener('click', () => {
        const playerDiv = $('#trailer-player');
        playerDiv.innerHTML = `<iframe src="${trailerUrl}" allowfullscreen allow="autoplay; encrypted-media" frameborder="0"></iframe>`;
      });
    }

    // Season tab events
    if (type === 'tv') {
      attachSeasonTabEvents(id);
      const firstSeason = seasons.find(s => s.season_number > 0);
      const targetSeason = activeSeasonNum || (firstSeason ? firstSeason.season_number : 1);
      if (targetSeason) {
        loadEpisodes(id, targetSeason);
      }
    }

    // Similar card events

  } catch (err) {
    console.error('Detail error:', err);
    modalBody.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">⚠️</div>
        <p class="no-results-text">Impossibile caricare i dettagli. Riprova.</p>
      </div>
    `;
  }
}

function attachSeasonTabEvents(tvId) {
  const tabs = $$('#season-tabs .season-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      loadEpisodes(tvId, parseInt(tab.dataset.season));
    });
  });
}

async function loadEpisodes(tvId, seasonNumber) {
  const grid = $('#episode-grid');
  if (!grid) return;

  grid.innerHTML = Array(6)
    .fill('<div class="skeleton" style="width:100%;height:80px;border-radius:8px"></div>')
    .join('');

  try {
    const season = await fetchSeasonDetails(tvId, seasonNumber);
    const episodes = season.episodes || [];

    if (episodes.length === 0) {
      grid.innerHTML = '<p style="color:var(--text-muted)">Nessun episodio disponibile.</p>';
      return;
    }

    // Fetch episode progress for this season
    const profile = getCurrentProfile();
    let progressMap = {};
    if (profile) {
      try {
        const progressData = await getEpisodeProgress(profile.id, tvId);
        progressData.forEach(p => {
          if (p.season === seasonNumber) {
            progressMap[p.episode] = p;
          }
        });
      } catch (e) {}
    }

    grid.innerHTML = episodes
      .map((ep) => {
        const prog = progressMap[ep.episode_number];
        let progressHTML = '';
        if (prog) {
          const pct = prog.duration_seconds > 0
            ? Math.min(Math.round((prog.progress_seconds / prog.duration_seconds) * 100), 100)
            : 0;
          const label = prog.completed ? '✓ Visto' : `${pct}%`;
          progressHTML = `
            <div class="ep-progress">
              <div class="ep-progress-bar"><div class="ep-progress-fill${prog.completed ? ' ep-completed' : ''}" style="width:${prog.completed ? 100 : pct}%"></div></div>
              <span class="ep-progress-label">${label}</span>
            </div>
          `;
        }
        return `
        <div class="episode-card${prog ? ' episode-watched' : ''}" data-tv-id="${tvId}" data-season="${seasonNumber}" data-episode="${ep.episode_number}"
             data-progress="${prog ? prog.progress_seconds : 0}" data-completed="${prog ? prog.completed : false}">
          <div class="episode-number">Episodio ${ep.episode_number}</div>
          <div class="episode-name">${esc(ep.name || `Episodio ${ep.episode_number}`)}</div>
          ${ep.overview ? `<div class="episode-overview">${esc(ep.overview)}</div>` : ''}
          ${ep.runtime ? `<div class="episode-runtime">${ep.runtime} min</div>` : ''}
          ${progressHTML}
        </div>
      `;
      })
      .join('');

    // Episode click events — read progress from data attributes (updated by refreshModalProgress)
    const _tvTitle = currentModalDetail?.title || '';
    const _tvPoster = currentModalDetail?.posterPath || '';
    $$('.episode-card').forEach((card) => {
      card.addEventListener('click', () => {
        const { tvId: tid, season: s, episode: e } = card.dataset;
        const isCompleted = card.dataset.completed === 'true';
        const startTime = (!isCompleted && parseFloat(card.dataset.progress) > 0) ? parseFloat(card.dataset.progress) : 0;
        openPlayer('tv', tid, s, e, _tvTitle, _tvPoster, startTime);
      });
    });
  } catch (err) {
    console.error('Episode load error:', err);
    grid.innerHTML = '<p style="color:var(--text-muted)">Errore nel caricamento episodi.</p>';
  }
}

// ─── Player ───────────────────────────────────────────
let playerOverlay = null;
let playerTrackingData = null; // { type, id, season, episode, title, posterPath, currentTime, duration }
let playerMessageHandler = null;
let playerAutoSaveInterval = null;

export function openPlayer(type, id, season, episode, title, posterPath, startTime) {
  const url = getEmbedUrl(type, id, season, episode, startTime);

  const wasPlaying = !!currentPlayer;   // episode switch vs fresh open
  closePlayer(false);
  currentPlayer = { type, id, season: season || null, episode: episode || null };
  // Mirror the player into the URL. Fresh open pushes a history entry so Back
  // closes the player; an episode switch replaces it (no history pile-up).
  const hash = buildHash(currentState());
  if (wasPlaying) history.replaceState({ cinema: true }, '', hash);
  else history.pushState({ cinema: true }, '', hash);

  // Block popup ads by intercepting window.open
  const origOpen = window.open;
  window.open = () => null;

  // Initialize tracking data
  playerTrackingData = {
    type, id, season: season || null, episode: episode || null,
    title: title || '', posterPath: posterPath || '',
    currentTime: 0, duration: 0,
  };

  // Auto-save every 30 seconds
  if (playerAutoSaveInterval) clearInterval(playerAutoSaveInterval);
  playerAutoSaveInterval = setInterval(() => {
    if (playerTrackingData && playerTrackingData.currentTime > 0) {
      savePlayerProgress(false);
    }
  }, 30000);
  // Auto-play state
  let _autoplayTriggered = false;
  let _autoplayInterval = null;
  let _goToNextEp = null;

  // Listen for VixSrc postMessage player events
  playerMessageHandler = (event) => {
    try {
      const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (msg?.type !== 'PLAYER_EVENT' || !msg.event) return;

      const { event: evtType, currentTime, duration } = msg.event;
      if (!playerTrackingData) return;

      // Update tracking data in memory only
      if (typeof currentTime === 'number') playerTrackingData.currentTime = currentTime;
      if (typeof duration === 'number' && duration > 0) playerTrackingData.duration = duration;

      // Mirror the live position to localStorage on every tick (throttled) so a
      // hard close/refresh never loses more than a couple of seconds.
      if (evtType === 'timeupdate') cacheLivePosition();

      // Only save to DB when the video ends
      if (evtType === 'ended') {
        savePlayerProgress(true);
      }

      // Auto-play countdown: trigger at 90s before end
      if (evtType === 'timeupdate' && _goToNextEp && !_autoplayTriggered
          && duration > 0 && (duration - currentTime) <= 90 && (duration - currentTime) > 0) {
        _autoplayTriggered = true;
        startAutoplayCountdown();
      }
    } catch (e) {
      // Ignore non-JSON messages
    }
  };
  window.addEventListener('message', playerMessageHandler);

  function startAutoplayCountdown() {
    const infoBar = playerOverlay?.querySelector('.cinema-info-bar');
    if (!infoBar) return;

    let countdown = 10;
    infoBar.innerHTML = `
      <div class="autoplay-countdown">
        <div class="autoplay-ring">
          <svg viewBox="0 0 40 40">
            <circle class="autoplay-ring-bg" cx="20" cy="20" r="17"/>
            <circle class="autoplay-ring-progress" cx="20" cy="20" r="17"/>
          </svg>
          <span class="autoplay-timer">${countdown}</span>
        </div>
        <span class="autoplay-text">Prossimo episodio</span>
        <button class="autoplay-cancel" aria-label="Annulla">✕</button>
      </div>
    `;
    infoBar.style.display = '';

    const timerEl = infoBar.querySelector('.autoplay-timer');
    const ringProgress = infoBar.querySelector('.autoplay-ring-progress');
    const cancelBtn = infoBar.querySelector('.autoplay-cancel');

    // Animate the ring
    if (ringProgress) {
      ringProgress.style.animationDuration = '10s';
    }

    _autoplayInterval = setInterval(() => {
      countdown--;
      if (timerEl) timerEl.textContent = countdown;
      if (countdown <= 0) {
        clearInterval(_autoplayInterval);
        _autoplayInterval = null;
        if (_goToNextEp) _goToNextEp();
      }
    }, 1000);

    // Cancel button
    cancelBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      clearInterval(_autoplayInterval);
      _autoplayInterval = null;
      // Restore the normal next episode button
      infoBar.innerHTML = `
        <span class="cinema-ep-label">S${season}:E${episode}</span>
        <button class="cinema-next-ep" tabindex="-1">
          <span>Prossimo episodio</span>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
        </button>
      `;
      const newNextBtn = infoBar.querySelector('.cinema-next-ep');
      newNextBtn?.addEventListener('click', () => {
        if (_goToNextEp) _goToNextEp();
      });
    });

    // Click on countdown area also advances immediately
    const countdownArea = infoBar.querySelector('.autoplay-countdown');
    countdownArea?.addEventListener('click', (e) => {
      if (e.target.closest('.autoplay-cancel')) return;
      clearInterval(_autoplayInterval);
      _autoplayInterval = null;
      if (_goToNextEp) _goToNextEp();
    });
  }

  const overlay = document.createElement('div');
  overlay.className = 'cinema-overlay';

  // Next episode button for TV shows (hidden until we verify it's not the last ep)
  const nextEpHTML = (type === 'tv' && season && episode) ? `
    <div class="cinema-info-bar" style="display:none">
      <span class="cinema-ep-label">S${season}:E${episode}</span>
      <button class="cinema-next-ep" tabindex="-1">
        <span>Prossimo episodio</span>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
      </button>
    </div>
  ` : '';

  overlay.innerHTML = `
    <div class="cinema-loader"><div class="cinema-spinner"></div></div>
    <iframe
      src="${url}"
      allowfullscreen
      webkitallowfullscreen
      mozallowfullscreen
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
      referrerpolicy="origin"
    ></iframe>
    <button class="cinema-close" tabindex="-1">✕</button>
    ${nextEpHTML}
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  playerOverlay = overlay;
  playerOverlay._origOpen = origOpen;

  // Safari fix: focus the iframe once loaded so it captures click/touch events
  const iframe = overlay.querySelector('iframe');
  if (iframe) {
    iframe.addEventListener('load', () => {
      // Hide loader
      const loader = overlay.querySelector('.cinema-loader');
      if (loader) loader.style.display = 'none';
      // Focus iframe for Safari interaction
      setTimeout(() => iframe.focus(), 100);
    });
    // Also focus on touch (Safari sometimes needs this)
    overlay.addEventListener('touchstart', (e) => {
      if (e.target === overlay) {
        iframe.focus();
      }
    }, { passive: true });
  }

  overlay.querySelector('.cinema-close').addEventListener('click', () => history.back());

  // Check if there are more episodes, then show the button
  if (type === 'tv' && season && episode) {
    const infoBar = overlay.querySelector('.cinema-info-bar');
    const nextBtn = overlay.querySelector('.cinema-next-ep');
    fetchSeasonDetails(id, season).then(seasonData => {
      const totalEps = seasonData?.episodes?.length || 0;
      const currentEp = parseInt(episode) || 0;
      if (currentEp < totalEps && infoBar) {
        infoBar.style.display = '';
        // Store the next episode function for autoplay
        _goToNextEp = () => {
          if (_autoplayInterval) clearInterval(_autoplayInterval);
          // Save progress without forcing completion (will use the 2-minute rule)
          savePlayerProgress(false);
          playerTrackingData = null;
          openPlayer(type, id, season, currentEp + 1, title, posterPath);
        };
        nextBtn?.addEventListener('click', () => _goToNextEp());
      } else if (currentEp === totalEps && infoBar) {
        // Last episode of the season. Check if there's a next season.
        fetchTVDetails(id).then(tvData => {
          const nextSeasonNum = parseInt(season) + 1;
          const hasNextSeason = tvData.seasons?.some(s => s.season_number === nextSeasonNum && s.episode_count > 0);
          if (hasNextSeason) {
            infoBar.style.display = '';
            _goToNextEp = () => {
              if (_autoplayInterval) clearInterval(_autoplayInterval);
              savePlayerProgress(false);
              playerTrackingData = null;
              openPlayer(type, id, nextSeasonNum, 1, title, posterPath);
            };
            nextBtn?.addEventListener('click', () => _goToNextEp());
          }
        }).catch(() => {});
      }
    }).catch(() => {});
  }

  requestAnimationFrame(() => overlay.classList.add('cinema-active'));
}

function savePlayerProgress(completed) {
  const profile = getCurrentProfile();
  if (!profile || !playerTrackingData) return;
  const d = playerTrackingData;

  // Completed if: explicitly marked, video ended, or within 2 minutes of end
  const isCompleted = completed || (d.duration > 0 && (d.duration - d.currentTime) <= 120);

  // Always save full progress data (time + completed flag)
  saveWatchProgress({
    profileId: profile.id,
    tmdbId: d.id,
    mediaType: d.type,
    title: d.title,
    posterPath: d.posterPath,
    season: d.season,
    episode: d.episode,
    progressSeconds: d.currentTime,
    durationSeconds: d.duration,
    completed: isCompleted,
  }).catch(err => console.warn('Watch progress save failed:', err));

  // Keep the instant local cache in sync (and clear it once finished)
  if (isCompleted) clearLivePosition(profile.id, d.type, d.id, d.season, d.episode);
  else cacheLivePosition(true);
}

// ── Instant resume cache ──────────────────────────────
// The DB only gets written every 30s, so a hard close/refresh would lose the
// last stretch. We mirror the live position into localStorage on every
// timeupdate (synchronous, survives a tab close instantly) and prefer it on
// restore. This is what guarantees "resume at the exact moment".
function posKey(profileId, type, id, season, episode) {
  let k = `kekflix:pos:${profileId}:${type}-${id}`;
  if (type === 'tv' && season) k += `-${season}-${episode}`;
  return k;
}

let _lastPosWrite = 0;
function cacheLivePosition(force = false) {
  const profile = getCurrentProfile();
  if (!profile || !playerTrackingData) return;
  const d = playerTrackingData;
  if (!(d.currentTime > 0)) return;
  const now = Date.now();
  if (!force && now - _lastPosWrite < 2000) return;  // light throttle
  _lastPosWrite = now;
  try {
    localStorage.setItem(
      posKey(profile.id, d.type, d.id, d.season, d.episode),
      JSON.stringify({ t: d.currentTime, d: d.duration, ts: now })
    );
  } catch (e) { /* storage full / disabled */ }
}

function readLivePosition(profileId, type, id, season, episode) {
  try {
    const raw = localStorage.getItem(posKey(profileId, type, id, season, episode));
    if (!raw) return 0;
    const o = JSON.parse(raw);
    if (o.d > 0 && (o.d - o.t) <= 120) return 0;   // basically finished
    return o.t > 30 ? o.t : 0;
  } catch (e) { return 0; }
}

function clearLivePosition(profileId, type, id, season, episode) {
  try { localStorage.removeItem(posKey(profileId, type, id, season, episode)); } catch (e) {}
}

// Flush the live position the instant the page is hidden or closing. localStorage
// is synchronous so it always lands; the DB save is best-effort.
function flushPlayerOnHide() {
  if (!playerTrackingData) return;
  cacheLivePosition(true);
  savePlayerProgress(false);
}
window.addEventListener('pagehide', flushPlayerOnHide);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushPlayerOnHide();
});

export function closePlayer(goBack = true) {
  currentPlayer = null;
  if (!playerOverlay) return;

  // Save final progress before closing
  if (playerTrackingData && playerTrackingData.currentTime > 0) {
    savePlayerProgress(false);
  }

  // Remove message listener
  if (playerMessageHandler) {
    window.removeEventListener('message', playerMessageHandler);
    playerMessageHandler = null;
  }
  if (playerAutoSaveInterval) {
    clearInterval(playerAutoSaveInterval);
    playerAutoSaveInterval = null;
  }
  playerTrackingData = null;

  // Restore window.open
  if (playerOverlay._origOpen) window.open = playerOverlay._origOpen;
  const iframe = playerOverlay.querySelector('iframe');
  if (iframe) iframe.src = '';
  playerOverlay.classList.add('cinema-closing');
  document.body.style.overflow = '';
  const el = playerOverlay;
  playerOverlay = null;
  setTimeout(() => el.remove(), 400);
  if (goBack && history.state?.cinema) history.back();

  // Auto-refresh the "Continue Watching" row after a short delay
  if (currentPage === 'home') {
    setTimeout(() => refreshContinueWatching(), 600);
  }

  // Auto-refresh the modal progress bar if modal is open
  if (modalOverlay.classList.contains('active')) {
    setTimeout(() => refreshModalProgress(), 600);
  }
}

async function refreshModalProgress() {
  const profile = getCurrentProfile();
  if (!profile) return;

  const playBtn = document.getElementById('modal-play-btn');
  const progressContainer = document.getElementById('modal-progress-bar');
  if (!playBtn) return;

  const tmdbId = parseInt(playBtn.dataset.id);
  const type = playBtn.dataset.type;
  if (!tmdbId) return;

  try {
    const progressData = await getEpisodeProgress(profile.id, tmdbId);
    if (!progressData || progressData.length === 0) return;

    // Movie progress
    if (type === 'movie' && progressContainer) {
      const movieProgress = progressData.find(p => !p.season && !p.episode);
      if (movieProgress) {
        const pct = movieProgress.duration_seconds > 0
          ? Math.min(Math.round((movieProgress.progress_seconds / movieProgress.duration_seconds) * 100), 100)
          : 0;
        const remaining = movieProgress.duration_seconds > 0
          ? Math.max(0, Math.round((movieProgress.duration_seconds - movieProgress.progress_seconds) / 60))
          : 0;
        const label = movieProgress.completed ? '✓ Visto' : `${remaining} min rimasti`;

        progressContainer.innerHTML = `
          <div class="modal-watch-progress">
            <div class="modal-wp-bar">
              <div class="modal-wp-fill${movieProgress.completed ? ' modal-wp-completed' : ''}" style="width:${movieProgress.completed ? 100 : pct}%"></div>
            </div>
            <span class="modal-wp-label">${label}</span>
          </div>
        `;

        if (!movieProgress.completed && movieProgress.progress_seconds > 30) {
          playBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            Continua a guardare
          `;
          playBtn.dataset.startTime = movieProgress.progress_seconds;
        }
      }
    }

    // TV: refresh episode progress bars in the grid
    if (type === 'tv') {
      const epCards = document.querySelectorAll('.episode-card');
      epCards.forEach(card => {
        const s = parseInt(card.dataset.season);
        const e = parseInt(card.dataset.episode);
        const prog = progressData.find(p => p.season === s && p.episode === e);

        // Remove old progress bar
        const oldProg = card.querySelector('.ep-progress');
        if (oldProg) oldProg.remove();
        card.classList.remove('episode-watched');

        if (prog) {
          card.classList.add('episode-watched');
          card.dataset.progress = prog.progress_seconds;
          card.dataset.completed = prog.completed;
          const pct = prog.duration_seconds > 0
            ? Math.min(Math.round((prog.progress_seconds / prog.duration_seconds) * 100), 100)
            : 0;
          const label = prog.completed ? '✓ Visto' : `${pct}%`;
          card.insertAdjacentHTML('beforeend', `
            <div class="ep-progress">
              <div class="ep-progress-bar"><div class="ep-progress-fill${prog.completed ? ' ep-completed' : ''}" style="width:${prog.completed ? 100 : pct}%"></div></div>
              <span class="ep-progress-label">${label}</span>
            </div>
          `);
        } else {
          card.dataset.progress = '0';
          card.dataset.completed = 'false';
        }
      });
    }
  } catch (err) {
    console.warn('Failed to refresh modal progress:', err);
  }
}

async function refreshContinueWatching() {
  const profile = getCurrentProfile();
  if (!profile) return;

  try {
    const cwItems = await getWatchHistory(profile.id);
    const existingRow = document.querySelector('.cw-row');

    if (cwItems && cwItems.length > 0) {
      const newRowHTML = createContinueWatchingRow(cwItems);
      if (existingRow) {
        existingRow.outerHTML = newRowHTML;
      } else {
        // Insert as first row
        contentRows.insertAdjacentHTML('afterbegin', newRowHTML);
      }
      attachRowArrows();
      observeFadeIns();
    } else if (existingRow) {
      existingRow.remove();
    }
  } catch (err) {
    console.warn('Failed to refresh continue watching:', err);
  }
}

export function isPlayerOpen() { return !!playerOverlay; }
// Browser Back / Forward is handled by the router's popstate listener
// (startRouter), which reconciles the whole UI to the URL.

// ─── Modal Close ──────────────────────────────────────
export function closeModal() {
  modalOverlay.classList.remove('active');
  currentModal = null;
  writeRoute();
  // Restore scroll position
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.overflow = '';
  window.scrollTo(0, savedScrollY);
  // Stop any playing video
  const iframe = modal.querySelector('iframe');
  if (iframe) iframe.src = '';
  setTimeout(() => {
    modalBackdropWrap.innerHTML = '';
    modalBody.innerHTML = '';
  }, 300);
}

// Escape closes (in priority order): cinema player → modal → search
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (playerOverlay) {
    e.preventDefault();
    history.back();
  } else if (modalOverlay.classList.contains('active')) {
    closeModal();
  } else if (isSearchOpen()) {
    closeSearch();
    $('#search-input').value = '';
  }
});

// TV remote "back" from tv-nav.js
document.addEventListener('close-player', () => closePlayer());

// ─── Card Click Events (delegated) ───────────────────
// One listener handles every card on the page — including those added
// later by "load more" / search / similar — without re-binding.
document.addEventListener('click', (e) => {
  if (!(e.target instanceof Element)) return;

  // Continue-watching: play button → resume directly in player
  const cwPlay = e.target.closest('.cw-play-btn');
  if (cwPlay) {
    const card = cwPlay.closest('.cw-card');
    if (!card) return;
    const season = card.dataset.season ? parseInt(card.dataset.season) : undefined;
    const episode = card.dataset.episode ? parseInt(card.dataset.episode) : undefined;
    const startTime = parseFloat(card.dataset.progress) || 0;
    openPlayer(card.dataset.type, parseInt(card.dataset.id), season, episode, card.dataset.title, card.dataset.poster, startTime);
    return;
  }

  // Continue-watching: remove button
  const cwRemove = e.target.closest('.cw-remove-btn');
  if (cwRemove) {
    const card = cwRemove.closest('.cw-card');
    if (card) handleCwRemove(cwRemove, card);
    return;
  }

  // Any poster card → open detail modal
  const card = e.target.closest('.card[data-id]');
  if (card) {
    openDetail(parseInt(card.dataset.id), card.dataset.type || 'movie');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !(e.target instanceof Element)) return;
  const card = e.target.closest('.card[data-id]');
  if (card) card.click();
});

// ─── Row Horizontal Scroll Arrows ────────────────────
function attachRowArrows() {
  $$('.row-slider-wrap').forEach((wrap) => {
    const slider = wrap.querySelector('.row-slider');
    const leftBtn = wrap.querySelector('.row-arrow-left');
    const rightBtn = wrap.querySelector('.row-arrow-right');

    if (!slider || !leftBtn || !rightBtn) return;

    const scrollAmount = () => slider.clientWidth * 0.75;

    leftBtn.addEventListener('click', () => {
      slider.scrollBy({ left: -scrollAmount(), behavior: 'smooth' });
    });

    rightBtn.addEventListener('click', () => {
      slider.scrollBy({ left: scrollAmount(), behavior: 'smooth' });
    });

    // Show/hide arrows based on scroll position
    const updateArrows = () => {
      leftBtn.classList.toggle('hidden', slider.scrollLeft <= 10);
      rightBtn.classList.toggle(
        'hidden',
        slider.scrollLeft + slider.clientWidth >= slider.scrollWidth - 10
      );
    };

    slider.addEventListener('scroll', updateArrows, { passive: true });
    updateArrows();
  });
}

// ─── Intersection Observer for Fade-in ────────────────
function observeFadeIns() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '50px' }
  );

  $$('.fade-in').forEach((el) => observer.observe(el));
}

// ─── Navbar Scroll Effect ─────────────────────────────
export function initNavbarScroll() {
  const navbar = $('#navbar');
  window.addEventListener(
    'scroll',
    () => {
      navbar.classList.toggle('scrolled', window.scrollY > 50);
    },
    { passive: true }
  );
}

// ─── Routing (hash-based state persistence) ───────────
// The full UI state — page, active filter, open modal, playing title — is
// mirrored into location.hash so a refresh (or a shared link) restores exactly
// where the user was. Base/filter/modal use replaceState (no extra history);
// the player uses pushState so the Back button closes it.
let routeSyncing = false;   // true while applyRoute() mutates the UI
let routeInitialized = false;

function serializeFilter(f) {
  if (!f) return '';
  if (f.isCompany) return 'c' + f.ids;            // ids = pipe-joined string
  if (f.id === 'new-releases') return 'new';
  if (typeof f.id === 'number') return 'g' + f.id;
  return '';
}

function serializePlay(p) {
  if (!p) return '';
  let v = `${p.type}-${p.id}`;
  if (p.type === 'tv' && p.season) v += `-${p.season}-${p.episode}`;
  return v;
}

function buildHash(state) {
  const q = new URLSearchParams();
  if (state.page && state.page !== 'home') q.set('page', state.page);
  if (state.filter) q.set('f', state.filter);
  if (state.modal) q.set('modal', state.modal);
  if (state.play) q.set('play', state.play);
  const s = q.toString();
  return s ? '#?' + s : '#';
}

function currentState() {
  return {
    page: currentPage,
    filter: serializeFilter(activeGenreFilter),
    modal: currentModal ? `${currentModal.type}-${currentModal.id}` : null,
    play: serializePlay(currentPlayer) || null,
  };
}

function writeRoute() {
  if (routeSyncing) return;
  const hash = buildHash(currentState());
  if (hash === (location.hash || '#')) return;
  history.replaceState(null, '', hash);
}

function setActiveNav(page) {
  $$('#nav-links a').forEach((l) => l.classList.toggle('active', l.dataset.page === page));
}

function lookupCompanyName(ids, mediaType) {
  const list = mediaType === 'tv' ? TV_COMPANY_LIST : COMPANY_LIST;
  const found = list.find((c) => c.ids.join('|') === ids);
  return found ? found.name : 'Studio';
}

function setActivePill(f) {
  const bar = $('#genre-filter-bar');
  if (!bar) return;
  bar.querySelectorAll('.genre-pill, .company-pill').forEach((p) => p.classList.remove('active'));
  if (!f) {
    bar.querySelector('.genre-pill[data-genre-id="all"]')?.classList.add('active');
  } else if (f.isCompany) {
    bar.querySelector(`.company-pill[data-company-ids="${f.ids}"]`)?.classList.add('active');
  } else if (f.id === 'new-releases') {
    bar.querySelector('.genre-pill[data-genre-id="new-releases"]')?.classList.add('active');
  } else {
    bar.querySelector(`.genre-pill[data-genre-id="${f.id}"]`)?.classList.add('active');
  }
}

async function applyFilterRender(mediaType, f) {
  if (f === 'new') {
    activeGenreFilter = { id: 'new-releases', type: mediaType };
    await renderNewReleasesGrid(mediaType);
  } else if (f[0] === 'g') {
    const id = parseInt(f.slice(1));
    activeGenreFilter = { id, type: mediaType };
    await renderGenreGrid(id, mediaType);
  } else if (f[0] === 'c') {
    const ids = f.slice(1);
    activeGenreFilter = { ids, type: mediaType, isCompany: true };
    await renderCompanyGrid(ids, lookupCompanyName(ids, mediaType), mediaType);
  }
  setActivePill(activeGenreFilter);
}

async function restoreBase(page, f) {
  setActiveNav(page);
  if (page === 'movies' || page === 'tv') {
    const mediaType = page === 'movies' ? 'movie' : 'tv';
    if (f) {
      // Filtered grid: render the filter bar fresh, then the grid
      currentPage = page;
      activeGenreFilter = null;
      heroSection.classList.add('hidden');
      contentRows.innerHTML = '';
      await applyFilterRender(mediaType, f);
    } else if (page === 'movies') {
      await renderMoviesPage();
    } else {
      await renderTVPage();
    }
  } else {
    activeGenreFilter = null;
    await renderHomePage();
  }
}

async function getResumeInfo(type, id, season, episode) {
  let title = '', poster = '', startTime = 0;
  try {
    const detail = type === 'tv' ? await fetchTVDetails(id) : await fetchMovieDetails(id);
    title = detail.title || detail.name || '';
    poster = detail.poster_path || '';
    const profile = getCurrentProfile();
    if (profile) {
      const prog = await getEpisodeProgress(profile.id, id);
      if (prog && prog.length) {
        const rec = (type === 'tv' && season && episode)
          ? prog.find((p) => p.season === season && p.episode === episode)
          : prog.find((p) => !p.season && !p.episode);
        if (rec && !rec.completed && rec.progress_seconds > 30) startTime = rec.progress_seconds;
      }
      // The local cache is more up-to-date than the DB after a hard close
      const local = readLivePosition(profile.id, type, id, season, episode);
      if (local > startTime) startTime = local;
    }
  } catch (e) { /* best-effort */ }
  return { title, poster, startTime };
}

async function restorePlayer(playStr) {
  const parts = playStr.split('-');
  const type = parts[0];
  const id = parseInt(parts[1]);
  const season = parts[2] ? parseInt(parts[2]) : undefined;
  const episode = parts[3] ? parseInt(parts[3]) : undefined;
  // Rebuild a base history entry (without play) so the player's Back/✕ has
  // somewhere to return to even right after a hard refresh.
  history.replaceState(null, '', buildHash({ ...currentState(), play: null }));
  const { title, poster, startTime } = await getResumeInfo(type, id, season, episode);
  openPlayer(type, id, season, episode, title, poster, startTime);
}

async function applyRoute() {
  if (routeSyncing) return;
  routeSyncing = true;
  try {
    const q = new URLSearchParams((location.hash || '').replace(/^#\??/, ''));
    const page = q.get('page') || 'home';
    const f = q.get('f') || '';
    const modal = q.get('modal');
    const play = q.get('play');

    // 1. Base page + filter — only re-render if it actually changed
    if (!routeInitialized || page !== currentPage || f !== serializeFilter(activeGenreFilter)) {
      await restoreBase(page, f);
    }

    // 2. Detail modal
    const mCur = currentModal ? `${currentModal.type}-${currentModal.id}` : null;
    if (modal !== mCur) {
      if (modal) {
        const dash = modal.indexOf('-');
        await openDetail(parseInt(modal.slice(dash + 1)), modal.slice(0, dash));
      } else if (currentModal) {
        closeModal();
      }
    }

    // 3. Player
    const pCur = serializePlay(currentPlayer) || null;
    if (play !== pCur) {
      if (play) await restorePlayer(play);
      else if (currentPlayer) closePlayer(false);
    }
  } catch (e) {
    console.error('Route restore failed:', e);
  } finally {
    routeInitialized = true;
    routeSyncing = false;
  }
}

// Entry point called once after the app is authenticated
export async function startRouter() {
  window.addEventListener('popstate', () => { applyRoute(); });
  window.addEventListener('hashchange', () => { applyRoute(); });
  await applyRoute();
}

// ─── Navigation ───────────────────────────────────────
export function initNavigation() {
  const links = $$('#nav-links a');

  links.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      if (page === currentPage && !isSearchOpen()) return;

      // Close search if open
      closeSearch();
      $('#search-input').value = '';

      links.forEach((l) => l.classList.remove('active'));
      link.classList.add('active');

      navigateTo(page);
    });
  });

  // Logo click = home
  $('#nav-brand').addEventListener('click', (e) => {
    e.preventDefault();
    closeSearch();
    $('#search-input').value = '';
    links.forEach((l) => l.classList.remove('active'));
    $('#nav-home').classList.add('active');
    navigateTo('home');
  });
}

async function navigateTo(page) {
  currentPage = page;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  switch (page) {
    case 'home':
      await renderHomePage();
      break;
    case 'movies':
      await renderMoviesPage();
      break;
    case 'tv':
      await renderTVPage();
      break;
  }
  writeRoute();
}

// ─── Modal Events ─────────────────────────────────────
// Escape handling is centralized in the module-scope keydown listener above
export function initModalEvents() {
  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
}
