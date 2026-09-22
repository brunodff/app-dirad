import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { redirect, useLoaderData, Form, useActionData, useNavigation } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { supabaseAdmin } from '~/lib/supabase.server';
import { getSession, commitSession, requireUser } from '~/lib/session.server';
import type { SessionData } from '~/lib/session.server';
import { UNIDADES } from '~/lib/unidades';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const step = url.searchParams.get('step') ?? 'token';

  if (step === 'perfil') {
    const user = await requireUser(request);
    return { step: 'perfil' as const, user };
  }

  return { step: 'token' as const, user: null };
}

export async function action({ request }: ActionFunctionArgs) {
  const fd = await request.formData();
  const intent = String(fd.get('intent') ?? '');
  const db = supabaseAdmin();

  if (intent === 'verificar_token') {
    const accessToken  = String(fd.get('access_token')  ?? '');
    const refreshToken = String(fd.get('refresh_token') ?? '');

    if (!accessToken) {
      return Response.json({ erro: 'Token ausente. Use o link enviado por e-mail.' }, { status: 400 });
    }

    const { data: { user }, error } = await db.auth.getUser(accessToken);
    if (error || !user) {
      return Response.json({ erro: 'Link inválido ou expirado. Solicite um novo convite.' }, { status: 400 });
    }

    const { data: userRow } = await db
      .from('usuarios')
      .select('perfil, nome')
      .eq('id', user.id)
      .maybeSingle();

    const session = await getSession(request);
    const sessionData: SessionData = {
      access_token:  accessToken,
      refresh_token: refreshToken,
      user_id:       user.id,
      email:         user.email ?? '',
      perfil:        (userRow?.perfil as SessionData['perfil']) ?? 'USER',
      nome:          String(userRow?.nome ?? ''),
    };
    session.set('user', sessionData);

    return redirect('/aceite-convite?step=perfil', {
      headers: { 'Set-Cookie': await commitSession(session) },
    });
  }

  if (intent === 'completar_perfil') {
    const user = await requireUser(request);
    const posto       = String(fd.get('posto')          ?? '').trim();
    const nomeGuerra  = String(fd.get('nome_guerra')    ?? '').trim();
    const unidade     = String(fd.get('unidade')        ?? '').trim();
    const senha       = String(fd.get('senha')          ?? '');
    const confirmaSenha = String(fd.get('confirma_senha') ?? '');

    if (!posto || !nomeGuerra || !unidade) {
      return Response.json({ erro: 'Preencha todos os campos obrigatórios.' }, { status: 400 });
    }
    if (senha.length < 8) {
      return Response.json({ erro: 'A senha deve ter ao menos 8 caracteres.' }, { status: 400 });
    }
    if (senha !== confirmaSenha) {
      return Response.json({ erro: 'As senhas não coincidem.' }, { status: 400 });
    }

    const nomeCompleto = `${posto} ${nomeGuerra}`.trim();

    await db.auth.admin.updateUserById(user.user_id, { password: senha });
    await db.from('usuarios').update({
      posto,
      nome_guerra: nomeGuerra,
      unidade,
      nome: nomeCompleto,
      ativo: true,
    }).eq('id', user.user_id);

    const session = await getSession(request);
    const atual = session.get('user') as SessionData;
    session.set('user', { ...atual, nome: nomeCompleto });

    return redirect('/painel', {
      headers: { 'Set-Cookie': await commitSession(session) },
    });
  }

  return Response.json({ erro: 'Requisição inválida.' }, { status: 400 });
}

export function meta() {
  return [{ title: 'COMAE GERENCIAL — Aceitar Convite' }];
}

// ── Step 1: lê o hash e auto-envia para o servidor ───────────────────────────

function TokenStep() {
  const formRef = useRef<HTMLFormElement>(null);
  const [erro, setErro] = useState('');
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle';

  useEffect(() => {
    const hash = window.location.hash.slice(1); // remove o '#'
    const params = new URLSearchParams(hash);
    const accessToken  = params.get('access_token')  ?? '';
    const refreshToken = params.get('refresh_token') ?? '';
    const type         = params.get('type') ?? '';

    if (!accessToken || type !== 'invite') {
      setErro('Link de convite inválido. Verifique se copiou corretamente o link do e-mail.');
      return;
    }

    if (formRef.current) {
      (formRef.current.querySelector('[name="access_token"]')  as HTMLInputElement).value = accessToken;
      (formRef.current.querySelector('[name="refresh_token"]') as HTMLInputElement).value = refreshToken;
      formRef.current.requestSubmit();
    }
  }, []);

  return (
    <div className="text-center">
      {erro ? (
        <>
          <p style={{ color: '#E06A6A', fontSize: 13, marginBottom: 16 }}>{erro}</p>
          <p style={{ color: '#8A97AC', fontSize: 11 }}>
            Entre em contato com o administrador para receber um novo convite.
          </p>
        </>
      ) : (
        <p style={{ color: '#8A97AC', fontSize: 12 }}>
          {submitting ? 'Verificando convite…' : 'Carregando…'}
        </p>
      )}

      <Form method="post" ref={formRef} style={{ display: 'none' }}>
        <input type="hidden" name="intent" value="verificar_token" />
        <input type="hidden" name="access_token" value="" />
        <input type="hidden" name="refresh_token" value="" />
        <button type="submit" />
      </Form>
    </div>
  );
}

// ── Step 2: formulário de perfil ─────────────────────────────────────────────

const POSTOS = ['SD', 'CB', 'SGT', 'TEN', 'CP', 'MJ', 'TCEL', 'CEL', 'BRIG'];

