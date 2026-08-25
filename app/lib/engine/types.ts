// Tipos centrais do motor de regras do COMAE Gerencial.

export interface MovimentoCredito {
  operacao: string;
  ugExecCod: string;
  ugExecNome: string;
  /** Formato ISO 'YYYY-MM-DD' */
  data: string;
  nc: string;
  descricao: string;
  ugRespCod: string;
  ugRespNome: string;
  /** Sempre string normalizada, ex.: '339015' */
  ndCod: string;
  ndNome: string;
  favorecidoCod: string;
  favorecidoNome: string;
  origemCod: string;
  origemNome: string;
  /** Valor com sinal: positivo = entrada, negativo = saída */
  valor: number;
  pedido: string;
}

export type TipoMovimento =
  | 'RECEBIDO'           // crédito recebido do EMAER pelo COMAE
  | 'DESCENTRALIZADO'    // saída do COMAE para unidade
  | 'DEVOLUCAO'          // devolução de unidade ao COMAE (abate descentralizado)
  | 'RECEBIDO_UNIDADES'  // unidade recebeu do EMAER (não entra no saldo do COMAE)
  | 'IGNORADO';

export interface MovimentoClassificado extends MovimentoCredito {
  tipoCalculado: TipoMovimento;
  /** 'ZIDA' | 'CATRIMANI' | null — somente operações CATRIMANI */
  subop: string | null;
  /** UG de destino (somente DESCENTRALIZADO) */
  ugDestinoCod: string | null;
  ugDestinoNome: string | null;
  exercicio: number;
  /** SHA-256 truncado para idempotência no upsert */
  hashLinha: string;
}

export interface EmpenhoRow {
  operacao: string;
  ugExecCod: string;
  ugExecNome: string;
  ugRespCod: string;
  ugRespNome: string;
  ndCod: string;
  ndNome: string;
  disponivel: number;
  aLiquidar: number;
  emLiquidacao: number;
  liqAPagar: number;
  pago: number;
  total: number;
}

/** Exceção por NC (configurável pelo ADEZ, ex.: COMAEX / HEMATITA) */
export interface ExcecaoNC {
  nc: string;        // ex.: '2026NC006858'
  operacao: string;  // nome exato da operação (para match por normalizar+contains)
}

export interface ConfigEngine {
  /** Exceções por NC carregadas do banco. Se omitido, usa os defaults do Leitor.gs. */
  excecoesNC?: ExcecaoNC[];
}

// ── Totais por operação (resultado do motor + empenhos) ──────────────────────
export interface ResumoOperacao {
  operacao: string;
  recebido: number;
  descentralizado: number;  // saídas - devoluções
  empenhado: number;
  disponivel: number;
}

// ── Resultado da conferência da seção 3.5 ───────────────────────────────────
export interface LinhaConferencia {
  operacao: string;
  ndCod: string;
  ugExecCod: string;
  ugRespCod: string;
  recebido: number;
  descentralizado: number;
  empenhado: number;
  disponivelCalculado: number;
  disponivelPlanilha: number;
  divergencia: number;
}
