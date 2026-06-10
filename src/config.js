export const CONFIG = {
  TMDB_API_KEY: 'ecda8e3726dbb67468e9d7492faf0c25',
  TMDB_TOKEN: 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlY2RhOGUzNzI2ZGJiNjc0NjhlOWQ3NDkyZmFmMGMyNSIsIm5iZiI6MTc4MDI0OTM5My4zNjQsInN1YiI6IjZhMWM3MzMxOTVlYzU1ZDJlNDA4YzA4NyIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.4cuqECzpsrb8h5c4UyUr_m6G4z58tHisqwQpUsBiWnQ',
  TMDB_BASE: 'https://api.themoviedb.org/3',
  TMDB_IMG: 'https://image.tmdb.org/t/p',
  VIXSRC_BASE: 'https://vixsrc.to',
  LANG: 'it-IT',
  PLAYER_COLORS: {
    primary: 'E50914',
    secondary: '8B0000',
  },
};

export const IMG_SIZES = {
  poster: '/w342',
  posterLg: '/w500',
  backdrop: '/w1280',
  backdropSm: '/w780',
  profile: '/w185',
};

// Movie genres (TMDB IDs)
export const GENRES_MAP = {
  28: 'Azione',
  12: 'Avventura',
  16: 'Animazione',
  35: 'Commedia',
  80: 'Crime',
  99: 'Documentario',
  18: 'Dramma',
  10751: 'Famiglia',
  14: 'Fantasy',
  36: 'Storia',
  27: 'Horror',
  10402: 'Musica',
  9648: 'Mistero',
  10749: 'Romantico',
  878: 'Fantascienza',
  10770: 'Film TV',
  53: 'Thriller',
  10752: 'Guerra',
  37: 'Western',
};

// TV genres (TMDB IDs) — some overlap with movies, some are TV-specific
export const TV_GENRES_MAP = {
  10759: 'Azione & Avventura',
  16: 'Animazione',
  35: 'Commedia',
  80: 'Crime',
  99: 'Documentario',
  18: 'Dramma',
  10751: 'Famiglia',
  10762: 'Kids',
  9648: 'Mistero',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10768: 'Guerra & Politica',
  37: 'Western',
};

// Ordered genre lists for filter bars
export const MOVIE_GENRE_LIST = [
  { id: 28, name: 'Azione' },
  { id: 12, name: 'Avventura' },
  { id: 16, name: 'Animazione' },
  { id: 35, name: 'Commedia' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentario' },
  { id: 18, name: 'Dramma' },
  { id: 10751, name: 'Famiglia' },
  { id: 14, name: 'Fantasy' },
  { id: 27, name: 'Horror' },
  { id: 9648, name: 'Mistero' },
  { id: 10749, name: 'Romantico' },
  { id: 878, name: 'Fantascienza' },
  { id: 53, name: 'Thriller' },
  { id: 10752, name: 'Guerra' },
  { id: 37, name: 'Western' },
];

export const TV_GENRE_LIST = [
  { id: 10759, name: 'Azione & Avventura' },
  { id: 16, name: 'Animazione' },
  { id: 35, name: 'Commedia' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentario' },
  { id: 18, name: 'Dramma' },
  { id: 10751, name: 'Famiglia' },
  { id: 10762, name: 'Kids' },
  { id: 9648, name: 'Mistero' },
  { id: 10764, name: 'Reality' },
  { id: 10765, name: 'Sci-Fi & Fantasy' },
  { id: 10768, name: 'Guerra & Politica' },
  { id: 37, name: 'Western' },
];

// Genre IDs to feature as row categories on homepage
export const FEATURED_GENRES = [28, 35, 27, 878, 10749, 18, 16, 12];

// Production companies (TMDB company IDs)
// `ids` is an array — they get joined with | (OR) in the TMDB discover API
export const COMPANY_LIST = [
  { ids: [420, 7505, 19551, 38679], name: 'Marvel' },
  { ids: [429, 9993, 128064], name: 'DC' },
  { ids: [2, 3166], name: 'Disney' },
  { ids: [3], name: 'Pixar' },
  { ids: [174], name: 'Warner Bros.' },
  { ids: [33], name: 'Universal' },
  { ids: [25, 127928], name: '20th Century' },
  { ids: [34, 5], name: 'Sony / Columbia' },
  { ids: [4], name: 'Paramount' },
  { ids: [1], name: 'Lucasfilm' },
  { ids: [521, 7], name: 'DreamWorks' },
  { ids: [10342], name: 'Studio Ghibli' },
  { ids: [41077], name: 'A24' },
  { ids: [1632], name: 'Lionsgate' },
  { ids: [8411, 21], name: 'MGM' },
  { ids: [11461, 923], name: 'Blumhouse' },
];

export const TV_COMPANY_LIST = [
  { ids: [420, 7505, 19551, 38679], name: 'Marvel' },
  { ids: [429, 9993, 128064], name: 'DC' },
  { ids: [2, 3166], name: 'Disney' },
  { ids: [1], name: 'Lucasfilm' },
  { ids: [174], name: 'Warner Bros.' },
  { ids: [76043, 3268], name: 'HBO' },
  { ids: [2739], name: 'BBC' },
  { ids: [41077], name: 'A24' },
  { ids: [4], name: 'Paramount' },
  { ids: [33], name: 'Universal TV' },
  { ids: [10342], name: 'Studio Ghibli' },
  { ids: [1081], name: 'Lionsgate' },
];
