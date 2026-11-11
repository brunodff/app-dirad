// Painel COMAE — réplica do Power BI "COMAE V2" (DOCS_BI\FAC\COMAE_V2.pbip), em funções puras.
//
// As regras são as das colunas calculadas e medidas do modelo do BI, não as do motor do app
// (lib/engine): o BI evoluiu depois do Leitor.gs. Nele o Recebido do COMAE [A] é tudo o que passou
// pela UG 120115 exceto as saídas para unidades e as devoluções (fecha por ND), o Descentralizado
// [B] é saída menos devolução, e o Disponível é A − B − Empenhado do COMAE.
//
// O servidor classifica as linhas do último sync (prepararDadosComae) e manda à tela só o
// necessário; a tela aplica os filtros (paginaComae, paginaUnidades).
//
// Sem dependências: é testado direto pelo Node (tests/painelComae.test.mjs).

export const UG_COMAE = '120115';
const UGS_DIRETORIA = new Set(['120002', '121002']);
/** Operação que o BI tira das listas de disponível (filtro do visual). */
export const OP_FORA_DAS_LISTAS = 'CODIGO INEXISTENTE NO SIAFI';

// ── Linhas do banco ──────────────────────────────────────────────────────────

export type CreditoBD = {
  operacao: string | null;
  ug_exec_cod: string | number | null;
  ug_exec_nome: string | null;
  data: string | null;
  nc: string | null;
  descricao: string | null;
  ug_resp_cod: string | number | null;
  ug_resp_nome: string | null;
  nd_cod: string | number | null;
  nd_nome: string | null;
  origem_nome: string | null;
  valor: number | string | null;
  pedido: string | null;
};

export type EmpenhoBD = {
  operacao: string | null;
  ug_exec_nome: string | null;
  ug_resp_cod: string | number | null;
  ug_resp_nome: string | null;
  nd_cod: string | number | null;
  nd_nome: string | null;
  disponivel: number | string | null;
  a_liquidar: number | string | null;
  em_liquidacao: number | string | null;
  liq_a_pagar: number | string | null;
  pago: number | string | null;
};

// ── Dados compactos (servidor → tela) ───────────────────────────────────────

/**
 * Linha da UG responsável COMAE. k: A = recebido [A]; S = saída para unidade; D = devolução ao COMAE.
 * om: unidade do outro lado da saída/devolução (UG responsável, como na planilha); '' em A.
 */
export type MovComae = {
  ano: string; op: string; opEf: string; nd: string; ndNome: string; ugExec: string; valor: number;
  k: 'A' | 'S' | 'D'; om: string;
};

/** Saída (+) ou devolução (−) do COMAE para uma unidade, por NC — base do Comparativo. */
export type DescentralizacaoNc = {
  ano: string; op: string; opEf: string; nc: string; data: string | null; nd: string; ndNome: string;
  omCod: string; om: string; valor: number; desc: string; pedido: string;
};

/** Linha classificada na visão antiga do BI (lista de pedidos). */
export type MovPedido = {
  ano: string; op: string; ugResp: string; pedido: string; data: string | null; nd: string; desc: string; valor: number;
  /** RECEBIDO COMAE-EMAER */ rc: boolean;
  /** RECEBIDO UNIDADES-EMAER */ ru: boolean;
  /** DESCENTRALIZADO (linha da unidade) */ ds: boolean;
};

export type EmpenhoPainel = {
  op: string; opEf: string; ugExec: string; ugResp: string; comae: boolean; nd: string; ndNome: string;
  disp: number; aLiq: number; liqPagar: number; pago: number;
};

/** Crédito recebido do EMAER (coluna EH_RECEBIDO), que decide quem aparece nos filtros. */
export type RecebidoEmaer = { ano: string; op: string; ugResp: string; valor: number };

export type DadosComae = {
  comae: MovComae[];
  pedidos: MovPedido[];
  empenhos: EmpenhoPainel[];
  recebidoEmaer: RecebidoEmaer[];
  /** Operações com alguma linha de crédito, por ano (granularidade da lista de disponível). */
  opsCredito: { ano: string; op: string; opEf: string }[];
  anos: string[];
  /** Data da última movimentação da base (AAAA-MM-DD). */
  atualizadoEm: string | null;
  /** Nome da UG 120115 como vem na planilha (o filtro de OM compara pelo nome). */
  nomeComae: string;
  /** Operações desativadas que existem na base (saíram do painel). */
  desativadas: string[];
  /** Nome do filtro de operação → nome da operação na planilha (o que se grava ao desativar). */
  opsPorCurta: Record<string, string>;
};

// ── Textos ───────────────────────────────────────────────────────────────────

const txt = (v: unknown) => String(v ?? '').trim();
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** Código de UG ou ND sem zeros à esquerda nem casas decimais ("120115", "339030"). */
const cod = (v: unknown) => {
  const s = txt(v);
  return /^\d+(\.0+)?$/.test(s) ? String(Number(s)) : s;
};

/** Maiúsculas, sem acento, espaços colapsados (DESC_NORM / OP_NORM do BI). */
export function normTexto(v: unknown): string {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().replace(/\s{2,}/g, ' ');
}

/** ANO do BI: ano da data; sem data, os 4 primeiros dígitos da NC. */
export function anoDaLinha(data: string | null, nc: string | null): string {
  if (data && /^\d{4}/.test(data)) return data.slice(0, 4);
  const n = txt(nc).slice(0, 4);
  return /^\d{4}$/.test(n) ? String(Number(n)) : 'SEM ANO';
}

