import { useState } from 'react';
import { useFetcher } from 'react-router';
import type { SessionData } from '~/lib/session.server';
import { UNIDADES } from '~/lib/unidades';

export type UsuarioGerencial = {
  id: string;
  email: string;
  nome: string;
  perfil: string;
  unidade: string;
  ativo: boolean;
  criado_em: string;
  ultimo_acesso: string | null;
  posto: string;
  nome_guerra: string;
};

type Props = {
  usuarios: UsuarioGerencial[];
  userAtual: SessionData;
};

const PERFIL_CORES: Record<string, { bg: string; fg: string }> = {
  DEV:  { bg: '#2D1B69', fg: '#A78BFA' },
  CMT:  { bg: '#3B1F0A', fg: '#F59E0B' },
  ADEZ: { bg: '#0C2825', fg: '#34D399' },
  USER: { bg: '#0F2033', fg: '#5FA8E0' },
};

function perfilCor(p: string) {
  return PERFIL_CORES[p] ?? { bg: '#1E3050', fg: '#8A97AC' };
}

function PerfilBadge({ perfil }: { perfil: string }) {
  const { bg, fg } = perfilCor(perfil);
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
      background: bg, color: fg, display: 'inline-block',
    }}>
      {perfil}
    </span>
  );
}

function dataFmt(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// Perfis que o usuário atual pode atribuir ao convidar
function perfisDisponiveisPara(perfil: string): string[] {
  if (perfil === 'DEV')  return ['USER', 'ADEZ', 'CMT', 'DEV', 'AUXILIAR'];
  if (perfil === 'CMT')  return ['USER', 'ADEZ', 'CMT'];
  if (perfil === 'ADEZ') return ['USER', 'ADEZ'];
  return [];
}

// Pode alterar o perfil de outro usuário?
function podeAlterarPerfil(quemAltera: string, perfilAlvo: string): boolean {
  if (quemAltera === 'DEV') return true;
  if (quemAltera === 'CMT') return perfilAlvo !== 'DEV';
  if (quemAltera === 'ADEZ') return perfilAlvo === 'USER' || perfilAlvo === 'ADEZ';
  return false;
}

// ── Card do usuário ───────────────────────────────────────────────────────────

function UserCard({ u, userAtual, adezCount }: {
  u: UsuarioGerencial;
  userAtual: SessionData;
  adezCount: number;
}) {
  const fetcher = useFetcher<{ ok?: boolean; erro?: string }>();
  const [expandido, setExpandido] = useState(false);

  const isSelf = u.id === userAtual.user_id;
  const podeEditar = podeAlterarPerfil(userAtual.perfil, u.perfil) && !isSelf;
  const perfisDisp = perfisDisponiveisPara(userAtual.perfil);

  const busy = fetcher.state !== 'idle';

  return (
    <div style={{
      background: '#101C33',
      border: `1px solid ${u.ativo ? '#1E3050' : '#2A1414'}`,
      borderRadius: 8,
      padding: '10px 12px',
      marginBottom: 6,
      opacity: u.ativo ? 1 : 0.65,
    }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        onClick={() => setExpandido(e => !e)}
      >
        {/* Avatar */}
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: perfilCor(u.perfil).bg, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 12, fontWeight: 700,
          color: perfilCor(u.perfil).fg,
        }}>
          {(u.nome || u.email).charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#EAF1FB', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {u.nome || u.email}
            </span>
            <PerfilBadge perfil={u.perfil} />
            {!u.ativo && (
              <span style={{ fontSize: 9, color: '#E06A6A', fontWeight: 600 }}>INATIVO</span>
            )}
            {isSelf && (
              <span style={{ fontSize: 9, color: '#8A97AC' }}>você</span>
            )}
          </div>
          <div style={{ fontSize: 9, color: '#4A5B73' }}>
            {u.email}
            {u.unidade ? ` · ${u.unidade}` : ''}
            {` · último acesso: ${dataFmt(u.ultimo_acesso)}`}
          </div>
        </div>

        <span style={{ fontSize: 9, color: '#2A3A53', flexShrink: 0 }}>{expandido ? '▲' : '▼'}</span>
      </div>

      {/* Expansão com ações */}
      {expandido && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #1A2840' }}>
          {fetcher.data?.erro && (
            <div style={{
              background: '#3A1212', border: '1px solid #E06A6A44', borderRadius: 5,
              padding: '5px 10px', marginBottom: 8, fontSize: 10, color: '#E06A6A',
            }}>
              {fetcher.data.erro}
            </div>
          )}
          {podeEditar && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              {/* Alterar perfil */}
              <fetcher.Form method="post" action="/painel" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="hidden" name="intent" value="alterar_perfil" />
                <input type="hidden" name="usuario_id" value={u.id} />
                <select
                  name="novo_perfil"
                  defaultValue={u.perfil}
                  disabled={busy}
                  style={{
                    background: '#0C1526', border: '1px solid #1E3050', color: '#EAF1FB',
                    borderRadius: 5, fontSize: 10, padding: '4px 8px', cursor: 'pointer',
                  }}
                >
                  {perfisDisp
                    .filter(p => !(p === 'ADEZ' && adezCount >= 4 && u.perfil !== 'ADEZ'))
                    .map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <button
                  type="submit"
                  disabled={busy}
                  style={{
                    background: '#1E3050', color: '#5FA8E0', border: 'none',
                    borderRadius: 5, fontSize: 10, padding: '4px 10px', cursor: 'pointer',
                  }}
                >
                  Alterar perfil
                </button>
              </fetcher.Form>

              {/* Ativar/Desativar */}
              <fetcher.Form method="post" action="/painel">
                <input type="hidden" name="intent" value={u.ativo ? 'desativar_usuario' : 'ativar_usuario'} />
                <input type="hidden" name="usuario_id" value={u.id} />
                <button
                  type="submit"
                  disabled={busy}
                  style={{
                    background: u.ativo ? '#2A0A0A' : '#0C2825',
                    color: u.ativo ? '#E06A6A' : '#34D399',
                    border: `1px solid ${u.ativo ? '#E06A6A33' : '#34D39933'}`,
                    borderRadius: 5, fontSize: 10, padding: '4px 10px', cursor: 'pointer',
                  }}
                >
                  {u.ativo ? 'Desativar acesso' : 'Reativar acesso'}
                </button>
              </fetcher.Form>

              {/* Excluir — só para inativos */}
              {!u.ativo && (
                <fetcher.Form
                  method="post"
                  action="/painel"
                  onSubmit={e => {
                    if (!window.confirm(`Excluir permanentemente ${u.email}? Esta ação não pode ser desfeita.`)) {
                      e.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="intent" value="excluir_usuario" />
                  <input type="hidden" name="usuario_id" value={u.id} />
                  <button
                    type="submit"
                    disabled={busy}
                    style={{
                      background: 'transparent', color: '#E06A6A',
                      border: '1px solid #E06A6A55',
                      borderRadius: 5, fontSize: 10, padding: '4px 10px', cursor: 'pointer',
                    }}
                  >
                    Excluir permanentemente
                  </button>
                </fetcher.Form>
              )}
            </div>
          )}

          {/* Sem permissão */}
          {!podeEditar && !isSelf && (
            <p style={{ fontSize: 10, color: '#3A4B63', fontStyle: 'italic' }}>
              Você não tem permissão para editar este usuário.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Formulário de convite ─────────────────────────────────────────────────────

function ConviteForm({ userAtual, adezCount }: { userAtual: SessionData; adezCount: number }) {
  const perfis = perfisDisponiveisPara(userAtual.perfil);
  const fetcher = useFetcher<{ ok?: boolean; erro?: string }>();
  const [email, setEmail] = useState('');
  const [perfil, setPerfil] = useState(perfis[0] ?? 'USER');

  const busy = fetcher.state !== 'idle';
  const result = fetcher.data;

  // Reset after success
  if (result?.ok && email) {
    setEmail('');
  }

  const adezLimitado = perfil === 'ADEZ' && adezCount >= 4;

  return (
    <div style={{
      background: '#101C33',
      border: '1px solid #1E3050',
      borderRadius: 8,
      padding: '14px 16px',
      marginBottom: 16,
    }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#5FA8E0', marginBottom: 10 }}>
        Convidar novo usuário
      </p>

      {result?.erro && (
        <div style={{ background: '#3A1212', border: '1px solid #E06A6A44', borderRadius: 5, padding: '6px 10px', marginBottom: 8, fontSize: 11, color: '#E06A6A' }}>
          {result.erro}
        </div>
      )}
      {result?.ok && (
        <div style={{ background: '#0C2825', border: '1px solid #34D39933', borderRadius: 5, padding: '6px 10px', marginBottom: 8, fontSize: 11, color: '#34D399' }}>
          Convite enviado com sucesso! O usuário receberá um e-mail.
        </div>
      )}

      <fetcher.Form method="post" action="/painel" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <input type="hidden" name="intent" value="convidar_usuario" />

        <div style={{ flex: 2, minWidth: 180 }}>
          <label style={LABEL}>E-mail</label>
          <input
            name="email"
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="nome@fab.mil.br"
            style={INPUT}
          />
        </div>

        <div style={{ flex: 1, minWidth: 100 }}>
          <label style={LABEL}>Perfil</label>
          <select
            name="perfil"
            value={perfil}
            onChange={e => setPerfil(e.target.value)}
            style={INPUT}
          >
            {perfis.map(p => (
              <option key={p} value={p} disabled={p === 'ADEZ' && adezCount >= 4}>
                {p}{p === 'ADEZ' && adezCount >= 4 ? ' (limite)' : ''}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={busy || adezLimitado}
          style={{
            background: adezLimitado ? '#1A2840' : '#1E3A6E',
            color: adezLimitado ? '#3A4B63' : '#5FA8E0',
            border: '1px solid #5FA8E033',
            borderRadius: 6, fontSize: 11, fontWeight: 700,
            padding: '7px 14px', cursor: busy || adezLimitado ? 'not-allowed' : 'pointer',
            flexShrink: 0,
          }}
        >
          {busy ? 'Enviando…' : '+ Enviar convite'}
        </button>
      </fetcher.Form>

      {adezLimitado && (
        <p style={{ fontSize: 9, color: '#E06A6A', marginTop: 4 }}>
          Limite de 3 usuários ADEZ atingido.
        </p>
      )}
    </div>
  );
}

const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 9, color: '#8A97AC',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
};

const INPUT: React.CSSProperties = {
  width: '100%', background: '#0C1526', border: '1px solid #1E3050',
  borderRadius: 6, color: '#EAF1FB', fontSize: 11, padding: '7px 10px',
  outline: 'none', boxSizing: 'border-box',
};

// ── Meu perfil ────────────────────────────────────────────────────────────────

const POSTOS_CFG = ['SD', 'CB', 'SGT', 'TEN', 'CP', 'MJ', 'TCEL', 'CEL', 'BRIG'];

function MeuPerfilForm({ user, usuarioAtual }: { user: SessionData; usuarioAtual: UsuarioGerencial | undefined }) {
  const fetcher = useFetcher<{ ok?: boolean; erro?: string }>();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [abrirUnidade, setAbrirUnidade] = useState(false);
  const [unidadeSel, setUnidadeSel] = useState(usuarioAtual?.unidade ?? '');
  const [senhaVis, setSenhaVis] = useState(false);

  const busy = fetcher.state !== 'idle';
  const unidadesFiltradas = UNIDADES.filter(u => u.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div style={{ background: '#101C33', border: '1px solid #1E3050', borderRadius: 8, marginBottom: 20, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: '#1E3050',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: '#5FA8E0',
          }}>
            {user.nome.charAt(0).toUpperCase()}
          </div>
          <div style={{ textAlign: 'left' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#EAF1FB', margin: 0 }}>{user.nome}</p>
            <p style={{ fontSize: 9, color: '#8A97AC', margin: 0 }}>{user.email}</p>
          </div>
        </div>
        <span style={{ fontSize: 9, color: '#3A4B63' }}>{aberto ? '▲' : '▼'} Meu perfil</span>
      </button>

      {aberto && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #1A2840' }}>
          {fetcher.data?.ok && (
            <div style={{ background: '#0C2825', border: '1px solid #34D39933', borderRadius: 5, padding: '6px 10px', margin: '10px 0', fontSize: 11, color: '#34D399' }}>
              Perfil atualizado com sucesso!
            </div>
          )}
          {fetcher.data?.erro && (
            <div style={{ background: '#3A1212', border: '1px solid #E06A6A44', borderRadius: 5, padding: '6px 10px', margin: '10px 0', fontSize: 11, color: '#E06A6A' }}>
              {fetcher.data.erro}
            </div>
          )}

          <fetcher.Form method="post" action="/painel" style={{ marginTop: 12 }}>
            <input type="hidden" name="intent" value="atualizar_meu_perfil" />
            <input type="hidden" name="unidade" value={unidadeSel} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={LABEL}>Posto / Graduação</label>
                <select name="posto" defaultValue={usuarioAtual?.posto ?? ''} style={INPUT}>
                  <option value="">— Selecione —</option>
                  {POSTOS_CFG.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={LABEL}>Nome de guerra</label>
                <input
                  name="nome_guerra"
                  type="text"
                  defaultValue={usuarioAtual?.nome_guerra ?? ''}
                  placeholder="Ex: Bruno"
                  style={INPUT}
                />
              </div>
            </div>

            {/* Unidade com busca */}
            <div style={{ marginBottom: 10, position: 'relative' }}>
              <label style={LABEL}>Unidade</label>
              <div
                onClick={() => setAbrirUnidade(a => !a)}
                style={{ ...INPUT, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: unidadeSel ? '#EAF1FB' : '#4A5B73' }}>{unidadeSel || 'Selecionar unidade…'}</span>
                <span style={{ color: '#5FA8E0', fontSize: 9 }}>▾</span>
              </div>
              {abrirUnidade && (
                <div style={{
                  position: 'absolute', zIndex: 50, top: '100%', left: 0, right: 0,
                  background: '#0C1526', border: '1px solid #1E3050', borderRadius: 6,
                  maxHeight: 180, overflow: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.5)',
                }}>
                  <div style={{ padding: '5px 8px', borderBottom: '1px solid #1E3050' }}>
                    <input
                      autoFocus
                      value={busca}
                      onChange={e => setBusca(e.target.value)}
                      placeholder="Buscar…"
                      style={{ ...INPUT, padding: '4px 8px', fontSize: 10 }}
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                  {unidadesFiltradas.map(u => (
                    <div
                      key={u}
                      onClick={() => { setUnidadeSel(u); setAbrirUnidade(false); setBusca(''); }}
                      style={{
                        padding: '6px 12px', fontSize: 11, cursor: 'pointer',
                        color: u === unidadeSel ? '#5FA8E0' : '#EAF1FB',
                        background: u === unidadeSel ? '#1E3050' : 'transparent',
                      }}
                    >
                      {u}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Nova senha (opcional) */}
            <div style={{ marginBottom: 12 }}>
              <label style={LABEL}>Nova senha <span style={{ color: '#3A4B63' }}>(deixe em branco para manter)</span></label>
              <div style={{ position: 'relative' }}>
                <input
                  name="nova_senha"
                  type={senhaVis ? 'text' : 'password'}
                  minLength={8}
                  placeholder="Mín. 8 caracteres"
                  style={{ ...INPUT, paddingRight: 60 }}
                />
                <button
                  type="button"
                  onClick={() => setSenhaVis(v => !v)}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: '#8A97AC', fontSize: 9, cursor: 'pointer',
                  }}
                >
                  {senhaVis ? 'ocultar' : 'mostrar'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              style={{
                background: '#1E3A6E', color: '#5FA8E0', border: '1px solid #5FA8E033',
                borderRadius: 6, fontSize: 11, fontWeight: 700, padding: '7px 14px',
                cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1, width: '100%',
              }}
            >
              {busy ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </fetcher.Form>
        </div>
      )}
    </div>
  );
}

// ── View principal ────────────────────────────────────────────────────────────

export function ConfiguracoesView({ usuarios, userAtual }: Props) {
  const podeConvidar = ['ADEZ', 'CMT', 'DEV'].includes(userAtual.perfil);

  const counts = {
    total: usuarios.filter(u => u.ativo).length,
    DEV:   usuarios.filter(u => u.perfil === 'DEV'  && u.ativo).length,
    CMT:   usuarios.filter(u => u.perfil === 'CMT'  && u.ativo).length,
    ADEZ:  usuarios.filter(u => u.perfil === 'ADEZ' && u.ativo).length,
    USER:  usuarios.filter(u => u.perfil === 'USER' && u.ativo).length,
  };

  const euAtual = usuarios.find(u => u.id === userAtual.user_id);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 700 }}>
      {/* Título */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#EAF1FB', margin: 0, marginBottom: 4 }}>
          Configurações
        </h2>
        <p style={{ fontSize: 10, color: '#8A97AC', margin: 0 }}>
          Atualize seus dados e gerencie o acesso de outros usuários.
        </p>
      </div>

      {/* Meu perfil — sempre visível */}
      <MeuPerfilForm user={userAtual} usuarioAtual={euAtual} />

      {/* Resumo (só para admins) */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Ativos', count: counts.total, cor: '#5FA8E0' },
          { label: 'DEV', count: counts.DEV, cor: '#A78BFA' },
          { label: 'CMT', count: counts.CMT, cor: '#F59E0B' },
          { label: `ADEZ (${counts.ADEZ}/4)`, count: counts.ADEZ, cor: '#34D399' },
          { label: 'USER', count: counts.USER, cor: '#5FA8E0' },
        ].map(({ label, count, cor }) => (
          <div key={label} style={{
            background: '#101C33', border: '1px solid #1E3050', borderRadius: 7,
            padding: '8px 14px', textAlign: 'center', minWidth: 70,
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: cor, lineHeight: 1 }}>{count}</div>
            <div style={{ fontSize: 9, color: '#8A97AC', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Formulário de convite */}
      {podeConvidar && (
        <ConviteForm userAtual={userAtual} adezCount={counts.ADEZ} />
      )}

      {/* Lista de usuários */}
      <p style={{ fontSize: 9, color: '#3A4B63', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        Usuários ({usuarios.length})
      </p>

      {usuarios.length === 0 ? (
        <p style={{ fontSize: 11, color: '#3A4B63', textAlign: 'center', padding: '24px 0' }}>
          Nenhum usuário cadastrado.
        </p>
      ) : (
        usuarios.map(u => (
          <UserCard
            key={u.id}
            u={u}
            userAtual={userAtual}
            adezCount={counts.ADEZ}
          />
        ))
      )}
    </div>
  );
}
