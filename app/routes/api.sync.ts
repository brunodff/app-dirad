import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { ingerir, type SyncPayload } from '~/lib/sync/ingestao';

function getToken(context: unknown): string {
  // Primary: load context injected by getLoadContext in functions/[[path]].ts
  const ctxEnv = (context as any)?.cloudflare?.env;
  if (ctxEnv?.SYNC_SECRET_TOKEN) return ctxEnv.SYNC_SECRET_TOKEN;
  // Fallback: globalThis (set from same getLoadContext) or process.env (local dev)
  return (globalThis as any).__cfEnv__?.SYNC_SECRET_TOKEN
      ?? process.env['SYNC_SECRET_TOKEN']
      ?? '';
}

async function handlePost(request: Request, context: unknown): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const token = getToken(context);
  if (!token || body['token'] !== token) {
    return Response.json({ error: 'Não autorizado' }, { status: 401 });
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

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  return handlePost(request, context);
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  if (request.method === 'POST') {
    return handlePost(request, context);
  }
  return Response.json({ status: 'ready', endpoint: '/api/sync', info: 'Use POST to sync' });
}