/** OP_EFETIVA: SEMANA DA PATRIA não tem PI próprio e é achada também pela descrição. */
export function operacaoEfetiva(op: string, descNorm = ''): string {
  return /SEMANA DA PATRIA/i.test(op) || descNorm.includes('SEMANA DA PATRIA') ? 'SEMANA DA PATRIA' : op;
}

const ROTULOS: Record<string, string> = {
  'OP CATRIMANI II': 'CATRIMANI II / ZIDA 41',
  'APOIO LOGISTICO - AERONAUTICA': 'GVA - Aeronáutica',
  'GARANTIA DE VOTACAO E APURACAO - AERONAUTICA': 'GVA - Terrestre',
  'OPERACAO GOTA': 'TED.GOTA',
  'TED - TRANSP. ORGAOS E EQUIPES': 'TED.TOTEQ',
};
/** OP_LABEL: rótulo de exibição da operação efetiva. */
export const rotuloOperacao = (opEf: string) => ROTULOS[opEf] ?? opEf;

/** OPERACAO_CURTA: nome do filtro de operação. */
export function operacaoCurta(op: string): string {
  const t = op.split('OPERACAO ').join('Op. ').split('EXERCICIO ').join('Ex. ');
  return (t === 'OP CATRIMANI II' ? 'CATRIMANI II / ZIDA 41' : t).trim().replace(/\s{2,}/g, ' ');
}

export function pedidoLimpo(p: string | null): string {
  const s = txt(p);
  return s === '' || s === '—' || s === '-' ? 'Sem pedido' : s;
}

/** A marca aparece (primeira ocorrência, como o SEARCH do DAX) entre dois dígitos: "12/COMAE/2026". */
function marcaEntreDigitos(t: string, marca: string): boolean {
  const i = t.indexOf(marca);
  if (i < 0) return false;
  return /\d/.test(t[i - 1] ?? '') && /\d/.test(t[i + marca.length] ?? '');
}

/** PAD_EMAER_ESTRITO, copiado do DAX (inclusive o tamanho da marca decidido pela 1ª forma). */
function padEmaerEstrito(t: string): boolean {
  const p1 = t.indexOf('/EMAER-5SC2/') + 1;
  const p2 = t.indexOf('/EMAER5SC2/') + 1;
  const pos = Math.max(p1, p2);
  if (pos <= 0) return false;
  const tam = p1 > 0 ? 12 : 11;
  return /\d/.test(t[pos - 2] ?? '') && /\d/.test(t[pos - 1 + tam] ?? '');
}

// ── Classificação (colunas calculadas do BI) ─────────────────────────────────

type Linha = {
  ano: string; op: string; opNorm: string; nc: string; ncValida: boolean; descNorm: string; desc: string;
  origemNorm: string; ugResp: string; ugRespNome: string; ugExec: string; ugExecNome: string;
  nd: string; ndNome: string; valor: number; data: string | null; pedido: string | null;
  comae: boolean; diretoria: boolean;
};

function linhaDe(c: CreditoBD): Linha {
  const nc = txt(c.nc);
  const ugResp = cod(c.ug_resp_cod);
  const ugExec = cod(c.ug_exec_cod);
  const ugExecNome = txt(c.ug_exec_nome);
  return {
    ano: anoDaLinha(c.data, c.nc), op: txt(c.operacao), opNorm: normTexto(c.operacao), nc,
    ncValida: /NC/i.test(nc), descNorm: normTexto(c.descricao), desc: txt(c.descricao),
    origemNorm: normTexto(c.origem_nome), ugResp, ugRespNome: txt(c.ug_resp_nome), ugExec, ugExecNome,
    nd: cod(c.nd_cod), ndNome: txt(c.nd_nome), valor: num(c.valor), data: c.data ? c.data.slice(0, 10) : null,
    pedido: c.pedido, comae: ugResp === UG_COMAE,
    diretoria: UGS_DIRETORIA.has(ugExec) || ugExecNome.toUpperCase().includes('DIRETORIA DE ECON'),
  };
}

export type Classificacao = {
  ehRecebido: boolean; ehDescentralizado: boolean; ehSaidaComae: boolean; ehDevolucaoComae: boolean;
  visaoRecebido: 'COMAE' | 'UNIDADES' | null;
};

