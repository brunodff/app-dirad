-- COMAE GERENCIAL — Schema inicial
-- Idempotente: pode rodar em projeto com objetos antigos sem erro.

-- ── LIMPEZA DE OBJETOS LEGADOS ───────────────────────────────────────────────
DROP TRIGGER  IF EXISTS on_auth_user_created   ON auth.users;
DROP FUNCTION IF EXISTS criar_usuario_apos_signup() CASCADE;
DROP FUNCTION IF EXISTS handle_new_user()            CASCADE;  -- nome comum do legado

-- Views (recriar do zero)
DROP VIEW IF EXISTS conferencia_35         CASCADE;
DROP VIEW IF EXISTS resumo_por_operacao    CASCADE;

-- Tabelas do legado (projeto paineisdirad.com.br) — descarta sem medo
DROP TABLE IF EXISTS
  public.pdf_logs, public.email_logs, public.relatorios,
  public.movimentos, public.credito, public.descentralizado,
  public.empenhos_legado, public.profiles, public.users_extra
CASCADE;

-- Tabelas do novo schema (para rerun seguro)
DROP TABLE IF EXISTS
  public.notificacoes, public.excecoes_nc, public.overrides,
  public.empenhos, public.movimentos_credito,
  public.eventos_auditoria, public.sync_log,
  public.sessoes, public.usuarios
CASCADE;

-- Tipos (recriar do zero)
DROP TYPE IF EXISTS perfil_usuario CASCADE;
DROP TYPE IF EXISTS tipo_movimento CASCADE;
DROP TYPE IF EXISTS status_sync    CASCADE;
DROP TYPE IF EXISTS tipo_override  CASCADE;
DROP TYPE IF EXISTS tipo_evento    CASCADE;

-- ── EXTENSIONS ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ENUMS ───────────────────────────────────────────────────────────────────
CREATE TYPE perfil_usuario AS ENUM ('USER', 'ADEZ', 'CMT', 'DEV');
CREATE TYPE tipo_movimento AS ENUM ('RECEBIDO', 'DESCENTRALIZADO', 'DEVOLUCAO', 'RECEBIDO_UNIDADES', 'IGNORADO');
CREATE TYPE status_sync    AS ENUM ('EM_ANDAMENTO', 'SUCESSO', 'ERRO', 'PARCIAL');
CREATE TYPE tipo_override  AS ENUM ('EXCLUIR', 'REINCLUIR', 'RECLASSIFICAR', 'SUBOP', 'MANUAL');
CREATE TYPE tipo_evento    AS ENUM (
  'LOGIN', 'LOGOUT', 'SYNC', 'OVERRIDE_CRIAR', 'OVERRIDE_REVERTER',
  'RECLASSIFICAR', 'SUBOP', 'EXCLUIR', 'REINCLUIR', 'REGISTRO_MANUAL',
  'EXCECAO_NC_CRIAR', 'EXCECAO_NC_REMOVER', 'NAVEGAR'
);

-- ── USUÁRIOS ─────────────────────────────────────────────────────────────────
-- Espelha auth.users do Supabase. Criado via trigger após signup.
CREATE TABLE usuarios (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL UNIQUE,
  nome        TEXT NOT NULL DEFAULT '',
  perfil      perfil_usuario NOT NULL DEFAULT 'USER',
  ativo       BOOLEAN NOT NULL DEFAULT true,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_acesso TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION criar_usuario_apos_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO usuarios (id, email, nome)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION criar_usuario_apos_signup();

-- ── SESSÕES ──────────────────────────────────────────────────────────────────
CREATE TABLE sessoes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   UUID NOT NULL REFERENCES usuarios(id),
  iniciada_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  encerrada_em TIMESTAMPTZ,
  ip           TEXT,
  user_agent   TEXT
);

CREATE INDEX idx_sessoes_usuario ON sessoes(usuario_id);

