import { createClient } from '@supabase/supabase-js';
import { getEnv } from '~/lib/env.server';

/**
 * Client com service role — para operações de servidor (API routes, sync).
 * NUNCA expor no bundle do cliente.
 */
export function supabaseAdmin() {
  return createClient(
    getEnv('SUPABASE_URL'),
    getEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Busca todas as linhas de uma query paginando de 1000 em 1000
 * (o PostgREST do Supabase corta qualquer resposta em 1000 linhas, mesmo com .limit maior).
 * `build` deve criar a query do zero a cada chamada e ter ordenação estável.
 */
const PAGE = 1000;
export async function fetchAll<T = Record<string, unknown>>(
  build: () => { range(from: number, to: number): PromiseLike<{ data: unknown; error: { message: string } | null }> },
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) return { data: out, error };
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return { data: out, error: null };
  }
}

/**
 * Client anon — para leitura a partir de uma session JWT do usuário.
 * Passa o token para respeitar RLS.
 */
export function supabaseFromRequest(request: Request) {
  const url = getEnv('SUPABASE_URL');
  const anonKey = getEnv('SUPABASE_ANON_KEY');
  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/, '');

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: token ? `Bearer ${token}` : '' } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}
