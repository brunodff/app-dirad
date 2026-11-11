/**
 * Aba CREDITO_COMAE (relatório do Tesouro Gerencial, todos os exercícios) e o Comparativo do
 * crédito que o COMAE descentralizou para o CELOG e a DIRMAB (combustível e manutenção de aeronaves).
 *
 * O relatório vem agrupado: célula em branco = mesmo valor da linha de cima (colunas A–Q).
 */

import { parseData, parseValor, normalizaNd, normalizaUg } from './engine/normalizar';

// ── Leitura da aba ────────────────────────────────────────────────────────────

export type LinhaComae = {
  ano: number | null;
  acao_cod: string; acao_nome: string;
  pi_cod: string; pi_nome: string;
  ug_exec_cod: string; ug_exec_nome: string;
  data: string | null;
  documento: string; nc: string | null;
  descricao: string;
  ug_resp_cod: string; ug_resp_nome: string;
  nd_cod: string; nd_nome: string;
  favorecido_cod: string; favorecido_nome: string;
  origem_cod: string; origem_nome: string;
  valor: number;
};

const COLS_AGRUPADAS = 17; // A..Q repetem; R (valor) não

/** Converte as linhas da aba (valores exibidos) em movimentos, preenchendo os agrupamentos. */
export function lerCreditoComae(linhas: unknown[][]): LinhaComae[] {
  const inicio = linhas.findIndex(l => String(l?.[0] ?? '').trim() === 'Ação Governo');
  const dados = inicio >= 0 ? linhas.slice(inicio + 1) : linhas;

  const anterior: string[] = [];
  const out: LinhaComae[] = [];
  for (const bruta of dados) {
    const r: string[] = [];
    for (let c = 0; c < 18; c++) {
      const v = String(bruta?.[c] ?? '').trim();
      r[c] = c < COLS_AGRUPADAS && v === '' ? (anterior[c] ?? '') : v;
    }
    for (let c = 0; c < COLS_AGRUPADAS; c++) anterior[c] = r[c];

    const valor = parseValor(r[17]);
    if (!valor) continue;

    const nc = r[7].match(/(\d{4}NC\d+)$/)?.[1] ?? null;
    const data = parseData(r[6]) || null;
    const ano = Number(nc?.slice(0, 4) ?? data?.slice(0, 4)) || null;

    out.push({
      ano,
      acao_cod: r[0], acao_nome: r[1],
      pi_cod: r[2], pi_nome: r[3],
      ug_exec_cod: normalizaUg(r[4]), ug_exec_nome: r[5],
      data, documento: r[7], nc,
      descricao: r[8],
      ug_resp_cod: normalizaUg(r[9]), ug_resp_nome: r[10],
      nd_cod: normalizaNd(r[11]), nd_nome: r[12],
      favorecido_cod: normalizaUg(r[13]), favorecido_nome: r[14],
      origem_cod: normalizaUg(r[15]), origem_nome: r[16],
      valor: Math.round(valor * 100) / 100,
    });
  }
  return out;
}

// ── Comparativo: COMAE → CELOG / DIRMAB ───────────────────────────────────────

const UG_COMAE = '120115';
/** UG responsável de destino → recebedor (combustível fica com o CELOG; manutenção, com a DIRMAB). */
export const RECEBEDORES: Record<string, 'CELOG' | 'DIRMAB'> = { '120071': 'CELOG', '120038': 'DIRMAB' };
export const NDS_COMPARATIVO = ['339030', '339039'] as const;

export type Valores = { celog30: number; celog39: number; dirmab30: number; dirmab39: number };

/** Uma descentralização do COMAE para CELOG/DIRMAB (valor +) ou devolução deles ao COMAE (−). */
export type ItemComparativo = {
  ano: number; op: string; pi: string; nc: string | null; data: string | null; nd: string;
  recebedor: 'CELOG' | 'DIRMAB'; valor: number; descricao: string;
};
export type NcComparativo = Omit<ItemComparativo, 'op' | 'pi'> & {
  /** Órgão do "PEDIDO NR …/ÓRGÃO/AAAA" citado no documento (COMAE, EMAER-5SC2, COMPREP…). */
  pedido: string;
};
export type LinhaComparativo = {
  chave: string;
  operacao: string;
  pi: string;
  porAno: Record<number, Valores>;
  ncs: NcComparativo[];
};
export type ComparativoDados = { anos: number[]; linhas: LinhaComparativo[] };

const zero = (): Valores => ({ celog30: 0, celog39: 0, dirmab30: 0, dirmab39: 0 });
export const totalValores = (v: Valores | undefined) => (v ? v.celog30 + v.celog39 + v.dirmab30 + v.dirmab39 : 0);

export function origemPedido(descricao: string): string {
  const org = descricao.match(/PEDIDO\s*N[RºO°.]*\s*\d+\s*\/\s*([A-Z0-9-]+)/i)?.[1]
    ?? descricao.match(/\d+\s*\/\s*(DIRMAB|COMAE|COMGAP|COMPREP|CELOG|EMAER[-A-Z0-9]*)\s*\/\s*\d{4}/i)?.[1];
  return org ? org.toUpperCase() : 'sem pedido';
}

/** O PI "Destaques" na ação 2000 é o crédito da Semana da Pátria (como no resto do app). */
export function nomeOperacao(piCod: string, acaoCod: string, piNome: string): string {
  if (piCod === 'D0000010000' && acaoCod === '2000') return 'SEMANA DA PATRIA';
  return piNome;
}