/** Classifica todas as linhas de uma vez (os pareamentos olham a base inteira, como o ALL do DAX). */
export function classificar(linhas: Linha[]): Classificacao[] {
  const porNC = new Map<string, Linha[]>();
  for (const l of linhas) {
    if (!porNC.has(l.nc)) porNC.set(l.nc, []);
    porNC.get(l.nc)!.push(l);
  }
  const daNC = (l: Linha) => porNC.get(l.nc) ?? [];

  return linhas.map((r) => {
    const mesmaNC = daNC(r);
    const opCoop = r.opNorm.includes('COOPERACION');
    const opCatrimani = r.opNorm.includes('CATRIMANI');
    const ncCoopEmaer = opCoop && mesmaNC.some((x) =>
      x.valor < 0 && x.nd === '339000' && x.opNorm.includes('COOPERACION') && x.origemNorm.includes('DIRETORIA DE ECON'));
    const ncEntraUnidade = r.ncValida && mesmaNC.some((x) => x.op === r.op && !x.comae && x.valor > 0 && x.ncValida);
    const ncSaiComae = r.ncValida && mesmaNC.some((x) => x.comae && x.valor < 0 && x.ncValida);
    const ncEntraComae = r.ncValida && mesmaNC.some((x) => x.comae && x.valor > 0 && x.ncValida);
    const rmjInterno = !r.comae
      && mesmaNC.some((x) => x.ugResp === r.ugResp && x.valor > 0)
      && mesmaNC.some((x) => x.ugResp === r.ugResp && x.valor < 0);

    // EH_RECEBIDO (só 2026 e só nota de crédito válida)
    const t = r.descNorm;
    const padComae = marcaEntreDigitos(t, '/COMAE/');
    const emaerEstrito = padEmaerEstrito(t);
    const descRecebida = (!padComae && (emaerEstrito || t.includes('SOLICITACAO DO EMAER')))
      || (r.opNorm.includes('OPERACAO ACOLHIDA') && t.includes('COMGAP'));
    const ehGota = r.opNorm.includes('GOTA');
    const ehToteq = r.opNorm.includes('TRANSP. ORGAOS E EQUIPES') || r.opNorm.includes('TRANSPORTE DE ORGAOS E EQUIPES')
      || r.opNorm.includes('TOTEQ');
    const opAmpla = ehGota || ehToteq;
    const coopEmaer = ncCoopEmaer && r.comae && r.valor > 0;
    const ncUp = r.nc.toUpperCase();
    const excecaoPontual = r.comae && t.includes('ATENDER') && (
      (r.opNorm.includes('COMAEX') && ncUp === '2026NC006858') || (r.opNorm.includes('HEMATITA') && ncUp === '2026NC001974'));
    const positivoOk = r.valor > 0 && (descRecebida || (opAmpla && r.comae) || coopEmaer || excecaoPontual);
    const temPositivaMesmaUG = mesmaNC.some((x) => x.ugResp === r.ugResp && x.valor > 0 && !x.diretoria && x.ncValida);
    const ehOpExcecao = opCoop || opAmpla || r.opNorm.includes('COMAEX') || r.opNorm.includes('HEMATITA');
    const negativoOk = r.valor < 0 && !ncEntraUnidade
      && (descRecebida || (opAmpla && r.comae) || (temPositivaMesmaUG && !ehOpExcecao));
    const ehRecebido = r.ano === '2026' && r.ncValida
      && ((coopEmaer || excecaoPontual) || (!r.diretoria && (positivoOk || negativoOk)));

    // EH_DESCENTRALIZADO (linha da unidade que recebeu do COMAE ou devolveu a ele)
    const ncPreenchida = r.nc !== '' && r.nc !== '—' && r.nc !== '-';
    const ehDescentralizado = r.ano === '2026' && ncPreenchida && !r.comae && !rmjInterno
      && !t.includes('CORRECAO DE UGR')
      && ((r.valor > 0 && ncSaiComae) || (r.valor < 0 && ncEntraComae));

    // EH_SAIDA_COMAE / EH_DEVOLUCAO_COMAE (linha do próprio COMAE; pareamento por NC + OPERACAO)
    const ehSaidaComae = r.ncValida && r.comae && r.valor < 0 && ncEntraUnidade && !t.includes('CORRECAO DE UGR');
    const temNegativaEmUnidade = mesmaNC.some((x) => x.op === r.op && !x.comae && x.valor < 0 && x.ncValida);
    const ehDevolucaoComae = r.ncValida && r.comae && r.valor > 0 && temNegativaEmUnidade
      && !t.includes('CORRECAO DE UGR') && !t.includes('ANULACAO PARA DESCENTRALIZACAO');

    const visaoRecebido = !ehRecebido ? null
      : r.comae ? 'COMAE'
      : opCatrimani && !emaerEstrito ? null
      : 'UNIDADES';

    return { ehRecebido, ehDescentralizado, ehSaidaComae, ehDevolucaoComae, visaoRecebido };
  });
}

const CORTE_DESCRICAO = 260;

function indicePorNC(linhas: Linha[]): Map<string, Linha[]> {
  const m = new Map<string, Linha[]>();
  for (const l of linhas) {
    if (!m.has(l.nc)) m.set(l.nc, []);
    m.get(l.nc)!.push(l);
  }
  return m;
}

type Destino = { om: string; omCod: string; fracao: number };

/**
 * Unidades do outro lado de uma saída (S) ou devolução (D) do COMAE: mesma NC e operação, sinal oposto
 * (o mesmo pareamento do EH_SAIDA_COMAE / EH_DEVOLUCAO_COMAE), de preferência na mesma ND.
 * Com mais de uma unidade na NC, o valor é repartido na proporção de cada uma.
 */
function destinosDe(l: Linha, k: 'S' | 'D', daNC: Linha[]): Destino[] {
  let cand = daNC.filter((x) => x.op === l.op && !x.comae && x.ncValida && (k === 'S' ? x.valor > 0 : x.valor < 0));
  const mesmaNd = cand.filter((x) => x.nd === l.nd);
  if (mesmaNd.length) cand = mesmaNd;
  const porUG = new Map<string, { om: string; omCod: string; v: number }>();
  for (const x of cand) {
    const u = porUG.get(x.ugResp) ?? { om: x.ugRespNome || x.ugResp, omCod: x.ugResp, v: 0 };
    u.v += Math.abs(x.valor);
    porUG.set(x.ugResp, u);
  }
  const total = [...porUG.values()].reduce((s, u) => s + u.v, 0);
  if (!total) return [{ om: '', omCod: '', fracao: 1 }];
  return [...porUG.values()].map((u) => ({ om: u.om, omCod: u.omCod, fracao: u.v / total }));
}

/**
 * Saídas e devoluções do COMAE por NC, com a unidade de destino (valor + = descentralizado,
 * − = devolvido). A soma é o Descentralizado [B] do painel.
 */
