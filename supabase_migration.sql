-- =============================================
-- Kekflix: Sistema Profili con PIN
-- Esegui questo SQL nell'SQL Editor di Supabase Dashboard
-- =============================================

-- 1. Abilita estensione pgcrypto per hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Tabella profili
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pin_hash text NOT NULL DEFAULT '',
  avatar_color text NOT NULL DEFAULT '#E50914',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Abilita RLS (Row Level Security)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Policy: blocca accesso diretto alla tabella per utenti anonimi
--    (così pin_hash non è mai esposto)
CREATE POLICY "Block direct anon access" ON public.profiles
  FOR SELECT
  TO anon
  USING (false);

-- 5. View pubblica: espone solo colonne sicure
CREATE VIEW public.profiles_public AS
  SELECT id, name, avatar_color, created_at
  FROM public.profiles;

-- Grant accesso alla view per utenti anonimi
GRANT SELECT ON public.profiles_public TO anon;

-- 6. Funzione RPC per verificare il PIN (eseguita server-side, SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.verify_pin(p_profile_id uuid, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stored_hash text;
BEGIN
  SELECT pin_hash INTO stored_hash
  FROM public.profiles
  WHERE id = p_profile_id;

  IF stored_hash IS NULL THEN
    RETURN false;
  END IF;

  RETURN stored_hash = encode(digest(p_pin, 'sha256'), 'hex');
END;
$$;

-- Grant: utenti anonimi possono chiamare verify_pin
GRANT EXECUTE ON FUNCTION public.verify_pin(uuid, text) TO anon;

-- 7. Funzione helper per impostare il PIN (solo da SQL Editor)
CREATE OR REPLACE FUNCTION public.set_pin(p_profile_id uuid, p_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET pin_hash = encode(digest(p_pin, 'sha256'), 'hex')
  WHERE id = p_profile_id;
END;
$$;

-- =============================================
-- COME CREARE UN PROFILO:
-- =============================================
-- 1. Inserisci il profilo:
--    INSERT INTO public.profiles (name, avatar_color) 
--    VALUES ('Francesco', '#E50914');
--
-- 2. Imposta il PIN (sostituisci l'UUID con quello generato):
--    SELECT set_pin('uuid-del-profilo', '1234');
--
-- Esempio completo:
--    INSERT INTO public.profiles (name, avatar_color)
--    VALUES ('Francesco', '#E50914')
--    RETURNING id;
--    -- Output: abc123-...-xyz
--    SELECT set_pin('abc123-...-xyz', '1234');
-- =============================================
