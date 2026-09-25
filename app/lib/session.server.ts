import { createCookieSessionStorage, redirect } from 'react-router';
import { optEnv } from '~/lib/env.server';

// Lazy so env vars are read after Cloudflare context is set (not at module load time).
let _storage: ReturnType<typeof createCookieSessionStorage> | null = null;

function storage() {
  return (_storage ??= createCookieSessionStorage({
    cookie: {
      name: '__comae_session',
      httpOnly: true,
      secure: optEnv('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
      secrets: [optEnv('SESSION_SECRET', 'dev-secret-change-me')],
    },
  }));
}

export type SessionData = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  email: string;
  perfil: 'USER' | 'ADEZ' | 'CMT' | 'DEV' | 'AUXILIAR';
  nome: string;
};

type SessionStore = Awaited<ReturnType<typeof storage().getSession>>;

export async function getSession(request: Request): Promise<SessionStore> {
  return storage().getSession(request.headers.get('Cookie'));
}

export async function commitSession(session: SessionStore): Promise<string> {
  return storage().commitSession(session);
}

export async function destroySession(session: SessionStore): Promise<string> {
  return storage().destroySession(session);
}

export async function getUser(request: Request): Promise<SessionData | null> {
  const session = await getSession(request);
  const data = session.get('user') as SessionData | undefined;
  if (!data?.access_token) return null;
  return data;
}

export async function requireUser(
  request: Request,
  redirectTo = '/login',
): Promise<SessionData> {
  const user = await getUser(request);
  if (!user) throw redirect(redirectTo);
  return user;
}

export async function requirePerfil(
  request: Request,
  perfisPermitidos: Array<SessionData['perfil']>,
): Promise<SessionData> {
  const user = await requireUser(request);
  if (!perfisPermitidos.includes(user.perfil)) {
    throw redirect('/painel?erro=acesso_negado');
  }
  return user;
}