export function descentralizacoesComae(creditos: CreditoBD[]): DescentralizacaoNc[] {
  const linhas = creditos.map(linhaDe);
  const cls = classificar(linhas);
  const porNC = indicePorNC(linhas);
  const out: DescentralizacaoNc[] = [];
  linhas.forEach((l, i) => {
    const k = cls[i].ehSaidaComae ? 'S' : cls[i].ehDevolucaoComae ? 'D' : null;
    if (!l.comae || !k) return;
    for (const d of destinosDe(l, k, porNC.get(l.nc) ?? [])) {
      out.push({
        ano: l.ano, op: l.op, opEf: operacaoEfetiva(l.op, l.descNorm), nc: l.nc, data: l.data, nd: l.nd, ndNome: l.ndNome,
        omCod: d.omCod, om: d.om, valor: -l.valor * d.fracao, desc: l.desc, pedido: pedidoLimpo(l.pedido),
      });
    }
  });
  return out;
}

/**
 * @param desativadas operações desativadas no sistema (config_operacoes). Saem de todos os visuais,
 *   mas as linhas delas continuam valendo nos pareamentos das notas (a classificação olha a base
 *   inteira), para que desativar uma operação não mude os números das outras.
 */
export function prepararDadosComae(creditos: CreditoBD[], empenhos: EmpenhoBD[], desativadas: string[] = []): DadosComae {
  const linhas = creditos.map(linhaDe);
  const cls = classificar(linhas);
  const porNC = indicePorNC(linhas);
  const fora = new Set(desativadas.map(txt).filter(Boolean));
  const encontradas = new Set<string>();
  /** A operação (pelo nome da planilha ou pela operação efetiva) está desativada? */
  const desligada = (op: string, opEf: string) => {
    const nome = fora.has(op) ? op : fora.has(opEf) ? opEf : null;
    if (nome) encontradas.add(nome);
    return nome !== null;
  };
  const porCurta = new Map<string, string>();

  const recebido = new Map<string, RecebidoEmaer>();
  const ops = new Map<string, { ano: string; op: string; opEf: string }>();
  const anos = new Set<string>();
  let atualizadoEm: string | null = null;
  let nomeComae = '';

  // As linhas vão agrupadas pelas colunas que a tela usa (a soma não muda; o payload cai bastante).
  const comaeAgr = new Map<string, MovComae>();
  const pedidosAgr = new Map<string, MovPedido>();
  const sep = '\u0000';

  linhas.forEach((l, i) => {
    const c = cls[i];
    const opEf = operacaoEfetiva(l.op, l.descNorm);
    anos.add(l.ano);
    if (l.data && (!atualizadoEm || l.data > atualizadoEm)) atualizadoEm = l.data;
    if (desligada(l.op, opEf)) return;
    if (!porCurta.has(operacaoCurta(l.op))) porCurta.set(operacaoCurta(l.op), l.op);
    const kOp = l.ano + sep + l.op;
    if (!ops.has(kOp)) ops.set(kOp, { ano: l.ano, op: l.op, opEf });
    if (l.comae) {
      if (!nomeComae && l.ugRespNome) nomeComae = l.ugRespNome;
      const k: MovComae['k'] = c.ehSaidaComae ? 'S' : c.ehDevolucaoComae ? 'D' : 'A';
      const partes: Destino[] = k === 'A' ? [{ om: '', omCod: '', fracao: 1 }] : destinosDe(l, k, porNC.get(l.nc) ?? []);
      for (const p of partes) {
        const chave = [l.ano, l.op, opEf, l.nd, l.ugExecNome, k, p.om].join(sep);
        const m = comaeAgr.get(chave) ?? { ano: l.ano, op: l.op, opEf, nd: l.nd, ndNome: l.ndNome, ugExec: l.ugExecNome, valor: 0, k, om: p.om };
        m.valor += l.valor * p.fracao;
        if (!m.ndNome) m.ndNome = l.ndNome;
        comaeAgr.set(chave, m);
      }
    }
    if (c.visaoRecebido || c.ehDescentralizado) {
      // a planilha traz caracteres de controle no meio de algumas descrições
      const limpa = l.desc.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
      const desc = limpa.length > CORTE_DESCRICAO ? limpa.slice(0, CORTE_DESCRICAO) : limpa;
      const rc = c.visaoRecebido === 'COMAE', ru = c.visaoRecebido === 'UNIDADES', ds = c.ehDescentralizado;
      const pedido = pedidoLimpo(l.pedido);
      const chave = [l.ano, l.op, l.ugRespNome, pedido, l.nd, desc, rc, ru, ds].join(sep);
      const p = pedidosAgr.get(chave) ?? { ano: l.ano, op: l.op, ugResp: l.ugRespNome, pedido, data: null, nd: l.nd, desc, valor: 0, rc, ru, ds };
      p.valor += l.valor;
      if (l.data && (!p.data || l.data > p.data)) p.data = l.data;
      pedidosAgr.set(chave, p);
    }
    if (c.ehRecebido) {
      const k = [l.ano, l.op, l.ugRespNome].join('\u0000');
      const r = recebido.get(k) ?? { ano: l.ano, op: l.op, ugResp: l.ugRespNome, valor: 0 };
      r.valor += l.valor;
      recebido.set(k, r);
    }
  });

  const empAgr = new Map<string, EmpenhoPainel>();
  for (const e of empenhos) {
    const op = txt(e.operacao);
    if (desligada(op, operacaoEfetiva(op))) continue;
    if (!porCurta.has(operacaoCurta(op))) porCurta.set(operacaoCurta(op), op);
    const ugRespCod = cod(e.ug_resp_cod);
    const x: EmpenhoPainel = {
      op, opEf: operacaoEfetiva(op), ugExec: txt(e.ug_exec_nome), ugResp: txt(e.ug_resp_nome), comae: ugRespCod === UG_COMAE,
      nd: cod(e.nd_cod), ndNome: txt(e.nd_nome), disp: num(e.disponivel),
      aLiq: num(e.a_liquidar) + num(e.em_liquidacao), liqPagar: num(e.liq_a_pagar), pago: num(e.pago),
    };
    const chave = [x.op, x.ugExec, x.ugResp, x.comae, x.nd].join(sep);
    const a = empAgr.get(chave);
    if (!a) { empAgr.set(chave, x); continue; }
    a.disp += x.disp; a.aLiq += x.aLiq; a.liqPagar += x.liqPagar; a.pago += x.pago;
  }

  return {
    comae: [...comaeAgr.values()],
    pedidos: [...pedidosAgr.values()],
    empenhos: [...empAgr.values()],
    recebidoEmaer: [...recebido.values()],
    opsCredito: [...ops.values()],
    anos: [...anos].sort(),
    atualizadoEm,
    nomeComae: nomeComae || 'COMANDO DE OPERACOES AEROESPACIAIS',
    desativadas: [...encontradas].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    opsPorCurta: Object.fromEntries(porCurta),
  };
}

