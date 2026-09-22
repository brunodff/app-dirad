import { useState, useRef, useEffect } from 'react';
import { Form, Link, useNavigate } from 'react-router';
import { apelidoOperacao } from '~/lib/apelidoOperacao';

export type FiltrosAtivos = {
  ops: string[];
  nds: string[];
  tipos: string[];
  dataDe: string;
  dataAte: string;
  ugExecs: string[];
  ugResps: string[];
  ugDestinos: string[];
  acoes: string[];
};

export type OpcoesFiltro = {
  operacoes: string[];
  nds: { cod: string; nome: string }[];
  ugExecs?: string[];
  ugResps?: string[];
  ugDestinos?: string[];
  acoes?: { cod: string; nome: string }[];
};

const TIPOS_OPCOES = [
  { value: 'RECEBIDO',          label: 'Recebido',        cor: '#3FB07A' },
  { value: 'DESCENTRALIZADO',   label: 'Descentralizado', cor: '#E0B341' },
  { value: 'DEVOLUCAO',         label: 'Devolução',       cor: '#E06A6A' },
  { value: 'RECEBIDO_UNIDADES', label: 'Rec. Unidades',   cor: '#25A3A3' },
];

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(d: string, n: number): string {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
}

function inicioMes(offset = 0): string {
  const dt = new Date();
  dt.setMonth(dt.getMonth() + offset, 1);
  return dt.toISOString().slice(0, 10);
}

function fimMes(offset = 0): string {
  const dt = new Date();
  dt.setMonth(dt.getMonth() + 1 + offset, 0);
  return dt.toISOString().slice(0, 10);
}

