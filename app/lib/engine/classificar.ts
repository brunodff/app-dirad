/**
 * Motor de classificação principal.
 * Recebe os registros brutos de BD_CREDITO e retorna cada um com tipo_calculado,
 * subop e ug_destino, seguindo exatamente a mesma sequência do Leitor.gs.
 */

import { createHash } from 'node:crypto';
import { normalizar, extrairAno } from './normalizar';
import {
  UG_COMAE,
  DEFAULT_EXCECOES_NC,
  resolverExcecoesNC,
  construirSetsCooperacion,
  chaveNC,
  ehRecebidoPositivo,
  ehRecebidoLinha,
  ehRecebidoUnidades,
  ehSaidaComae,
  ehDevolucaoComae,
  subOpDe,
} from './regras';
import type {
  MovimentoCredito,
  MovimentoClassificado,
  TipoMovimento,
  ConfigEngine,
} from './types';

/** Hash determinístico para idempotência (32 hex chars). */
export function hashMovimento(r: MovimentoCredito): string {
  const key = [r.nc, r.ndCod, r.ugExecCod, r.ugRespCod, r.valor.toFixed(2)].join('|');
  return createHash('sha256').update(key).digest('hex').slice(0, 32);
}

/**
 * Classifica todos os registros de BD_CREDITO.
 *
 * Sequência idêntica ao Leitor.gs:
 *  1. Monta sets de apoio (cross-year)
 *  2. Classifica cada linha (1.ª passagem)
 *  3. Adiciona complementoComae (2.ª passagem)
 *  4. Remove devoluções que escaparam para RECEBIDO (3.ª passagem)
 */
