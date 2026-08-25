/**
 * Ingestão idempotente: recebe dados brutos do Apps Script, classifica e
 * persiste no Supabase. Reprocessar a mesma planilha não duplica registros.
 */

import { supabaseAdmin } from '../supabase.server';
import { classificar } from '../engine/classificar';
import { parseData, normalizaNd, normalizaUg, parseValor, ehSemInfo } from '../engine/normalizar';
import type { MovimentoCredito, EmpenhoRow, ConfigEngine } from '../engine/types';

// ── PARSERS DE LINHA ──────────────────────────────────────────────────────────

/** Converte uma linha da BD_CREDITO (objeto chave→valor) para MovimentoCredito. */
function parseLinhaCreditoRecord(row: Record<string, unknown>): MovimentoCredito | null {
  const valor = parseValor(row['VALOR']);
  if (valor === 0) return null;

  const ugRespCod = normalizaUg(row['UG_RESP_COD']);
  const ugRespNome = String(row['UG_RESP_NOME'] ?? '').trim();
  const ugExecCod = normalizaUg(row['UG_EXEC_COD']);
  const ugExecNome = String(row['UG_EXEC_NOME'] ?? '').trim();

  if (ehSemInfo(ugRespCod, ugRespNome)) return null;
  if (ehSemInfo(ugExecCod, ugExecNome)) return null;

  return {
    operacao:      String(row['OPERACAO']      ?? '').trim() || '(SEM OPERAÇÃO)',
    ugExecCod,
    ugExecNome,
    data:          parseData(row['DATA']),
    nc:            String(row['NC']            ?? '').trim() || 'SEM NC',
    descricao:     String(row['DESCRICAO']     ?? '').trim(),
    ugRespCod,
    ugRespNome,
    ndCod:         normalizaNd(row['ND_COD']),
    ndNome:        String(row['ND_NOME']       ?? '').trim(),
    favorecidoCod: normalizaUg(row['FAVORECIDO_COD']),
    favorecidoNome: String(row['FAVORECIDO_NOME'] ?? '').trim(),
    origemCod:     normalizaUg(row['ORIGEM_COD']),
    origemNome:    String(row['ORIGEM_NOME']   ?? '').trim(),
    valor,
    pedido:        String(row['PEDIDO']        ?? '').trim(),
  };
}

/** Converte uma linha da BD_EMPENHOS. */
function parseLinhEmpenhosRecord(row: Record<string, unknown>): EmpenhoRow | null {
  const ugRespCod = normalizaUg(row['UG_RESP_COD']);
  const ugRespNome = String(row['UG_RESP_NOME'] ?? '').trim();
  const ugExecCod = normalizaUg(row['UG_EXEC_COD']);
  const ugExecNome = String(row['UG_EXEC_NOME'] ?? '').trim();

  if (ehSemInfo(ugRespCod, ugRespNome)) return null;
  if (ehSemInfo(ugExecCod, ugExecNome)) return null;

  return {
    operacao:     String(row['OPERACAO']     ?? '').trim() || '(SEM OPERAÇÃO)',
    ugExecCod,
    ugExecNome,
    ugRespCod,
    ugRespNome,
    ndCod:        normalizaNd(row['ND_COD']),
    ndNome:       String(row['ND_NOME']      ?? '').trim(),
    disponivel:   parseValor(row['DISPONIVEL']),
    aLiquidar:    parseValor(row['A_LIQUIDAR']),
    emLiquidacao: parseValor(row['EM_LIQUIDACAO']),
    liqAPagar:    parseValor(row['LIQ_A_PAGAR']),
    pago:         parseValor(row['PAGO']),
    total:        parseValor(row['TOTAL']),
  };
}

// ── PAYLOAD DO APPS SCRIPT ────────────────────────────────────────────────────

export interface SyncPayload {
  credito:  Record<string, unknown>[];
  empenhos: Record<string, unknown>[];
}

// ── INGESTÃO PRINCIPAL ────────────────────────────────────────────────────────

export interface ResultadoIngestao {
  syncId: number;
  creditoRecebido: number;
  creditoProcessado: number;
  empenhosRecebido: number;
  erros: string[];
}

