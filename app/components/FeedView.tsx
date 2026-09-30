import { useState } from 'react';
import { useFetcher } from 'react-router';
import { FilterBar, type FiltrosAtivos, type OpcoesFiltro } from './FilterBar';
import { apelidoOperacao } from '~/lib/apelidoOperacao';

export type MovimentoRow = {
  id: number;
  operacao: string;
  tipo_calculado: string;
  nd_cod: string;
  nd_nome: string;
  nc: string;
  data: string;
  valor: number;
  descricao: string;
  ug_exec_nome: string;
  ug_resp_nome: string;
  ug_destino_nome: string | null;
  subop: string | null;
  pedido: string | null;
  acao_cod?: string | null;
  acao_nome?: string | null;
  ug_exec_cod?: string | null;
  favorecido_nome?: string | null;
};

const ND_COLORS: Record<string, string> = {
  '339015': '#3E86C9',
  '339030': '#D68A3A',
  '339033': '#25A3A3',
  '339039': '#8266C4',
  '339092': '#C4566F',
};

const TIPO_META: Record<string, { label: string; cor: string; valorCor: string }> = {
  RECEBIDO:          { label: 'Recebido',       cor: '#1B3A2B', valorCor: '#3FB07A' },
  DESCENTRALIZADO:   { label: 'Descentralizado', cor: '#3A2C0C', valorCor: '#E0B341' },
  DEVOLUCAO:         { label: 'Devolução',       cor: '#3A1212', valorCor: '#E06A6A' },
  RECEBIDO_UNIDADES: { label: 'Rec. Unidades',   cor: '#0F2A2A', valorCor: '#25A3A3' },
};

