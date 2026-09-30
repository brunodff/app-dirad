function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const MOV_DIRETA_TITLE =
  'Crédito que entrou ou saiu das unidades sem passar pelo COMAE: remanejamentos e ' +
  'recolhimentos feitos pelas unidades, entradas diretas do EMAER, correções de UGR.';

/**
 * Descentralizado ± movimentação direta das unidades = Nas unidades.
 * `execucaoTotal`, quando informado, sinaliza divergência entre a planilha de crédito e a de execução.
 */
export function Conciliacao({
  descentralizado,
  nasUnidades,
  execucaoTotal,
  className = '',
}: {
  descentralizado: number;
  nasUnidades: number;
  execucaoTotal?: number;
  className?: string;
}) {
  const movDireta = Math.round((nasUnidades - descentralizado) * 100) / 100;
  const temMov = Math.abs(movDireta) >= 0.01;
  const divergExec = execucaoTotal !== undefined ? Math.round((execucaoTotal - nasUnidades) * 100) / 100 : 0;
  return (
    <div className={`rounded-lg px-3 py-2 text-[11px] tabular-nums space-y-1 ${className}`} style={{ background: '#0C1526', border: '1px solid #1E3050' }}>
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
      {Math.abs(divergExec) >= 0.01 && (
        <p className="text-[10px] pt-1" style={{ color: '#E0B341' }}>
          A planilha de execução difere do crédito em {divergExec > 0 ? '+' : '−'}{brl(Math.abs(divergExec))}.
        </p>
      )}
    </div>
  );
}