-- ── AUDITORIA ────────────────────────────────────────────────────────────────
CREATE TABLE eventos_auditoria (
  id          BIGSERIAL PRIMARY KEY,
  usuario_id  UUID REFERENCES usuarios(id),
  sessao_id   UUID REFERENCES sessoes(id),
  tipo        tipo_evento NOT NULL,
  entidade    TEXT,
  entidade_id TEXT,
  dados_antes JSONB,
  dados_depois JSONB,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auditoria_usuario   ON eventos_auditoria(usuario_id);
CREATE INDEX idx_auditoria_tipo      ON eventos_auditoria(tipo);
CREATE INDEX idx_auditoria_criado_em ON eventos_auditoria(criado_em DESC);

-- ── SYNC LOG ─────────────────────────────────────────────────────────────────
CREATE TABLE sync_log (
  id                  BIGSERIAL PRIMARY KEY,
  iniciado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em        TIMESTAMPTZ,
  status              status_sync NOT NULL DEFAULT 'EM_ANDAMENTO',
  registros_credito   INTEGER,
  registros_empenhos  INTEGER,
  erros               TEXT[],
  detalhes            JSONB
);

-- ── MOVIMENTOS DE CRÉDITO ────────────────────────────────────────────────────
-- Uma linha por movimento de BD_CREDITO, com classificação calculada.
CREATE TABLE movimentos_credito (
  id              BIGSERIAL PRIMARY KEY,
  -- Dados da planilha (BD_CREDITO)
  operacao        TEXT NOT NULL,
  ug_exec_cod     TEXT NOT NULL,
  ug_exec_nome    TEXT NOT NULL,
  data            DATE NOT NULL,
  nc              TEXT NOT NULL,
  descricao       TEXT NOT NULL,
  ug_resp_cod     TEXT NOT NULL,
  ug_resp_nome    TEXT NOT NULL,
  nd_cod          TEXT NOT NULL,
  nd_nome         TEXT NOT NULL,
  favorecido_cod  TEXT,
  favorecido_nome TEXT,
  origem_cod      TEXT,
  origem_nome     TEXT,
  valor           NUMERIC(15,2) NOT NULL,  -- com sinal (+/−)
  pedido          TEXT,
  exercicio       INTEGER NOT NULL DEFAULT 2026,
  -- Classificação calculada pelo motor de regras
  tipo_calculado  tipo_movimento,
  subop           TEXT,  -- 'ZIDA' | 'CATRIMANI' | null
  ug_destino_cod  TEXT,
  ug_destino_nome TEXT,
  -- Controle
  hash_linha      TEXT NOT NULL,           -- para idempotência
  sync_id         BIGINT REFERENCES sync_log(id),
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- O hash garante que reprocessar a mesma planilha não duplica registros.
CREATE UNIQUE INDEX idx_movimentos_hash ON movimentos_credito(hash_linha);
CREATE INDEX idx_movimentos_operacao    ON movimentos_credito(operacao);
CREATE INDEX idx_movimentos_nc          ON movimentos_credito(nc);
CREATE INDEX idx_movimentos_data        ON movimentos_credito(data DESC);
CREATE INDEX idx_movimentos_tipo        ON movimentos_credito(tipo_calculado);
CREATE INDEX idx_movimentos_nd_cod      ON movimentos_credito(nd_cod);
CREATE INDEX idx_movimentos_ug_resp     ON movimentos_credito(ug_resp_cod);

-- ── EMPENHOS ────────────────────────────────────────────────────────────────
-- Snapshot da BD_EMPENHOS. Substituído integralmente a cada sync.
CREATE TABLE empenhos (
  id            BIGSERIAL PRIMARY KEY,
  operacao      TEXT NOT NULL,
  ug_exec_cod   TEXT NOT NULL,
  ug_exec_nome  TEXT NOT NULL,
  ug_resp_cod   TEXT NOT NULL,
  ug_resp_nome  TEXT NOT NULL,
  nd_cod        TEXT NOT NULL,
  nd_nome       TEXT NOT NULL,
  disponivel    NUMERIC(15,2) NOT NULL DEFAULT 0,
  a_liquidar    NUMERIC(15,2) NOT NULL DEFAULT 0,
  em_liquidacao NUMERIC(15,2) NOT NULL DEFAULT 0,
  liq_a_pagar   NUMERIC(15,2) NOT NULL DEFAULT 0,
  pago          NUMERIC(15,2) NOT NULL DEFAULT 0,
  total         NUMERIC(15,2) NOT NULL DEFAULT 0,
  snapshot_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_id       BIGINT REFERENCES sync_log(id)
);

CREATE INDEX idx_empenhos_operacao  ON empenhos(operacao);
CREATE INDEX idx_empenhos_ug_resp   ON empenhos(ug_resp_cod);
CREATE INDEX idx_empenhos_nd_cod    ON empenhos(nd_cod);
CREATE INDEX idx_empenhos_snapshot  ON empenhos(snapshot_em DESC);

-- ── OVERRIDES (decisões manuais do ADEZ) ─────────────────────────────────────
-- Persistem entre sincronizações; casados por NC.
CREATE TABLE overrides (
  id             BIGSERIAL PRIMARY KEY,
  nc             TEXT NOT NULL,
  operacao       TEXT,
  nd_cod         TEXT,
  usuario_id     UUID NOT NULL REFERENCES usuarios(id),
  tipo           tipo_override NOT NULL,
  valor_anterior JSONB,
  valor_novo     JSONB,
  motivo         TEXT NOT NULL,
  ativo          BOOLEAN NOT NULL DEFAULT true,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_overrides_nc   ON overrides(nc);
CREATE INDEX idx_overrides_ativo ON overrides(ativo) WHERE ativo = true;

-- ── EXCEÇÕES POR NC (ex.: COMAEX, HEMATITA) ──────────────────────────────────
-- Configuraveis pelo ADEZ sem deploy.
CREATE TABLE excecoes_nc (
  id               SERIAL PRIMARY KEY,
  nc               TEXT NOT NULL,           -- ex.: '2026NC006858'
  operacao         TEXT NOT NULL,           -- regex-friendly name, ex.: 'EXERCICIO COMAEX'
  descricao_motivo TEXT NOT NULL,
  ativo            BOOLEAN NOT NULL DEFAULT true,
  criado_por       UUID REFERENCES usuarios(id),
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: exceções padrão que já eram hardcode no Leitor.gs
INSERT INTO excecoes_nc (nc, operacao, descricao_motivo) VALUES
  ('2026NC006858', 'EXERCICIO COMAEX',   'NC pontual COMAEX — regra 3.2.c'),
  ('2026NC001974', 'OPERACAO HEMATITA',  'NC pontual HEMATITA — regra 3.2.c');

-- ── NOTIFICAÇÕES ─────────────────────────────────────────────────────────────
CREATE TABLE notificacoes (
  id          BIGSERIAL PRIMARY KEY,
  usuario_id  UUID NOT NULL REFERENCES usuarios(id),
  tipo        TEXT NOT NULL,
  titulo      TEXT NOT NULL,
  corpo       TEXT NOT NULL,
  dados       JSONB,
  lida        BOOLEAN NOT NULL DEFAULT false,
  lida_em     TIMESTAMPTZ,
  criada_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_usuario ON notificacoes(usuario_id, lida);
CREATE INDEX idx_notif_criada  ON notificacoes(criada_em DESC);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
ALTER TABLE usuarios            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessoes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos_auditoria   ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentos_credito  ENABLE ROW LEVEL SECURITY;
ALTER TABLE empenhos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE overrides           ENABLE ROW LEVEL SECURITY;
ALTER TABLE excecoes_nc         ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log            ENABLE ROW LEVEL SECURITY;

-- Políticas: usuários autenticados leem tudo; escrita via service role (API)
CREATE POLICY "usuarios_auth_read" ON usuarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "movimentos_auth_read" ON movimentos_credito FOR SELECT TO authenticated USING (true);
CREATE POLICY "empenhos_auth_read" ON empenhos FOR SELECT TO authenticated USING (true);
CREATE POLICY "overrides_auth_read" ON overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "excecoes_nc_auth_read" ON excecoes_nc FOR SELECT TO authenticated USING (true);
CREATE POLICY "notificacoes_own" ON notificacoes FOR SELECT TO authenticated USING (usuario_id = auth.uid());
CREATE POLICY "sync_log_auth_read" ON sync_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "auditoria_dev_read" ON eventos_auditoria FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil = 'DEV'));

-- ── VIEWS UTILITÁRIAS ────────────────────────────────────────────────────────

-- Totais por operação (RECEBIDO, DESCENTRALIZADO, DEVOLUCAO, EMPENHADO, DISPONIVEL)
CREATE VIEW resumo_por_operacao AS
WITH cred AS (
  SELECT
    operacao,
    SUM(CASE WHEN tipo_calculado = 'RECEBIDO'       THEN valor ELSE 0 END) AS recebido,
    SUM(CASE WHEN tipo_calculado = 'DESCENTRALIZADO' THEN ABS(valor) ELSE 0 END) AS descentr_saida,
    SUM(CASE WHEN tipo_calculado = 'DEVOLUCAO'       THEN ABS(valor) ELSE 0 END) AS devolucao
  FROM movimentos_credito
  WHERE exercicio = 2026
  GROUP BY operacao
),
emp AS (
  SELECT
    operacao,
    SUM(a_liquidar + em_liquidacao + liq_a_pagar + pago) AS empenhado
  FROM (
    SELECT DISTINCT ON (operacao, ug_exec_cod, ug_resp_cod, nd_cod) *
    FROM empenhos
    WHERE ug_resp_cod = '120115'   -- somente empenhos do COMAE
    ORDER BY operacao, ug_exec_cod, ug_resp_cod, nd_cod, snapshot_em DESC
  ) e
  GROUP BY operacao
)
SELECT
  c.operacao,
  ROUND(c.recebido, 2)                                                AS recebido,
  ROUND(c.descentr_saida - COALESCE(c.devolucao, 0), 2)             AS descentralizado,
  ROUND(COALESCE(e.empenhado, 0), 2)                                  AS empenhado,
  ROUND(c.recebido - (c.descentr_saida - COALESCE(c.devolucao, 0))
        - COALESCE(e.empenhado, 0), 2)                               AS disponivel
FROM cred c
LEFT JOIN emp e USING (operacao);

-- Conferência seção 3.5 — compara disponível calculado vs. BD_EMPENHOS.DISPONIVEL
-- Agrupa por Operação × ND × UG Executora (granularidade essencial)
CREATE VIEW conferencia_35 AS
WITH cred AS (
  SELECT
    operacao,
    nd_cod,
    ug_exec_cod,
    SUM(CASE WHEN tipo_calculado = 'RECEBIDO'        THEN valor ELSE 0 END) AS recebido,
    SUM(CASE WHEN tipo_calculado = 'DESCENTRALIZADO' THEN ABS(valor) ELSE 0 END) AS descentr_saida,
    SUM(CASE WHEN tipo_calculado = 'DEVOLUCAO'       THEN ABS(valor) ELSE 0 END) AS devolucao
  FROM movimentos_credito
  WHERE exercicio = 2026
  GROUP BY operacao, nd_cod, ug_exec_cod
),
emp AS (
  SELECT DISTINCT ON (operacao, nd_cod, ug_exec_cod, ug_resp_cod)
    operacao, nd_cod, ug_exec_cod, ug_resp_cod,
    disponivel,
    (a_liquidar + em_liquidacao + liq_a_pagar + pago) AS empenhado
  FROM empenhos
  ORDER BY operacao, nd_cod, ug_exec_cod, ug_resp_cod, snapshot_em DESC
),
joined AS (
  SELECT
    COALESCE(c.operacao,    e.operacao)    AS operacao,
    COALESCE(c.nd_cod,      e.nd_cod)      AS nd_cod,
    COALESCE(c.ug_exec_cod, e.ug_exec_cod) AS ug_exec_cod,
    e.ug_resp_cod,
    COALESCE(c.recebido, 0)         AS recebido,
    COALESCE(c.descentr_saida, 0)   AS descentr_saida,
    COALESCE(c.devolucao, 0)        AS devolucao,
    COALESCE(e.empenhado, 0)        AS empenhado,
    COALESCE(e.disponivel, 0)       AS disponivel_planilha
  FROM cred c
  FULL OUTER JOIN emp e
    ON c.operacao    = e.operacao
   AND c.nd_cod      = e.nd_cod
   AND c.ug_exec_cod = e.ug_exec_cod
)
SELECT
  operacao, nd_cod, ug_exec_cod, ug_resp_cod,
  ROUND(recebido, 2)          AS recebido,
  ROUND(descentr_saida - devolucao, 2) AS descentralizado,
  ROUND(empenhado, 2)         AS empenhado,
  ROUND(recebido - (descentr_saida - devolucao) - empenhado, 2) AS disponivel_calculado,
  ROUND(disponivel_planilha, 2) AS disponivel_planilha,
  ROUND(recebido - (descentr_saida - devolucao) - empenhado - disponivel_planilha, 2) AS divergencia
FROM joined
ORDER BY ABS(recebido - (descentr_saida - devolucao) - empenhado - disponivel_planilha) DESC NULLS LAST;
