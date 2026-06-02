-- =============================================
-- Kekflix: Sistema "Continua a Guardare"
-- Esegui questo SQL nell'SQL Editor di Supabase Dashboard
-- Progetto: nimtzcwdnmalqgqxpofv
-- =============================================

-- 1. Tabella watch_history
CREATE TABLE public.watch_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tmdb_id integer NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title text NOT NULL DEFAULT '',
  poster_path text,
  season integer,
  episode integer,
  progress_seconds real NOT NULL DEFAULT 0,
  duration_seconds real NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  last_watched_at timestamptz NOT NULL DEFAULT now()
);

-- Unique index con COALESCE (funziona come constraint ma supporta espressioni)
CREATE UNIQUE INDEX idx_watch_history_unique
  ON public.watch_history (profile_id, tmdb_id, media_type, COALESCE(season, -1), COALESCE(episode, -1));

-- Index per query veloci
CREATE INDEX idx_watch_history_profile ON public.watch_history(profile_id, last_watched_at DESC);

-- 2. Abilita RLS
ALTER TABLE public.watch_history ENABLE ROW LEVEL SECURITY;

-- Blocca accesso diretto per anon (usiamo solo RPC)
CREATE POLICY "Block direct anon access" ON public.watch_history
  FOR ALL
  TO anon
  USING (false);

-- 3. RPC: Inserisci o aggiorna il progresso di visione
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

GRANT EXECUTE ON FUNCTION public.upsert_watch_progress(uuid, integer, text, text, text, integer, integer, real, real, boolean) TO anon;

-- 4. RPC: Recupera la cronologia di visione (non completati, ordinati per ultimo guardato)
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
    AND wh.completed = false
    AND wh.progress_seconds > 30
  ORDER BY wh.last_watched_at DESC
  LIMIT 20;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_watch_history(uuid) TO anon;

-- 5. RPC: Segna come completato (rimuovi dalla lista "continua a guardare")
CREATE OR REPLACE FUNCTION public.mark_completed(
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

GRANT EXECUTE ON FUNCTION public.mark_completed(uuid, integer, text, integer, integer) TO anon;
