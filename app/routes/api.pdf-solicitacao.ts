import type { ActionFunctionArgs } from 'react-router';
import { requireUser } from '~/lib/session.server';
import { supabaseAdmin } from '~/lib/supabase.server';
import { gerarSiscodecPDF } from '~/lib/gerar-siscodec-pdf.server';
import { CONFIG_PADRAO } from '~/lib/siscodec-doc-config';
import type { SiscodecDocConfig } from '~/lib/siscodec-doc-config';

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);

  let body: {
    pedido_id: number;
    num_desc?: string;
    num_dor?: string;
    operacao?: string;
    config?: Partial<SiscodecDocConfig>;
  };

  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: pedido } = await db
    .from('siscodec_pedidos')
    .select('*, siscodec_celulas(*)')
    .eq('id', body.pedido_id)
    .single();

  if (!pedido) return new Response('Pedido not found', { status: 404 });

  const cfg: SiscodecDocConfig = { ...CONFIG_PADRAO, ...(body.config ?? {}) };
  const celulas = (pedido.siscodec_celulas as Array<{
    ordem: number; tipo: string; ptres: string; nd: string; valor: number;
    obs_linha1?: string | null; obs_linha2?: string | null;
  }>)
    .sort((a, b) => a.ordem - b.ordem)
    .map(c => ({
      tipo:      c.tipo as 'ANULACAO' | 'SUPLEMENTACAO',
      ptres:     c.ptres,
      nd:        c.nd,
      valor:     c.valor,
      obs:       [c.obs_linha1, c.obs_linha2].filter(Boolean).join(' / '),
    }));

  const pdfBytes = await gerarSiscodecPDF({
    operacao:          body.operacao  ?? pedido.operacao ?? 'N/A',
    num_desc:          body.num_desc  ?? 'XXX',
    num_dor:           body.num_dor   ?? 'XX',
    destaque:          pedido.destaque ?? 'Nao',
    signatario:        cfg.signatario,
    pag:               cfg.pag,
    ug_exec_an_cod:    cfg.ug_exec_an_cod,
    ug_exec_an_sigla:  cfg.ug_exec_an_sigla,
    ug_exec_sup_cod:   cfg.ug_exec_sup_cod,
    ug_exec_sup_sigla: cfg.ug_exec_sup_sigla,
    ug_cred_an_cod:    cfg.ug_cred_an_cod,
    ug_cred_an_sigla:  cfg.ug_cred_an_sigla,
    ug_cred_sup_cod:   cfg.ug_cred_sup_cod,
    ug_cred_sup_sigla: cfg.ug_cred_sup_sigla,
    fonte:             cfg.fonte,
    esfera:            cfg.esfera,
    plano_interno:     cfg.plano_interno,
    celulas,
  });

  const filename = `solicitacao-desc-${(body.operacao ?? pedido.operacao ?? 'comae').replace(/[^a-zA-Z0-9-]/g, '-')}.pdf`;

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
