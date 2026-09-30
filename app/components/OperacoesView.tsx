import { useState } from 'react';
import { useFetcher } from 'react-router';
import { FilterBar, type FiltrosAtivos, type OpcoesFiltro } from './FilterBar';
import { apelidoOperacao } from '~/lib/apelidoOperacao';

export type ResumoRow = {
  operacao: string;
  recebido: number;
  descentralizado: number;
  empenhado: number;
  disponivel: number;
  /** Crédito líquido nas unidades (fora do COMAE) — igual ao total "Unidades" da Execução. */
  nas_unidades?: number;
  acao_cod?: string | null;
  acao_nome?: string | null;
};

function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function MetricItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider" style={{ color }}>
        {label}
      </span>
      <span className="text-sm font-semibold text-white tabular-nums">{brl(value)}</span>
    </div>
  );
}

function ProgressBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-slate-500 mb-1">
        <span>{label}</span>
        <span>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-1 rounded-full" style={{ background: '#1E3050' }}>
        <div className="h-1 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function ConfirmarDesativar({
  operacao,
  onCancel,
}: {
  operacao: string;
  onCancel: () => void;
}) {
  const fetcher = useFetcher();
  const [motivo, setMotivo] = useState('');
  const submetendo = fetcher.state !== 'idle';

  return (
    <fetcher.Form
      method="post"
      action="/painel"
      className="mt-3 pt-3 border-t"
      style={{ borderColor: '#1E3050' }}
    >
      <input type="hidden" name="intent" value="desativar" />
      <input type="hidden" name="operacao" value={operacao} />

      <p className="text-[10px] text-slate-500 mb-2">Motivo da desativação (obrigatório)</p>
      <textarea
        name="motivo"
        value={motivo}
        onChange={e => setMotivo(e.target.value)}
        required
        minLength={10}
        rows={2}
        placeholder="Ex.: operação encerrada, crédito esgotado..."
        className="w-full text-xs px-3 py-2 rounded-lg border outline-none resize-none mb-2"
        style={{ background: '#0C1526', borderColor: '#1E3050', color: '#EAF1FB' }}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submetendo || motivo.trim().length < 10}
          className="text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-40"
          style={{ background: '#3A1212', color: '#E06A6A', border: '1px solid #E06A6A33' }}
        >
          {submetendo ? 'Desativando…' : 'Confirmar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded-lg border cursor-pointer"
          style={{ borderColor: '#1E3050', color: '#8A97AC' }}
        >
          Cancelar
        </button>
      </div>
    </fetcher.Form>
  );
}

const MOV_DIRETA_TITLE =
  'Crédito que entrou ou saiu das unidades sem passar pelo COMAE: remanejamentos e ' +
  'recolhimentos feitos pelas unidades, entradas diretas do EMAER, correções de UGR.';

/** Descentralizado ± movimentação direta das unidades = Nas unidades (aba Execução). */
function Conciliacao({ descentralizado, nasUnidades }: { descentralizado: number; nasUnidades: number }) {
  const movDireta = Math.round((nasUnidades - descentralizado) * 100) / 100;
  const temMov = Math.abs(movDireta) >= 0.01;
  return (
    <div className="rounded-lg px-3 py-2 mb-4 text-[11px] tabular-nums space-y-1" style={{ background: '#0C1526', border: '1px solid #1E3050' }}>
      <div className="flex justify-between gap-2">
        <span className="text-slate-500">Descentralizado pelo COMAE</span>
        <span className="text-slate-300">{brl(descentralizado)}</span>
      </div>
      {temMov && (
        <div className="flex justify-between gap-2" title={MOV_DIRETA_TITLE}>
          <span className="text-slate-500 underline decoration-dotted cursor-help">Mov. direta das unidades</span>
          <span style={{ color: movDireta < 0 ? '#E06A6A' : '#3FB07A' }}>
            {movDireta > 0 ? '+' : '−'}{brl(Math.abs(movDireta))}
          </span>
        </div>
      )}
      <div className="flex justify-between gap-2 pt-1" style={{ borderTop: '1px solid #1E3050' }}>
        <span className="text-slate-400 font-semibold">Nas unidades</span>
        <span className="text-white font-semibold">{brl(nasUnidades)}</span>
      </div>
    </div>
  );
}