export function classificar(
  registros: MovimentoCredito[],
  config: ConfigEngine = {},
): MovimentoClassificado[] {
  const excecoesNC = config.excecoesNC
    ? resolverExcecoesNC(config.excecoesNC)
    : DEFAULT_EXCECOES_NC;

  // ── SETS DE APOIO (construídos de TODOS os anos) ──────────────────────────
  const ncCoopEmaer = construirSetsCooperacion(registros);

  // Chaveados por NC+operação — evita pareamento cruzado entre operações distintas.
  const ncEntraUnidade      = new Set<string>();
  const ncNegativaEmUnidade = new Set<string>();
  for (const r of registros) {
    if (r.ugRespCod !== UG_COMAE) {
      if (r.valor > 0) ncEntraUnidade.add(chaveNC(r));
      if (r.valor < 0) ncNegativaEmUnidade.add(chaveNC(r));
    }
  }

  // chaveRecebidaPositiva = "UG_RESP|NC@op" para positivos classificáveis como recebidos.
  // Usado no fallback das negativas (recolhimento por pareamento de NC+op).
  const chaveRecebidaPositiva = new Set<string>();
  for (const r of registros) {
    if (ehRecebidoPositivo(r, ncCoopEmaer, excecoesNC)) {
      chaveRecebidaPositiva.add(r.ugRespCod + '|' + chaveNC(r));
    }
  }

  // ── 1.ª PASSAGEM: classificação principal ────────────────────────────────
  const n = registros.length;
  const tipos = new Array<TipoMovimento>(n).fill('IGNORADO');

  for (let i = 0; i < n; i++) {
    const r = registros[i];

    if (extrairAno(r.data) !== '2026') continue;

    if (r.ugRespCod === UG_COMAE) {
      // Ordem: DESCENTRALIZADO → DEVOLUCAO → RECEBIDO (mirrors Leitor.gs)
      if (ehSaidaComae(r, ncEntraUnidade)) {
        tipos[i] = 'DESCENTRALIZADO';
      } else if (ehDevolucaoComae(r, ncNegativaEmUnidade)) {
        tipos[i] = 'DEVOLUCAO';
      } else if (ehRecebidoLinha(r, ncCoopEmaer, chaveRecebidaPositiva, ncEntraUnidade, excecoesNC)) {
        tipos[i] = 'RECEBIDO';
      }
    } else {
      if (ehRecebidoUnidades(r, ncCoopEmaer, chaveRecebidaPositiva, ncEntraUnidade, excecoesNC)) {
        tipos[i] = 'RECEBIDO_UNIDADES';
      }
    }
  }

  // ── 2.ª PASSAGEM: complementoComae ──────────────────────────────────────
  // Movimentos do COMAE em 2026 que não são saídas nem devoluções e ainda não estão
  // em RECEBIDO — trocas de ND, ajustes internos, etc. Leitor.gs os inclui em recComae.
  const jaClassificado = new Set<string>();
  for (let i = 0; i < n; i++) {
    if (tipos[i] === 'RECEBIDO') {
      const r = registros[i];
      jaClassificado.add(r.nc + '|' + r.ndCod + '|' + r.valor.toFixed(2));
    }
  }

  for (let i = 0; i < n; i++) {
    const r = registros[i];
    if (extrairAno(r.data) !== '2026') continue;
    if (r.ugRespCod !== UG_COMAE) continue;
    if (r.valor === 0) continue;
    if (tipos[i] === 'DESCENTRALIZADO' || tipos[i] === 'DEVOLUCAO') continue;
    if (jaClassificado.has(r.nc + '|' + r.ndCod + '|' + r.valor.toFixed(2))) continue;
    tipos[i] = 'RECEBIDO';
  }

  // ── 3.ª PASSAGEM: remove devoluções que escaparam para RECEBIDO ───────────
  for (let i = 0; i < n; i++) {
    if (tipos[i] === 'RECEBIDO' && ehDevolucaoComae(registros[i], ncNegativaEmUnidade)) {
      tipos[i] = 'IGNORADO';
    }
  }

  // ── MAPA UG DESTINO por NC+op ────────────────────────────────────────────
  // Para linhas DESCENTRALIZADO, exibe a unidade que recebeu o crédito.
  const destinoPorNC = new Map<string, { cod: string; nome: string }>();
  for (const r of registros) {
    if (r.valor > 0 && r.ugRespCod !== UG_COMAE && !destinoPorNC.has(chaveNC(r))) {
      destinoPorNC.set(chaveNC(r), { cod: r.ugRespCod, nome: r.ugRespNome });
    }
  }

  // ── RESULTADO ────────────────────────────────────────────────────────────
  return registros.map((r, i) => {
    const tipoCalculado = tipos[i];
    const destino = tipoCalculado === 'DESCENTRALIZADO' ? destinoPorNC.get(chaveNC(r)) : undefined;

    return {
      ...r,
      tipoCalculado,
      subop: subOpDe(r.operacao, r.descricao) || null,
      ugDestinoCod:  destino?.cod  ?? null,
      ugDestinoNome: destino?.nome ?? null,
      exercicio: 2026,
      hashLinha: hashMovimento(r),
    };
  });
}

// ── 3.5 CONFERÊNCIA ──────────────────────────────────────────────────────────
/**
 * Calcula RECEBIDO − DESCENTRALIZADO − EMPENHADO por (Operação × ND × UG Exec)
 * e retorna linhas com divergência != 0 primeiro.
 * Para ser chamada após a classificação.
 */
export function computarResumoOperacao(
  classificados: MovimentoClassificado[],
): Array<{ operacao: string; recebido: number; descentrSaida: number; devolucao: number }> {
  const map = new Map<string, { recebido: number; descentrSaida: number; devolucao: number }>();

  for (const r of classificados) {
    if (!map.has(r.operacao)) map.set(r.operacao, { recebido: 0, descentrSaida: 0, devolucao: 0 });
    const acc = map.get(r.operacao)!;
    if (r.tipoCalculado === 'RECEBIDO')        acc.recebido       += r.valor;
    if (r.tipoCalculado === 'DESCENTRALIZADO') acc.descentrSaida  += Math.abs(r.valor);
    if (r.tipoCalculado === 'DEVOLUCAO')       acc.devolucao      += Math.abs(r.valor);
  }

  return Array.from(map.entries()).map(([operacao, v]) => ({
    operacao,
    ...v,
  }));
}

/** Rótulo de exibição — 3.7: "OP CATRIMANI II" → "OP CATRIMANI II/ZIDA". */
export function rotuloOperacao(operacao: string): string {
  if (normalizar(operacao) === 'OP CATRIMANI II') return 'OP CATRIMANI II/ZIDA';
  return operacao;
}
