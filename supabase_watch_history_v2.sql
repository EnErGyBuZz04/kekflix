-- =============================================
-- Kekflix: Aggiornamento Watch History
-- Un solo record per serie TV per profilo
-- Esegui nell'SQL Editor di Supabase
-- =============================================

-- 1. Rimuovi il vecchio indice unique (per-episodio)
DROP INDEX IF EXISTS idx_watch_history_unique;

-- 2. Se ci sono duplicati (stesso profilo+serie), tieni solo il più recente
DELETE FROM public.watch_history a
USING public.watch_history b
WHERE a.profile_id = b.profile_id
  AND a.tmdb_id = b.tmdb_id
  AND a.media_type = b.media_type
  AND a.last_watched_at < b.last_watched_at;

-- 3. Nuovo indice unique: un solo record per profilo + contenuto
CREATE UNIQUE INDEX idx_watch_history_unique
  ON public.watch_history (profile_id, tmdb_id, media_type);

-- 4. Aggiorna la funzione upsert (sovrascrive season/episode)
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
  ON CONFLICT (profile_id, tmdb_id, media_type)
  DO UPDATE SET
    title = EXCLUDED.title,
    poster_path = EXCLUDED.poster_path,
    season = EXCLUDED.season,
    episode = EXCLUDED.episode,
    progress_seconds = EXCLUDED.progress_seconds,
    duration_seconds = EXCLUDED.duration_seconds,
    completed = EXCLUDED.completed,
    last_watched_at = now();
END;
$$;

-- 5. Nuova funzione: elimina il record (quando completato)
CREATE OR REPLACE FUNCTION public.delete_watch_progress(
  p_profile_id uuid,
  p_tmdb_id integer,
  p_media_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.watch_history
  WHERE profile_id = p_profile_id
    AND tmdb_id = p_tmdb_id
    AND media_type = p_media_type;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_watch_progress(uuid, integer, text) TO anon;

-- 6. Aggiorna get_watch_history (rimuovi filtro completed, ora si elimina)
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
  SELECT
    wh.id, wh.tmdb_id, wh.media_type, wh.title, wh.poster_path,
    wh.season, wh.episode, wh.progress_seconds, wh.duration_seconds,
    wh.completed, wh.last_watched_at
  FROM public.watch_history wh
  WHERE wh.profile_id = p_profile_id
    AND wh.progress_seconds > 30
  ORDER BY wh.last_watched_at DESC
  LIMIT 20;
END;
$$;
