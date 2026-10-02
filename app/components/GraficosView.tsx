import { useEffect, useRef, useState } from 'react';
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

/** Itens da legenda com valores completos (oculta Emp. COMAE zerado). */
function itensLegenda(row: GraficoOpRow): Segmento[] {
  return montarBarras(row).flatMap(b => b.segmentos)
    .filter(it => it.label !== 'Empenhado COMAE' || Math.abs(it.valor) >= 0.01);
}

// ── Gráfico ───────────────────────────────────────────────────────────────────

/** Dimensões e tipografia do gráfico: card normal ou modo apresentação. */
type Tamanho = {
  plotH: number; folga: number; minW: number;
  eixoW: string; eixoTxt: string; valorTxt: string; pctTxt: string;
  xTxt: string; grupoTxt: string; tipTxt: string; barMax: string; gap: string;
};

const TAM_CARD: Tamanho = {
  plotH: 200, folga: 34, minW: 520,
  eixoW: 'w-12', eixoTxt: 'text-[9px]', valorTxt: 'text-[10px]', pctTxt: 'text-[9px]',
  xTxt: 'text-[10px]', grupoTxt: 'text-[9px]', tipTxt: 'text-[11px]', barMax: 'max-w-[56px]', gap: 'gap-2',
};

const tamApresentacao = (plotH: number): Tamanho => ({
  plotH, folga: 62, minW: 760,
  eixoW: 'w-16', eixoTxt: 'text-xs', valorTxt: 'text-xl', pctTxt: 'text-sm',
  xTxt: 'text-base', grupoTxt: 'text-xs', tipTxt: 'text-sm', barMax: 'max-w-[120px]', gap: 'gap-5',
});

