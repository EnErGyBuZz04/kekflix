-- =============================================
-- Kekflix: Preferiti + Guardati di recente + badge "già visto"
-- Stessa architettura di watch_history: RLS chiusa all'anon,
-- tutto l'accesso passa da RPC SECURITY DEFINER.
-- Esegui nell'SQL Editor di Supabase
-- =============================================

CREATE TABLE IF NOT EXISTS public.favorites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tmdb_id     integer NOT NULL,
  media_type  text NOT NULL,
  title       text NOT NULL DEFAULT '',
  poster_path text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_unique
  ON public.favorites (profile_id, tmdb_id, media_type);
CREATE INDEX IF NOT EXISTS idx_favorites_profile
  ON public.favorites (profile_id, created_at DESC);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Block direct anon access" ON public.favorites;
CREATE POLICY "Block direct anon access" ON public.favorites
  AS PERMISSIVE FOR ALL TO anon USING (false);

-- Aggiungi/togli dai preferiti. Ritorna true se ora è preferito.
CREATE OR REPLACE FUNCTION public.toggle_favorite(
  p_profile_id uuid,
  p_tmdb_id integer,
  p_media_type text,
  p_title text DEFAULT '',
  p_poster_path text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.favorites
  WHERE profile_id = p_profile_id AND tmdb_id = p_tmdb_id AND media_type = p_media_type;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted > 0 THEN
    RETURN false;
  END IF;

  INSERT INTO public.favorites (profile_id, tmdb_id, media_type, title, poster_path)
  VALUES (p_profile_id, p_tmdb_id, p_media_type, COALESCE(p_title, ''), p_poster_path);
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_favorite(uuid, integer, text, text, text) TO anon, authenticated, service_role;

-- Lista preferiti del profilo, dal più recente
CREATE OR REPLACE FUNCTION public.get_favorites(p_profile_id uuid)
RETURNS TABLE (
  tmdb_id integer,
  media_type text,
  title text,
  poster_path text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT f.tmdb_id, f.media_type, f.title, f.poster_path, f.created_at
  FROM public.favorites f
  WHERE f.profile_id = p_profile_id
  ORDER BY f.created_at DESC
  LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_favorites(uuid) TO anon, authenticated, service_role;

-- "Guardati di recente": un titolo per riga, film finiti o comunque
-- guardati per più di due minuti, dal più recente.
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
      wh.completed, wh.last_watched_at
    FROM public.watch_history wh
    WHERE wh.profile_id = p_profile_id
      AND (wh.completed = true OR wh.progress_seconds > 120)
    ORDER BY wh.tmdb_id, wh.media_type, wh.last_watched_at DESC
  ) sub
  ORDER BY sub.last_watched_at DESC
  LIMIT 30;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_recently_watched(uuid) TO anon, authenticated, service_role;

-- Titoli da marcare con la spunta "già visto":
--   film  → completato
--   serie → tutti gli episodi registrati sono completati (almeno uno)
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
  HAVING bool_and(wh.completed) AND count(*) > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_watched_ids(uuid) TO anon, authenticated, service_role;
