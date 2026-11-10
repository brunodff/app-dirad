import type { ActionFunctionArgs } from 'react-router';
import { supabaseAdmin } from '~/lib/supabase.server';
import { lerCreditoComae } from '~/lib/creditoComae';

/**
 * Recebe a aba CREDITO_COMAE inteira (valores exibidos, como na planilha) e substitui a cópia
 * em `credito_comae`. Grava o lote novo antes de apagar os antigos: a tabela nunca fica vazia.
 */

function getToken(context: unknown): string {
  const ctxEnv = (context as any)?.cloudflare?.env;
  if (ctxEnv?.SYNC_SECRET_TOKEN) return String(ctxEnv.SYNC_SECRET_TOKEN).trim();
  return ((globalThis as any).__cfEnv__?.SYNC_SECRET_TOKEN ?? process.env['SYNC_SECRET_TOKEN'] ?? '').trim();
}

const LOTE_INSERCAO = 1000;

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const token = getToken(context);
  if (!token || String(body['token'] ?? '').trim() !== token) {
    return Response.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const linhas = body['linhas'];
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return Response.json({ error: 'Campo "linhas" obrigatório (array de linhas da aba)' }, { status: 400 });
  }

  const movimentos = lerCreditoComae(linhas as unknown[][]);
  if (movimentos.length === 0) {
    return Response.json({ error: 'Nenhum movimento reconhecido na aba' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const lote = Date.now();

  for (let i = 0; i < movimentos.length; i += LOTE_INSERCAO) {
    const { error } = await db.from('credito_comae')
      .insert(movimentos.slice(i, i + LOTE_INSERCAO).map(m => ({ ...m, lote })));
    if (error) {
      await db.from('credito_comae').delete().eq('lote', lote); // desfaz o lote parcial
      return Response.json({ error: 'Falha ao gravar: ' + error.message }, { status: 500 });
    }
  }

  const { error: limpezaErr } = await db.from('credito_comae').delete().neq('lote', lote);

  const porAno: Record<string, number> = {};
  for (const m of movimentos) porAno[m.ano ?? 'sem ano'] = (porAno[m.ano ?? 'sem ano'] ?? 0) + 1;

  return Response.json({
    ok: true, lote, movimentos: movimentos.length, porAno,
    ...(limpezaErr ? { aviso: 'Lotes antigos não apagados: ' + limpezaErr.message } : {}),
  });
}

export function loader() {
  return Response.json({ status: 'ready', endpoint: '/api/sync-comae', info: 'Use POST com { token, linhas }' });
}
