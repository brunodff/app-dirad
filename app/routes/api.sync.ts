/**
 * POST /api/sync
 * Recebe os dados do Apps Script (BD_CREDITO + BD_EMPENHOS) e aciona a ingestão.
 * Protegido por token secreto (SYNC_SECRET_TOKEN).
 *
 * Nota: handlePost é chamado tanto pelo action (POST direto) quanto pelo loader
 * (fallback para quando há redirect automático de POST→GET em alguns ambientes).
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { ingerir, type SyncPayload } from '~/lib/sync/ingestao';
import { optEnv } from '~/lib/env.server';

async function handlePost(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const token = optEnv('SYNC_SECRET_TOKEN');
  if (!token || body['token'] !== token) {
    const cfEnv = (globalThis as any).__cfEnv__;
    return Response.json({
      error: 'Não autorizado',
      _debug: {
        hasCfEnv: !!cfEnv,
        cfEnvKeys: cfEnv ? Object.keys(cfEnv) : [],
        hasToken: !!token,
        tokenLen: token.length,
        bodyTokenLen: typeof body['token'] === 'string' ? (body['token'] as string).length : -1,
        match: token === body['token'],
      },
    }, { status: 401 });
  }

  const credito  = body['credito'];
  const empenhos = body['empenhos'];

  if (!Array.isArray(credito) || !Array.isArray(empenhos)) {
    return Response.json({ error: 'Campos "credito" e "empenhos" são obrigatórios (arrays)' }, { status: 400 });
  }

  if (credito.length === 0) {
    return Response.json({ error: 'Array "credito" vazio' }, { status: 400 });
  }

  const payload: SyncPayload = {
    credito:  credito as Record<string, unknown>[],
    empenhos: empenhos as Record<string, unknown>[],
  };

  try {
    const resultado = await ingerir(payload);
    return Response.json({
      ok: true,
      syncId:            resultado.syncId,
      creditoRecebido:   resultado.creditoRecebido,
      creditoProcessado: resultado.creditoProcessado,
      empenhosRecebido:  resultado.empenhosRecebido,
      erros:             resultado.erros,
    });
  } catch (err) {
    console.error('[api.sync] Erro na ingestão:', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  return handlePost(request);
}

// Aceita POST no loader como fallback (cobre redirect POST→GET em alguns ambientes)
export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === 'POST') {
    return handlePost(request);
  }
  return Response.json({ status: 'ready', endpoint: '/api/sync', info: 'Use POST to sync' });
}
