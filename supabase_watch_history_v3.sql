-- =============================================
-- Kekflix: Watch History v3
-- Progressi per-episodio + "Continua a guardare" smart
-- Esegui nell'SQL Editor di Supabase
-- =============================================

-- 1. Rimuovi il vecchio indice unique
DROP INDEX IF EXISTS idx_watch_history_unique;

-- 2. Nuovo indice unique per-episodio
CREATE UNIQUE INDEX idx_watch_history_unique
  ON public.watch_history (profile_id, tmdb_id, media_type, COALESCE(season, -1), COALESCE(episode, -1));

-- 3. Aggiorna upsert (per-episodio, aggiorna season/episode nel conflict)
CREATE OR REPLACE FUNCTION public.upsert_watch_progress(
  p_profile_id uuid,
  p_tmdb_id integer,
  p_media_type text,
  p_title text,
  p_poster_path text,
  p_season integer DEFAULT NULL,
  p_episode integer DEFAULT NULL,
  p_progress_seconds real DEFAULT 0,
  p_duration_seconds real DEFAULT 0,
  p_completed boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.watch_history (
    profile_id, tmdb_id, media_type, title, poster_path,
    season, episode, progress_seconds, duration_seconds,
    completed, last_watched_at
  ) VALUES (
    p_profile_id, p_tmdb_id, p_media_type, p_title, p_poster_path,
    p_season, p_episode, p_progress_seconds, p_duration_seconds,
    p_completed, now()
  )
  ON CONFLICT (profile_id, tmdb_id, media_type, COALESCE(season, -1), COALESCE(episode, -1))
  DO UPDATE SET
    title = EXCLUDED.title,
    poster_path = EXCLUDED.poster_path,
    progress_seconds = EXCLUDED.progress_seconds,
    duration_seconds = EXCLUDED.duration_seconds,
    completed = EXCLUDED.completed,
    last_watched_at = now();
END;
$$;

-- 4. "Continua a guardare": ultimo episodio non completato per serie (DISTINCT ON)
CREATE OR REPLACE FUNCTION public.get_watch_history(p_profile_id uuid)
RETURNS TABLE (
  id uuid,
  tmdb_id integer,
  media_type text,
  title text,
  poster_path text,
  season integer,
  episode integer,
  progress_seconds real,
  duration_seconds real,
  completed boolean,
  last_watched_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM (
    SELECT DISTINCT ON (wh.tmdb_id, wh.media_type)
      wh.id, wh.tmdb_id, wh.media_type, wh.title, wh.poster_path,
      wh.season, wh.episode, wh.progress_seconds, wh.duration_seconds,
      wh.completed, wh.last_watched_at
    FROM public.watch_history wh
    WHERE wh.profile_id = p_profile_id
      AND wh.completed = false
      AND wh.progress_seconds > 30
    ORDER BY wh.tmdb_id, wh.media_type, wh.last_watched_at DESC
  ) sub
  ORDER BY sub.last_watched_at DESC
  LIMIT 20;
END;
$$;

-- 5. Progressi episodi per la modal (tutti gli episodi guardati di una serie)
CREATE OR REPLACE FUNCTION public.get_episode_progress(
  p_profile_id uuid,
  p_tmdb_id integer
)
RETURNS TABLE (
  season integer,
  episode integer,
  progress_seconds real,
  duration_seconds real,
  completed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT wh.season, wh.episode, wh.progress_seconds, wh.duration_seconds, wh.completed
  FROM public.watch_history wh
  WHERE wh.profile_id = p_profile_id
    AND wh.tmdb_id = p_tmdb_id
    AND wh.progress_seconds > 0
  ORDER BY wh.season, wh.episode;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_episode_progress(uuid, integer) TO anon;

-- 6. Segna come completato (per il tasto rimuovi e auto-complete)
CREATE OR REPLACE FUNCTION public.mark_watch_completed(
  p_profile_id uuid,
  p_tmdb_id integer,
  p_media_type text,
  p_season integer DEFAULT NULL,
  p_episode integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.watch_history
  SET completed = true
  WHERE profile_id = p_profile_id
    AND tmdb_id = p_tmdb_id
    AND media_type = p_media_type
    AND COALESCE(season, -1) = COALESCE(p_season, -1)
    AND COALESCE(episode, -1) = COALESCE(p_episode, -1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_watch_completed(uuid, integer, text, integer, integer) TO anon;

-- 7. Rimuovi la vecchia delete_watch_progress se esiste
DROP FUNCTION IF EXISTS public.delete_watch_progress(uuid, integer, text);
-- Rimuovi la vecchia mark_completed se esiste
DROP FUNCTION IF EXISTS public.mark_completed(uuid, integer, text, integer, integer);