export async function ingerir(
  payload: SyncPayload,
  config: ConfigEngine = {},
): Promise<ResultadoIngestao> {
  const db = supabaseAdmin();
  const erros: string[] = [];

  // Registra o início do sync
  const { data: syncRow, error: syncErr } = await db
    .from('sync_log')
    .insert({ status: 'EM_ANDAMENTO' })
    .select('id')
    .single();

  if (syncErr || !syncRow) {
    throw new Error('Falha ao criar sync_log: ' + syncErr?.message);
  }
  const syncId: number = syncRow.id;

  try {
    // ── Carrega exceções NC configuradas pelo ADEZ ───────────────────────────
    const { data: excecoesNcDb } = await db
      .from('excecoes_nc')
      .select('nc, operacao')
      .eq('ativo', true);

    const configFinal: ConfigEngine = {
      ...config,
      excecoesNC: excecoesNcDb ?? [],
    };

    // ── Parse de crédito ─────────────────────────────────────────────────────
    const registrosBrutos: MovimentoCredito[] = [];
    for (const row of payload.credito) {
      try {
        const r = parseLinhaCreditoRecord(row);
        if (r) registrosBrutos.push(r);
      } catch (e) {
        erros.push('Parse crédito: ' + String(e));
      }
    }

    // ── Classificação ────────────────────────────────────────────────────────
    const classificados = classificar(registrosBrutos, configFinal);

    // ── Carrega overrides ativos ─────────────────────────────────────────────
    const { data: overrides } = await db
      .from('overrides')
      .select('nc, nd_cod, tipo, valor_novo, motivo')
      .eq('ativo', true);

    // ── Aplica overrides ─────────────────────────────────────────────────────
    if (overrides?.length) {
      const overrideMap = new Map<string, typeof overrides[0]>();
      for (const ov of overrides) {
        overrideMap.set(ov.nc + '|' + (ov.nd_cod ?? ''), ov);
      }

      for (const m of classificados) {
        const ov =
          overrideMap.get(m.nc + '|' + m.ndCod) ??
          overrideMap.get(m.nc + '|');

        if (!ov) continue;

        if (ov.tipo === 'EXCLUIR') {
          m.tipoCalculado = 'IGNORADO';
        } else if (ov.tipo === 'RECLASSIFICAR' && ov.valor_novo?.tipo) {
          m.tipoCalculado = ov.valor_novo.tipo;
        } else if (ov.tipo === 'SUBOP' && ov.valor_novo?.subop !== undefined) {
          m.subop = ov.valor_novo.subop;
        }
      }
    }

    // ── Upsert movimentos ────────────────────────────────────────────────────
    // onConflict('hash_linha'): novos inserem, existentes atualizam tipo e subop.
    const rows = classificados.map(m => ({
      operacao:        m.operacao,
      ug_exec_cod:     m.ugExecCod,
      ug_exec_nome:    m.ugExecNome,
      data:            m.data,
      nc:              m.nc,
      descricao:       m.descricao,
      ug_resp_cod:     m.ugRespCod,
      ug_resp_nome:    m.ugRespNome,
      nd_cod:          m.ndCod,
      nd_nome:         m.ndNome,
      favorecido_cod:  m.favorecidoCod,
      favorecido_nome: m.favorecidoNome,
      origem_cod:      m.origemCod,
      origem_nome:     m.origemNome,
      valor:           m.valor,
      pedido:          m.pedido,
      exercicio:       m.exercicio,
      tipo_calculado:  m.tipoCalculado,
      subop:           m.subop,
      ug_destino_cod:  m.ugDestinoCod,
      ug_destino_nome: m.ugDestinoNome,
      hash_linha:      m.hashLinha,
      sync_id:         syncId,
      atualizado_em:   new Date().toISOString(),
    }));

    // Upsert em lotes de 500 para evitar payload excessivo
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const lote = rows.slice(i, i + BATCH);
      const { error } = await db
        .from('movimentos_credito')
        .upsert(lote, { onConflict: 'hash_linha', ignoreDuplicates: false });
      if (error) erros.push(`Upsert crédito lote ${i / BATCH}: ${error.message}`);
    }

    // ── Empenhos: substitui tudo (snapshot) ──────────────────────────────────
    const empRows: EmpenhoRow[] = [];
    for (const row of payload.empenhos) {
      try {
        const e = parseLinhEmpenhosRecord(row);
        if (e) empRows.push(e);
      } catch (ex) {
        erros.push('Parse empenhos: ' + String(ex));
      }
    }

    if (empRows.length > 0) {
      // Deleta snapshot anterior e insere novo
      await db.from('empenhos').delete().neq('id', 0);

      const empDbRows = empRows.map(e => ({
        operacao:      e.operacao,
        ug_exec_cod:   e.ugExecCod,
        ug_exec_nome:  e.ugExecNome,
        ug_resp_cod:   e.ugRespCod,
        ug_resp_nome:  e.ugRespNome,
        nd_cod:        e.ndCod,
        nd_nome:       e.ndNome,
        disponivel:    e.disponivel,
        a_liquidar:    e.aLiquidar,
        em_liquidacao: e.emLiquidacao,
        liq_a_pagar:   e.liqAPagar,
        pago:          e.pago,
        total:         e.total,
        sync_id:       syncId,
      }));

      for (let i = 0; i < empDbRows.length; i += BATCH) {
        const lote = empDbRows.slice(i, i + BATCH);
        const { error } = await db.from('empenhos').insert(lote);
        if (error) erros.push(`Insert empenhos lote ${i / BATCH}: ${error.message}`);
      }
    }

    // ── Finaliza sync_log ────────────────────────────────────────────────────
    await db
      .from('sync_log')
      .update({
        status:              erros.length === 0 ? 'SUCESSO' : 'PARCIAL',
        concluido_em:        new Date().toISOString(),
        registros_credito:   classificados.length,
        registros_empenhos:  empRows.length,
        erros:               erros.length ? erros : null,
      })
      .eq('id', syncId);

    return {
      syncId,
      creditoRecebido:  registrosBrutos.length,
      creditoProcessado: classificados.length,
      empenhosRecebido: empRows.length,
      erros,
    };
  } catch (err) {
    // Marca sync como ERRO
    await db
      .from('sync_log')
      .update({
        status: 'ERRO',
        concluido_em: new Date().toISOString(),
        erros: [String(err)],
      })
      .eq('id', syncId);
    throw err;
  }
}
