import type { LoaderFunctionArgs } from 'react-router';
import { requireUser } from '~/lib/session.server';
import { supabaseAdmin } from '~/lib/supabase.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const operacao = url.searchParams.get('operacao') ?? '';
  if (!operacao) return Response.json([]);

  const db = supabaseAdmin();

  // Get latest empenhos snapshot for COMAE (ug_resp_cod=120115)
  const { data: snap } = await db
    .from('empenhos')
    .select('snapshot_em')
    .eq('ug_resp_cod', '120115')
    .eq('operacao', operacao)
    .order('snapshot_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  const linhasEmpenhos: Array<{
    ug_exec_cod: string; ug_exec_nome: string;
    nd_cod: string; nd_nome: string; disponivel: number;
  }> = [];

  if (snap) {
    const { data } = await db
      .from('empenhos')
      .select('ug_exec_cod, ug_exec_nome, nd_cod, nd_nome, disponivel')
      .eq('ug_resp_cod', '120115')
      .eq('operacao', operacao)
      .eq('snapshot_em', (snap as { snapshot_em: string }).snapshot_em)
      .gt('disponivel', 0)
      .order('nd_cod');
    if (data) linhasEmpenhos.push(...data);
  }

  // Get PTRES/FONTE/PI from historical ANULACAO cells for this operacao
  // Use siscodec_celulas joined via siscodec_pedidos
  const { data: celulasHist } = await db
    .from('siscodec_celulas')
    .select('nd, ptres, fonte, plano_interno, siscodec_pedidos!inner(operacao)')
    .eq('tipo', 'ANULACAO')
    .eq('siscodec_pedidos.operacao', operacao)
    .not('ptres', 'is', null)
    .not('fonte', 'is', null);

  // Build nd -> { ptres, fonte, plano_interno } map (most recent wins via order)
  const histMap = new Map<string, { ptres: string; fonte: string; plano_interno: string }>();
  if (celulasHist) {
    for (const cel of celulasHist) {
      const nd = cel.nd?.trim();
      if (!nd || histMap.has(nd)) continue;
      histMap.set(nd, {
        ptres:         cel.ptres         ?? '',
        fonte:         cel.fonte         ?? '',
        plano_interno: cel.plano_interno ?? '',
      });
    }
  }

  // Merge empenhos + historical data
  const resultado = linhasEmpenhos.map(l => ({
    ug_exec_cod:   l.ug_exec_cod,
    ug_exec_nome:  l.ug_exec_nome,
    nd_cod:        l.nd_cod,
    nd_nome:       l.nd_nome,
    disponivel:    l.disponivel,
    ptres:         histMap.get(l.nd_cod)?.ptres         ?? '',
    fonte:         histMap.get(l.nd_cod)?.fonte         ?? '',
    plano_interno: histMap.get(l.nd_cod)?.plano_interno ?? '',
  }));

  return Response.json(resultado);
}
