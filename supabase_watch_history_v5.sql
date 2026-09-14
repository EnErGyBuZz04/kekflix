-- =============================================
-- Kekflix: Watch History v5
--   • "finito" non è più "mancano 2 minuti": i titoli di coda contano come fine
--   • possibilità di togliere un titolo da "Guardati di recente"
-- Esegui nell'SQL Editor di Supabase
-- =============================================

-- 1. Regola unica di "finito", usata da tutte le query.
--    Un film di 105' con 7' di titoli di coda è finito; un episodio di 25'
--    lo è quando mancano 2 minuti. Da qui: l'8% della durata, mai meno di
--    2 minuti e mai più di 10 (per i film molto lunghi).
CREATE OR REPLACE FUNCTION public.is_watch_finished(
  p_progress real,
  p_duration real,
  p_completed boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_completed, false)
      OR (
        COALESCE(p_duration, 0) > 0
        AND (p_duration - COALESCE(p_progress, 0)) <= GREATEST(120, LEAST(p_duration * 0.08, 600))
      );
$$;

GRANT EXECUTE ON FUNCTION public.is_watch_finished(real, real, boolean) TO anon, authenticated, service_role;

-- 2. Nascondi un titolo da "Guardati di recente" (la X sulla card)
ALTER TABLE public.watch_history
  ADD COLUMN IF NOT EXISTS hidden_from_recent boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.hide_from_recently_watched(
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
  SET hidden_from_recent = true
  WHERE profile_id = p_profile_id
    AND tmdb_id = p_tmdb_id
    AND media_type = p_media_type;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hide_from_recently_watched(uuid, integer, text) TO anon, authenticated, service_role;

-- 3. Riguardare un titolo lo riporta in entrambe le sezioni
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
    completed, dismissed, hidden_from_recent, last_watched_at
  ) VALUES (
    p_profile_id, p_tmdb_id, p_media_type, p_title, p_poster_path,
    p_season, p_episode, p_progress_seconds, p_duration_seconds,
    p_completed, false, false, now()
  )
  ON CONFLICT (profile_id, tmdb_id, media_type, COALESCE(season, -1), COALESCE(episode, -1))
  DO UPDATE SET
    title = EXCLUDED.title,
    poster_path = EXCLUDED.poster_path,
    progress_seconds = EXCLUDED.progress_seconds,
    duration_seconds = EXCLUDED.duration_seconds,
    completed = EXCLUDED.completed,
    dismissed = false,
    hidden_from_recent = false,
    last_watched_at = now();
END;
$$;

-- 4. "Continua a guardare" con la nuova regola di fine visione
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
      public.is_watch_finished(wh.progress_seconds, wh.duration_seconds, wh.completed) AS completed,
      wh.last_watched_at
    FROM public.watch_history wh
    WHERE wh.profile_id = p_profile_id
      AND wh.dismissed = false
      AND (
        -- serie: sempre l'ultima riga, il client risolve l'episodio successivo
        wh.media_type = 'tv'
        -- film: solo se davvero a metà
        OR (
          NOT public.is_watch_finished(wh.progress_seconds, wh.duration_seconds, wh.completed)
          AND wh.progress_seconds > 30
        )
      )
    ORDER BY wh.tmdb_id, wh.media_type, wh.last_watched_at DESC
  ) sub
  ORDER BY sub.last_watched_at DESC
  LIMIT 20;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_watch_history(uuid) TO anon, authenticated, service_role;

-- 5. "Guardati di recente": stessa regola + rispetta la X
CREATE OR REPLACE FUNCTION public.get_recently_watched(p_profile_id uuid)
RETURNS TABLE (
  tmdb_id integer,
  media_type text,
  title text,
  poster_path text,
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
      wh.tmdb_id, wh.media_type, wh.title, wh.poster_path,
      public.is_watch_finished(wh.progress_seconds, wh.duration_seconds, wh.completed) AS completed,
      wh.last_watched_at
    FROM public.watch_history wh
    WHERE wh.profile_id = p_profile_id
      AND wh.hidden_from_recent = false
      AND (
        public.is_watch_finished(wh.progress_seconds, wh.duration_seconds, wh.completed)
        OR wh.progress_seconds > 120
      )
    ORDER BY wh.tmdb_id, wh.media_type, wh.last_watched_at DESC
  ) sub
  ORDER BY sub.last_watched_at DESC
  LIMIT 30;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_recently_watched(uuid) TO anon, authenticated, service_role;

-- 6. Spunta verde con la stessa regola
CREATE OR REPLACE FUNCTION public.get_watched_ids(p_profile_id uuid)
RETURNS TABLE (
  tmdb_id integer,
  media_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT wh.tmdb_id, wh.media_type
  FROM public.watch_history wh
  WHERE wh.profile_id = p_profile_id
  GROUP BY wh.tmdb_id, wh.media_type
  HAVING bool_and(public.is_watch_finished(wh.progress_seconds, wh.duration_seconds, wh.completed));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_watched_ids(uuid) TO anon, authenticated, service_role;

-- 7. Barre di progresso nella scheda: "✓ Visto" con la stessa regola
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
  SELECT wh.season, wh.episode, wh.progress_seconds, wh.duration_seconds,
         public.is_watch_finished(wh.progress_seconds, wh.duration_seconds, wh.completed)
  FROM public.watch_history wh
  WHERE wh.profile_id = p_profile_id
    AND wh.tmdb_id = p_tmdb_id
    AND wh.progress_seconds > 0
  ORDER BY wh.season, wh.episode;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_episode_progress(uuid, integer) TO anon, authenticated, service_role;
