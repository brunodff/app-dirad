/**
 * API REST consumida pela extensão do navegador.
 * Auth via header: Authorization: Bearer <api_token>
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from 'react-router';
import { supabaseAdmin } from '~/lib/supabase.server';

type UsuarioAuth = { id: string; email: string; nome: string; perfil: string };

async function autenticarToken(request: Request): Promise<UsuarioAuth | null> {
  const auth  = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;

  const db = supabaseAdmin();
  const { data } = await db
    .from('usuarios')
    .select('id, email, nome, perfil')
    .eq('api_token', token)
    .eq('ativo', true)
    .single();

  return (data as UsuarioAuth | null);
}

function cors(response: Response): Response {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === 'OPTIONS') {
    return cors(new Response(null, { status: 204 }));
  }

  const user = await autenticarToken(request);
  if (!user) return cors(Response.json({ erro: 'Não autorizado' }, { status: 401 }));

  const url    = new URL(request.url);
  const status = url.searchParams.get('status') ?? 'PENDENTE';

  const db = supabaseAdmin();
  const { data: pedidos } = await db
    .from('siscodec_pedidos')
    .select('id, status, descricao, operacao, destaque, entrada_exterior, obs, criado_em, siscodec_celulas(id, ordem, tipo, ptres, nd, valor, ug_exec, esfera, fonte, plano_interno, ug_cred, obs_linha1, obs_linha2)')
    .eq('status', status)
    .order('criado_em', { ascending: true });

  return cors(Response.json({ pedidos: pedidos ?? [], usuario: user }));
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === 'OPTIONS') {
    return cors(new Response(null, { status: 204 }));
  }

  const user = await autenticarToken(request);
  if (!user) return cors(Response.json({ erro: 'Não autorizado' }, { status: 401 }));

  const body = await request.json() as {
    pedido_id?: number;
    status?: string;
    erro_msg?: string;
  };

  const { pedido_id, status, erro_msg } = body;

  if (!pedido_id || !status) {
    return cors(Response.json({ erro: 'pedido_id e status são obrigatórios' }, { status: 400 }));
  }

  const db  = supabaseAdmin();
  const now = new Date().toISOString();

  const update: Record<string, unknown> = { status };

  if (status === 'EM_ANDAMENTO') {
    // apenas atualiza status — reserva o pedido para esta sessão
  } else if (status === 'CONCLUIDO') {
    update.concluido_por   = user.id;
    update.concluido_em    = now;
    update.concluido_email = user.email;
  } else if (status === 'ERRO') {
    update.erro_msg = erro_msg ?? 'Erro desconhecido';
  } else if (status === 'PENDENTE') {
    update.erro_msg = null; // limpa erro anterior ao retornar para fila
  }

  const { error } = await db
    .from('siscodec_pedidos')
    .update(update)
    .eq('id', pedido_id);

  if (error) return cors(Response.json({ erro: error.message }, { status: 500 }));

  // Registra auditoria
  void supabaseAdmin().from('eventos_auditoria').insert({
    usuario_id:   user.id,
    tipo:         status === 'CONCLUIDO' ? 'REINCLUIR' : 'EXCLUIR',
    entidade:     'siscodec_pedidos',
    entidade_id:  String(pedido_id),
    dados_depois: { pedido_id, status, concluido_email: user.email },
  });

  return cors(Response.json({ ok: true }));
}
