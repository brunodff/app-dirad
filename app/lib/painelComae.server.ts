// Carga do Painel COMAE: lê o espelho da planilha que o /api/sync grava e classifica pelas regras do BI.
import { fetchAll, type supabaseAdmin } from '~/lib/supabase.server';
import {
  descentralizacoesComae, prepararDadosComae, type CreditoBD, type DadosComae, type DescentralizacaoNc, type EmpenhoBD,
} from '~/lib/painelComae';

type Db = ReturnType<typeof supabaseAdmin>;

const COLS_CREDITO =
  'operacao, ug_exec_cod, ug_exec_nome, data, nc, descricao, ug_resp_cod, ug_resp_nome, nd_cod, nd_nome, origem_nome, valor, pedido';
const COLS_EMPENHO =
  'operacao, ug_exec_nome, ug_resp_cod, ug_resp_nome, nd_cod, nd_nome, disponivel, a_liquidar, em_liquidacao, liq_a_pagar, pago';

/**
 * A planilha inteira de crédito, como estava no último sync bem-sucedido.
 * O sync regrava todas as linhas da planilha com o seu sync_id (as que sumiram ficam com um id antigo),
 * então as linhas com sync_id >= o do último sync concluído são o espelho atual — inclusive as que o
 * motor do app marca como IGNORADO, que o BI usa (ex.: trocas de ND dentro do COMAE).
 */
async function ultimoSyncId(db: Db): Promise<number> {
  const { data: ultimo } = await db
    .from('sync_log')
    .select('id')
    .in('status', ['SUCESSO', 'PARCIAL'])
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (ultimo as { id: number } | null)?.id ?? 0;
}

/**
 * Saídas e devoluções do COMAE por NC, com a unidade de destino — as mesmas que formam o
 * Descentralizado [B] do painel. Usada pelo Comparativo, para os dois baterem.
 */
export async function carregarDescentralizacoesComae(db: Db): Promise<DescentralizacaoNc[]> {
  const syncId = await ultimoSyncId(db);
  const { data: creditos, error } = await fetchAll<CreditoBD>(() =>
    db.from('movimentos_credito').select(COLS_CREDITO).gte('sync_id', syncId).order('id'));
  if (error) throw new Error(`Painel COMAE: falha ao ler o banco (${error.message})`);
  return descentralizacoesComae(creditos);
}

export async function carregarDadosComae(db: Db): Promise<DadosComae> {
  const syncId = await ultimoSyncId(db);

  const [{ data: creditos, error: e1 }, { data: empenhos, error: e2 }, { data: desativadas, error: e3 }] = await Promise.all([
    fetchAll<CreditoBD>(() => db.from('movimentos_credito').select(COLS_CREDITO).gte('sync_id', syncId).order('id')),
    fetchAll<EmpenhoBD>(() => db.from('empenhos').select(COLS_EMPENHO).order('id')),
    // as mesmas operações desativadas que as outras abas escondem (aba Desativados)
    db.from('config_operacoes').select('operacao').eq('ativo', false),
  ]);
  if (e1 || e2 || e3) throw new Error(`Painel COMAE: falha ao ler o banco (${(e1 ?? e2 ?? e3)?.message})`);
  return prepararDadosComae(creditos, empenhos, (desativadas ?? []).map((d) => (d as { operacao: string }).operacao));
}
