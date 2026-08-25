/**
 * Motor de regras do COMAE Gerencial — tradução direta do Leitor.gs.
 *
 * Cada predicado espelha EXATAMENTE a função correspondente no Apps Script.
 * Não altere a lógica sem validar contra os valores de aceitação da seção 3.5.
 */

import { normalizar, extrairAno } from './normalizar';
import type { MovimentoCredito, ExcecaoNC } from './types';

// ── CONSTANTES ───────────────────────────────────────────────────────────────
export const UG_COMAE = '120115';

// Mesmos padrões que Leitor.gs
const RE_COMAE        = /\d+\s*\/\s*COMAE\s*\/\s*\d{4}/i;
const RE_EMAER        = /\d+\s*\/\s*EMAER-?5SC2\s*\/\s*\d{4}/i;
const RE_EMAER_SOLIC  = /SOLICITACAO DO EMAER/;       // sobre texto normalizado
const RE_COMGAP       = /COMGAP/;                      // idem
const RE_OP_ACOLHIDA  = /OPERACAO ACOLHIDA/;           // idem
const RE_OP_COOPERACION = /COOPERACION/;
const RE_OP_GOTA      = /\bGOTA\b/;
const RE_OP_COMAEX    = /COMAEX/;
const RE_OP_HEMATITA  = /HEMATITA/;
// TOTEQ: três grafias possíveis, incluindo a sigla
const RE_OP_TOTEQ     = /TRANSP\.?\s*ORGAOS E EQUIPES|TRANSPORTE DE ORGAOS E EQUIPES|\bTOTEQ\b/;
const RE_CORRECAO_UGR = /CORRECAO DE UGR/;
const RE_ZIDA         = /\bZIDA\b/i;
const RE_OP_CATRIMANI = /CATRIMANI/i;
const RE_UG_DIRETORIA = /DIRETORIA DE ECON/;

const UGS_DIRETORIA = new Set(['120002', '121002']);

/**
 * Exceções padrão por NC (COMAEX e HEMATITA), idênticas ao hardcode do Leitor.gs.
 * O ADEZ pode adicionar mais via interface — elas chegam via ConfigEngine.excecoesNC.
 */
export const DEFAULT_EXCECOES_NC: Array<{ opRe: RegExp; digitos: string }> = [
  { opRe: RE_OP_COMAEX,   digitos: '2026006858' },   // EXERCICIO COMAEX  → 2026NC006858
  { opRe: RE_OP_HEMATITA, digitos: '2026001974' },   // OPERACAO HEMATITA → 2026NC001974
];

