-- Cópia bruta da aba CREDITO_COMAE (relatório do Tesouro Gerencial), todos os exercícios.
-- Alimentada por POST /api/sync-comae. Cada envio grava um lote novo e apaga os anteriores,
-- então a tabela nunca fica vazia durante a troca.
-- Usada pela aba Comparativo (crédito repassado ao CELOG por ano).

CREATE TABLE IF NOT EXISTS public.credito_comae (
  id               BIGSERIAL PRIMARY KEY,
  lote             BIGINT        NOT NULL,
  ano              SMALLINT,
  acao_cod         TEXT,
  acao_nome        TEXT,
  pi_cod           TEXT,
  pi_nome          TEXT,
  ug_exec_cod      TEXT,
  ug_exec_nome     TEXT,
  data             DATE,
  documento        TEXT,
  nc               TEXT,
  descricao        TEXT,
  ug_resp_cod      TEXT,
  ug_resp_nome     TEXT,
  nd_cod           TEXT,
  nd_nome          TEXT,
  favorecido_cod   TEXT,
  favorecido_nome  TEXT,
  origem_cod       TEXT,
  origem_nome      TEXT,
  valor            NUMERIC(16,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS credito_comae_lote_idx    ON public.credito_comae (lote);
CREATE INDEX IF NOT EXISTS credito_comae_ug_exec_idx ON public.credito_comae (lote, ug_exec_cod);

-- Só o servidor (service role) lê e grava; nenhuma política pública.
ALTER TABLE public.credito_comae ENABLE ROW LEVEL SECURITY;
