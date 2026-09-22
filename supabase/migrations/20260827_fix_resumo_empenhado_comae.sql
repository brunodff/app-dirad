-- Corrige resumo_por_operacao:
-- 1. Empenhado = apenas COMAE (ug_resp_cod = '120115')
-- 2. Remove DISTINCT ON — usa SUM direto como o ExecucaoView,
--    para que os dois painéis sempre mostrem o mesmo valor.
--    O sync faz DELETE + INSERT a cada rodada; se houver linhas
--    de syncs antigos acumuladas, a VIEW e o ExecucaoView ficam
--    automaticamente em sincronia (ambos somam tudo).

CREATE OR REPLACE VIEW resumo_por_operacao AS
WITH cred AS (
  SELECT
    operacao,
    SUM(CASE WHEN tipo_calculado = 'RECEBIDO'        THEN valor       ELSE 0 END) AS recebido,
    SUM(CASE WHEN tipo_calculado = 'DESCENTRALIZADO' THEN ABS(valor)  ELSE 0 END) AS descentr_saida,
    SUM(CASE WHEN tipo_calculado = 'DEVOLUCAO'       THEN ABS(valor)  ELSE 0 END) AS devolucao
  FROM movimentos_credito
  WHERE exercicio = 2026
  GROUP BY operacao
),
emp AS (
  SELECT
    operacao,
    SUM(a_liquidar + em_liquidacao + liq_a_pagar + pago) AS empenhado
  FROM empenhos
  WHERE ug_resp_cod = '120115'   -- somente empenhos do COMAE
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
