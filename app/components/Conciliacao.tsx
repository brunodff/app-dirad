import { useState } from 'react';

/** Movimentação feita pelas unidades fora do fluxo COMAE → unidade (uma por NC). */
export type MovUnidade = {
  nc: string;
  data: string;
  valor: number;
  tipo: 'entrada' | 'saida' | 'cambio';
  ug: string;
  descricao: string;
};

/** Por operação: crédito atual nas unidades e as movimentações que explicam a diferença. */
export type VisaoUnidades = { atual: number; itens: MovUnidade[] };

/** Recorte da aba Execução: recebido (descentralizado pelo COMAE) + movimentações = atual. */
export type ConciliacaoUnidades = { recebido: number; atual: number; itens: MovUnidade[] };

function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function brlSinal(v: number): string {
  return `${v > 0 ? '+' : '−'}${brl(Math.abs(v))}`;
}

function dataBr(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso;
}

function rotuloMov(m: MovUnidade): string {
  if (m.tipo === 'cambio') return m.valor < 0 ? 'Remanejado p/ fechamento de câmbio' : 'Chegada do câmbio na comissão no exterior';
  if (m.tipo === 'entrada') return 'Entrada direta na unidade (não passou pelo COMAE)';
  return 'Saída / remanejamento feito pela unidade';
}

const RESUMO_TIPO: Array<{ tipo: MovUnidade['tipo']; label: string }> = [
  { tipo: 'entrada', label: 'Entradas diretas nas unidades' },
  { tipo: 'saida',   label: 'Saídas e remanejamentos' },
  { tipo: 'cambio',  label: 'Câmbio (saídas − chegadas no exterior)' },
];

const POR_PAGINA = 5;

/**
 * Recebido pelas unidades (descentralizado pelo COMAE) + movimentações das unidades = crédito atual.
 * As movimentações aparecem como observações, uma por NC.
 * `execucaoTotal`, quando informado, sinaliza divergência entre a planilha de crédito e a de execução.
 */
export function Conciliacao({
  recebido,
  atual,
  itens,
  execucaoTotal,
  recolhido = false,
  className = '',
}: {
  recebido: number;
  atual: number;
  itens: MovUnidade[];
  execucaoTotal?: number;
  /** Começa com as observações fechadas (cards pequenos). */
  recolhido?: boolean;
  className?: string;
}) {
  const [aberto, setAberto] = useState(!recolhido);
  const [todos, setTodos] = useState(false);

  const movTotal = Math.round((atual - recebido) * 100) / 100;
  const temMov = itens.length > 0 && Math.abs(movTotal) >= 0.01;
  const divergExec = execucaoTotal !== undefined ? Math.round((execucaoTotal - atual) * 100) / 100 : 0;
  const visiveis = todos ? itens : itens.slice(0, POR_PAGINA);

  return (
    <div className={`rounded-lg px-3 py-2.5 text-[11px] tabular-nums ${className}`} style={{ background: '#0C1526', border: '1px solid #1E3050' }}>
      <div className="flex justify-between gap-2">
        <span className="text-slate-300 font-semibold">
          Recebido pelas unidades <span className="text-slate-500 font-normal">(descentralizado pelo COMAE)</span>
        </span>
        <span className="text-white font-semibold">{brl(recebido)}</span>
      </div>

      {temMov && (
        <div className="mt-1.5 space-y-0.5">
          <div className="flex justify-between gap-2">
            <span className="text-slate-400">Movimentações posteriores das unidades</span>
            <span style={{ color: movTotal < 0 ? '#E06A6A' : '#3FB07A' }}>{brlSinal(movTotal)}</span>
          </div>
          {RESUMO_TIPO.map(({ tipo, label }) => {
            const soma = itens.filter(m => m.tipo === tipo).reduce((s, m) => s + m.valor, 0);
            if (Math.abs(soma) < 0.01) return null;
            return (
              <div key={tipo} className="flex justify-between gap-2 pl-3 text-[10px] text-slate-500">
                <span>{label}</span>
                <span>{brlSinal(soma)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-between gap-2 mt-1.5 pt-1.5" style={{ borderTop: '1px solid #1E3050' }}>
        <span className="text-slate-400 font-semibold">Crédito atual nas unidades</span>
        <span className="text-slate-200 font-semibold">{brl(atual)}</span>
      </div>

      {Math.abs(divergExec) >= 0.01 && (
        <p className="text-[10px] pt-1" style={{ color: '#E0B341' }}>
          A planilha de execução difere do crédito em {brlSinal(divergExec)}.
        </p>
      )}

      {temMov && (
        <div className="mt-2 pt-2" style={{ borderTop: '1px dashed #1E3050' }}>
          <button
            type="button"
            onClick={() => setAberto(a => !a)}
            className="text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300 cursor-pointer"
          >
            {aberto ? '▾' : '▸'} Observações ({itens.length})
          </button>

          {aberto && (
            <ul className="mt-1.5 space-y-1.5">
              {visiveis.map(m => (
                <li key={m.nc + m.valor} className="text-[10px] leading-snug">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400 min-w-0 truncate">
                      {dataBr(m.data)} · <span className="font-mono">{m.nc}</span> · {m.ug}
                    </span>
                    <span className="flex-shrink-0" style={{ color: m.valor < 0 ? '#E06A6A' : '#3FB07A' }}>{brlSinal(m.valor)}</span>
                  </div>
                  <p className="text-slate-500 truncate" title={m.descricao}>
                    <span className="text-slate-400">{rotuloMov(m)}</span> — {m.descricao}
                  </p>
                </li>
              ))}
              {itens.length > POR_PAGINA && (
                <li>
                  <button
                    type="button"
                    onClick={() => setTodos(t => !t)}
                    className="text-[10px] text-sky-400/80 hover:text-sky-300 cursor-pointer"
                  >
                    {todos ? 'Mostrar menos' : `Ver todas (${itens.length})`}
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