// ── Medidas ─────────────────────────────────────────────────────────────────

export type Visao = 'Recebido' | 'Descentralizado' | null;
export type FiltroComae = { ano: string | null; operacao: string | null; om: string | null; visao: Visao };
export type FiltroUnidades = { operacao: string | null; om: string | null };

export type LinhaDetalhe = { ugExec: string; ugResp: string; nd: string; valor: number };
export type Detalhe = { linhas: LinhaDetalhe[]; total: number; fonte: 'empenhos' | 'credito' };

export type PaginaComae = {
  cabecalho: {
    recebido: number; descentralizado: number;
    /** Filtro de OM numa unidade: o que o COMAE descentralizou para ela e o que ela recebeu por outros meios. */
    om: { nome: string; descentralizado: number; recebidoDireto: number } | null;
  };
  nds: {
    visao: 'Recebido' | 'Descentralizado'; total: number; cards: { nd: string; ndNome: string; valor: number; pct: number }[];
    /** OM filtrada (as NDs mostram o descentralizado pelo COMAE para ela). */
    om: string | null;
  };
  controle: {
    linhas: { opEf: string; rotulo: string; a: number; b: number; e: number; d: number }[];
    total: { a: number; b: number; e: number; d: number };
  };
  disponivel: { rank: number; opEf: string; rotulo: string; valor: number; detalhe: Detalhe }[];
  pedidos: {
    rotulo: string; qtd: number; total: number;
    linhas: { pedido: string; data: string | null; nd: string; valor: number; om: string; desc: string; pct: number }[];
  };
};

const soma = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
const ordemDensa = (valores: number[]) => {
  const unicos = [...new Set(valores)].sort((a, b) => b - a);
  return (v: number) => unicos.indexOf(v) + 1;
};
const quase0 = (v: number) => Math.abs(v) < 0.005;

/** "Op Tem Movimentação" > 0: operações e OMs com crédito recebido do EMAER no ano. */
export function opcoesComae(d: DadosComae, f: Pick<FiltroComae, 'ano' | 'operacao'>) {
  const doAno = d.recebidoEmaer.filter((r) => !f.ano || r.ano === f.ano);
  const porOp = new Map<string, number>();
  for (const r of doAno) porOp.set(operacaoCurta(r.op), (porOp.get(operacaoCurta(r.op)) ?? 0) + r.valor);
  const porOM = new Map<string, number>();
  for (const r of doAno) {
    if (f.operacao && operacaoCurta(r.op) !== f.operacao) continue;
    porOM.set(r.ugResp, (porOM.get(r.ugResp) ?? 0) + r.valor);
  }
  // Unidades que receberam descentralização do COMAE também entram no filtro de OM
  for (const m of d.comae) {
    if (m.k === 'A' || !m.om || (f.ano && m.ano !== f.ano) || (f.operacao && operacaoCurta(m.op) !== f.operacao)) continue;
    porOM.set(m.om, (porOM.get(m.om) ?? 0) + Math.abs(m.valor));
  }
  const comValor = (m: Map<string, number>) => [...m].filter(([, v]) => !quase0(v)).map(([k]) => k).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return { operacoes: comValor(porOp), oms: comValor(porOM) };
}

/** Detalhe do disponível do COMAE na operação (tooltip): base de empenhos; sem PI próprio, base de crédito. */
function detalheComae(d: DadosComae, opEf: string): Detalhe {
  const agrupar = (itens: { ugExec: string; ugResp: string; nd: string; valor: number }[]) => {
    const m = new Map<string, LinhaDetalhe>();
    for (const x of itens) {
      const k = [x.ugExec, x.ugResp, x.nd].join('\u0000');
      const l = m.get(k) ?? { ugExec: x.ugExec, ugResp: x.ugResp, nd: x.nd, valor: 0 };
      l.valor += x.valor;
      m.set(k, l);
    }
    return [...m.values()].filter((l) => !quase0(l.valor)).sort((a, b) => b.valor - a.valor);
  };
  const doEmp = agrupar(d.empenhos.filter((e) => e.comae && e.opEf === opEf)
    .map((e) => ({ ugExec: e.ugExec, ugResp: e.ugResp, nd: e.nd, valor: e.disp })));
  const doCred = doEmp.length ? [] : agrupar(d.comae.filter((m) => m.opEf === opEf)
    .map((m) => ({ ugExec: m.ugExec, ugResp: d.nomeComae, nd: m.nd, valor: m.valor })));
  const usaCredito = !doEmp.length && doCred.length > 0;
  const linhas = usaCredito ? doCred : doEmp;
  return { linhas, total: soma(linhas, (l) => l.valor), fonte: usaCredito ? 'credito' : 'empenhos' };
}

