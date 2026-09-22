-- Corrige fórmula do disponível:
-- DISPONÍVEL = RECEBIDO − DESCENTRALIZADO
-- O empenhado NÃO é subtraído: o empenho já é registrado como movimento
-- de crédito e portanto já está embutido no Descentralizado.
-- Subtraí-lo novamente produzia disponível negativo (dupla contagem).
-- O campo "empenhado" permanece na view apenas como dado informativo.

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
  WHERE ug_resp_cod = '120115'
  GROUP BY operacao
)
SELECT
  c.operacao,
  ROUND(c.recebido, 2)                                                AS recebido,
  ROUND(c.descentr_saida - COALESCE(c.devolucao, 0), 2)             AS descentralizado,
  ROUND(COALESCE(e.empenhado, 0), 2)                                  AS empenhado,
  ROUND(c.recebido - (c.descentr_saida - COALESCE(c.devolucao, 0)), 2) AS disponivel
FROM cred c
LEFT JOIN emp e USING (operacao);
