import { useEffect, useState } from 'react';
import { Form, NavLink, useSearchParams } from 'react-router';
import type { SessionData } from '~/lib/session.server';

type AbaId =
  | 'feed'
  | 'operacoes'
  | 'execucao'
  | 'rascunho'
  | 'unidades'
  | 'naturezas'
  | 'conferencia'
  | 'desativados'
  | 'configuracoes'
  | 'power-bi'
  | 'siscodec'
  | 'ferramentas'
  | 'dev';

type NavItem = {
  id: AbaId;
  label: string;
  icon: React.ReactNode;
  perfisPermitidos?: Array<SessionData['perfil']>;
  placeholder?: boolean;
};

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  feed:          <Icon d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  operacoes:     <Icon d="M4 4h16v4H4zM4 12h16v4H4zM4 20h16" />,
  execucao:      <Icon d="M3 3h4v18H3zM10 8h4v13h-4zM17 13h4v8h-4z" />,
  rascunho:      <Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" />,
  unidades:      <Icon d="M3 21V9l9-7 9 7v12M9 21v-6h6v6" />,
  naturezas:     <Icon d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 0 2-2h2a2 2 0 0 0 2 2" />,
  conferencia:   <Icon d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  lixeira:       <Icon d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />,
  configuracoes: <Icon d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />,
  powerbi:       <Icon d="M18 20V10M12 20V4M6 20v-6" />,
  siscodec:      <Icon d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
  ferramentas:   <Icon d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
  dev:           <Icon d="M22 12h-4l-3 9L9 3l-3 9H2" />,
};

const NAV_ITEMS: NavItem[] = [
  { id: 'feed',      label: 'Feed',       icon: ICONS.feed },
  { id: 'operacoes', label: 'Operações',  icon: ICONS.operacoes },
  { id: 'execucao',  label: 'Execução',   icon: ICONS.execucao },
  { id: 'rascunho',  label: 'Rascunho',   icon: ICONS.rascunho },
];

const NAV_ADEZ: NavItem[] = [
  { id: 'desativados',  label: 'Desativados',  icon: ICONS.lixeira,      perfisPermitidos: ['ADEZ', 'CMT', 'DEV'] },
  { id: 'siscodec',     label: 'SISCODEC',     icon: ICONS.siscodec,     perfisPermitidos: ['ADEZ', 'CMT', 'DEV'] },
  { id: 'ferramentas',  label: 'Ferramentas',  icon: ICONS.ferramentas,  perfisPermitidos: ['ADEZ', 'CMT', 'DEV'] },
];

const PERFIL_CORES: Record<string, string> = {
  DEV:      '#7C3AED',
  CMT:      '#B45309',
  ADEZ:     '#0F766E',
  USER:     '#1D4ED8',
  AUXILIAR: '#9A3412',
};

function saudacao() {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function Saudacao({ nome }: { nome: string }) {
  const [texto, setTexto] = useState('');
  useEffect(() => { setTexto(`${saudacao()}, ${nome}`); }, [nome]);
  if (!texto) return null;
  return (
    <p className="text-[10px] text-slate-500 mb-2 truncate">{texto}</p>
  );
}

type Props = { user: SessionData; abaAtiva: string };

export function Sidebar({ user, abaAtiva }: Props) {
  const podeAdez = ['ADEZ', 'CMT', 'DEV'].includes(user.perfil);
  const [searchParams] = useSearchParams();

  function NavItemEl({ item }: { item: NavItem }) {
    const ativo = abaAtiva === item.id;
    const disabled = item.placeholder;

    // Preserva filtros ativos ao trocar de aba
    const params = new URLSearchParams(searchParams);
    params.set('aba', item.id);
    const href = `/painel?${params.toString()}`;

    if (disabled) {
      return (
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-not-allowed"
          style={{ color: '#3A4B63' }}
          title="Em breve"
        >
          <span style={{ color: '#2A3A53' }}>{item.icon}</span>
          <span className="text-xs">{item.label}</span>
          <span className="ml-auto text-[10px] opacity-50">em breve</span>
        </div>
      );
    }

    return (
      <NavLink
        to={href}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group"
        style={ativo
          ? { background: '#1E3050', color: '#EAF1FB', borderLeft: '2px solid #5FA8E0' }
          : { color: '#8A97AC' }
        }
      >
        <span style={{ color: ativo ? '#5FA8E0' : '#4A5B73' }}>{item.icon}</span>
        <span className="text-xs font-medium">{item.label}</span>
      </NavLink>
    );
  }

  return (
    <aside
      className="w-56 flex-shrink-0 flex flex-col h-screen sticky top-0"
      style={{ background: '#080F1F', borderRight: '1px solid #1E3050' }}
    >
      {/* Logo */}
      <div className="px-4 py-4 border-b" style={{ borderColor: '#1E3050' }}>
        <p className="text-[8px] text-slate-600 uppercase tracking-normal whitespace-nowrap mb-0.5">COMANDO DE OPERAÇÕES AEROESPACIAIS</p>
        <h1 className="text-sm font-bold text-white tracking-wide leading-tight">COMAE GERENCIAL</h1>
        <p className="text-[10px] text-slate-500 mt-0.5">Painel Orçamentário</p>
      </div>

      {/* Nav principal */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map(item => <NavItemEl key={item.id} item={item} />)}

        {/* SISCODEC + Ferramentas para AUXILIAR */}
        {user.perfil === 'AUXILIAR' && (
          <>
            <div className="my-3 border-t" style={{ borderColor: '#1A2840' }} />
            <NavItemEl item={{ id: 'siscodec',    label: 'SISCODEC',    icon: ICONS.siscodec }} />
            <NavItemEl item={{ id: 'ferramentas', label: 'Ferramentas', icon: ICONS.ferramentas }} />
          </>
        )}

        {/* Seção ADEZ (Desativados + SISCODEC) */}
        {podeAdez && (
          <>
            <div className="my-3 border-t" style={{ borderColor: '#1A2840' }} />
            {NAV_ADEZ.map(item => <NavItemEl key={item.id} item={item} />)}
          </>
        )}

        {/* Configurações — visível para todos */}
        <div className="my-3 border-t" style={{ borderColor: '#1A2840' }} />
        <NavItemEl item={{ id: 'configuracoes', label: 'Configurações', icon: ICONS.configuracoes }} />

        {/* Power BI */}
        <div className="my-3 border-t" style={{ borderColor: '#1A2840' }} />
        <NavItemEl item={{ id: 'power-bi', label: 'Power BI', icon: ICONS.powerbi }} />

        {/* DEV */}
        {user.perfil === 'DEV' && (
          <>
            <div className="my-3 border-t" style={{ borderColor: '#1A2840' }} />
            <NavItemEl item={{ id: 'dev', label: 'Analytics', icon: ICONS.dev }} />
          </>
        )}
      </nav>

      {/* Footer — usuário */}
      <div className="px-3 py-4 border-t" style={{ borderColor: '#1E3050' }}>
        <Saudacao nome={user.nome} />
        <div className="flex items-center gap-2.5 mb-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: PERFIL_CORES[user.perfil] ?? '#1D4ED8' }}
          >
            {user.nome.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate">{user.nome}</p>
            <p className="text-[10px] text-slate-500">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
            style={{ background: PERFIL_CORES[user.perfil] ?? '#1D4ED8' }}
          >
            {user.perfil}
          </span>
          <Form method="post" action="/logout">
            <button
              type="submit"
              className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            >
              Sair
            </button>
          </Form>
        </div>
      </div>
    </aside>
  );
}
