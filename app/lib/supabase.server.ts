import { createClient } from '@supabase/supabase-js';

function getEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Variável de ambiente ausente: ${key}`);
  return v;
}

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
