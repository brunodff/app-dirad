/**
 * POST /api/sync
 * Recebe os dados do Apps Script (BD_CREDITO + BD_EMPENHOS) e aciona a ingestão.
 * Protegido por token secreto (SYNC_SECRET_TOKEN).
 */

import type { ActionFunctionArgs } from 'react-router';
import { ingerir, type SyncPayload } from '~/lib/sync/ingestao';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }

  // Valida token
  const token = process.env['SYNC_SECRET_TOKEN'];
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

// GET: health check do endpoint (Apps Script pode chamar antes de sync)
export async function loader() {
  return Response.json({ status: 'ok', endpoint: '/api/sync' });
}
