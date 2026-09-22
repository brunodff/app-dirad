import { useState } from 'react';
import { FilterBar, type FiltrosAtivos, type OpcoesFiltro } from './FilterBar';
import { apelidoOperacao } from '~/lib/apelidoOperacao';

export type EmpenhoDbRow = {
  operacao: string;
  ug_exec_cod: string;
  ug_exec_nome: string;
  ug_resp_cod: string;
  ug_resp_nome: string;
  nd_cod: string;
  nd_nome: string;
  subop: string | null;
  disponivel: number;
  a_liquidar: number;
  em_liquidacao: number;
  liq_a_pagar: number;
  pago: number;
  total: number;
  acao_cod?: string | null;
  acao_nome?: string | null;
};

// ── Tipos internos ────────────────────────────────────────────────────────────

type Fases = {
  disponivel: number;
  a_liquidar: number;
  em_liquidacao: number;
  liq_a_pagar: number;
  pago: number;
  total: number;
};

type NdItem      = Fases & { nd_cod: string; nd_nome: string };
type UgCredBlock = { cod: string; nome: string; nds: NdItem[]; subtotal: Fases };
type UgExecBlock = { cod: string; nome: string; ugsCred: UgCredBlock[]; subtotal: Fases };
type SubopBlock  = { subop: string; ugsExec: UgExecBlock[]; subtotal: Fases };
type OpBlockComae    = { operacao: string; subops: SubopBlock[]; subtotal: Fases };
type OpBlockUnidades = { operacao: string; ugsExec: UgExecBlock[]; subtotal: Fases };

const FASES_ZERO: Fases = { disponivel: 0, a_liquidar: 0, em_liquidacao: 0, liq_a_pagar: 0, pago: 0, total: 0 };

