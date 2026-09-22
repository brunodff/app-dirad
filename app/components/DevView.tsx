import { useState, useEffect } from 'react';
import { useFetcher } from 'react-router';
import type { PresencaUsuario } from '~/lib/usePresenca';
import { criarClienteSupabase } from '~/lib/supabase.client';

export type UsuarioAnalytics = {
  id: string;
  email: string;
  nome: string;
  perfil: string;
  ativo: boolean;
  criado_em: string;
  ultimo_acesso: string | null;
};

export type SyncLogRow = {
  id: number;
  iniciado_em: string;
  concluido_em: string | null;
  status: string;
  registros_credito: number | null;
  registros_empenhos: number | null;
  erros: string[] | null;
};

export type NavegacaoRow = {
  id: number;
  usuario_id: string;
  tipo: string;
  entidade: string | null;
  entidade_id: string | null;
  criado_em: string;
};

function onlineStatus(ultimoAcesso: string | null): 'online' | 'recente' | 'offline' {
  if (!ultimoAcesso) return 'offline';
  const diff = Date.now() - new Date(ultimoAcesso).getTime();
  if (diff < 5 * 60 * 1000)  return 'online';
  if (diff < 30 * 60 * 1000) return 'recente';
  return 'offline';
}

const STATUS_META = {
  online:  { label: 'Online',  cor: '#3FB07A', dot: '#3FB07A' },
  recente: { label: 'Recente', cor: '#E0B341', dot: '#E0B341' },
  offline: { label: 'Offline', cor: '#4A5B73', dot: '#2A3A53' },
};

const PERFIL_CORES: Record<string, string> = {
  DEV:  '#7C3AED',
  CMT:  '#B45309',
  ADEZ: '#0F766E',
  USER: '#1D4ED8',
};

const STATUS_SYNC: Record<string, string> = {
  SUCESSO:      '#3FB07A',
  ERRO:         '#E06A6A',
  PARCIAL:      '#E0B341',
  EM_ANDAMENTO: '#5FA8E0',
};

