-- =============================================
-- Kekflix: Watch History v4
-- Fix "Continua a guardare" per le serie TV:
--   • l'episodio finito non fa più sparire la serie (il client propone il successivo)
--   • un episodio appena aperto (progress 0) non fa più sparire la serie
--   • rimozione dal carosello via `dismissed`, non più via `completed`
-- Esegui nell'SQL Editor di Supabase
-- =============================================

-- 1. Flag di rimozione esplicita dal carosello (la X sulla card)
ALTER TABLE public.watch_history
  ADD COLUMN IF NOT EXISTS dismissed boolean NOT NULL DEFAULT false;

-- 2. Upsert: riprendere a guardare riporta il titolo nel carosello
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
    completed, dismissed, last_watched_at
  ) VALUES (
    p_profile_id, p_tmdb_id, p_media_type, p_title, p_poster_path,
    p_season, p_episode, p_progress_seconds, p_duration_seconds,
    p_completed, false, now()
  )
  ON CONFLICT (profile_id, tmdb_id, media_type, COALESCE(season, -1), COALESCE(episode, -1))
  DO UPDATE SET
    title = EXCLUDED.title,
    poster_path = EXCLUDED.poster_path,
    progress_seconds = EXCLUDED.progress_seconds,
    duration_seconds = EXCLUDED.duration_seconds,
    completed = EXCLUDED.completed,
    dismissed = false,
    last_watched_at = now();
END;
$$;

-- 3. "Continua a guardare"
--    Serie TV: sempre l'ultima riga toccata, anche se l'episodio è completato
--    (il client risolve l'episodio successivo via TMDB e scarta la serie finita).
--    Film: solo se non completati e oltre i 30 secondi, come prima.
DROP FUNCTION IF EXISTS public.get_watch_history(uuid);

CREATE FUNCTION public.get_watch_history(p_profile_id uuid)
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
      AND wh.dismissed = false
      AND (
        wh.media_type = 'tv'
        OR (wh.completed = false AND wh.progress_seconds > 30)
      )
    ORDER BY wh.tmdb_id, wh.media_type, wh.last_watched_at DESC
  ) sub
  ORDER BY sub.last_watched_at DESC
  LIMIT 20;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_watch_history(uuid) TO anon, authenticated, service_role;

-- 4. Rimozione dal carosello (la X): nasconde l'intero titolo senza
--    falsare i progressi già salvati.
CREATE OR REPLACE FUNCTION public.dismiss_from_continue_watching(
  p_profile_id uuid,
  p_tmdb_id integer,
  p_media_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.watch_history
  SET dismissed = true
  WHERE profile_id = p_profile_id
    AND tmdb_id = p_tmdb_id
    AND media_type = p_media_type;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dismiss_from_continue_watching(uuid, integer, text) TO anon, authenticated, service_role;