function GraficoBarras({ row, tam = TAM_CARD }: { row: GraficoOpRow; tam?: Tamanho }) {
  const { plotH, folga } = tam;
  const barras = montarBarras(row);
  const topo   = topoEixo(Math.max(...barras.map(totalBarra), 0));
  const px     = (v: number) => Math.max(0, Math.round((v / topo) * plotH));
  const ticks  = [0, 0.25, 0.5, 0.75, 1].map(f => f * topo);
  const iDivisor = barras.findIndex(b => b.grupo === 'execucao');

  return (
    <div className="overflow-x-auto">
      <div className="flex" style={{ minWidth: tam.minW }}>
        {/* Eixo Y */}
        <div className={`relative flex-shrink-0 ${tam.eixoW}`} style={{ height: plotH + folga }}>
          {ticks.map(t => (
            <span
              key={t}
              className={`absolute right-2 ${tam.eixoTxt} text-slate-600 tabular-nums -translate-y-1/2`}
              style={{ bottom: px(t) }}
            >
              {eixo(t)}
            </span>
          ))}
        </div>

        {/* Área de plotagem */}
        <div className="flex-1 min-w-0">
          <div className="relative" style={{ height: plotH + folga }}>
            {ticks.map(t => (
              <div
                key={t}
                className="absolute left-0 right-0"
                style={{ bottom: px(t), borderTop: t === 0 ? '1px solid #2A3D5C' : '1px dashed #16243A' }}
              />
            ))}

            <div className={`absolute inset-0 flex items-end ${tam.gap} px-1`}>
              {barras.map((b, i) => {
                const total = totalBarra(b);
                return (
                  <div key={b.id} className="relative flex-1 flex items-end justify-center h-full group">
                    {i === iDivisor && (
                      <div className="absolute -left-1 top-0 bottom-0" style={{ borderLeft: '1px solid #1E3050' }} />
                    )}

                    <div className={`flex flex-col items-center w-full ${tam.barMax}`}>
                      {/* Valor + % */}
                      <span className={`${tam.valorTxt} font-semibold text-white tabular-nums whitespace-nowrap leading-tight`}>
                        {compacto(total)}
                      </span>
                      <span className={`${tam.pctTxt} text-slate-400 tabular-nums whitespace-nowrap leading-tight mb-1`}>
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
                      className={`pointer-events-none absolute top-0 z-10 hidden group-hover:block rounded-lg px-3 py-2 ${tam.tipTxt} whitespace-nowrap shadow-xl ${
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
          <div className={`flex ${tam.gap} px-1 pt-2`}>
            {barras.map(b => (
              <span key={b.id} className={`flex-1 text-center ${tam.xTxt} text-slate-400 leading-tight`}>{b.label}</span>
            ))}
          </div>

          {/* Grupos */}
          <div className={`flex ${tam.gap} px-1 pt-2`}>
            <span
              className={`text-center ${tam.grupoTxt} uppercase tracking-widest text-slate-600 pt-1`}
              style={{ flex: iDivisor, borderTop: '1px solid #1E3050' }}
            >
              Crédito COMAE
            </span>
            <span
              className={`text-center ${tam.grupoTxt} uppercase tracking-widest text-slate-600 pt-1`}
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

function IconeTelaCheia({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function GraficoCard({ row, onApresentar }: { row: GraficoOpRow; onApresentar: () => void }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: '#101C33', border: '1px solid #1E3050' }}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-0.5">Execução</p>
          <h2 className="text-base font-bold text-white leading-snug" title={row.operacao}>
            {apelidoOperacao(row.operacao)}
          </h2>
        </div>
        <div className="flex gap-2 flex-shrink-0 items-stretch">
          <Destaque label="Recebido" valor={brl(row.recebido)} cor={COR.recebido} />
          <Destaque label="Pago" valor={pct(row.pago, row.recebido)} cor={COR.pago} />
          <button
            type="button"
            onClick={onApresentar}
            title="Modo apresentação (tela cheia)"
            className="flex items-center gap-1.5 text-xs px-3 rounded-lg border cursor-pointer transition-colors hover:brightness-125"
            style={{ background: '#0C1526', borderColor: '#2A3D5C', color: '#8FB8E8' }}
          >
            <IconeTelaCheia /> Apresentar
          </button>
        </div>
      </div>

      <GraficoBarras row={row} />

      {/* Valores completos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mt-5 pt-4" style={{ borderTop: '1px solid #1E3050' }}>
        {itensLegenda(row).map(it => (
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

function Destaque({ label, valor, cor, grande = false }: { label: string; valor: string; cor: string; grande?: boolean }) {
  return (
    <div
      className={`rounded-lg text-right ${grande ? 'px-4 py-2.5' : 'px-2.5 py-1.5'}`}
      style={{ background: '#0C1526', border: '1px solid #1E3050' }}
    >
      <p className={`${grande ? 'text-[11px]' : 'text-[9px]'} uppercase tracking-wider`} style={{ color: cor }}>{label}</p>
      <p className={`${grande ? 'text-2xl' : 'text-xs'} font-semibold text-white tabular-nums whitespace-nowrap`}>{valor}</p>
    </div>
  );
}

// ── Modo apresentação ─────────────────────────────────────────────────────────

function formatarSync(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function BotaoControle({ children, onClick, disabled, title }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="min-w-8 h-8 px-2.5 rounded-lg border text-sm text-slate-300 cursor-pointer disabled:opacity-30 disabled:cursor-default hover:brightness-125"
      style={{ background: '#101C33', borderColor: '#2A3D5C' }}
    >
      {children}
    </button>
  );
}

function Apresentacao({ rows, inicio, ultimaSync, onFechar }: {
  rows: GraficoOpRow[]; inicio: number; ultimaSync: string | null; onFechar: () => void;
}) {
  const [i, setI] = useState(inicio);
  const [plotH, setPlotH] = useState(320);
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;

  // Altura do gráfico acompanha a tela (projetor, notebook, TV)
  useEffect(() => {
    const calc = () => setPlotH(Math.max(200, Math.min(620, window.innerHeight - 500)));
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  // Teclado (← → PageUp PageDown espaço Esc), saída da tela cheia e trava do scroll da página
  useEffect(() => {
    const total = rows.length;
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); setI(x => Math.min(total - 1, x + 1)); }
      else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); setI(x => Math.max(0, x - 1)); }
      else if (e.key === 'Escape') fecharRef.current();
    };
    const onFullscreen = () => { if (!document.fullscreenElement) fecharRef.current(); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFullscreen);
    const overflowAntes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.body.style.overflow = overflowAntes;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [rows.length]);

  const row = rows[i];
  if (!row) return null;
  const sync = formatarSync(ultimaSync);
  const saiuComae = row.descentralizado + row.empenhadoComae;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col px-10 py-8 overflow-y-auto" style={{ background: '#0C1526' }}>
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-6 mb-6">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500 mb-2">COMAE Gerencial · Execução orçamentária</p>
          <h1 className="text-4xl font-bold text-white leading-tight">{apelidoOperacao(row.operacao)}</h1>
        </div>
        <div className="flex gap-3 flex-shrink-0">
          <Destaque grande label="Recebido" valor={brl(row.recebido)} cor={COR.recebido} />
          <Destaque grande label="Descentralizado" valor={pct(saiuComae, row.recebido)} cor={COR.descentralizado} />
          <Destaque grande label="Pago" valor={pct(row.pago, row.recebido)} cor={COR.pago} />
        </div>
      </div>

      {/* Gráfico */}
      <div className="flex-1 flex flex-col justify-center rounded-2xl px-6 pt-6 pb-4" style={{ background: '#101C33', border: '1px solid #1E3050' }}>
        <GraficoBarras row={row} tam={tamApresentacao(plotH)} />
      </div>

      {/* Valores completos */}
      <div className="grid grid-cols-4 gap-x-6 gap-y-3 mt-6">
        {itensLegenda(row).map(it => (
          <div key={it.label} className="flex items-start gap-2.5 min-w-0">
            <span className="w-3 h-3 rounded-sm mt-1.5 flex-shrink-0" style={{ background: it.cor }} />
            <div className="min-w-0">
              <p className="text-xs text-slate-500 leading-tight">{it.label}</p>
              <p className="text-lg text-slate-100 font-semibold tabular-nums leading-tight whitespace-nowrap">
                {brl(it.valor)} <span className="text-sm text-slate-500 font-normal">{pct(it.valor, row.recebido)}</span>
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Rodapé + controles */}
      <div className="flex items-center justify-between gap-4 mt-6 pt-4" style={{ borderTop: '1px solid #1E3050' }}>
        <p className="text-xs text-slate-500">
          {sync && <>Dados sincronizados em {sync} · </>}Percentuais sobre o recebido pelo COMAE
        </p>
        <div className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
          {rows.length > 1 && (
            <>
              <BotaoControle onClick={() => setI(x => Math.max(0, x - 1))} disabled={i === 0} title="Anterior (←)">‹</BotaoControle>
              <span className="text-xs text-slate-400 tabular-nums px-1">{i + 1} / {rows.length}</span>
              <BotaoControle onClick={() => setI(x => Math.min(rows.length - 1, x + 1))} disabled={i === rows.length - 1} title="Próxima (→)">›</BotaoControle>
            </>
          )}
          <BotaoControle onClick={() => fecharRef.current()} title="Sair (Esc)">Sair · Esc</BotaoControle>
        </div>
      </div>
    </div>
  );
}

// ── View ──────────────────────────────────────────────────────────────────────

type Props = {
  graficos: GraficoOpRow[];
  filtrosAtivos: FiltrosAtivos;
  opcoes: OpcoesFiltro;
  ultimaSync: string | null;
};

export function GraficosView({ graficos, filtrosAtivos, opcoes, ultimaSync }: Props) {
  const [apresentando, setApresentando] = useState<number | null>(null);

  function apresentar(indice: number) {
    // Chamado direto no clique (gesto do usuário), senão o navegador bloqueia a tela cheia
    document.documentElement.requestFullscreen?.().catch(() => {});
    setApresentando(indice);
  }

  return (
    <div>
      <div className="px-5 py-4 border-b flex items-center justify-between gap-4 flex-wrap" style={{ background: '#080F1F', borderColor: '#1E3050' }}>
        <div>
          <h2 className="text-sm font-bold text-white mb-0.5">Gráficos</h2>
          <p className="text-[10px] text-slate-500">
            Crédito e execução por operação · percentuais sobre o recebido pelo COMAE
          </p>
        </div>
        {graficos.length > 0 && (
          <button
            type="button"
            onClick={() => apresentar(0)}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border cursor-pointer transition-colors hover:brightness-125"
            style={{ background: '#101C33', borderColor: '#2A3D5C', color: '#8FB8E8' }}
          >
            <IconeTelaCheia /> {graficos.length > 1 ? `Apresentar todas (${graficos.length})` : 'Apresentar'}
          </button>
        )}
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
            {graficos.map((row, i) => (
              <GraficoCard key={row.operacao} row={row} onApresentar={() => apresentar(i)} />
            ))}
          </div>
        )}
      </div>

      {apresentando !== null && (
        <Apresentacao
          rows={graficos}
          inicio={apresentando}
          ultimaSync={ultimaSync}
          onFechar={() => setApresentando(null)}
        />
      )}
    </div>
  );
}