/** "OP CATRIMANI II" (2025) e "OP CATRIMANI II" (2026) → "CATRIMANI II": sem prefixo, ano e acento. */
export function nomeCanonico(nome: string): string {
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/\s+-\s+A CARGO D[OA] .*$/, '')
    .replace(/^(OPERACAO|OP\.?)\s+/, '')
    .replace(/\b20\d{2}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const normDesc = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

/**
 * COMAE → CELOG/DIRMAB a partir do relatório (anos que não estão na base do Painel COMAE).
 *
 * Em 2026 a passagem é uma NC (UGR COMAE de um lado, UGR CELOG/DIRMAB do outro). Em 2025 era uma
 * troca de UGR dentro da DIRAD, num documento SEM NC ("-9"): as duas pernas têm a mesma data, UG,
 * ND e descrição. Por isso o documento é a NC ou, sem ela, data + UG + ND + descrição.
 * Mesmas exclusões do painel: correção de UGR não é descentralização; "anulação para
 * descentralização" não é devolução.
 */
export function descentralizacoesDoRelatorio(linhas: LinhaComae[], anos: Set<number>): ItemComparativo[] {
  const grupos = new Map<string, LinhaComae[]>();
  for (const l of linhas) {
    if (!l.ano || !anos.has(l.ano) || !l.valor) continue;
    const doc = l.nc ? `NC|${l.nc}` : `DOC|${l.data}|${l.ug_exec_cod}|${l.nd_cod}|${normDesc(l.descricao)}`;
    const k = `${doc}|${l.pi_cod}`;
    const g = grupos.get(k) ?? [];
    g.push(l);
    grupos.set(k, g);
  }

  const out: ItemComparativo[] = [];
  for (const ls of grupos.values()) {
    const comaeSai = ls.some(x => x.ug_resp_cod === UG_COMAE && x.valor < 0);
    const comaeRecebe = ls.some(x => x.ug_resp_cod === UG_COMAE && x.valor > 0);
    if (!comaeSai && !comaeRecebe) continue;
    for (const x of ls) {
      const recebedor = RECEBEDORES[x.ug_resp_cod];
      if (!recebedor || !(NDS_COMPARATIVO as readonly string[]).includes(x.nd_cod)) continue;
      const d = normDesc(x.descricao);
      if (d.includes('CORRECAO DE UGR')) continue;
      const desc = x.valor > 0 && comaeSai;
      const devol = x.valor < 0 && comaeRecebe && !d.includes('ANULACAO PARA DESCENTRALIZACAO');
      if (!desc && !devol) continue;
      out.push({
        ano: x.ano!, op: nomeOperacao(x.pi_cod, x.acao_cod, x.pi_nome), pi: x.pi_cod, nc: x.nc, data: x.data,
        nd: x.nd_cod, recebedor, valor: x.valor, descricao: x.descricao,
      });
    }
  }
  return out;
}

/**
 * Junta os itens por operação e ano. A mesma operação muda de PI a cada ano (OCS8… em 2025,
 * OCS9… em 2026), então a junção é pelo nome. `piPorNome` (nome canônico → PI) completa o PI dos
 * itens que vêm do painel, que não trazem o código.
 */
export function calcularComparativo(itens: ItemComparativo[], piPorNome: Map<string, string> = new Map()): ComparativoDados {
  const map = new Map<string, LinhaComparativo & { nomes: Map<string, { n: number; ano: number }>; pis: Set<string> }>();
  const anos = new Set<number>();

  for (const it of itens) {
    const chave = nomeCanonico(it.op);
    const linha = map.get(chave) ?? {
      chave, operacao: it.op, pi: '', porAno: {} as Record<number, Valores>, ncs: [] as NcComparativo[],
      nomes: new Map<string, { n: number; ano: number }>(), pis: new Set<string>(),
    };
    const nome = linha.nomes.get(it.op) ?? { n: 0, ano: it.ano };
    nome.n += 1; nome.ano = Math.max(nome.ano, it.ano);
    linha.nomes.set(it.op, nome);
    const pi = it.pi || piPorNome.get(chave);
    if (pi) linha.pis.add(pi);

    anos.add(it.ano);
    const v = (linha.porAno[it.ano] ??= zero());
    const campo = `${it.recebedor === 'CELOG' ? 'celog' : 'dirmab'}${it.nd === '339030' ? '30' : '39'}` as keyof Valores;
    v[campo] = Math.round((v[campo] + it.valor) * 100) / 100;

    linha.ncs.push({
      ano: it.ano, data: it.data, nc: it.nc, nd: it.nd, recebedor: it.recebedor, valor: Math.round(it.valor * 100) / 100,
      descricao: it.descricao, pedido: origemPedido(it.descricao),
    });
    map.set(chave, linha);
  }

  const linhas: LinhaComparativo[] = [...map.values()].map(({ nomes, pis, ...l }) => ({
    ...l,
    // Nome usado no ano mais recente; no empate, o mais frequente
    operacao: [...nomes.entries()].sort((a, b) => b[1].ano - a[1].ano || b[1].n - a[1].n)[0][0],
    pi: [...pis].sort().join(' · '),
    ncs: l.ncs.sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '')),
  }));
  const maiorTotal = (l: LinhaComparativo) => Math.max(...Object.values(l.porAno).map(totalValores), 0);
  linhas.sort((a, b) => maiorTotal(b) - maiorTotal(a));

  return { anos: [...anos].sort(), linhas };
}
