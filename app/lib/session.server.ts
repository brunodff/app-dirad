import { createCookieSessionStorage, redirect } from 'react-router';

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: '__comae_session',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 dias
    secrets: [process.env['SESSION_SECRET'] ?? 'dev-secret-change-me'],
  },
});

export type SessionData = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  email: string;
  perfil: 'USER' | 'ADEZ' | 'CMT' | 'DEV' | 'AUXILIAR';
  nome: string;
};

type SessionStore = Awaited<ReturnType<typeof sessionStorage.getSession>>;

export async function getSession(request: Request): Promise<SessionStore> {
  return sessionStorage.getSession(request.headers.get('Cookie'));
}

export async function commitSession(session: SessionStore): Promise<string> {
  return sessionStorage.commitSession(session);
}

export async function destroySession(session: SessionStore): Promise<string> {
  return sessionStorage.destroySession(session);
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