function brl(v: number) {
  return Math.abs(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatData(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatDataLonga(iso: string) {
  const dt = new Date(iso + 'T12:00:00');
  return dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function MovimentoCard({ m, podeEditar }: { m: MovimentoRow; podeEditar: boolean }) {
  const meta = TIPO_META[m.tipo_calculado] ?? TIPO_META.RECEBIDO;
  const ndColor = ND_COLORS[m.nd_cod] ?? '#8A97AC';
  const sinal = m.tipo_calculado === 'DESCENTRALIZADO' ? '-' : '+';
  const [mostrando, setMostrando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [detalhes, setDetalhes] = useState(false);
  const fetcher = useFetcher();

  return (
    <div
      className="rounded-xl px-4 py-3 transition-all hover:brightness-110"
      style={{ background: '#101C33', border: '1px solid #1E3050', borderLeft: `3px solid ${meta.valorCor}` }}
    >
      <div className="flex gap-3">
        {/* Tipo badge + data */}
        <div className="flex-shrink-0 w-24 flex flex-col gap-1 pt-0.5">
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full text-center"
            style={{ background: meta.cor, color: meta.valorCor }}
          >
            {meta.label}
          </span>
          <span className="text-[10px] text-slate-500 text-center">{formatData(m.data)}</span>
          {m.subop && (
            <span className="text-[10px] text-slate-500 text-center font-medium">{m.subop}</span>
          )}
        </div>

        {/* Conteúdo principal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="text-xs font-semibold text-white truncate" title={m.operacao}>
              {apelidoOperacao(m.operacao)}
            </span>
            <span
              className="text-sm font-bold tabular-nums flex-shrink-0"
              style={{ color: meta.valorCor }}
            >
              {sinal}{brl(m.valor)}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-1.5">
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium"
              style={{ background: '#0C1526', color: ndColor, border: `1px solid ${ndColor}30` }}
            >
              {m.nd_cod}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">{m.nc}</span>
            {m.pedido && (
              <span className="text-[10px] text-slate-600 truncate max-w-[160px]" title={m.pedido}>
                {m.pedido}
              </span>
            )}
          </div>

          <div className="text-[10px] text-slate-500 flex gap-2 flex-wrap">
            <span title="UG Responsável">{m.ug_resp_nome}</span>
            {m.ug_destino_nome && m.tipo_calculado === 'DESCENTRALIZADO' && (
              <span className="text-slate-600">→ {m.ug_destino_nome}</span>
            )}
          </div>

          <p className="text-[10px] text-slate-600 mt-1 truncate" title={m.descricao}>
            {m.descricao}
          </p>

          <div className="flex items-center justify-between mt-1.5">
            <button
              type="button"
              onClick={() => setDetalhes(d => !d)}
              className="text-[10px] transition-colors cursor-pointer"
              style={{ color: detalhes ? '#C77DD6' : '#4A5B73' }}
            >
              {detalhes ? '↑ fechar' : '↓ detalhes'}
            </button>
            {podeEditar && !mostrando && (
              <button
                type="button"
                onClick={() => setMostrando(true)}
                className="text-[10px] text-slate-700 hover:text-red-400 transition-colors cursor-pointer"
              >
                Descartar
              </button>
            )}
          </div>

          {detalhes && (
            <div
              className="mt-2 pt-2 grid grid-cols-2 gap-x-4 gap-y-1.5"
              style={{ borderTop: '1px solid #1E3050' }}
            >
              {m.acao_cod && (
                <div className="col-span-2">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Ação</span>
                  <p className="text-[10px] mt-0.5">
                    <span className="font-mono font-bold" style={{ color: '#C77DD6' }}>{m.acao_cod}</span>
                    {m.acao_nome && <span className="text-slate-500 ml-1">— {m.acao_nome}</span>}
                  </p>
                </div>
              )}
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">NC</span>
                <p className="text-[10px] font-mono text-slate-300 mt-0.5">{m.nc}</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">ND</span>
                <p className="text-[10px] font-mono mt-0.5" style={{ color: ndColor }}>{m.nd_cod} <span className="text-slate-500 font-sans">{m.nd_nome}</span></p>
              </div>
              {(m.ug_destino_nome ?? m.ug_resp_nome) && (
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Favorecido</span>
                  <p className="text-[10px] text-slate-300 mt-0.5">{m.ug_destino_nome ?? m.ug_resp_nome}</p>
                </div>
              )}
              {m.pedido && (
                <div className="col-span-2">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Pedido</span>
                  <p className="text-[10px] text-slate-300 mt-0.5 break-all">{m.pedido}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Inline descarte form */}
      {mostrando && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: '#1E3050' }}>
          <p className="text-[10px] text-slate-500 mb-2">
            Este movimento ficará oculto do Feed e das Operações. Informe o motivo:
          </p>
          <fetcher.Form method="post" action="/painel">
            <input type="hidden" name="intent" value="descartar_movimento" />
            <input type="hidden" name="movimento_id" value={m.id} />
            <textarea
              name="motivo"
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Motivo do descarte (mín. 10 caracteres)…"
              rows={2}
              className="w-full text-xs rounded px-2 py-1.5 resize-none mb-2"
              style={{ background: '#0C1526', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }}
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={motivo.trim().length < 10 || fetcher.state !== 'idle'}
                className="text-xs font-semibold px-3 py-1.5 rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#3A1212', color: '#E06A6A', border: '1px solid #E06A6A33' }}
              >
                {fetcher.state !== 'idle' ? 'Descartando…' : 'Confirmar descarte'}
              </button>
              <button
                type="button"
                onClick={() => { setMostrando(false); setMotivo(''); }}
                className="text-xs px-3 py-1.5 rounded cursor-pointer"
                style={{ color: '#8A97AC' }}
              >
                Cancelar
              </button>
            </div>
          </fetcher.Form>
        </div>
      )}
    </div>
  );
}

function DiaGroup({ data, movimentos, podeEditar }: { data: string; movimentos: MovimentoRow[]; podeEditar: boolean }) {
  const recebido = movimentos.filter(m => m.tipo_calculado === 'RECEBIDO').reduce((s, m) => s + m.valor, 0);
  const descentr = movimentos.filter(m => m.tipo_calculado === 'DESCENTRALIZADO').reduce((s, m) => s + Math.abs(m.valor), 0);

  return (
    <section className="mb-6">
      <div
        className="flex items-center justify-between px-4 py-2 rounded-lg mb-3 sticky top-0 z-10"
        style={{ background: '#0C1526', border: '1px solid #1E3050' }}
      >
        <h2 className="text-xs font-semibold text-slate-300 capitalize">{formatDataLonga(data)}</h2>
        <div className="flex gap-4 text-[10px]">
          {recebido > 0 && <span style={{ color: '#3FB07A' }}>+{brl(recebido)}</span>}
          {descentr > 0 && <span style={{ color: '#E0B341' }}>-{brl(descentr)}</span>}
          <span className="text-slate-600">{movimentos.length} mov.</span>
        </div>
      </div>
      <div className="space-y-2">
        {movimentos.map(m => <MovimentoCard key={m.id} m={m} podeEditar={podeEditar} />)}
      </div>
    </section>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm font-bold tabular-nums" style={{ color: color ?? '#EAF1FB' }}>{value}</p>
    </div>
  );
}

type Props = {
  movimentos: MovimentoRow[];
  totaisGlobais: { recebido: number; descentralizado: number } | null;
  filtrosAtivos: FiltrosAtivos;
  opcoes: OpcoesFiltro;
  podeEditar: boolean;
};

export function FeedView({ movimentos, totaisGlobais, filtrosAtivos, opcoes, podeEditar }: Props) {
  const grouped = new Map<string, MovimentoRow[]>();
  for (const m of movimentos) {
    if (!grouped.has(m.data)) grouped.set(m.data, []);
    grouped.get(m.data)!.push(m);
  }

  const temFiltro =
    filtrosAtivos.ops.length > 0 || filtrosAtivos.nds.length > 0 ||
    filtrosAtivos.tipos.length > 0 || !!filtrosAtivos.dataDe ||
    (filtrosAtivos.ugExecs ?? []).length > 0 || (filtrosAtivos.ugDestinos ?? []).length > 0 ||
    (filtrosAtivos.acoes ?? []).length > 0;

  // Quando há filtro, totaliza os movimentos exibidos; sem filtro usa o resumo global do banco
  const totalRec  = temFiltro
    ? movimentos.filter(m => m.tipo_calculado === 'RECEBIDO').reduce((s, m) => s + m.valor, 0)
    : (totaisGlobais?.recebido ?? 0);
  const totalDev  = movimentos.filter(m => m.tipo_calculado === 'DEVOLUCAO').reduce((s, m) => s + Math.abs(m.valor), 0);
  const totalDesc = temFiltro
    ? movimentos.filter(m => m.tipo_calculado === 'DESCENTRALIZADO').reduce((s, m) => s + Math.abs(m.valor), 0) - totalDev
    : (totaisGlobais?.descentralizado ?? 0);
  const operacoes = new Set(movimentos.map(m => m.operacao)).size;

  return (
    <div>
      {/* FilterBar */}
      <FilterBar aba="feed" opcoes={opcoes} filtrosAtivos={filtrosAtivos} mostrarDatas />

      {/* Sumário */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 border-b"
        style={{ borderColor: '#1E3050', background: '#080F1F' }}
      >
        <Stat label={temFiltro ? 'Movimentos' : `Movimentos (${movimentos.length} recentes)`} value={temFiltro ? String(movimentos.length) : '—'} />
        <Stat label="Operações"       value={String(operacoes)} />
        <Stat label={temFiltro ? 'Recebido' : 'Recebido (total geral)'}         value={brl(totalRec)}   color="#3FB07A" />
        <Stat label={temFiltro ? 'Descentralizado' : 'Descentralizado (total)'} value={brl(totalDesc)} color="#E0B341" />
      </div>
      {!temFiltro && (
        <div className="px-4 py-1.5" style={{ background: '#080F1F', borderBottom: '1px solid #1E3050' }}>
          <p className="text-[10px] text-slate-600">
            O feed exibe os {movimentos.length} movimentos mais recentes. Os totais acima refletem <strong className="text-slate-500">todas as operações ativas</strong> do exercício.
          </p>
        </div>
      )}

      <div className="p-4">
        {movimentos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <p className="text-slate-500 text-sm">Nenhum movimento para os filtros selecionados.</p>
          </div>
        ) : (
          [...grouped.entries()].map(([data, movs]) => (
            <DiaGroup key={data} data={data} movimentos={movs} podeEditar={podeEditar} />
          ))
        )}
      </div>
    </div>
  );
}