// Dropdown multi-select com checkboxes e busca
function MultiDropdown({
  label,
  opcoes,
  selecionados,
  onChange,
  renderOpcao,
  comBusca = false,
}: {
  label: string;
  opcoes: { value: string; label: string; cor?: string }[];
  selecionados: string[];
  onChange: (vals: string[]) => void;
  renderOpcao?: (op: { value: string; label: string; cor?: string }) => React.ReactNode;
  comBusca?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false);
        setBusca('');
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function toggle(val: string) {
    if (selecionados.includes(val)) onChange(selecionados.filter(v => v !== val));
    else onChange([...selecionados, val]);
  }

  const opcoesFiltradas = busca.trim()
    ? opcoes.filter(op => op.label.toLowerCase().includes(busca.toLowerCase()))
    : opcoes;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-all cursor-pointer"
        style={{
          background: selecionados.length > 0 ? '#1E3050' : '#101C33',
          borderColor: selecionados.length > 0 ? '#5FA8E0' : '#1E3050',
          color: selecionados.length > 0 ? '#EAF1FB' : '#8A97AC',
        }}
      >
        {label}
        {selecionados.length > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: '#5FA8E0' }}>
            {selecionados.length}
          </span>
        )}
        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d={aberto ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} />
        </svg>
      </button>

      {aberto && (
        <div
          className="absolute top-full left-0 mt-1 z-50 rounded-xl overflow-hidden min-w-56"
          style={{ background: '#101C33', border: '1px solid #1E3050', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', maxWidth: 340 }}
        >
          {/* Campo de busca */}
          {(comBusca || opcoes.length > 6) && (
            <div style={{ padding: '6px 8px', borderBottom: '1px solid #1E3050' }}>
              <input
                autoFocus
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar…"
                className="w-full text-xs rounded px-2 py-1.5 outline-none"
                style={{ background: '#080F1F', border: '1px solid #1E3050', color: '#EAF1FB' }}
                onClick={e => e.stopPropagation()}
              />
            </div>
          )}
          <div className="max-h-60 overflow-y-auto">
            {opcoesFiltradas.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-500">Nenhum resultado</p>
            )}
            {opcoesFiltradas.map(op => (
              <label
                key={op.value}
                className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors hover:brightness-125"
                style={{ background: selecionados.includes(op.value) ? '#1E3050' : 'transparent' }}
              >
                <input
                  type="checkbox"
                  checked={selecionados.includes(op.value)}
                  onChange={() => toggle(op.value)}
                  className="rounded flex-shrink-0"
                  style={{ accentColor: '#5FA8E0' }}
                />
                {renderOpcao ? renderOpcao(op) : (
                  <span className="text-xs text-slate-300 break-words">{op.label}</span>
                )}
              </label>
            ))}
          </div>
          {selecionados.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-[10px] text-slate-500 hover:text-slate-300 px-3 py-2 border-t cursor-pointer"
              style={{ borderColor: '#1E3050' }}
            >
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type Props = {
  aba: string;
  opcoes: OpcoesFiltro;
  filtrosAtivos: FiltrosAtivos;
  mostrarDatas?: boolean;
};

export function FilterBar({ aba, opcoes, filtrosAtivos, mostrarDatas = true }: Props) {
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [pendOps,    setPendOps]    = useState<string[]>(filtrosAtivos.ops);
  const [pendNds,    setPendNds]    = useState<string[]>(filtrosAtivos.nds);
  const [pendTipos,  setPendTipos]  = useState<string[]>(filtrosAtivos.tipos);
  const [pendDataDe, setPendDataDe] = useState(filtrosAtivos.dataDe);
  const [pendDataAte, setPendDataAte] = useState(filtrosAtivos.dataAte);
  const [pendUgExecs,    setPendUgExecs]    = useState<string[]>(filtrosAtivos.ugExecs ?? []);
  const [pendUgResps,    setPendUgResps]    = useState<string[]>(filtrosAtivos.ugResps ?? []);
  const [pendUgDestinos, setPendUgDestinos] = useState<string[]>(filtrosAtivos.ugDestinos ?? []);
  const [pendAcoes,      setPendAcoes]      = useState<string[]>(filtrosAtivos.acoes ?? []);

  // Sincroniza se filtros externos mudarem (navegação)
  useEffect(() => {
    setPendOps(filtrosAtivos.ops);
    setPendNds(filtrosAtivos.nds);
    setPendTipos(filtrosAtivos.tipos);
    setPendDataDe(filtrosAtivos.dataDe);
    setPendDataAte(filtrosAtivos.dataAte);
    setPendUgExecs(filtrosAtivos.ugExecs ?? []);
    setPendUgResps(filtrosAtivos.ugResps ?? []);
    setPendUgDestinos(filtrosAtivos.ugDestinos ?? []);
    setPendAcoes(filtrosAtivos.acoes ?? []);
  }, [JSON.stringify(filtrosAtivos)]);

  const totalAtivos =
    filtrosAtivos.ops.length +
    filtrosAtivos.nds.length +
    filtrosAtivos.tipos.length +
    (filtrosAtivos.dataDe ? 1 : 0) +
    (filtrosAtivos.ugExecs ?? []).length +
    (filtrosAtivos.ugResps ?? []).length +
    (filtrosAtivos.ugDestinos ?? []).length +
    (filtrosAtivos.acoes ?? []).length;

  function buildUrl(overrides: Partial<FiltrosAtivos>): string {
    const params = new URLSearchParams();
    params.set('aba', aba);
    const f = { ...filtrosAtivos, ...overrides };
    f.ops.forEach(v => params.append('ops', v));
    f.nds.forEach(v => params.append('nds', v));
    f.tipos.forEach(v => params.append('tipos', v));
    if (f.dataDe) params.set('data_de', f.dataDe);
    if (f.dataAte) params.set('data_ate', f.dataAte);
    (f.ugExecs    ?? []).forEach(v => params.append('ug_execs',    v));
    (f.ugResps    ?? []).forEach(v => params.append('ug_resps',    v));
    (f.ugDestinos ?? []).forEach(v => params.append('ug_destinos', v));
    (f.acoes      ?? []).forEach(v => params.append('acoes',       v));
    return `/painel?${params.toString()}`;
  }

  function aplicar(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    params.set('aba', aba);
    pendOps.forEach(v => params.append('ops', v));
    pendNds.forEach(v => params.append('nds', v));
    pendTipos.forEach(v => params.append('tipos', v));
    if (pendDataDe) params.set('data_de', pendDataDe);
    if (pendDataAte) params.set('data_ate', pendDataAte);
    pendUgExecs.forEach(v    => params.append('ug_execs',    v));
    pendUgResps.forEach(v    => params.append('ug_resps',    v));
    pendUgDestinos.forEach(v => params.append('ug_destinos', v));
    pendAcoes.forEach(v      => params.append('acoes',       v));
    navigate(`/painel?${params.toString()}`);
    setAberto(false);
  }

  function presetData(de: string, ate: string) {
    setPendDataDe(de);
    setPendDataAte(ate);
  }

  const opsOpcoes = opcoes.operacoes.map(op => ({ value: op, label: apelidoOperacao(op) }));
  const ndsOpcoes = opcoes.nds.map(nd => ({ value: nd.cod, label: `${nd.cod} — ${nd.nome}` }));

  return (
    <div data-tour="filter-bar" style={{ borderBottom: '1px solid #1E3050', background: '#080F1F' }}>
      {/* Barra de chips de filtros ativos + botão abrir */}
      <div className="flex items-center gap-2 px-4 py-2.5 flex-wrap">
        <button
          type="button"
          onClick={() => setAberto(a => !a)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer flex-shrink-0"
          style={{
            background: aberto || totalAtivos > 0 ? '#1E3050' : '#101C33',
            borderColor: aberto ? '#5FA8E0' : totalAtivos > 0 ? '#E0B341' : '#1E3050',
            color: aberto ? '#EAF1FB' : totalAtivos > 0 ? '#E0B341' : '#8A97AC',
          }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filtros
          {totalAtivos > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: '#E0B341' }}>
              {totalAtivos}
            </span>
          )}
        </button>

        {/* Chips dos filtros ativos */}
        {filtrosAtivos.ops.map(op => (
          <Link key={op} to={buildUrl({ ops: filtrosAtivos.ops.filter(o => o !== op) })}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full transition-colors"
            style={{ background: '#1E3050', color: '#5FA8E0' }}
          >
            {apelidoOperacao(op).length > 20 ? apelidoOperacao(op).slice(0, 20) + '…' : apelidoOperacao(op)}
            <span>×</span>
          </Link>
        ))}
        {filtrosAtivos.nds.map(nd => (
          <Link key={nd} to={buildUrl({ nds: filtrosAtivos.nds.filter(n => n !== nd) })}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full transition-colors"
            style={{ background: '#1E3050', color: '#3E86C9' }}
          >
            ND {nd} <span>×</span>
          </Link>
        ))}
        {filtrosAtivos.tipos.map(t => (
          <Link key={t} to={buildUrl({ tipos: filtrosAtivos.tipos.filter(tp => tp !== t) })}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full transition-colors"
            style={{ background: '#1E3050', color: '#E0B341' }}
          >
            {t} <span>×</span>
          </Link>
        ))}
        {filtrosAtivos.dataDe && (
          <Link to={buildUrl({ dataDe: '', dataAte: '' })}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full"
            style={{ background: '#1E3050', color: '#C77DD6' }}
          >
            {filtrosAtivos.dataDe}{filtrosAtivos.dataAte ? ` → ${filtrosAtivos.dataAte}` : ''} <span>×</span>
          </Link>
        )}
        {(filtrosAtivos.ugExecs ?? []).map(ug => (
          <Link key={ug} to={buildUrl({ ugExecs: (filtrosAtivos.ugExecs ?? []).filter(u => u !== ug) })}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full transition-colors"
            style={{ background: '#1E3050', color: '#25A3A3' }}
          >
            UG Exec: {ug.length > 18 ? ug.slice(0, 18) + '…' : ug} <span>×</span>
          </Link>
        ))}
        {(filtrosAtivos.ugResps ?? []).map(ug => (
          <Link key={ug} to={buildUrl({ ugResps: (filtrosAtivos.ugResps ?? []).filter(u => u !== ug) })}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full transition-colors"
            style={{ background: '#1E3050', color: '#E0B341' }}
          >
            UG Resp: {ug.length > 18 ? ug.slice(0, 18) + '…' : ug} <span>×</span>
          </Link>
        ))}
        {(filtrosAtivos.ugDestinos ?? []).map(ug => (
          <Link key={ug} to={buildUrl({ ugDestinos: (filtrosAtivos.ugDestinos ?? []).filter(u => u !== ug) })}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full transition-colors"
            style={{ background: '#1E3050', color: '#C77DD6' }}
          >
            UG Destino: {ug.length > 18 ? ug.slice(0, 18) + '…' : ug} <span>×</span>
          </Link>
        ))}
        {(filtrosAtivos.acoes ?? []).map(cod => (
          <Link key={cod} to={buildUrl({ acoes: (filtrosAtivos.acoes ?? []).filter(a => a !== cod) })}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full transition-colors"
            style={{ background: '#1E3050', color: '#C77DD6' }}
          >
            Ação: {cod} <span>×</span>
          </Link>
        ))}
        {totalAtivos > 0 && (
          <Link to={`/painel?aba=${aba}`}
            className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
          >
            Limpar tudo
          </Link>
        )}
      </div>

      {/* Painel de filtros expandido */}
      {aberto && (
        <form onSubmit={aplicar}>
          <div className="px-4 pb-4 pt-1 space-y-4">
            {/* Linha de dropdowns */}
            <div className="flex flex-wrap gap-2">
              <MultiDropdown
                label="Operação"
                opcoes={opsOpcoes}
                selecionados={pendOps}
                onChange={setPendOps}
                comBusca
              />
              <MultiDropdown
                label="Natureza de Despesa"
                opcoes={ndsOpcoes}
                selecionados={pendNds}
                onChange={setPendNds}
                renderOpcao={op => (
                  <span className="text-xs">
                    <span className="font-mono text-slate-400">{op.value}</span>
                    <span className="text-slate-500 ml-1">— {op.label.split('—')[1]?.trim()}</span>
                  </span>
                )}
              />
              {mostrarDatas && (
                <MultiDropdown
                  label="Tipo"
                  opcoes={TIPOS_OPCOES}
                  selecionados={pendTipos}
                  onChange={setPendTipos}
                  renderOpcao={op => (
                    <span className="flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: op.cor }} />
                      <span className="text-slate-300">{op.label}</span>
                    </span>
                  )}
                />
              )}
              {(mostrarDatas || aba === 'execucao') && opcoes.ugExecs && opcoes.ugExecs.length > 0 && (
                <MultiDropdown
                  label="UG Executora"
                  opcoes={opcoes.ugExecs.map(ug => ({ value: ug, label: ug }))}
                  selecionados={pendUgExecs}
                  onChange={setPendUgExecs}
                  comBusca
                />
              )}
              {aba === 'execucao' && opcoes.ugResps && opcoes.ugResps.length > 0 && (
                <MultiDropdown
                  label="UG Responsável"
                  opcoes={opcoes.ugResps.map(ug => ({ value: ug, label: ug }))}
                  selecionados={pendUgResps}
                  onChange={setPendUgResps}
                  comBusca
                />
              )}
              {(aba === 'feed' || aba === 'execucao') && opcoes.acoes && opcoes.acoes.length > 0 && (
                <MultiDropdown
                  label="Ação"
                  opcoes={opcoes.acoes.map(a => ({ value: a.cod, label: `${a.cod} — ${a.nome}` }))}
                  selecionados={pendAcoes}
                  onChange={setPendAcoes}
                  comBusca
                />
              )}
              {mostrarDatas && opcoes.ugDestinos && opcoes.ugDestinos.length > 0 && (
                <MultiDropdown
                  label="UG Destino (Recebeu)"
                  opcoes={opcoes.ugDestinos.map(ug => ({ value: ug, label: ug }))}
                  selecionados={pendUgDestinos}
                  onChange={setPendUgDestinos}
                  comBusca
                />
              )}
            </div>

            {/* Período */}
            {mostrarDatas && (
              <div className="space-y-2">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Período</p>
                <div className="flex flex-wrap gap-2 items-center">
                  {/* Presets */}
                  {[
                    { label: 'Hoje', fn: () => presetData(hoje(), hoje()) },
                    { label: 'Ontem', fn: () => presetData(addDays(hoje(), -1), addDays(hoje(), -1)) },
                    { label: '7 dias', fn: () => presetData(addDays(hoje(), -6), hoje()) },
                    { label: 'Este mês', fn: () => presetData(inicioMes(), fimMes()) },
                    { label: 'Mês anterior', fn: () => presetData(inicioMes(-1), fimMes(-1)) },
                  ].map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={p.fn}
                      className="text-[10px] px-2.5 py-1 rounded-lg border cursor-pointer transition-all hover:brightness-125"
                      style={{ background: '#101C33', borderColor: '#1E3050', color: '#8A97AC' }}
                    >
                      {p.label}
                    </button>
                  ))}
                  {/* Inputs de data */}
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={pendDataDe}
                      onChange={e => setPendDataDe(e.target.value)}
                      className="text-xs px-2 py-1 rounded-lg border outline-none"
                      style={{ background: '#101C33', borderColor: '#1E3050', color: '#EAF1FB' }}
                    />
                    <span className="text-slate-500 text-xs">→</span>
                    <input
                      type="date"
                      value={pendDataAte}
                      onChange={e => setPendDataAte(e.target.value)}
                      className="text-xs px-2 py-1 rounded-lg border outline-none"
                      style={{ background: '#101C33', borderColor: '#1E3050', color: '#EAF1FB' }}
                    />
                  </div>
                  {(pendDataDe || pendDataAte) && (
                    <button
                      type="button"
                      onClick={() => { setPendDataDe(''); setPendDataAte(''); }}
                      className="text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      limpar datas
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Botões */}
            <div className="flex gap-2">
              <button
                type="submit"
                className="text-xs font-semibold px-4 py-2 rounded-lg transition-all cursor-pointer"
                style={{ background: '#1D4ED8', color: '#fff' }}
              >
                Aplicar filtros
              </button>
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="text-xs px-4 py-2 rounded-lg border cursor-pointer"
                style={{ borderColor: '#1E3050', color: '#8A97AC' }}
              >
                Fechar
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