export function paginaComae(d: DadosComae, f: FiltroComae): PaginaComae {
  const noAno = (ano: string) => !f.ano || ano === f.ano;
  const naOp = (op: string) => !f.operacao || operacaoCurta(op) === f.operacao;
  // Filtro numa unidade (não no próprio COMAE): vale o que o COMAE descentralizou para ela
  const omUnidade = f.om && f.om !== d.nomeComae ? f.om : null;

  const contexto = d.comae.filter((m) => noAno(m.ano) && naOp(m.op));
  const comOM = omUnidade ? contexto.filter((m) => m.k !== 'A' && m.om === omUnidade) : contexto;
  const valorA = (xs: MovComae[]) => soma(xs.filter((m) => m.k === 'A'), (m) => m.valor);
  const valorB = (xs: MovComae[]) => -soma(xs.filter((m) => m.k === 'S'), (m) => m.valor) - soma(xs.filter((m) => m.k === 'D'), (m) => m.valor);

  // Faixa por ND (segue a visão Recebido / Descentralizado; numa unidade, sempre o descentralizado para ela)
  const visao = omUnidade ? 'Descentralizado' : (f.visao ?? 'Recebido');
  const porND = new Map<string, MovComae[]>();
  for (const m of comOM) {
    if (!porND.has(m.nd)) porND.set(m.nd, []);
    porND.get(m.nd)!.push(m);
  }
  const ndsBrutos = [...porND].map(([nd, xs]) => ({
    nd, ndNome: xs.find((x) => x.ndNome)?.ndNome ?? '', valor: visao === 'Recebido' ? valorA(xs) : valorB(xs),
  })).filter((x) => !quase0(x.valor));
  const totalNd = soma(ndsBrutos, (x) => x.valor);
  const cards = ndsBrutos.map((x) => ({ ...x, pct: totalNd ? x.valor / totalNd : 0 })).sort((a, b) => b.valor - a.valor);

  // Controle geral por operação efetiva (o filtro de OM não age aqui)
  const empComae = new Map<string, number>();
  for (const e of d.empenhos) {
    if (e.comae) empComae.set(e.opEf, (empComae.get(e.opEf) ?? 0) + e.aLiq + e.liqPagar + e.pago);
  }
  const porOp = new Map<string, MovComae[]>();
  for (const m of contexto) {
    if (!porOp.has(m.opEf)) porOp.set(m.opEf, []);
    porOp.get(m.opEf)!.push(m);
  }
  const linhasControle = [...porOp].map(([opEf, xs]) => {
    const a = valorA(xs), b = valorB(xs), e = empComae.get(opEf) ?? 0;
    return { opEf, rotulo: rotuloOperacao(opEf), a, b, e, d: a - b - e };
  }).filter((l) => !quase0(l.a) || !quase0(l.b)).sort((x, y) => y.d - x.d);
  const totA = soma(linhasControle, (l) => l.a), totB = soma(linhasControle, (l) => l.b), totE = soma(linhasControle, (l) => l.e);

  // Crédito disponível no COMAE: só o ano filtra (operação e OM não, como no BI)
  const opsDoAno = new Set(d.opsCredito.filter((o) => noAno(o.ano) && o.op !== OP_FORA_DAS_LISTAS).map((o) => o.opEf));
  const dispEmp = new Map<string, number>();
  for (const e of d.empenhos) if (e.comae) dispEmp.set(e.opEf, (dispEmp.get(e.opEf) ?? 0) + e.disp);
  const dispBruto = [...opsDoAno].map((opEf) => {
    const valor = dispEmp.has(opEf)
      ? dispEmp.get(opEf)!
      : (() => { const xs = d.comae.filter((m) => m.opEf === opEf && noAno(m.ano)); return valorA(xs) - valorB(xs); })();
    return { opEf, rotulo: rotuloOperacao(opEf), valor };
  }).filter((x) => !quase0(x.valor));
  const posicao = ordemDensa(dispBruto.map((x) => x.valor));
  const disponivel = dispBruto
    .map((x) => ({ ...x, rank: posicao(x.valor), detalhe: detalheComae(d, x.opEf) }))
    .sort((a, b) => a.rank - b.rank || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

  const recebidoDireto = omUnidade
    ? soma(d.recebidoEmaer.filter((r) => r.ugResp === omUnidade && noAno(r.ano) && naOp(r.op)), (r) => r.valor)
    : 0;

  return {
    cabecalho: {
      recebido: omUnidade ? recebidoDireto : valorA(comOM),
      descentralizado: valorB(comOM),
      om: omUnidade ? { nome: omUnidade, descentralizado: valorB(comOM), recebidoDireto } : null,
    },
    nds: { visao, total: totalNd, cards, om: omUnidade },
    controle: { linhas: linhasControle, total: { a: totA, b: totB, e: totE, d: totA - totB - totE } },
    disponivel,
    pedidos: pedidosComae(d, f),
  };
}

/** Lista de pedidos (visual oculto do BI, alternado pelo botão ↻ do Controle Geral). */
export function pedidosComae(d: DadosComae, f: FiltroComae): PaginaComae['pedidos'] {
  const filtro = (p: MovPedido) => (f.visao === 'Recebido' ? p.rc : f.visao === 'Descentralizado' ? p.ds : p.rc || p.ru || p.ds);
  const rotulo = f.visao === 'Recebido' ? 'recebidos pelo COMAE' : f.visao === 'Descentralizado' ? 'descentralizados às unidades' : 'classificados';
  const base = d.pedidos.filter((p) => filtro(p) && (!f.ano || p.ano === f.ano)
    && (!f.operacao || operacaoCurta(p.op) === f.operacao) && (!f.om || p.ugResp === f.om));
  const grupos = new Map<string, MovPedido[]>();
  for (const p of base) {
    if (!grupos.has(p.pedido)) grupos.set(p.pedido, []);
    grupos.get(p.pedido)!.push(p);
  }
  /** O de maior |valor| e quantos outros existem ("339030 +2"). */
  const principal = (xs: MovPedido[], chave: (p: MovPedido) => string, contar: boolean) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(chave(x), (m.get(chave(x)) ?? 0) + x.valor);
    const ordem = [...m].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    if (!ordem.length) return '';
    return ordem[0][0] + (contar && ordem.length > 1 ? ` +${ordem.length - 1}` : '');
  };
  const validos = [...grupos].map(([pedido, xs]) => ({
    pedido,
    valor: soma(xs, (x) => x.valor),
    data: xs.reduce<string | null>((max, x) => (x.data && (!max || x.data > max) ? x.data : max), null),
    nd: principal(xs, (x) => x.nd, true),
    om: principal(xs, (x) => x.ugResp, true),
    desc: principal(xs, (x) => x.desc, false),
  })).filter((x) => !quase0(x.valor));
  const maior = Math.max(0, ...validos.map((x) => Math.abs(x.valor)));
  const linhas = validos
    .map((x) => ({ ...x, pct: maior ? Math.round((Math.abs(x.valor) / maior) * 100) : 0 }))
    .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '') || Math.abs(b.valor) - Math.abs(a.valor));
  return { rotulo, qtd: linhas.length, total: soma(linhas, (x) => x.valor), linhas };
}

