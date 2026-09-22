-- Adiciona campos extras às células SISCODEC
ALTER TABLE public.siscodec_celulas
  ADD COLUMN IF NOT EXISTS ug_exec       TEXT,
  ADD COLUMN IF NOT EXISTS esfera        TEXT,
  ADD COLUMN IF NOT EXISTS fonte         TEXT,
  ADD COLUMN IF NOT EXISTS plano_interno TEXT,
  ADD COLUMN IF NOT EXISTS ug_cred       TEXT,
  ADD COLUMN IF NOT EXISTS obs_linha1    TEXT,
  ADD COLUMN IF NOT EXISTS obs_linha2    TEXT;