function OperacaoCard({
  row,
  podeEditar,
}: {
  row: ResumoRow;
  podeEditar: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);

  const pctDesc = row.recebido > 0 ? Math.min(100, (row.descentralizado / row.recebido) * 100) : 0;
  const pctEmp  = row.recebido > 0 ? Math.min(100, (row.empenhado / row.recebido) * 100) : 0;
  const pctUtil = Math.min(100, pctDesc + pctEmp);

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: '#101C33', border: '1px solid #1E3050' }}
    >
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-white leading-snug">{apelidoOperacao(row.operacao)}</h2>
          {row.acao_cod && (
            <p className="text-[10px] mt-0.5 font-mono" style={{ color: '#C77DD6' }}>
              {row.acao_cod} <span style={{ color: '#6A7A8C', fontFamily: 'inherit' }}>— {row.acao_nome}</span>
            </p>
          )}
        </div>
        {podeEditar && !confirmando && (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="flex-shrink-0 text-[10px] px-2 py-1 rounded-lg border cursor-pointer transition-colors hover:brightness-125"
            style={{ background: '#1A0A0A', borderColor: '#3A1212', color: '#E06A6A' }}
            title="Desativar operação"
          >
            Desativar
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-5">
        <MetricItem label="Recebido"          value={row.recebido}        color="#3FB07A" />
        <MetricItem label="Descentralizado"   value={row.descentralizado} color="#E0B341" />
        <MetricItem label="Emp. COMAE"        value={row.empenhado}       color="#C77DD6" />
        <MetricItem label="Disponível"        value={row.disponivel}      color="#5FA8E0" />
      </div>

      {row.nas_unidades !== undefined && (
        <Conciliacao descentralizado={row.descentralizado} nasUnidades={row.nas_unidades} />
      )}

      <div className="space-y-2">
        <ProgressBar label="Descentralização" pct={pctDesc} color="#E0B341" />
        {row.empenhado > 0 && (
          <ProgressBar label="Empenhado" pct={pctEmp} color="#C77DD6" />
        )}
        {row.empenhado > 0 && (
          <ProgressBar label="Utilização" pct={pctUtil} color="#5FA8E0" />
        )}
      </div>

      {confirmando && (
        <ConfirmarDesativar operacao={row.operacao} onCancel={() => setConfirmando(false)} />
      )}
    </div>
  );
}

type Props = {
  resumo: ResumoRow[];
  filtrosAtivos: FiltrosAtivos;
  opcoes: OpcoesFiltro;
  podeEditar: boolean;
};

export function OperacoesView({ resumo, filtrosAtivos, opcoes, podeEditar }: Props) {
  const totais = resumo.reduce(
    (acc, r) => ({
      recebido:        acc.recebido        + r.recebido,
      descentralizado: acc.descentralizado + r.descentralizado,
      empenhado:       acc.empenhado       + r.empenhado,
      disponivel:      acc.disponivel      + r.disponivel,
      nasUnidades:     acc.nasUnidades     + (r.nas_unidades ?? 0),
    }),
    { recebido: 0, descentralizado: 0, empenhado: 0, disponivel: 0, nasUnidades: 0 },
  );

  return (
    <div>
      {/* FilterBar (apenas seletor de operação, sem datas/tipos) */}
      <FilterBar aba="operacoes" opcoes={opcoes} filtrosAtivos={filtrosAtivos} mostrarDatas={false} />

      {/* Totais */}
      <div
        className="grid grid-cols-2 sm:grid-cols-5 gap-4 px-5 py-4 border-b"
        style={{ borderColor: '#1E3050', background: '#080F1F' }}
      >
        <MetricItem label="Recebido Total"          value={totais.recebido}        color="#3FB07A" />
        <MetricItem label="Descentralizado Total"   value={totais.descentralizado} color="#E0B341" />
        <MetricItem label="Emp. COMAE Total"        value={totais.empenhado}       color="#C77DD6" />
        <MetricItem label="Disponível Total"        value={totais.disponivel}      color="#5FA8E0" />
        <MetricItem label="Nas Unidades Total"      value={totais.nasUnidades}     color="#94A3B8" />
      </div>

      {/* Cards por operação */}
      <div className="p-5">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-4">
          {resumo.length} operação{resumo.length !== 1 ? 'ões' : ''}
          {filtrosAtivos.ops.length > 0 && ' (filtradas)'}
        </p>
        {resumo.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhuma operação para os filtros selecionados.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {resumo.map(row => (
              <OperacaoCard key={row.operacao} row={row} podeEditar={podeEditar} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