export type PaginaUnidades = {
  indicadores: { total: number; disp: number; aLiq: number; liqPagar: number; pago: number };
  unidades: {
    ugResp: string; aLiq: number; liqPagar: number; pago: number;
    porNd: { nd: string; ndNome: string; aLiq: number; liqPagar: number; pago: number }[];
  }[];
  dispDetalhe: {
    linhas: number; total: number;
    operacoes: { op: string; rotulo: string; total: number; linhas: { ugResp: string; nd: string; valor: number }[] }[];
  };
  dispPorOperacao: { rank: number; op: string; rotulo: string; valor: number; detalhe: Detalhe }[];
  /** Com uma OM filtrada: por ND, o que o COMAE descentralizou para ela e a execução dela. */
  omPorNd: { nd: string; ndNome: string; descentralizado: number; disp: number; aLiq: number; liqPagar: number; pago: number }[] | null;
};

export function opcoesUnidades(d: DadosComae, f: FiltroUnidades) {
  const ops = opcoesComae(d, { ano: null, operacao: null }).operacoes;
  const oms = [...new Set(d.empenhos.filter((e) => !f.operacao || operacaoCurta(e.op) === f.operacao).map((e) => e.ugResp))]
    .filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return { operacoes: ops, oms };
}

export function paginaUnidades(d: DadosComae, f: FiltroUnidades): PaginaUnidades {
  const filtrados = d.empenhos.filter((e) => (!f.operacao || operacaoCurta(e.op) === f.operacao) && (!f.om || e.ugResp === f.om));
  const ind = {
    disp: soma(filtrados, (e) => e.disp), aLiq: soma(filtrados, (e) => e.aLiq),
    liqPagar: soma(filtrados, (e) => e.liqPagar), pago: soma(filtrados, (e) => e.pago),
  };
  const fora = filtrados.filter((e) => !e.comae);

  // Execução por UG responsável (fora o COMAE), maior "a liquidar" primeiro
  const porUnidade = new Map<string, EmpenhoPainel[]>();
  for (const e of fora) {
    if (!porUnidade.has(e.ugResp)) porUnidade.set(e.ugResp, []);
    porUnidade.get(e.ugResp)!.push(e);
  }
  const unidades = [...porUnidade].map(([ugResp, xs]) => {
    const nds = new Map<string, { nd: string; ndNome: string; aLiq: number; liqPagar: number; pago: number }>();
    for (const x of xs) {
      const n = nds.get(x.nd) ?? { nd: x.nd, ndNome: x.ndNome, aLiq: 0, liqPagar: 0, pago: 0 };
      n.aLiq += x.aLiq; n.liqPagar += x.liqPagar; n.pago += x.pago;
      nds.set(x.nd, n);
    }
    return {
      ugResp, aLiq: soma(xs, (x) => x.aLiq), liqPagar: soma(xs, (x) => x.liqPagar), pago: soma(xs, (x) => x.pago),
      porNd: [...nds.values()].filter((n) => !quase0(n.aLiq) || !quase0(n.liqPagar) || !quase0(n.pago))
        .sort((a, b) => b.aLiq - a.aLiq),
    };
  }).filter((u) => !quase0(u.aLiq) || !quase0(u.liqPagar) || !quase0(u.pago))
    .sort((a, b) => b.aLiq - a.aLiq || a.ugResp.localeCompare(b.ugResp, 'pt-BR'));

  // Disponível nas unidades, em seções por operação
  const celulas = new Map<string, { op: string; opEf: string; ugResp: string; nd: string; valor: number }>();
  for (const e of fora) {
    const k = [e.op, e.ugResp, e.nd].join('\u0000');
    const c = celulas.get(k) ?? { op: e.op, opEf: e.opEf, ugResp: e.ugResp, nd: e.nd, valor: 0 };
    c.valor += e.disp;
    celulas.set(k, c);
  }
  const comValor = [...celulas.values()].filter((c) => !quase0(c.valor));
  const porOpDet = new Map<string, typeof comValor>();
  for (const c of comValor) {
    if (!porOpDet.has(c.op)) porOpDet.set(c.op, []);
    porOpDet.get(c.op)!.push(c);
  }
  const operacoes = [...porOpDet].map(([op, cs]) => {
    const totUnid = new Map<string, number>();
    for (const c of cs) totUnid.set(c.ugResp, (totUnid.get(c.ugResp) ?? 0) + c.valor);
    return {
      op, rotulo: rotuloOperacao(cs[0].opEf), total: soma(cs, (c) => c.valor),
      linhas: cs.map((c) => ({ ugResp: c.ugResp, nd: c.nd, valor: c.valor })).sort((a, b) =>
        totUnid.get(b.ugResp)! - totUnid.get(a.ugResp)! || a.ugResp.localeCompare(b.ugResp, 'pt-BR') || b.valor - a.valor),
    };
  }).sort((a, b) => b.total - a.total);

  // Total disponível por operação: os filtros de operação e OM não agem aqui (como no BI)
  const porOpTot = new Map<string, { op: string; opEf: string; valor: number }>();
  for (const e of d.empenhos) {
    if (e.comae || e.op === OP_FORA_DAS_LISTAS) continue;
    const k = operacaoCurta(e.op);
    const x = porOpTot.get(k) ?? { op: e.op, opEf: e.opEf, valor: 0 };
    x.valor += e.disp;
    porOpTot.set(k, x);
  }
  const listaOps = [...porOpTot.values()].filter((x) => !quase0(x.valor));
  const posicao = ordemDensa(listaOps.map((x) => x.valor));
  const dispPorOperacao = listaOps.map((x) => {
    const linhas = new Map<string, LinhaDetalhe>();
    for (const e of d.empenhos) {
      if (e.comae || e.opEf !== x.opEf) continue;
      const k = [e.ugExec, e.ugResp, e.nd].join('\u0000');
      const l = linhas.get(k) ?? { ugExec: e.ugExec, ugResp: e.ugResp, nd: e.nd, valor: 0 };
      l.valor += e.disp;
      linhas.set(k, l);
    }
    const ls = [...linhas.values()].filter((l) => !quase0(l.valor)).sort((a, b) => b.valor - a.valor);
    return {
      rank: posicao(x.valor), op: x.op, rotulo: rotuloOperacao(x.opEf), valor: x.valor,
      detalhe: { linhas: ls, total: soma(ls, (l) => l.valor), fonte: 'empenhos' as const },
    };
  }).sort((a, b) => a.rank - b.rank || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

  // OM filtrada: descentralizado pelo COMAE (todos os anos da base) e execução, por ND
  let omPorNd: PaginaUnidades['omPorNd'] = null;
  if (f.om && f.om !== d.nomeComae) {
    type Lin = NonNullable<PaginaUnidades['omPorNd']>[number];
    const m = new Map<string, Lin>();
    const linha = (nd: string, ndNome: string) => {
      const l = m.get(nd) ?? { nd, ndNome, descentralizado: 0, disp: 0, aLiq: 0, liqPagar: 0, pago: 0 };
      if (!l.ndNome) l.ndNome = ndNome;
      m.set(nd, l);
      return l;
    };
    for (const x of d.comae) {
      if (x.k === 'A' || x.om !== f.om || (f.operacao && operacaoCurta(x.op) !== f.operacao)) continue;
      linha(x.nd, x.ndNome).descentralizado -= x.valor; // saída (−) e devolução (+) do lado do COMAE
    }
    for (const e of filtrados) {
      const l = linha(e.nd, e.ndNome);
      l.disp += e.disp; l.aLiq += e.aLiq; l.liqPagar += e.liqPagar; l.pago += e.pago;
    }
    omPorNd = [...m.values()]
      .filter((l) => [l.descentralizado, l.disp, l.aLiq, l.liqPagar, l.pago].some((v) => !quase0(v)))
      .sort((a, b) => a.nd.localeCompare(b.nd));
  }

  return {
    indicadores: { total: ind.disp + ind.aLiq + ind.liqPagar + ind.pago, ...ind },
    unidades,
    dispDetalhe: { linhas: comValor.length, total: soma(comValor, (c) => c.valor), operacoes },
    dispPorOperacao,
    omPorNd,
  };
}

// ── Formatos (os do BI: "R$ #,##0.00" e "0.0%") ─────────────────────────────

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtMoeda = (v: number) => moeda.format(quase0(v) ? 0 : v).replace(/\s/g, ' ');
export const fmtPct = (v: number) =>
  (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
export const fmtData = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
export const fmtDataCurta = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');

/** Cor da ND nos selos (a mesma de todos os visuais do BI). */
export function corDaNd(nd: string): string {
  switch (nd) {
    case '339015': return '#3E86C9';
    case '339030': return '#D68A3A';
    case '339033': return '#25A3A3';
    case '339039': return '#8266C4';
    case '339092': return '#C4566F';
    default: return '#6B7689';
  }
}
