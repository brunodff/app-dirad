ALTER TABLE public.movimentos_credito
  ADD COLUMN IF NOT EXISTS acao_cod  TEXT,
  ADD COLUMN IF NOT EXISTS acao_nome TEXT;

ALTER TABLE public.empenhos
  ADD COLUMN IF NOT EXISTS acao_cod  TEXT,
  ADD COLUMN IF NOT EXISTS acao_nome TEXT;
