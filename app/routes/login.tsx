import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { Form, redirect, useActionData, useNavigation } from 'react-router';
import { createClient } from '@supabase/supabase-js';
import { getSession, commitSession, type SessionData } from '~/lib/session.server';
import { supabaseAdmin } from '~/lib/supabase.server';
import { optEnv } from '~/lib/env.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await getSession(request);
  if (session.get('user')) throw redirect('/painel');
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = String(formData.get('email') ?? '').trim();
  const senha = String(formData.get('senha') ?? '');

  if (!email || !senha) {
    return { erro: 'Preencha e-mail e senha.' };
  }

  const supabaseUrl = optEnv('SUPABASE_URL');
  const supabaseAnonKey = optEnv('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return { erro: 'Configuração de servidor incompleta. Contate o administrador.' };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });

  if (authError || !authData.session) {
    return { erro: 'E-mail ou senha inválidos.' };
  }

  const admin = supabaseAdmin();
  const { data: usuario } = await admin
    .from('usuarios')
    .select('perfil, nome')
    .eq('id', authData.user.id)
    .single();

  if (!usuario) {
    return { erro: 'Usuário não cadastrado no sistema. Contate o administrador.' };
  }

  const sessionData: SessionData = {
    access_token:  authData.session.access_token,
    refresh_token: authData.session.refresh_token,
    user_id:       authData.user.id,
    email:         authData.user.email!,
    perfil:        usuario.perfil as SessionData['perfil'],
    nome:          usuario.nome,
  };

  const session = await getSession(request);
  session.set('user', sessionData);

  await admin
    .from('usuarios')
    .update({ ultimo_acesso: new Date().toISOString() })
    .eq('id', authData.user.id);

  throw redirect('/painel', {
    headers: { 'Set-Cookie': await commitSession(session) },
  });
}

export function meta() {
  return [{ title: 'COMAE GERENCIAL — Acesso' }];
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const loading = navigation.state === 'submitting';

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#0C1526' }}
    >
      <div className="w-full max-w-sm px-6">
        <div className="mb-10 text-center">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-4">Comando de Operações Aeroespaciais</p>
          <h1 className="text-2xl font-bold text-white tracking-wide">COMAE GERENCIAL</h1>
          <p className="text-sm text-slate-400 mt-1">Painel Orçamentário</p>
        </div>

        <Form method="post" className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider"
            >
              E-mail
            </label>
            <input
              id="email"
              type="email"
              name="email"
              required
              autoComplete="email"
              className="w-full px-4 py-3 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
              style={{ background: '#101C33', border: '1px solid #1E3050' }}
              placeholder="usuario@fab.mil.br"
            />
          </div>

          <div>
            <label
              htmlFor="senha"
              className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider"
            >
              Senha
            </label>
            <input
              id="senha"
              type="password"
              name="senha"
              required
              autoComplete="current-password"
              className="w-full px-4 py-3 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
              style={{ background: '#101C33', border: '1px solid #1E3050' }}
              placeholder="••••••••"
            />
          </div>

          {actionData?.erro && (
            <p className="text-sm text-red-400 text-center py-1">{actionData.erro}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50 cursor-pointer"
            style={{ background: loading ? '#1e3a5f' : '#1D4ED8' }}
          >
            {loading ? 'Autenticando…' : 'Entrar'}
          </button>
        </Form>

        <p className="text-center text-[10px] text-slate-700 mt-10">
          Desenvolvido por 2º Ten Int Bruno · GAP-MN
        </p>
      </div>
    </div>
  );
}