/** Converte ExcecaoNC[] do banco para o formato interno com regex pré-compilado. */
export function resolverExcecoesNC(
  excecoesNC: ExcecaoNC[],
): Array<{ opRe: RegExp; digitos: string }> {
  return excecoesNC.map(e => ({
    // Escapa o nome da operação para uso em regex; correspondência insensível a acento via normalizar
    opRe: new RegExp(normalizar(e.operacao).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    digitos: e.nc.replace(/\D/g, ''),
  }));
}

// ── 3.1 DUPLICIDADE DA DIRETORIA ────────────────────────────────────────────
/**
 * Descarta linhas cuja UG EXECUTORA seja a Diretoria de Econ. e Fin.
 * (120002 ou 121002, ou nome contendo "DIRETORIA DE ECON").
 * Testar na UG Executora, nunca na Origem — as exceções 3.2.b e 3.2.c
 * têm bypass próprio e são verificadas ANTES desta exclusão.
 */
export function ehUgExecDiretoria(r: MovimentoCredito): boolean {
  const cod = r.ugExecCod.replace(/\D/g, '');
  if (UGS_DIRETORIA.has(cod)) return true;
  return RE_UG_DIRETORIA.test(normalizar(r.ugExecNome));
}

// ── HELPERS INTERNOS ─────────────────────────────────────────────────────────

/** GOTA e TOTEQ usam regra ampla: todo positivo que chega ao COMAE entra. */
function ehOpRegraAmpla(opN: string): boolean {
  return RE_OP_GOTA.test(opN) || RE_OP_TOTEQ.test(opN);
}

/**
 * Operações com critério próprio — para as negativas, o pareamento
 * padrão não se aplica (senão anulações de QDD viram "recolhimento").
 */
function ehOperacaoExcecao(opN: string): boolean {
  return (
    RE_OP_COOPERACION.test(opN) ||
    ehOpRegraAmpla(opN) ||
    RE_OP_COMAEX.test(opN) ||
    RE_OP_HEMATITA.test(opN)
  );
}

/**
 * Regra padrão (CATRIMANI e demais): EMAER-5SC2 na descrição,
 * ou SOLICITACAO DO EMAER (texto normalizado), ou COMGAP em ACOLHIDA.
 * Nunca com /COMAE/ na descrição.
 */
function ehDescricaoRecebida(r: MovimentoCredito): boolean {
  if (RE_COMAE.test(r.descricao)) return false;
  if (RE_EMAER.test(r.descricao)) return true;
  const descN = normalizar(r.descricao);
  if (RE_EMAER_SOLIC.test(descN)) return true;
  if (RE_OP_ACOLHIDA.test(normalizar(r.operacao)) && RE_COMGAP.test(descN)) return true;
  return false;
}

// ── 3.2.a RECEBIDO — REGRA AMPLA (GOTA / TOTEQ) ──────────────────────────────
/** Todo positivo que chega ao COMAE — descrição não importa. */
export function ehRecebidoRegraAmpla(r: MovimentoCredito): boolean {
  return r.ugRespCod === UG_COMAE && ehOpRegraAmpla(normalizar(r.operacao));
}

// ── 3.2.b RECEBIDO — COOPERACION ────────────────────────────────────────────
/**
 * Positiva no COMAE cuja NC tem contrapartida negativa com
 * ORIGEM_NOME = "DIRETORIA DE ECON" e ND_COD = 339000.
 * O conjunto ncCoopEmaer é construído em construirSetsCooperacion().
 */
export function ehRecebidoCooperacion(
  r: MovimentoCredito,
  ncCoopEmaer: Set<string>,
): boolean {
  return (
    r.valor > 0 &&
    r.ugRespCod === UG_COMAE &&
    RE_OP_COOPERACION.test(normalizar(r.operacao)) &&
    ncCoopEmaer.has(r.nc)
  );
}

// ── 3.2.c RECEBIDO — NC PONTUAIS (COMAEX / HEMATITA) ────────────────────────
/**
 * NC específica que chega ao COMAE com "ATENDER" na descrição.
 * A lista de exceções é configurável pelo ADEZ via interface.
 */
export function ehRecebidoPontual(
  r: MovimentoCredito,
  excecoesNC: Array<{ opRe: RegExp; digitos: string }>,
): boolean {
  if (r.valor <= 0 || r.ugRespCod !== UG_COMAE) return false;
  if (!normalizar(r.descricao).includes('ATENDER')) return false;
  const opN = normalizar(r.operacao);
  const dig = r.nc.replace(/\D/g, '');
  return excecoesNC.some(e => e.opRe.test(opN) && dig === e.digitos);
}

// ── CLASSIFICAÇÃO DE POSITIVOS ───────────────────────────────────────────────
/**
 * Determina se uma linha POSITIVA é "recebida".
 * Ordem idêntica ao Leitor.gs (exceções com bypass antes do filtro Diretoria).
 */
export function ehRecebidoPositivo(
  r: MovimentoCredito,
  ncCoopEmaer: Set<string>,
  excecoesNC: Array<{ opRe: RegExp; digitos: string }>,
): boolean {
  if (r.valor <= 0) return false;
  // 3.2.b e 3.2.c passam por cima da exclusão da Diretoria
  if (ehRecebidoCooperacion(r, ncCoopEmaer)) return true;
  if (ehRecebidoPontual(r, excecoesNC)) return true;
  // 3.1 — duplicidade da Diretoria
  if (ehUgExecDiretoria(r)) return false;
  // 3.2.d — GOTA / TOTEQ
  if (ehRecebidoRegraAmpla(r)) return true;
  // Para as demais operações de exceção, apenas o critério próprio vale
  const opN = normalizar(r.operacao);
  if (RE_OP_COOPERACION.test(opN) || RE_OP_COMAEX.test(opN) || RE_OP_HEMATITA.test(opN)) {
    return false;
  }
  // 3.2.a — regra padrão: descrição EMAER
  return ehDescricaoRecebida(r);
}

// ── CLASSIFICAÇÃO COMPLETA DE LINHA (positivo + recolhimento) ───────────────
/**
 * Decide se uma linha (qualquer sinal) entra nas abas de Recebido.
 * Para 2026 apenas.
 */
export function ehRecebidoLinha(
  r: MovimentoCredito,
  ncCoopEmaer: Set<string>,
  chaveRecebidaPositiva: Set<string>,
  ncEntraUnidade: Set<string>,
  excecoesNC: Array<{ opRe: RegExp; digitos: string }>,
): boolean {
  if (r.valor === 0) return false;
  if (extrairAno(r.data) !== '2026') return false;
  if (r.valor > 0) return ehRecebidoPositivo(r, ncCoopEmaer, excecoesNC);

  // ---- NEGATIVO = RECOLHIMENTO ----
  // Se a NC entrou em unidade, a saída do COMAE é descentralização — não recolhimento.
  if (ncEntraUnidade.has(r.nc)) return false;
  if (ehUgExecDiretoria(r)) return false;
  // GOTA/TOTEQ: saída sem destino em unidade = recolhimento
  if (ehRecebidoRegraAmpla(r)) return true;
  // CATRIMANI e demais: descrição EMAER
  if (ehDescricaoRecebida(r)) return true;
  // Operações de exceção: não usa pareamento padrão
  if (ehOperacaoExcecao(normalizar(r.operacao))) return false;
  // Fallback: mesmo NC + UG_RESP que já teve positivo reconhecido
  return chaveRecebidaPositiva.has(r.ugRespCod + '|' + r.nc);
}

// ── 3.3 DESCENTRALIZADO ──────────────────────────────────────────────────────
/**
 * Linha NEGATIVA do COMAE cuja NC tem contrapartida positiva em unidade.
 * A linha da unidade NÃO entra — usamos a linha do COMAE (ND de saída).
 */
export function ehSaidaComae(
  r: MovimentoCredito,
  ncEntraUnidade: Set<string>,
): boolean {
  if (extrairAno(r.data) !== '2026') return false;
  if (r.ugRespCod !== UG_COMAE) return false;
  if (r.valor >= 0) return false;
  if (!r.nc || r.nc === 'SEM NC') return false;
  if (!ncEntraUnidade.has(r.nc)) return false;
  // CATRIMANI com COMGAP nunca é descentralização
  if (
    RE_OP_CATRIMANI.test(normalizar(r.operacao)) &&
    RE_COMGAP.test(normalizar(r.descricao))
  ) return false;
  // Ajuste administrativo de UGR — não é movimentação de crédito
  if (RE_CORRECAO_UGR.test(normalizar(r.descricao))) return false;
  return true;
}

// ── 3.4 DEVOLUÇÕES ───────────────────────────────────────────────────────────
/**
 * Linha POSITIVA no COMAE cuja NC tem contrapartida negativa em unidade.
 * Entra NEGATIVA no Descentralizado, abatendo. Não conta no Recebido.
 */
export function ehDevolucaoComae(
  r: MovimentoCredito,
  ncNegativaEmUnidade: Set<string>,
): boolean {
  if (extrairAno(r.data) !== '2026') return false;
  if (r.ugRespCod !== UG_COMAE) return false;
  if (r.valor <= 0) return false;
  if (!ncNegativaEmUnidade.has(r.nc)) return false;
  if (RE_CORRECAO_UGR.test(normalizar(r.descricao))) return false;
  return true;
}

// ── RECEBIDO UNIDADES (aba separada) ─────────────────────────────────────────
/**
 * Unidade (≠ COMAE) que recebeu do EMAER.
 * Para CATRIMANI: somente descrição EMAER-5SC2 (sem SOLICITACAO DO EMAER).
 */
export function ehRecebidoUnidades(
  r: MovimentoCredito,
  ncCoopEmaer: Set<string>,
  chaveRecebidaPositiva: Set<string>,
  ncEntraUnidade: Set<string>,
  excecoesNC: Array<{ opRe: RegExp; digitos: string }>,
): boolean {
  if (r.ugRespCod === UG_COMAE) return false;
  if (!ehRecebidoLinha(r, ncCoopEmaer, chaveRecebidaPositiva, ncEntraUnidade, excecoesNC)) return false;
  // 3.2.e — CATRIMANI: UNIDADES só vê EMAER estrito
  if (RE_OP_CATRIMANI.test(normalizar(r.operacao)) && !RE_EMAER.test(r.descricao)) return false;
  return true;
}

// ── 3.6 SUB-OP (somente CATRIMANI) ───────────────────────────────────────────
/**
 * ZIDA se "ZIDA" na descrição; CATRIMANI se "CATRIMANI" na descrição; '' se nenhum.
 * A escolha manual do usuário sobrepõe este valor (persistida via overrides).
 */
export function subOpDe(operacao: string, descricao: string): string {
  if (!RE_OP_CATRIMANI.test(normalizar(operacao))) return '';
  if (RE_ZIDA.test(descricao)) return 'ZIDA';
  if (RE_OP_CATRIMANI.test(descricao)) return 'CATRIMANI';
  return '';
}

// ── CONSTRUÇÃO DE SETS DE APOIO ──────────────────────────────────────────────

/**
 * Monta o conjunto de NCs da COOPERACION que têm contrapartida negativa
 * com ORIGEM_NOME = "DIRETORIA DE ECON" e ND_COD = 339000.
 * Construído sobre TODOS os registros (não filtrado por ano).
 */
export function construirSetsCooperacion(
  registros: MovimentoCredito[],
): Set<string> {
  const ncCoopEmaer = new Set<string>();
  for (const r of registros) {
    if (!RE_OP_COOPERACION.test(normalizar(r.operacao))) continue;
    if (
      r.valor < 0 &&
      r.ndCod === '339000' &&
      /DIRETORIA DE ECON/.test(normalizar(r.origemNome))
    ) {
      ncCoopEmaer.add(r.nc);
    }
  }
  return ncCoopEmaer;
}
