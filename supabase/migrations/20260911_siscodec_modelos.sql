CREATE TABLE IF NOT EXISTS public.siscodec_modelos (
  id               SERIAL PRIMARY KEY,
  operacao         TEXT NOT NULL,
  obs              TEXT,
  destaque         TEXT NOT NULL DEFAULT 'Não',
  entrada_exterior TEXT NOT NULL DEFAULT 'Não',
  celulas          JSONB NOT NULL DEFAULT '[]',
  criado_por       UUID REFERENCES public.usuarios(id),
  criado_por_nome  TEXT,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS siscodec_modelos_operacao_idx ON public.siscodec_modelos(operacao);