function PerfilStep({ user }: { user: SessionData }) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle';
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const [unidadeSel, setUnidadeSel] = useState('');

  const unidadesFiltradas = UNIDADES.filter(u =>
    u.toLowerCase().includes(busca.toLowerCase()),
  );

  return (
    <Form method="post">
      <input type="hidden" name="intent" value="completar_perfil" />

      <p style={{ fontSize: 11, color: '#8A97AC', marginBottom: 20 }}>
        Bem-vindo(a), <strong style={{ color: '#EAF1FB' }}>{user.email}</strong>!
        Complete seu perfil para acessar o painel.
      </p>

      {actionData && typeof actionData === 'object' && 'erro' in actionData && (
        <div style={{ background: '#3A1212', border: '1px solid #E06A6A44', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 11, color: '#E06A6A' }}>
          {(actionData as { erro: string }).erro}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        {/* Posto */}
        <div>
          <label style={LABEL_STYLE}>Posto / Graduação *</label>
          <select name="posto" required style={INPUT_STYLE}>
            <option value="">Selecione…</option>
            {POSTOS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Nome de guerra */}
        <div>
          <label style={LABEL_STYLE}>Nome de guerra *</label>
          <input
            name="nome_guerra"
            type="text"
            required
            placeholder="Ex: Bruno"
            style={INPUT_STYLE}
          />
        </div>
      </div>

      {/* Unidade */}
      <div style={{ marginBottom: 10, position: 'relative' }}>
        <label style={LABEL_STYLE}>Unidade *</label>
        <input
          type="hidden"
          name="unidade"
          value={unidadeSel}
          required
        />
        <div
          onClick={() => setAberto(a => !a)}
          style={{
            ...INPUT_STYLE,
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ color: unidadeSel ? '#EAF1FB' : '#4A5B73' }}>
            {unidadeSel || 'Selecione a unidade…'}
          </span>
          <span style={{ color: '#5FA8E0', fontSize: 10 }}>▾</span>
        </div>
        {aberto && (
          <div style={{
            position: 'absolute', zIndex: 50, top: '100%', left: 0, right: 0,
            background: '#0C1526', border: '1px solid #1E3050', borderRadius: 6,
            maxHeight: 200, overflow: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.5)',
          }}>
            <div style={{ padding: '6px 8px', borderBottom: '1px solid #1E3050' }}>
              <input
                autoFocus
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar…"
                style={{ ...INPUT_STYLE, marginBottom: 0, padding: '4px 8px', fontSize: 11 }}
                onClick={e => e.stopPropagation()}
              />
            </div>
            {unidadesFiltradas.map(u => (
              <div
                key={u}
                onClick={() => { setUnidadeSel(u); setAberto(false); setBusca(''); }}
                style={{
                  padding: '7px 12px', fontSize: 11, cursor: 'pointer',
                  color: u === unidadeSel ? '#5FA8E0' : '#EAF1FB',
                  background: u === unidadeSel ? '#1E3050' : 'transparent',
                }}
                onMouseEnter={e => { (e.target as HTMLElement).style.background = '#1A2840'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.background = u === unidadeSel ? '#1E3050' : 'transparent'; }}
              >
                {u}
              </div>
            ))}
            {unidadesFiltradas.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 11, color: '#8A97AC' }}>
                Nenhuma unidade encontrada.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Senha */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <div>
          <label style={LABEL_STYLE}>Senha *</label>
          <input
            name="senha"
            type="password"
            required
            minLength={8}
            placeholder="Mín. 8 caracteres"
            style={INPUT_STYLE}
          />
        </div>
        <div>
          <label style={LABEL_STYLE}>Confirmar senha *</label>
          <input
            name="confirma_senha"
            type="password"
            required
            placeholder="Repita a senha"
            style={INPUT_STYLE}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting || !unidadeSel}
        style={{
          width: '100%',
          background: submitting ? '#0F2033' : '#1E3A6E',
          color: '#5FA8E0',
          border: '1px solid #5FA8E033',
          borderRadius: 8,
          padding: '10px',
          fontSize: 12,
          fontWeight: 700,
          cursor: submitting ? 'not-allowed' : 'pointer',
          opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting ? 'Salvando…' : 'Concluir cadastro e acessar o painel →'}
      </button>
    </Form>
  );
}

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  fontSize: 9,
  color: '#8A97AC',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 4,
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: '#101C33',
  border: '1px solid #1E3050',
  borderRadius: 6,
  color: '#EAF1FB',
  fontSize: 11,
  padding: '7px 10px',
  outline: 'none',
  marginBottom: 0,
  boxSizing: 'border-box',
};

// ── Layout raiz ───────────────────────────────────────────────────────────────

export default function AceiteConvite() {
  const { step, user } = useLoaderData<typeof loader>();

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#080F1F',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#0C1526',
          border: '1px solid #1E3050',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,.6)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #1E3050', background: '#080F1F' }}>
          <p style={{ fontSize: 10, color: '#5FA8E0', letterSpacing: '0.05em', fontWeight: 700, marginBottom: 2 }}>
            COMAE GERENCIAL
          </p>
          <h1 style={{ fontSize: 15, fontWeight: 700, color: '#EAF1FB', margin: 0 }}>
            {step === 'token' ? 'Verificando convite…' : 'Complete seu cadastro'}
          </h1>
        </div>

        {/* Conteúdo */}
        <div style={{ padding: 24 }}>
          {step === 'token' && <TokenStep />}
          {step === 'perfil' && user && <PerfilStep user={user} />}
        </div>
      </div>
    </div>
  );
}