const ABA_LABELS: Record<string, string> = {
  feed:          'Feed',
  operacoes:     'Operações',
  execucao:      'Execução',
  rascunho:      'Rascunho',
  siscodec:      'SISCODEC',
  desativados:   'Desativados',
  configuracoes: 'Configurações',
  'power-bi':    'Power BI',
  dev:           'Analytics',
};

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function tempoAtras(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s atrás`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min}min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function PerfilBadge({ perfil }: { perfil: string }) {
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white flex-shrink-0"
      style={{ background: PERFIL_CORES[perfil] ?? '#1D4ED8' }}
    >
      {perfil}
    </span>
  );
}

function MetricCard({ label, value, color, desc }: { label: string; value: number; color: string; desc: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: '#101C33', border: '1px solid #1E3050' }}>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</p>
      <p className="text-[10px] text-slate-600 mt-0.5">{desc}</p>
    </div>
  );
}

const PERFIL_COR: Record<string, string> = {
  DEV: '#7C3AED', CMT: '#B45309', ADEZ: '#0F766E', USER: '#1D4ED8', AUXILIAR: '#6B7280',
};

const ABA_LABEL: Record<string, string> = {
  feed: 'Feed', operacoes: 'Operações', execucao: 'Execução', siscodec: 'SISCODEC',
  dev: 'DEV', desativados: 'Desativados', rascunho: 'Rascunho',
  configuracoes: 'Configurações', ferramentas: 'Ferramentas',
};

function labelPagina(pagina: string): string {
  try {
    const url = new URL(pagina, 'http://x');
    const aba = url.searchParams.get('aba');
    return aba ? (ABA_LABEL[aba] ?? aba) : pagina;
  } catch {
    return pagina;
  }
}

function PresencaTempoReal({ lista }: { lista: PresencaUsuario[] }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1E3050' }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ background: '#080F1F', borderBottom: '1px solid #1E3050' }}>
        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
        <h3 className="text-xs font-bold text-white">Presença em Tempo Real</h3>
        <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#1B3A2B', color: '#3FB07A' }}>
          {lista.length} online
        </span>
      </div>
      {lista.length === 0 ? (
        <p className="px-4 py-5 text-center text-slate-600 text-xs">Nenhum usuário com o app aberto</p>
      ) : (
        <div>
          {lista.map(u => {
            const cor = PERFIL_COR[u.perfil] ?? '#8A97AC';
            return (
              <div
                key={u.userId}
                className="flex items-center gap-3 px-4 py-3"
                style={{ background: '#0C1526', borderBottom: '1px solid #1A2840' }}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#3FB07A', boxShadow: '0 0 6px #3FB07A' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-white truncate">{u.nome}</span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
                      style={{ background: cor + '22', color: cor }}
                    >
                      {u.perfil}
                    </span>
                  </div>
                  <p className="text-[10px] mt-0.5" style={{ color: '#5FA8E0' }}>{labelPagina(u.pagina)}</p>
                </div>
                <span className="text-[10px] text-slate-600 flex-shrink-0">
                  desde {new Date(u.desde).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type Props = {
  usuarios: UsuarioAnalytics[];
  syncLogs: SyncLogRow[];
  navegacoes: NavegacaoRow[];
  atividadeHoje: NavegacaoRow[];
  supabaseUrl: string;
  anonKey: string;
};

export function DevView({ usuarios, syncLogs, navegacoes, atividadeHoje, supabaseUrl, anonKey }: Props) {
  const [aba, setAba] = useState<'vivo' | 'usuarios' | 'historico' | 'sync'>('vivo');
  const reclFetcher = useFetcher<{ ok: boolean; total: number; erros: string[] }>();
  const reclOk   = reclFetcher.data?.ok;
  const reclErrs = reclFetcher.data?.erros;
  const reclBusy = reclFetcher.state !== 'idle';
  const hoje = new Date().toISOString().slice(0, 10);

  // Presença em tempo real (WebSocket) — fonte de verdade para "online agora"
  const [presentes, setPresentes] = useState<Record<string, PresencaUsuario>>({});
  useEffect(() => {
    if (!supabaseUrl || !anonKey) return;
    const sb      = criarClienteSupabase(supabaseUrl, anonKey);
    const channel = sb.channel('presenca-comae');
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<PresencaUsuario>();
      const map: Record<string, PresencaUsuario> = {};
      for (const [key, presences] of Object.entries(state)) {
        if (presences.length > 0) map[key] = presences[0] as unknown as PresencaUsuario;
      }
      setPresentes(map);
    });
    channel.subscribe();
    return () => { sb.removeChannel(channel); };
  }, [supabaseUrl, anonKey]);

  const listaPresentes = Object.values(presentes).sort(
    (a, b) => new Date(b.desde).getTime() - new Date(a.desde).getTime(),
  );

  const ativosHoje   = usuarios.filter(u => u.ultimo_acesso?.startsWith(hoje));

  // Último evento de navegação por usuário
  const ultimoEvento = new Map<string, NavegacaoRow>();
  for (const n of navegacoes) {
    if (!ultimoEvento.has(n.usuario_id)) ultimoEvento.set(n.usuario_id, n);
  }

  // Contagem de eventos hoje por usuário
  const eventosHoje = new Map<string, number>();
  for (const n of atividadeHoje) {
    eventosHoje.set(n.usuario_id, (eventosHoje.get(n.usuario_id) ?? 0) + 1);
  }

  const totalEventosHoje = atividadeHoje.length;

  return (
    <div>
      {/* Header */}
      <div className="px-5 py-4 border-b flex items-center justify-between" style={{ background: '#080F1F', borderColor: '#1E3050' }}>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h2 className="text-sm font-bold text-white">Analytics — Painel DEV</h2>
            <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#1B3A2B', color: '#3FB07A' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              LIVE
            </span>
          </div>
          <p className="text-[10px] text-slate-500">
            {listaPresentes.length} online agora · {ativosHoje.length} logado{ativosHoje.length !== 1 ? 's' : ''} hoje · {totalEventosHoje} eventos
          </p>
        </div>

        {/* Botão Reclassificar */}
        <div className="flex flex-col items-end gap-1">
          <reclFetcher.Form method="post" action="/painel">
            <input type="hidden" name="intent" value="reclassificar" />
            <button
              type="submit"
              disabled={reclBusy}
              className="text-xs px-3 py-2 rounded-lg border cursor-pointer transition-all disabled:opacity-50"
              style={{
                background:   reclOk === true  ? '#0C2825' : reclOk === false ? '#3A1212' : '#101C33',
                borderColor:  reclOk === true  ? '#3FB07A' : reclOk === false ? '#E06A6A' : '#1E3050',
                color:        reclOk === true  ? '#3FB07A' : reclOk === false ? '#E06A6A' : '#8A97AC',
              }}
            >
              {reclBusy ? 'Reclassificando…' : reclOk === true ? '✓ Reclassificado' : 'Reclassificar dados'}
            </button>
          </reclFetcher.Form>
          {reclOk === true && reclFetcher.data && (
            <p className="text-[10px] text-slate-500">{reclFetcher.data.total} movimentos atualizados</p>
          )}
          {reclErrs?.length ? (
            <p className="text-[10px] text-red-400">{reclErrs[0]}</p>
          ) : null}
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* Presença em tempo real */}
        <PresencaTempoReal lista={listaPresentes} />

        {/* Métricas históricas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="Online agora"   value={listaPresentes.length}  color="#3FB07A" desc="tempo real" />
          <MetricCard label="Logados hoje"   value={ativosHoje.length}   color="#E0B341" desc={hoje} />
          <MetricCard label="Eventos hoje"   value={totalEventosHoje}    color="#E0A041" desc="navegações" />
          <MetricCard label="Total usuários" value={usuarios.length}     color="#C77DD6" desc="cadastrados" />
        </div>

        {/* Abas internas */}
        <div className="flex gap-1" style={{ borderBottom: '1px solid #1E3050' }}>
          {([
            { id: 'vivo',      label: '● Ao Vivo' },
            { id: 'usuarios',  label: 'Usuários' },
            { id: 'historico', label: 'Histórico' },
            { id: 'sync',      label: 'Sincronizações' },
          ] as const).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setAba(t.id)}
              className="px-4 py-2 text-xs font-medium transition-colors cursor-pointer"
              style={{
                color:        aba === t.id ? '#5FA8E0' : '#4A5B73',
                borderBottom: aba === t.id ? '2px solid #5FA8E0' : '2px solid transparent',
                background:   'transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── AO VIVO ── */}
        {aba === 'vivo' && (
          <div className="space-y-4">
            {/* Online agora */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1E3050' }}>
              <div className="flex items-center justify-between px-4 py-2.5" style={{ background: '#080F1F', borderBottom: '1px solid #1E3050' }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs font-semibold text-white">Online agora</span>
                  <span className="text-[10px] text-slate-500">(últimos 5 min)</span>
                </div>
                <span className="text-[10px] text-slate-500">{listaPresentes.length} usuário{listaPresentes.length !== 1 ? 's' : ''}</span>
              </div>
              {listaPresentes.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-slate-600">Nenhum usuário online no momento</div>
              ) : (
                listaPresentes.map(p => {
                  const count = eventosHoje.get(p.userId) ?? 0;
                  return (
                    <div
                      key={p.userId}
                      className="flex items-center gap-3 px-4 py-3"
                      style={{ borderBottom: '1px solid #1A2840', background: '#0D1828' }}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#3FB07A', boxShadow: '0 0 6px #3FB07A' }} />
                      <span className="text-xs font-medium text-white flex-shrink-0">{p.nome}</span>
                      <PerfilBadge perfil={p.perfil} />
                      <span className="text-[11px] text-slate-400 flex-1 min-w-0 truncate">
                        Aba: <span className="text-slate-200">{labelPagina(p.pagina)}</span>
                      </span>
                      <span className="text-[10px] text-slate-500 flex-shrink-0">{tempoAtras(p.desde)}</span>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: '#1E3050', color: '#5FA8E0' }}
                      >
                        {count} hoje
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Quem usou o app hoje */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1E3050' }}>
              <div className="flex items-center justify-between px-4 py-2.5" style={{ background: '#080F1F', borderBottom: '1px solid #1E3050' }}>
                <span className="text-xs font-semibold text-white">Quem usou o app hoje</span>
              </div>
              {ativosHoje.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-slate-600">Nenhum acesso hoje</div>
              ) : (
                <>
                  <div
                    className="grid text-[10px] text-slate-500 font-medium px-4 py-2"
                    style={{ gridTemplateColumns: '1fr 80px 70px 90px 100px', background: '#080F1F', borderBottom: '1px solid #1A2840' }}
                  >
                    <span>USUÁRIO</span>
                    <span>PERFIL</span>
                    <span className="text-right">EVENTOS</span>
                    <span className="text-center">STATUS</span>
                    <span className="text-right">ÚLTIMO ACESSO</span>
                  </div>
                  {ativosHoje.map((u, i) => {
                    const status = onlineStatus(u.ultimo_acesso);
                    const meta   = STATUS_META[status];
                    const count  = eventosHoje.get(u.id) ?? 0;
                    return (
                      <div
                        key={u.id}
                        className="grid items-center px-4 py-2.5"
                        style={{
                          gridTemplateColumns: '1fr 80px 70px 90px 100px',
                          background: i % 2 === 0 ? '#101C33' : '#0D1828',
                          borderBottom: '1px solid #1A2840',
                        }}
                      >
                        <span className="text-xs font-medium text-white">{u.nome}</span>
                        <PerfilBadge perfil={u.perfil} />
                        <span className="text-xs text-slate-300 text-right tabular-nums">{count}</span>
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.dot }} />
                          <span className="text-[11px]" style={{ color: meta.cor }}>{meta.label}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 text-right tabular-nums">
                          {u.ultimo_acesso ? new Date(u.ultimo_acesso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── USUÁRIOS ── */}
        {aba === 'usuarios' && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1E3050' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: '#080F1F', borderBottom: '1px solid #1E3050' }}>
                  {['Usuário', 'Perfil', 'Status', 'Último acesso'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-slate-500 font-medium text-[10px] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u, i) => {
                  const status = onlineStatus(u.ultimo_acesso);
                  const meta   = STATUS_META[status];
                  return (
                    <tr
                      key={u.id}
                      style={{ background: i % 2 === 0 ? '#101C33' : '#0D1828', borderBottom: '1px solid #1A2840' }}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{u.nome}</div>
                        <div className="text-slate-500 text-[10px]">{u.email}</div>
                      </td>
                      <td className="px-4 py-3"><PerfilBadge perfil={u.perfil} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: meta.dot, boxShadow: status === 'online' ? `0 0 6px ${meta.dot}` : 'none' }}
                          />
                          <span style={{ color: meta.cor }}>{meta.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {u.ultimo_acesso
                          ? <span title={formatTs(u.ultimo_acesso)}>{tempoAtras(u.ultimo_acesso)}</span>
                          : <span className="text-slate-600">Nunca</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── HISTÓRICO ── */}
        {aba === 'historico' && (
          <div className="space-y-4">
            {usuarios
              .filter(u => atividadeHoje.some(n => n.usuario_id === u.id))
              .map(u => {
                const minhas = atividadeHoje.filter(n => n.usuario_id === u.id);
                const abas   = [...new Set(minhas.map(n => n.entidade_id).filter(Boolean))];
                return (
                  <HistoricoRow key={u.id} usuario={u} eventos={minhas} abas={abas as string[]} />
                );
              })
            }
            {!atividadeHoje.some(n => usuarios.find(u => u.id === n.usuario_id)) && (
              <p className="text-slate-600 text-xs">Nenhuma atividade hoje.</p>
            )}
          </div>
        )}

        {/* ── SINCRONIZAÇÕES ── */}
        {aba === 'sync' && (
          <div className="space-y-2">
            {syncLogs.map(s => (
              <div
                key={s.id}
                className="rounded-lg px-4 py-3 flex items-center justify-between gap-4"
                style={{ background: '#101C33', border: '1px solid #1E3050' }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: `${STATUS_SYNC[s.status] ?? '#8A97AC'}22`, color: STATUS_SYNC[s.status] ?? '#8A97AC' }}
                  >
                    {s.status}
                  </span>
                  <span className="text-[10px] text-slate-500">{formatTs(s.iniciado_em)}</span>
                </div>
                <div className="flex gap-4 text-[10px] text-slate-400">
                  {s.registros_credito  != null && <span>{s.registros_credito} créditos</span>}
                  {s.registros_empenhos != null && <span>{s.registros_empenhos} empenhos</span>}
                  {s.erros && s.erros.length > 0 && (
                    <span style={{ color: '#E06A6A' }}>{s.erros.length} erros</span>
                  )}
                </div>
              </div>
            ))}
            {syncLogs.length === 0 && (
              <p className="text-slate-600 text-xs">Nenhuma sincronização registrada.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HistoricoRow({ usuario, eventos, abas }: { usuario: UsuarioAnalytics; eventos: NavegacaoRow[]; abas: string[] }) {
  const [expandido, setExpandido] = useState(false);
  const primeiro = eventos[eventos.length - 1];
  const ultimo   = eventos[0];

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1E3050' }}>
      <button
        type="button"
        onClick={() => setExpandido(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer hover:brightness-110 transition-all"
        style={{ background: '#101C33' }}
      >
        <span className="text-xs font-medium text-white flex-shrink-0">{usuario.nome}</span>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white flex-shrink-0"
          style={{ background: PERFIL_CORES[usuario.perfil] ?? '#1D4ED8' }}
        >
          {usuario.perfil}
        </span>
        <div className="flex gap-1.5 flex-wrap flex-1 min-w-0">
          {abas.map(a => (
            <span key={a} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#1E3050', color: '#5FA8E0' }}>
              {ABA_LABELS[a] ?? a}
            </span>
          ))}
        </div>
        <span className="text-[10px] text-slate-500 flex-shrink-0">{eventos.length} eventos</span>
        <span className="text-[10px] text-slate-600 flex-shrink-0">
          {formatTs(primeiro.criado_em)} → {formatTs(ultimo.criado_em)}
        </span>
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#4A5B73" strokeWidth={2} strokeLinecap="round">
          <path d={expandido ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} />
        </svg>
      </button>
      {expandido && (
        <div className="px-4 pb-3 pt-1 space-y-1" style={{ background: '#0D1828' }}>
          {eventos.map(n => (
            <div key={n.id} className="flex items-center gap-3 text-[10px]">
              <span className="text-slate-600 tabular-nums">{formatTs(n.criado_em)}</span>
              <span className="px-1.5 py-0.5 rounded font-medium" style={{ background: '#1E3050', color: '#5FA8E0' }}>
                {ABA_LABELS[n.entidade_id ?? ''] ?? n.entidade_id ?? '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
