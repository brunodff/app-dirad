/**
 * Aba CREDITO_COMAE (relatório do Tesouro Gerencial, todos os exercícios) e o Comparativo
 * de crédito repassado ao CELOG para combustível e manutenção de aeronaves.
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

// ── Comparativo ───────────────────────────────────────────────────────────────

const UG_DIRAD = '120002';
const UG_CELOG = '120071';
const UGR_CELOG = '120071';   // crédito do próprio CELOG (combustível)
const UGR_DIRMAB = '120038';  // crédito da DIRMAB executado pelo CELOG (manutenção)
const NDS = ['339030', '339039'] as const;

export type Valores = { celog30: number; celog39: number; dirmab30: number; dirmab39: number };
export type NcComparativo = {
  ano: number; data: string | null; nc: string; nd: string;
  recebedor: 'CELOG' | 'DIRMAB'; valor: number; descricao: string;
  /** Órgão do "PEDIDO NR …/ÓRGÃO/AAAA" citado na NC (COMAE, EMAER-5SC2, COMPREP…). */
  pedido: string;
};

export function origemPedido(descricao: string): string {
  const org = descricao.match(/PEDIDO\s*N[RºO°.]*\s*\d+\s*\/\s*([A-Z0-9-]+)/i)?.[1]
    ?? descricao.match(/\d+\s*\/\s*(DIRMAB|COMAE|COMGAP|COMPREP|CELOG|EMAER[-A-Z0-9]*)\s*\/\s*\d{4}/i)?.[1];
  return org ? org.toUpperCase() : 'sem pedido';
}
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

/** O mesmo PI de "Destaques" na ação 2000 é o crédito da Semana da Pátria (como no resto do app). */
function nomeOperacao(piCod: string, acaoCod: string, piNome: string): string {
  if (piCod === 'D0000010000' && acaoCod === '2000') return 'SEMANA DA PATRIA';
  return piNome;
}

/**
 * Crédito da operação repassado pela DIRAD ao CELOG em 339030/339039, por ano.
 *
 * - Conta a perna do CELOG (UG executora 120071) cuja UGR é o próprio CELOG (combustível) ou a
 *   DIRMAB (manutenção), em NC com contrapartida na DIRAD. É a etapa que aparece nos dois anos:
 *   em 2026 o COMAE descentraliza para a DIRMAB/CELOG por NC; em 2025 a troca de UGR não gerava NC.
 * - Anulações e devoluções do CELOG para a DIRAD entram negativas.
 * - Remanejamentos do CELOG para o fechamento de câmbio ("RMJ … DIRMAB") não são descontados:
 *   o crédito segue para manutenção, paga pelas comissões no exterior.
 */
export function calcularComparativo(linhas: LinhaComae[]): ComparativoDados {
  const porDoc = new Map<string, LinhaComae[]>();
  for (const l of linhas) {
    if (!l.nc || !l.ano) continue;
    const ls = porDoc.get(l.nc) ?? [];
    ls.push(l);
    porDoc.set(l.nc, ls);
  }

  const map = new Map<string, LinhaComparativo & { nomes: Map<string, number> }>();
  const anos = new Set<number>();

  for (const ls of porDoc.values()) {
    if (!ls.some(l => l.ug_exec_cod === UG_DIRAD)) continue;
    for (const l of ls) {
      if (l.ug_exec_cod !== UG_CELOG) continue;
      if (l.ug_resp_cod !== UGR_CELOG && l.ug_resp_cod !== UGR_DIRMAB) continue;
      if (!(NDS as readonly string[]).includes(l.nd_cod)) continue;
      if (l.pi_cod === '-8') continue;
      if (l.valor < 0 && /RMJ/.test(l.descricao) && /DIRMAB/.test(l.descricao)) continue;

      // Uma linha por PI; o PI "Destaques" separa a Semana da Pátria (ação 2000) dos demais destaques
      const chave = l.pi_cod === 'D0000010000' ? `${l.pi_cod}|${l.acao_cod}` : l.pi_cod;
      const linha = map.get(chave) ?? {
        chave, operacao: '', pi: l.pi_cod,
        porAno: {} as Record<number, Valores>, ncs: [] as NcComparativo[], nomes: new Map<string, number>(),
      };
      const nome = nomeOperacao(l.pi_cod, l.acao_cod, l.pi_nome);
      linha.nomes.set(nome, (linha.nomes.get(nome) ?? 0) + 1);

      const ano = l.ano!;
      anos.add(ano);
      const v = (linha.porAno[ano] ??= zero());
      const recebedor: NcComparativo['recebedor'] = l.ug_resp_cod === UGR_CELOG ? 'CELOG' : 'DIRMAB';
      const campo = `${recebedor === 'CELOG' ? 'celog' : 'dirmab'}${l.nd_cod === '339030' ? '30' : '39'}` as keyof Valores;
      v[campo] = Math.round((v[campo] + l.valor) * 100) / 100;

      linha.ncs.push({
        ano, data: l.data, nc: l.nc!, nd: l.nd_cod, recebedor, valor: l.valor, descricao: l.descricao,
        pedido: origemPedido(l.descricao),
      });
      map.set(chave, linha);
    }
  }

  const porPi: LinhaComparativo[] = [...map.values()].map(({ nomes, ...l }) => ({
    ...l,
    // Nome mais frequente do PI (o SIAFI às vezes muda a descrição no meio do ano)
    operacao: [...nomes.entries()].sort((a, b) => b[1] - a[1])[0][0],
  }));

  // O PI muda a cada ano (OCS8… em 2025, OCS9… em 2026): junta a mesma operação pelo nome
  const porOperacao = new Map<string, LinhaComparativo>();
  const anoDoNome = new Map<string, number>();
  for (const l of porPi) {
    const chave = nomeCanonico(l.operacao);
    const anoMaisRecente = Math.max(...Object.keys(l.porAno).map(Number));
    const atual = porOperacao.get(chave);
    if (!atual) {
      porOperacao.set(chave, { ...l, chave, porAno: { ...l.porAno }, ncs: [...l.ncs] });
      anoDoNome.set(chave, anoMaisRecente);
      continue;
    }
    for (const [ano, v] of Object.entries(l.porAno)) {
      const alvo = (atual.porAno[Number(ano)] ??= zero());
      for (const k of Object.keys(v) as (keyof Valores)[]) alvo[k] = Math.round((alvo[k] + v[k]) * 100) / 100;
    }
    atual.ncs.push(...l.ncs);
    atual.pi = [...new Set([...atual.pi.split(' · '), l.pi])].sort().join(' · ');
    // Exibe o nome usado no ano mais recente
    if (anoMaisRecente > (anoDoNome.get(chave) ?? 0)) {
      atual.operacao = l.operacao;
      anoDoNome.set(chave, anoMaisRecente);
    }
  }

  const linhasOut = [...porOperacao.values()].map(l => ({
    ...l, ncs: l.ncs.sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '')),
  }));
  const maiorTotal = (l: LinhaComparativo) => Math.max(...Object.values(l.porAno).map(totalValores), 0);
  linhasOut.sort((a, b) => maiorTotal(b) - maiorTotal(a));

  return { anos: [...anos].sort(), linhas: linhasOut };
}

/** "OP CATRIMANI II" (2025) e "OP CATRIMANI II" (2026) → "CATRIMANI II": sem prefixo, ano e acento. */
function nomeCanonico(nome: string): string {
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/\s+-\s+A CARGO D[OA] .*$/, '')
    .replace(/^(OPERACAO|OP\.?)\s+/, '')
    .replace(/\b20\d{2}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
