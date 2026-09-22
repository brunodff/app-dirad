ALTER TABLE public.solicitacoes_desc
  ADD COLUMN IF NOT EXISTS operacao TEXT NOT NULL DEFAULT '';
