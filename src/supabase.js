import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nimtzcwdnmalqgqxpofv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pbXR6Y3dkbm1hbHFncXhwb2Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDc5MTEsImV4cCI6MjA5NTkyMzkxMX0.UzX9Cx7u7UxtjDr0xFmfKlszMDpNm0XuMN8DX2GN6jc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PROFILE_STORAGE_KEY = 'kekflix_profile';

/**
 * Fetch all profiles (public view — no PIN exposed)
 */
export async function fetchProfiles() {
  const { data, error } = await supabase
    .from('profiles_public')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching profiles:', error);
    throw error;
  }
  return data || [];
}

/**
 * Verify a PIN for a given profile via server-side RPC
 * @returns {boolean} true if PIN is correct
 */
export async function verifyPin(profileId, pin) {
  const { data, error } = await supabase
    .rpc('verify_pin', {
      p_profile_id: profileId,
      p_pin: pin,
    });

  if (error) {
    console.error('PIN verification error:', error);
    return false;
  }
  return data === true;
}

/**
 * Save the current profile session to localStorage
 */
export function saveProfileSession(profile) {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({
    id: profile.id,
    name: profile.name,
    avatar_color: profile.avatar_color,
    loginAt: Date.now(),
  }));
}

/**
 * Get the current profile from localStorage (null if not logged in)
 */
export function getCurrentProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Clear the profile session (logout)
 */
export function logout() {
  localStorage.removeItem(PROFILE_STORAGE_KEY);
}

// ─── Watch History ────────────────────────────────────

/**
 * Save or update watch progress for a content item
 */
export async function saveWatchProgress({
  profileId, tmdbId, mediaType, title, posterPath,
  season = null, episode = null,
  progressSeconds = 0, durationSeconds = 0, completed = false,
}) {
  const { error } = await supabase.rpc('upsert_watch_progress', {
    p_profile_id: profileId,
    p_tmdb_id: tmdbId,
    p_media_type: mediaType,
    p_title: title,
    p_poster_path: posterPath,
    p_season: season,
    p_episode: episode,
    p_progress_seconds: progressSeconds,
    p_duration_seconds: durationSeconds,
    p_completed: completed,
  });

  if (error) {
    console.error('Save watch progress error:', error);
  }
}

/**
 * Get the "continue watching" list for a profile (incomplete items, >30s watched)
 */
export async function getWatchHistory(profileId) {
  const { data, error } = await supabase.rpc('get_watch_history', {
    p_profile_id: profileId,
  });

  if (error) {
    console.error('Get watch history error:', error);
    return [];
  }
  return data || [];
}

/**
 * Mark a specific episode/movie as completed (stays in DB for progress bars, removed from CW)
 */
export async function markWatchCompleted(profileId, tmdbId, mediaType, season = null, episode = null) {
  const { error } = await supabase.rpc('mark_watch_completed', {
    p_profile_id: profileId,
    p_tmdb_id: tmdbId,
    p_media_type: mediaType,
    p_season: season,
    p_episode: episode,
  });

  if (error) {
    console.error('Mark watch completed error:', error);
  }
}

/**
 * Get all episode progress for a specific show/movie (for modal progress bars)
 */
export async function getEpisodeProgress(profileId, tmdbId) {
  const { data, error } = await supabase.rpc('get_episode_progress', {
    p_profile_id: profileId,
    p_tmdb_id: tmdbId,
  });

  if (error) {
    console.error('Get episode progress error:', error);
    return [];
  }
  return data || [];
}