function somarFases(items: Fases[]): Fases {
  return items.reduce(
    (acc, r) => ({
      disponivel:    acc.disponivel    + r.disponivel,
      a_liquidar:    acc.a_liquidar    + r.a_liquidar,
      em_liquidacao: acc.em_liquidacao + r.em_liquidacao,
      liq_a_pagar:   acc.liq_a_pagar   + r.liq_a_pagar,
      pago:          acc.pago          + r.pago,
      total:         acc.total         + r.total,
    }),
    { ...FASES_ZERO },
  );
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

function buildUgExecBlocks(rows: EmpenhoDbRow[]): UgExecBlock[] {
  const byUg = groupBy(rows, r => r.ug_exec_cod);
  return [...byUg.entries()]
    .sort(([, a], [, b]) => a[0].ug_exec_nome.localeCompare(b[0].ug_exec_nome))
    .map(([cod, ugRows]) => {
      const byResp = groupBy(ugRows, r => r.ug_resp_cod);
      const ugsCred: UgCredBlock[] = [...byResp.entries()]
        .sort(([, a], [, b]) => a[0].ug_resp_nome.localeCompare(b[0].ug_resp_nome))
        .map(([respCod, respRows]) => {
          const byNd = groupBy(respRows, r => r.nd_cod);
          const nds: NdItem[] = [...byNd.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([nd_cod, ndRows]) => ({
              nd_cod, nd_nome: ndRows[0].nd_nome, ...somarFases(ndRows),
            }));
          return { cod: respCod, nome: respRows[0].ug_resp_nome, nds, subtotal: somarFases(nds) };
        });
      return { cod, nome: ugRows[0].ug_exec_nome, ugsCred, subtotal: somarFases(ugsCred.map(u => u.subtotal)) };
    });
}

function agruparComae(rows: EmpenhoDbRow[]): OpBlockComae[] {
  const byOp = groupBy(rows, r => r.operacao);
  const SUBOP_ORDER: Record<string, number> = { ZIDA: 0, CATRIMANI: 1 };

  return [...byOp.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([operacao, opRows]) => {
    const bySubop = groupBy(opRows, r => r.subop ?? 'Sem SubOp');

    const subops: SubopBlock[] = [...bySubop.entries()]
      .sort(([a], [b]) => (SUBOP_ORDER[a] ?? 9) - (SUBOP_ORDER[b] ?? 9))
      .map(([subop, subopRows]) => {
        const ugsExec = buildUgExecBlocks(subopRows);
        return { subop, ugsExec, subtotal: somarFases(ugsExec.map(u => u.subtotal)) };
      });

    return { operacao, subops, subtotal: somarFases(subops.map(s => s.subtotal)) };
  });
}

function agruparUnidades(rows: EmpenhoDbRow[]): OpBlockUnidades[] {
  const byOp = groupBy(rows, r => r.operacao);

  return [...byOp.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([operacao, opRows]) => {
    const ugsExec = buildUgExecBlocks(opRows);
    return { operacao, ugsExec, subtotal: somarFases(ugsExec.map(u => u.subtotal)) };
  });
}

// ── Utilitários de display ────────────────────────────────────────────────────

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function nomeUgCurto(nome: string): string {
  // Remove o código se vier no formato "120625 — NOME DA UG"
  return nome.replace(/^\d+\s*[—–-]\s*/, '').trim();
}

const FASE = {
  disponivel:    { cor: '#3FB07A' },
  a_liquidar:    { cor: '#E0B341' },
  em_liquidacao: { cor: '#D49A30' },
  liq_a_pagar:   { cor: '#5FA8E0' },
  pago:          { cor: '#7DD6A8' },
};

function ChevronIcon({ up }: { up: boolean }) {
  return (
    <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d={up ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} />
    </svg>
  );
}

function FaseCell({ value, cor }: { value: number; cor: string }) {
  if (value === 0) return <td className="px-3 py-2 text-right tabular-nums text-[11px] text-slate-700">—</td>;
  return (
    <td className="px-3 py-2 text-right tabular-nums text-[11px] font-medium" style={{ color: cor }}>
      {brl(value)}
    </td>
  );
}

function TotalCell({ value, bold }: { value: number; bold?: boolean }) {
  return (
    <td className={`px-3 py-2 text-right tabular-nums text-[11px] ${bold ? 'font-bold' : 'font-medium'} text-white`}>
      {brl(value)}
    </td>
  );
}

// ── Linhas da tabela ──────────────────────────────────────────────────────────

function NdLine({ nd, indent = 4 }: { nd: NdItem; indent?: number }) {
  const paddingLeft = `${indent}rem`;
  return (
    <tr style={{ background: '#0D1828', borderBottom: '1px solid #141F35' }}>
      <td className="pr-3 py-2 text-[11px]" style={{ paddingLeft }}>
        <span className="font-mono text-slate-400">{nd.nd_cod}</span>
        <span className="text-slate-600 ml-2 text-[10px]">{nd.nd_nome}</span>
      </td>
      <FaseCell value={nd.disponivel}    cor={FASE.disponivel.cor} />
      <FaseCell value={nd.a_liquidar}    cor={FASE.a_liquidar.cor} />
      <FaseCell value={nd.em_liquidacao} cor={FASE.em_liquidacao.cor} />
      <FaseCell value={nd.liq_a_pagar}   cor={FASE.liq_a_pagar.cor} />
      <FaseCell value={nd.pago}          cor={FASE.pago.cor} />
      <TotalCell value={nd.total} />
    </tr>
  );
}

function GroupRow({
  label, fases, depth, expanded, onClick, accent, monospace, noExpand,
}: {
  label: string; fases: Fases; depth: number;
  expanded: boolean; onClick: () => void;
  accent?: string; monospace?: boolean; noExpand?: boolean;
}) {
  const pl   = ['px-4', 'pl-6 pr-3', 'pl-10 pr-3', 'pl-14 pr-3'][depth] ?? 'pl-16 pr-3';
  const bg   = ['#131F38', '#0F1D30', '#0C1929', '#091420'][depth]       ?? '#080F1F';
  const size = depth === 0 ? 'text-xs font-bold text-white'
             : depth === 1 ? 'text-[11px] font-semibold text-slate-300'
             : depth === 2 ? 'text-[10px] font-medium text-slate-400'
             : 'text-[10px] font-medium text-slate-500';
  const border = depth === 0
    ? { borderBottom: '2px solid #1E3050', borderTop: '2px solid #1E3050' }
    : { borderBottom: '1px solid #1A2840' };

  return (
    <tr
      className={noExpand ? '' : 'cursor-pointer'}
      onClick={noExpand ? undefined : onClick}
      style={{ background: bg, ...border }}
    >
      <td className={`${pl} py-${depth === 0 ? '3' : '2'} ${size}`}>
        <span className="inline-flex items-center gap-2" style={{ color: depth === 0 && accent ? accent : undefined }}>
          {!noExpand && <ChevronIcon up={expanded} />}
          <span className={monospace ? 'font-mono' : ''}>{label}</span>
        </span>
      </td>
      <FaseCell value={fases.disponivel}    cor={FASE.disponivel.cor} />
      <FaseCell value={fases.a_liquidar}    cor={FASE.a_liquidar.cor} />
      <FaseCell value={fases.em_liquidacao} cor={FASE.em_liquidacao.cor} />
      <FaseCell value={fases.liq_a_pagar}   cor={FASE.liq_a_pagar.cor} />
      <FaseCell value={fases.pago}          cor={FASE.pago.cor} />
      <TotalCell value={fases.total} bold={depth === 0} />
    </tr>
  );
}

// ── Blocos COMAE ──────────────────────────────────────────────────────────────

function UgCredSection({ block, depth }: { block: UgCredBlock; depth: number }) {
  const [exp, setExp] = useState(false);
  const singleNd = block.nds.length === 1;
  const ndSuffix = singleNd ? ` · ${block.nds[0].nd_cod}` : '';
  const label = `${block.cod} — ${nomeUgCurto(block.nome)}${ndSuffix}`;
  return (
    <>
      <GroupRow
        label={label}
        fases={block.subtotal}
        depth={depth}
        expanded={exp}
        onClick={() => setExp(e => !e)}
        monospace
        noExpand={singleNd}
      />
      {exp && !singleNd && block.nds.map(nd => <NdLine key={nd.nd_cod} nd={nd} indent={depth === 3 ? 5 : 4} />)}
    </>
  );
}

function UgExecSection({ block, depth }: { block: UgExecBlock; depth: number }) {
  const [exp, setExp] = useState(true);
  const label = `${block.cod} — ${nomeUgCurto(block.nome)}`;

  return (
    <>
      <GroupRow
        label={label}
        fases={block.subtotal}
        depth={depth}
        expanded={exp}
        onClick={() => setExp(e => !e)}
        monospace
      />
      {exp && block.ugsCred.map(cred => (
        <UgCredSection key={cred.cod} block={cred} depth={depth + 1} />
      ))}
    </>
  );
}

function SubopSection({ block }: { block: SubopBlock }) {
  const [exp, setExp] = useState(true);
  return (
    <>
      <GroupRow label={block.subop} fases={block.subtotal} depth={1} expanded={exp} onClick={() => setExp(e => !e)} />
      {exp && block.ugsExec.map(u => <UgExecSection key={u.cod} block={u} depth={2} />)}
    </>
  );
}

function OperacaoComae({ block }: { block: OpBlockComae }) {
  const [exp, setExp] = useState(true);
  return (
    <>
      <GroupRow label={apelidoOperacao(block.operacao)} fases={block.subtotal} depth={0} expanded={exp} onClick={() => setExp(e => !e)} accent="#5FA8E0" />
      {exp && block.subops.map(s =>
        s.subop === 'Sem SubOp'
          ? s.ugsExec.map(u => <UgExecSection key={u.cod} block={u} depth={1} />)
          : <SubopSection key={s.subop} block={s} />
      )}
    </>
  );
}

// ── Blocos Unidades ───────────────────────────────────────────────────────────

function OperacaoUnidades({ block }: { block: OpBlockUnidades }) {
  const [exp, setExp] = useState(true);
  return (
    <>
      <GroupRow label={apelidoOperacao(block.operacao)} fases={block.subtotal} depth={0} expanded={exp} onClick={() => setExp(e => !e)} accent="#5FA8E0" />
      {exp && block.ugsExec.map(u => <UgExecSection key={u.cod} block={u} depth={1} />)}
    </>
  );
}

// ── Cards e barra de fases ────────────────────────────────────────────────────

function SummaryCards({ total }: { total: Fases }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {[
        { label: 'Crédito Total',  value: brl(total.total),        cor: '#EAF1FB' },
        { label: 'Disponível',     value: brl(total.disponivel),   cor: FASE.disponivel.cor },
        { label: 'A Liquidar',     value: brl(total.a_liquidar),   cor: FASE.a_liquidar.cor },
        { label: 'Liq. a Pagar',   value: brl(total.liq_a_pagar),  cor: FASE.liq_a_pagar.cor },
        { label: 'Pago',           value: brl(total.pago),         cor: FASE.pago.cor },
      ].map(c => (
        <div key={c.label} className="rounded-xl p-3" style={{ background: '#101C33', border: '1px solid #1E3050' }}>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{c.label}</p>
          <p className="text-sm font-bold tabular-nums" style={{ color: c.cor }}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

function PhaseBar({ total }: { total: Fases }) {
  const t = total.total || 1;
  const segs = [
    { key: 'disponivel',    pct: (total.disponivel    / t) * 100, cor: FASE.disponivel.cor,    label: 'Disponível' },
    { key: 'a_liquidar',    pct: (total.a_liquidar    / t) * 100, cor: FASE.a_liquidar.cor,    label: 'A Liquidar' },
    { key: 'em_liquidacao', pct: (total.em_liquidacao / t) * 100, cor: FASE.em_liquidacao.cor, label: 'Em Liquidação' },
    { key: 'liq_a_pagar',   pct: (total.liq_a_pagar   / t) * 100, cor: FASE.liq_a_pagar.cor,   label: 'Liq. a Pagar' },
    { key: 'pago',          pct: (total.pago          / t) * 100, cor: FASE.pago.cor,          label: 'Pago' },
  ];

  return (
    <div>
      <div className="flex h-2 rounded-full overflow-hidden gap-[1px]">
        {segs.map(s => s.pct > 0.1 && (
          <div key={s.key} style={{ width: `${s.pct}%`, background: s.cor, minWidth: 2 }} title={`${s.label}: ${s.pct.toFixed(1)}%`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-4 mt-2">
        {segs.map(s => (
          <span key={s.key} className="text-[10px] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.cor }} />
            <span style={{ color: s.cor }}>{s.label}</span>
            <span className="text-slate-600">{s.pct.toFixed(1)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Cabeçalho de sync ─────────────────────────────────────────────────────────

function SyncStatus({ ultimaSync }: { ultimaSync: string | null }) {
  if (!ultimaSync) return null;

  const dt      = new Date(ultimaSync);
  const diffMin = Math.floor((Date.now() - dt.getTime()) / 60_000);
  const diffH   = Math.floor(diffMin / 60);
  const diffD   = Math.floor(diffH / 24);

  const tempo   = diffD > 0 ? `${diffD}d atrás` : diffH > 0 ? `${diffH}h atrás` : `${diffMin}min atrás`;
  const stale   = diffH >= 24;
  const cor     = stale ? '#E0B341' : '#3FB07A';
  const bgCor   = stale ? '#3A2C0C' : '#0C2825';
  const bord    = stale ? '#E0B34133' : '#3FB07A33';
  const label   = dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: bgCor, border: `1px solid ${bord}` }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cor }} />
      <span className="text-[10px]" style={{ color: cor }}>
        Sincronizado em {label} ({tempo}){stale ? ' — dados podem estar desatualizados' : ''}
      </span>
    </div>
  );
}

// ── View principal ────────────────────────────────────────────────────────────

const TABLE_HEADERS = ['ND / Grupo', 'Disponível', 'A Liquidar', 'Em Liquidação', 'Liq. a Pagar', 'Pago', 'Total'];

type Props = {
  rows: EmpenhoDbRow[];
  filtrosAtivos: FiltrosAtivos;
  opcoes: OpcoesFiltro;
  ultimaSync: string | null;
};


export function ExecucaoView({ rows, filtrosAtivos, opcoes, ultimaSync }: Props) {
  const [visao, setVisao] = useState<'comae' | 'unidades'>('comae');
  const [soComCredito, setSoComCredito] = useState(false);

  const rowsBase     = soComCredito ? rows.filter(r => r.disponivel > 0.005) : rows;
  const rowsComae    = rowsBase.filter(r => r.ug_resp_cod === '120115');
  const rowsUnidades = rowsBase.filter(r => r.ug_resp_cod !== '120115');
  const rowsAtivos   = visao === 'comae' ? rowsComae : rowsUnidades;
  const totalGeral   = somarFases(rowsAtivos);

  const blocosComae    = visao === 'comae'    ? agruparComae(rowsComae)       : [];
  const blocosUnidades = visao === 'unidades' ? agruparUnidades(rowsUnidades) : [];

  return (
    <div>
      {/* Header */}
      <div className="px-5 py-4 border-b flex items-center justify-between gap-4 flex-wrap" style={{ background: '#080F1F', borderColor: '#1E3050' }}>
        <div>
          <h2 className="text-sm font-bold text-white mb-0.5">Execução Orçamentária</h2>
          <p className="text-[10px] text-slate-500">Fases da despesa por operação</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <SyncStatus ultimaSync={ultimaSync} />
          {/* Toggle: apenas com crédito disponível */}
          <button
            data-tour="credito-toggle"
            type="button"
            onClick={() => setSoComCredito(v => !v)}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-all cursor-pointer"
            style={{
              background:   soComCredito ? '#1B3A2B' : '#101C33',
              borderColor:  soComCredito ? '#3FB07A' : '#1E3050',
              color:        soComCredito ? '#3FB07A' : '#8A97AC',
            }}
          >
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Com crédito disponível
          </button>
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #1E3050' }}>
            {(['comae', 'unidades'] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setVisao(v)}
                className="px-4 py-2 text-xs font-medium transition-colors cursor-pointer"
                style={{
                  background: visao === v ? '#1E3050' : 'transparent',
                  color:      visao === v ? '#EAF1FB' : '#8A97AC',
                  borderRight: v === 'comae' ? '1px solid #1E3050' : undefined,
                }}
              >
                {v === 'comae' ? 'COMAE' : 'Unidades'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* FilterBar */}
      <FilterBar aba="execucao" opcoes={opcoes} filtrosAtivos={filtrosAtivos} mostrarDatas={false} />

      {/* Summary */}
      {rowsAtivos.length > 0 && (
        <div className="px-5 py-4 border-b space-y-3" style={{ borderColor: '#1E3050', background: '#080F1F' }}>
          <SummaryCards total={totalGeral} />
          <PhaseBar total={totalGeral} />
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        {rowsAtivos.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-slate-500 text-sm text-center px-8">
              {rows.length === 0
                ? 'Nenhum dado de execução disponível.'
                : `Nenhum dado ${visao === 'comae' ? 'do COMAE' : 'das Unidades'} para os filtros selecionados.`
              }
            </p>
          </div>
        ) : (
          <table className="w-full text-xs" style={{ minWidth: 960 }}>
            <thead>
              <tr style={{ background: '#080F1F', borderBottom: '1px solid #1E3050' }}>
                {TABLE_HEADERS.map((h, i) => (
                  <th
                    key={h}
                    className="px-3 py-2.5 text-[10px] text-slate-500 font-medium"
                    style={{ textAlign: i === 0 ? 'left' : 'right' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visao === 'comae'
                ? blocosComae.map(b    => <OperacaoComae    key={b.operacao} block={b} />)
                : blocosUnidades.map(b => <OperacaoUnidades key={b.operacao} block={b} />)
              }
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
