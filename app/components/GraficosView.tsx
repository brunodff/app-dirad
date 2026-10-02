import { FilterBar, type FiltrosAtivos, type OpcoesFiltro } from './FilterBar';
import { apelidoOperacao } from '~/lib/apelidoOperacao';

export type GraficoOpRow = {
  operacao: string;
  recebido: number;
  descentralizado: number;
  empenhadoComae: number;
  disponivelComae: number;
  disponivelOm: number;
  aLiquidar: number;
  emLiquidacao: number;
  aPagar: number;
  pago: number;
};

// ── Formatação ────────────────────────────────────────────────────────────────

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** "58,26 mi" / "288,1 mil" — rótulo curto para cima das barras. */
function compacto(v: number): string {
  const a = Math.abs(v);
  const sinal = v < 0 ? '−' : '';
  if (a >= 1e6) return `${sinal}${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  if (a >= 1e3) return `${sinal}${(a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `${sinal}${a.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

function eixo(v: number): string {
  if (v === 0) return '0';
  if (v >= 1e6) return `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (v >= 1e3) return `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return v.toLocaleString('pt-BR');
}

function pct(v: number, base: number): string {
  if (base <= 0) return '—';
  return `${((v / base) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Topo "redondo" do eixo Y, divisível em 4 faixas (1, 1,2, 1,6, 2, 2,4 … 10 × 10ⁿ). */
const PASSOS = [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10];
function topoEixo(max: number): number {
  if (max <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(max));
  const f = max / exp;
  return (PASSOS.find(p => f <= p) ?? 10) * exp;
}

// ── Barras ────────────────────────────────────────────────────────────────────

type Segmento = { label: string; valor: number; cor: string };
type Barra = { id: string; label: string; grupo: 'credito' | 'execucao'; segmentos: Segmento[] };

const COR = {
  recebido:        '#3FB07A',
  descentralizado: '#E0B341',
  empComae:        '#C77DD6',
  dispComae:       '#5FA8E0',
  dispOm:          '#25A3A3',
  aLiquidar:       '#F0A04B',
  emLiquidacao:    '#D4763A',
  aPagar:          '#8B9CF6',
  pago:            '#7DD6A8',
};

function montarBarras(r: GraficoOpRow): Barra[] {
  const barras: Barra[] = [
    { id: 'rec',  label: 'Recebido',        grupo: 'credito', segmentos: [{ label: 'Recebido', valor: r.recebido, cor: COR.recebido }] },
    {
      id: 'desc', label: 'Descentralizado', grupo: 'credito',
      segmentos: [
        { label: 'Descentralizado', valor: r.descentralizado, cor: COR.descentralizado },
        { label: 'Empenhado COMAE', valor: r.empenhadoComae,  cor: COR.empComae },
      ],
    },
    { id: 'dcom', label: 'Disp. COMAE',     grupo: 'credito',  segmentos: [{ label: 'Disponível COMAE', valor: r.disponivelComae, cor: COR.dispComae }] },
    { id: 'dom',  label: 'Disp. OM',        grupo: 'execucao', segmentos: [{ label: 'Disponível OM',    valor: r.disponivelOm,    cor: COR.dispOm }] },
    { id: 'liq',  label: 'A Liquidar',      grupo: 'execucao', segmentos: [{ label: 'A Liquidar',       valor: r.aLiquidar,       cor: COR.aLiquidar }] },
  ];
  if (Math.abs(r.emLiquidacao) >= 0.01) {
    barras.push({ id: 'eliq', label: 'Em Liquidação', grupo: 'execucao', segmentos: [{ label: 'Em Liquidação', valor: r.emLiquidacao, cor: COR.emLiquidacao }] });
  }
  barras.push(
    { id: 'pag',  label: 'A Pagar',         grupo: 'execucao', segmentos: [{ label: 'A Pagar', valor: r.aPagar, cor: COR.aPagar }] },
    { id: 'pago', label: 'Pago',            grupo: 'execucao', segmentos: [{ label: 'Pago',    valor: r.pago,   cor: COR.pago }] },
  );
  return barras;
}

const totalBarra = (b: Barra) => b.segmentos.reduce((s, x) => s + x.valor, 0);

// ── Gráfico ───────────────────────────────────────────────────────────────────

const PLOT_H = 200;   // altura útil das barras (px)
const FOLGA  = 34;    // espaço acima da maior barra para valor + %

function GraficoBarras({ row }: { row: GraficoOpRow }) {
  const barras = montarBarras(row);
  const topo   = topoEixo(Math.max(...barras.map(totalBarra), 0));
  const px     = (v: number) => Math.max(0, Math.round((v / topo) * PLOT_H));
  const ticks  = [0, 0.25, 0.5, 0.75, 1].map(f => f * topo);
  const iDivisor = barras.findIndex(b => b.grupo === 'execucao');

  return (
    <div className="overflow-x-auto">
      <div className="flex" style={{ minWidth: 520 }}>
        {/* Eixo Y */}
        <div className="relative flex-shrink-0 w-12" style={{ height: PLOT_H + FOLGA }}>
          {ticks.map(t => (
            <span
              key={t}
              className="absolute right-2 text-[9px] text-slate-600 tabular-nums -translate-y-1/2"
              style={{ bottom: px(t) }}
            >
              {eixo(t)}
            </span>
          ))}
        </div>

        {/* Área de plotagem */}
        <div className="flex-1 min-w-0">
          <div className="relative" style={{ height: PLOT_H + FOLGA }}>
            {ticks.map(t => (
              <div
                key={t}
                className="absolute left-0 right-0"
                style={{ bottom: px(t), borderTop: t === 0 ? '1px solid #2A3D5C' : '1px dashed #16243A' }}
              />
            ))}

            <div className="absolute inset-0 flex items-end gap-2 px-1">
              {barras.map((b, i) => {
                const total = totalBarra(b);
                return (
                  <div key={b.id} className="relative flex-1 flex items-end justify-center h-full group">
                    {i === iDivisor && (
                      <div className="absolute -left-1 top-0 bottom-0" style={{ borderLeft: '1px solid #1E3050' }} />
                    )}

                    <div className="flex flex-col items-center w-full max-w-[56px]">
                      {/* Valor + % */}
                      <span className="text-[10px] font-semibold text-white tabular-nums whitespace-nowrap leading-tight">
                        {compacto(total)}
                      </span>
                      <span className="text-[9px] text-slate-400 tabular-nums whitespace-nowrap leading-tight mb-1">
                        {pct(total, row.recebido)}
                      </span>

                      {/* Barra (empilhada de baixo para cima) */}
                      <div
                        className="w-full rounded-t-md overflow-hidden flex flex-col-reverse transition-[filter] group-hover:brightness-125"
                        style={{ height: px(total), minHeight: total > 0 ? 2 : 0 }}
                      >
                        {b.segmentos.map(sg => (
                          <div
                            key={sg.label}
                            style={{
                              height: total > 0 ? `${(Math.max(0, sg.valor) / total) * 100}%` : 0,
                              background: `linear-gradient(180deg, ${sg.cor} 0%, ${sg.cor}B3 100%)`,
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Tooltip */}
                    <div
                      className={`pointer-events-none absolute top-0 z-10 hidden group-hover:block rounded-lg px-3 py-2 text-[11px] whitespace-nowrap shadow-xl ${
                        i === 0 ? 'left-0' : i === barras.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                      }`}
                      style={{ background: '#0C1526', border: '1px solid #2A3D5C' }}
                    >
                      <p className="text-slate-300 font-semibold mb-1">{b.label}</p>
                      {b.segmentos.length > 1 && b.segmentos.map(sg => (
                        <p key={sg.label} className="flex items-center gap-1.5 tabular-nums text-slate-400">
                          <span className="w-2 h-2 rounded-sm" style={{ background: sg.cor }} />
                          {sg.label}: <span className="text-slate-200">{brl(sg.valor)}</span>
                        </p>
                      ))}
                      <p className="tabular-nums text-white font-semibold">
                        {brl(total)} <span className="text-slate-400 font-normal">· {pct(total, row.recebido)} do recebido</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rótulos X */}
          <div className="flex gap-2 px-1 pt-2">
            {barras.map(b => (
              <span key={b.id} className="flex-1 text-center text-[10px] text-slate-400 leading-tight">{b.label}</span>
            ))}
          </div>

          {/* Grupos */}
          <div className="flex gap-2 px-1 pt-2">
            <span
              className="text-center text-[9px] uppercase tracking-widest text-slate-600 pt-1"
              style={{ flex: iDivisor, borderTop: '1px solid #1E3050' }}
            >
              Crédito COMAE
            </span>
            <span
              className="text-center text-[9px] uppercase tracking-widest text-slate-600 pt-1"
              style={{ flex: barras.length - iDivisor, borderTop: '1px solid #1E3050' }}
            >
              Execução
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function GraficoCard({ row }: { row: GraficoOpRow }) {
  const barras = montarBarras(row);
  const itens = barras.flatMap(b => b.segmentos)
    .filter(it => it.label !== 'Empenhado COMAE' || Math.abs(it.valor) >= 0.01);

  return (
    <div className="rounded-2xl p-5" style={{ background: '#101C33', border: '1px solid #1E3050' }}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-0.5">Execução</p>
          <h2 className="text-base font-bold text-white leading-snug" title={row.operacao}>
            {apelidoOperacao(row.operacao)}
          </h2>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Destaque label="Recebido" valor={brl(row.recebido)} cor={COR.recebido} />
          <Destaque label="Pago" valor={pct(row.pago, row.recebido)} cor={COR.pago} />
        </div>
      </div>

      <GraficoBarras row={row} />

      {/* Valores completos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mt-5 pt-4" style={{ borderTop: '1px solid #1E3050' }}>
        {itens.map(it => (
          <div key={it.label} className="flex items-start gap-2 min-w-0">
            <span className="w-2 h-2 rounded-sm mt-1 flex-shrink-0" style={{ background: it.cor }} />
            <div className="min-w-0">
              <p className="text-[10px] text-slate-500 leading-tight">{it.label}</p>
              <p className="text-xs text-slate-200 font-semibold tabular-nums leading-tight">
                {brl(it.valor)} <span className="text-[10px] text-slate-500 font-normal">{pct(it.valor, row.recebido)}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Destaque({ label, valor, cor }: { label: string; valor: string; cor: string }) {
  return (
    <div className="rounded-lg px-2.5 py-1.5 text-right" style={{ background: '#0C1526', border: '1px solid #1E3050' }}>
      <p className="text-[9px] uppercase tracking-wider" style={{ color: cor }}>{label}</p>
      <p className="text-xs font-semibold text-white tabular-nums whitespace-nowrap">{valor}</p>
    </div>
  );
}

// ── View ──────────────────────────────────────────────────────────────────────

type Props = {
  graficos: GraficoOpRow[];
  filtrosAtivos: FiltrosAtivos;
  opcoes: OpcoesFiltro;
};

export function GraficosView({ graficos, filtrosAtivos, opcoes }: Props) {
  return (
    <div>
      <div className="px-5 py-4 border-b" style={{ background: '#080F1F', borderColor: '#1E3050' }}>
        <h2 className="text-sm font-bold text-white mb-0.5">Gráficos</h2>
        <p className="text-[10px] text-slate-500">
          Crédito e execução por operação · percentuais sobre o recebido pelo COMAE
        </p>
      </div>

      <FilterBar aba="graficos" opcoes={opcoes} filtrosAtivos={filtrosAtivos} mostrarDatas={false} />

      <div className="p-5">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-4">
          {graficos.length} {graficos.length === 1 ? 'operação' : 'operações'}
          {filtrosAtivos.ops.length > 0 && ' (filtradas)'}
        </p>
        {graficos.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhuma operação para os filtros selecionados.</p>
        ) : (
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5">
            {graficos.map(row => <GraficoCard key={row.operacao} row={row} />)}
          </div>
        )}
      </div>
    </div>
  );
}
