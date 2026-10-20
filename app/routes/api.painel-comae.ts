import type { LoaderFunctionArgs } from 'react-router';
import { requireUser } from '~/lib/session.server';
import { supabaseAdmin } from '~/lib/supabase.server';
import { carregarDadosComae } from '~/lib/painelComae.server';

/**
 * Lista de pedidos do Painel COMAE. Vem à parte porque é o maior pedaço dos dados (as descrições
 * das notas) e só aparece quando alguém aperta ↻ no Controle Geral.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const dados = await carregarDadosComae(supabaseAdmin());
  return Response.json({ pedidos: dados.pedidos }, { headers: { 'Cache-Control': 'private, no-store' } });
}
