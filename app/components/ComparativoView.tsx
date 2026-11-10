import { Fragment, useMemo, useState } from 'react';
import { apelidoOperacao } from '~/lib/apelidoOperacao';
import { totalValores, type ComparativoDados, type LinhaComparativo, type Valores } from '~/lib/creditoComae';

// ── Formatação ────────────────────────────────────────────────────────────────

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function compacto(v: number): string {
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  if (a >= 1e6) return `${s}${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  if (a >= 1e3) return `${s}${(a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `${s}${a.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

function variacao(antes: number, depois: number): { txt: string; cor: string } {
  if (Math.abs(antes) < 0.01 && Math.abs(depois) < 0.01) return { txt: '—', cor: '#6A7A8C' };
  if (Math.abs(antes) < 0.01) return { txt: 'novo', cor: '#5FA8E0' };
  const p = ((depois - antes) / Math.abs(antes)) * 100;
  return {
    txt: `${p > 0 ? '+' : ''}${p.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`,
    cor: p > 0 ? '#3FB07A' : p < 0 ? '#E06A6A' : '#8A97AC',
  };
}

function dataBr(iso: string | null): string {
  return iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—';
}

// ── Visões ────────────────────────────────────────────────────────────────────

type Visao = 'nd' | 'recebedor';

const VISOES: Record<Visao, { rotulo: string; col: [string, string]; cor: [string, string]; f: (v: Valores) => [number, number] }> = {
  nd: {
    rotulo: 'Por natureza',
    col: ['339030 · Combustível/material', '339039 · Manutenção'],
    cor: ['#F0A04B', '#8B9CF6'],
    f: v => [v.celog30 + v.dirmab30, v.celog39 + v.dirmab39],
  },
  recebedor: {
    rotulo: 'Por recebedor',
    col: ['CELOG (UGR 120071)', 'DIRMAB (UGR 120038)'],
    cor: ['#25A3A3', '#C77DD6'],
    f: v => [v.celog30 + v.celog39, v.dirmab30 + v.dirmab39],
  },
};

const COR_ANT = '#6B7A90';
const COR_ATUAL = '#5FA8E0';

function somar(linhas: LinhaComparativo[], ano: number): Valores {
  const t: Valores = { celog30: 0, celog39: 0, dirmab30: 0, dirmab39: 0 };
  for (const l of linhas) {
    const v = l.porAno[ano];
    if (!v) continue;
    t.celog30 += v.celog30; t.celog39 += v.celog39; t.dirmab30 += v.dirmab30; t.dirmab39 += v.dirmab39;
  }
  return t;
}

// ── Cards ─────────────────────────────────────────────────────────────────────

function Card({ titulo, antes, depois, anoAnt, anoAtual, destaque = false }: {
  titulo: string; antes: number; depois: number; anoAnt: number; anoAtual: number; destaque?: boolean;
}) {
  const v = variacao(antes, depois);
  return (
    <div className="rounded-xl p-4" style={{ background: destaque ? '#122440' : '#101C33', border: `1px solid ${destaque ? '#24406A' : '#1E3050'}` }}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">{titulo}</p>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="space-y-0.5 tabular-nums">
          <p className="text-[11px]" style={{ color: COR_ANT }}>{anoAnt} <span className="text-slate-300 font-semibold">{brl(antes)}</span></p>
          <p className="text-[11px]" style={{ color: COR_ATUAL }}>{anoAtual} <span className="text-white font-bold text-sm">{brl(depois)}</span></p>
        </div>
        <span className="text-sm font-bold tabular-nums" style={{ color: v.cor }}>{v.txt}</span>
      </div>
    </div>
  );
}

// ── Gráfico (barras horizontais, um par por operação) ────────────────────────

function Grafico({ linhas, anoAnt, anoAtual }: { linhas: LinhaComparativo[]; anoAnt: number; anoAtual: number }) {
  const max = Math.max(1, ...linhas.flatMap(l => [totalValores(l.porAno[anoAnt]), totalValores(l.porAno[anoAtual])]));
  const largura = (v: number) => `${Math.max(0, (v / max) * 100)}%`;
  return (
    <div className="space-y-3">
      {linhas.map(l => {
        const a = totalValores(l.porAno[anoAnt]), b = totalValores(l.porAno[anoAtual]);
        return (
          <div key={l.chave} className="grid gap-3 items-center" style={{ gridTemplateColumns: 'minmax(120px, 220px) 1fr' }}>
            <span className="text-[11px] text-slate-300 leading-tight truncate" title={`${l.operacao} · PI ${l.pi}`}>
              {apelidoOperacao(l.operacao)}
            </span>
            <div className="space-y-1">
              {([[anoAnt, a, COR_ANT], [anoAtual, b, COR_ATUAL]] as const).map(([ano, v, cor]) => (
                <div key={ano} className="flex items-center gap-2" title={`${ano}: ${brl(v)}`}>
                  <div className="flex-1 h-3 rounded-sm" style={{ background: '#0C1526' }}>
                    <div className="h-3 rounded-sm" style={{ width: largura(v), background: cor, minWidth: v > 0 ? 2 : 0 }} />
                  </div>
                  <span className="w-20 text-right text-[10px] tabular-nums" style={{ color: cor }}>{compacto(v)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tabela ────────────────────────────────────────────────────────────────────

function Celulas({ v, visao }: { v: Valores | undefined; visao: Visao }) {
  const [c1, c2] = v ? VISOES[visao].f(v) : [0, 0];
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums text-slate-300">{brl(c1)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-300">{brl(c2)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-white font-semibold" style={{ borderRight: '1px solid #1E3050' }}>{brl(c1 + c2)}</td>
    </>
  );
}

function DetalheNcs({ linha, anoAnt, anoAtual, colSpan }: { linha: LinhaComparativo; anoAnt: number; anoAtual: number; colSpan: number }) {
  const ncs = linha.ncs.filter(n => n.ano === anoAnt || n.ano === anoAtual);
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 pb-3 pt-1" style={{ background: '#0C1526' }}>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
          {ncs.length} NC{ncs.length === 1 ? '' : 's'} · PI {linha.pi}
        </p>
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-[11px]">
            <tbody>
              {ncs.map((n, i) => (
                <tr key={n.nc + n.nd + n.recebedor + i} className="align-top" style={{ borderTop: '1px solid #16243A' }}>
                  <td className="py-1 pr-3 tabular-nums" style={{ color: n.ano === anoAtual ? COR_ATUAL : COR_ANT }}>{dataBr(n.data)}</td>
                  <td className="py-1 pr-3 font-mono text-slate-400">{n.nc}</td>
                  <td className="py-1 pr-3 font-mono text-slate-400">{n.nd}</td>
                  <td className="py-1 pr-3 text-slate-400">{n.recebedor}</td>
                  <td className="py-1 pr-3 text-slate-500 whitespace-nowrap" title="Órgão do pedido citado na NC">{n.pedido}</td>
                  <td className="py-1 pr-3 text-right tabular-nums whitespace-nowrap" style={{ color: n.valor < 0 ? '#E06A6A' : '#CBD5E1' }}>{brl(n.valor)}</td>
                  <td className="py-1 text-slate-500 truncate max-w-[520px]" title={n.descricao}>{n.descricao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

// ── View ──────────────────────────────────────────────────────────────────────

export function ComparativoView({ dados }: { dados: ComparativoDados | null }) {
  const [visao, setVisao] = useState<Visao>('nd');
  const [aberta, setAberta] = useState<string | null>(null);

  const anoAtual = dados?.anos.at(-1) ?? new Date().getFullYear();
  const anoAnt = anoAtual - 1;
  const linhas = useMemo(
    () => (dados?.linhas ?? []).filter(l => totalValores(l.porAno[anoAnt]) !== 0 || totalValores(l.porAno[anoAtual]) !== 0),
    [dados, anoAnt, anoAtual],
  );
  const tAnt = somar(linhas, anoAnt), tAtual = somar(linhas, anoAtual);
  const cfg = VISOES[visao];
  const [a1, a2] = cfg.f(tAnt), [b1, b2] = cfg.f(tAtual);

  if (!dados || dados.anos.length === 0) {
    return (
      <div className="p-8">
        <h2 className="text-sm font-bold text-white mb-2">Comparativo</h2>
        <p className="text-sm text-slate-400 max-w-xl">
          Ainda não há dados da aba CREDITO_COMAE no app. Eles chegam pelo envio <code className="text-slate-300">pushCreditoComae()</code> do
          Apps Script da planilha.
        </p>
      </div>
    );
  }

  const COLS = 9;
  return (
    <div>
      <div className="px-5 py-4 border-b flex items-center justify-between gap-4 flex-wrap" style={{ background: '#080F1F', borderColor: '#1E3050' }}>
        <div>
          <h2 className="text-sm font-bold text-white mb-0.5">Comparativo {anoAnt} × {anoAtual}</h2>
          <p className="text-[10px] text-slate-500">
            Crédito das operações repassado ao CELOG para combustível (339030) e manutenção de aeronaves (339039)
          </p>
        </div>
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #1E3050' }}>
          {(Object.keys(VISOES) as Visao[]).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setVisao(v)}
              className="px-4 py-2 text-xs font-medium transition-colors cursor-pointer"
              style={{ background: visao === v ? '#1E3050' : 'transparent', color: visao === v ? '#EAF1FB' : '#8A97AC' }}
            >
              {VISOES[v].rotulo}
            </button>
          ))}
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-5 py-4 border-b" style={{ borderColor: '#1E3050', background: '#080F1F' }}>
        <Card destaque titulo="Total — todas as operações" antes={a1 + a2} depois={b1 + b2} anoAnt={anoAnt} anoAtual={anoAtual} />
        <Card titulo={cfg.col[0]} antes={a1} depois={b1} anoAnt={anoAnt} anoAtual={anoAtual} />
        <Card titulo={cfg.col[1]} antes={a2} depois={b2} anoAnt={anoAnt} anoAtual={anoAtual} />
      </div>

      <div className="p-5 space-y-5">
        {/* Gráfico */}
        <section className="rounded-2xl p-5" style={{ background: '#101C33', border: '1px solid #1E3050' }}>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Total por operação</h3>
            <div className="flex gap-4 text-[11px] text-slate-300">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COR_ANT }} />{anoAnt}</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COR_ATUAL }} />{anoAtual}</span>
            </div>
          </div>
          <Grafico linhas={linhas} anoAnt={anoAnt} anoAtual={anoAtual} />
        </section>

        {/* Tabela */}
        <section className="rounded-2xl overflow-hidden" style={{ background: '#101C33', border: '1px solid #1E3050' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 1100 }}>
              <thead>
                <tr style={{ background: '#080F1F' }}>
                  <th rowSpan={2} className="px-3 py-2 text-left text-[10px] text-slate-500 font-medium" style={{ borderRight: '1px solid #1E3050' }}>Operação</th>
                  <th colSpan={3} className="px-3 pt-2 text-center text-[11px] font-semibold" style={{ color: COR_ANT, borderRight: '1px solid #1E3050' }}>{anoAnt}</th>
                  <th colSpan={3} className="px-3 pt-2 text-center text-[11px] font-semibold" style={{ color: COR_ATUAL, borderRight: '1px solid #1E3050' }}>{anoAtual}</th>
                  <th colSpan={2} className="px-3 pt-2 text-center text-[11px] font-semibold text-slate-400">Variação</th>
                </tr>
                <tr style={{ background: '#080F1F', borderBottom: '1px solid #1E3050' }}>
                  {[0, 1].map(i => (
                    <Fragment key={i}>
                      <th className="px-3 pb-2 text-right text-[10px] font-medium" style={{ color: cfg.cor[0] }}>{cfg.col[0]}</th>
                      <th className="px-3 pb-2 text-right text-[10px] font-medium" style={{ color: cfg.cor[1] }}>{cfg.col[1]}</th>
                      <th className="px-3 pb-2 text-right text-[10px] text-slate-400 font-medium" style={{ borderRight: '1px solid #1E3050' }}>Total</th>
                    </Fragment>
                  ))}
                  <th className="px-3 pb-2 text-right text-[10px] text-slate-500 font-medium">R$</th>
                  <th className="px-3 pb-2 text-right text-[10px] text-slate-500 font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: '#122440', borderBottom: '1px solid #24406A' }}>
                  <td className="px-3 py-2.5 font-bold text-white" style={{ borderRight: '1px solid #1E3050' }}>TOTAL — todas as operações</td>
                  <Celulas v={tAnt} visao={visao} />
                  <Celulas v={tAtual} visao={visao} />
                  <LinhaVariacao antes={a1 + a2} depois={b1 + b2} />
                </tr>
                {linhas.map(l => {
                  const ant = totalValores(l.porAno[anoAnt]), atual = totalValores(l.porAno[anoAtual]);
                  const aberto = aberta === l.chave;
                  return (
                    <Fragment key={l.chave}>
                      <tr
                        onClick={() => setAberta(aberto ? null : l.chave)}
                        className="cursor-pointer hover:brightness-125"
                        style={{ borderTop: '1px solid #16243A', background: aberto ? '#0F1E36' : undefined }}
                        title="Ver as NCs"
                      >
                        <td className="px-3 py-2 text-slate-200" style={{ borderRight: '1px solid #1E3050' }}>
                          <span className="text-slate-500 mr-1.5">{aberto ? '▾' : '▸'}</span>
                          {apelidoOperacao(l.operacao)}
                          <span className="ml-2 text-[10px] font-mono text-slate-600">{l.pi}</span>
                        </td>
                        <Celulas v={l.porAno[anoAnt]} visao={visao} />
                        <Celulas v={l.porAno[anoAtual]} visao={visao} />
                        <LinhaVariacao antes={ant} depois={atual} />
                      </tr>
                      {aberto && <DetalheNcs linha={l} anoAnt={anoAnt} anoAtual={anoAtual} colSpan={COLS} />}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <OrigemPedidos linhas={linhas} anoAnt={anoAnt} anoAtual={anoAtual} />

        {/* Nota metodológica */}
        <section className="rounded-lg px-4 py-3 text-[11px] leading-relaxed space-y-1" style={{ background: '#0F1E36', border: '1px solid #24406A', color: '#A9C4E8' }}>
          <p className="font-semibold text-white">Como os valores são calculados</p>
          <p>
            Soma o crédito de cada operação que a DIRAD repassou ao CELOG (UG 120071) em 339030 e 339039: com UGR do próprio CELOG
            (combustível) ou da DIRMAB (manutenção). É a etapa que aparece nos dois anos — em {anoAtual} o COMAE descentraliza para a
            DIRMAB/CELOG por NC; em {anoAnt} a passagem para a UGR da DIRMAB/CELOG não gerava NC no relatório.
          </p>
          <p>
            Anulações e devoluções do CELOG para a DIRAD entram negativas. Remanejamentos do CELOG para o fechamento de câmbio não são
            descontados: o crédito continua indo para manutenção, paga pelas comissões no exterior. Operações têm PI diferente a cada
            ano (ex.: Ágata Amazônia 2025 × Ágata Amazônia Ocidental 2026) e por isso aparecem em linhas separadas.
          </p>
          <p className="opacity-80">Fonte: aba CREDITO_COMAE (Tesouro Gerencial). Clique numa operação para ver as NCs.</p>
        </section>
      </div>
    </div>
  );
}

/** Quem pediu o crédito que chegou ao CELOG (órgão citado em "PEDIDO NR …/ÓRGÃO/AAAA"). */
function OrigemPedidos({ linhas, anoAnt, anoAtual }: { linhas: LinhaComparativo[]; anoAnt: number; anoAtual: number }) {
  const mapa = new Map<string, { ant: number; atual: number }>();
  for (const l of linhas) for (const n of l.ncs) {
    if (n.ano !== anoAnt && n.ano !== anoAtual) continue;
    const v = mapa.get(n.pedido) ?? { ant: 0, atual: 0 };
    if (n.ano === anoAnt) v.ant += n.valor; else v.atual += n.valor;
    mapa.set(n.pedido, v);
  }
  const itens = [...mapa.entries()]
    .filter(([, v]) => Math.abs(v.ant) >= 0.01 || Math.abs(v.atual) >= 0.01)
    .sort((a, b) => Math.max(b[1].ant, b[1].atual) - Math.max(a[1].ant, a[1].atual));

  return (
    <section className="rounded-2xl p-5" style={{ background: '#101C33', border: '1px solid #1E3050' }}>
      <h3 className="text-xs font-semibold text-white uppercase tracking-wider mb-1">Origem dos pedidos</h3>
      <p className="text-[10px] text-slate-500 mb-3">
        Órgão que pediu o crédito, conforme o "PEDIDO NR …" citado em cada NC. Valores negativos são devoluções pedidas pelo próprio CELOG/DIRMAB.
      </p>
      <table className="w-full max-w-2xl text-xs">
        <thead>
          <tr className="text-[10px] text-slate-500">
            <th className="text-left font-medium pb-1.5">Pedido</th>
            <th className="text-right font-medium pb-1.5" style={{ color: COR_ANT }}>{anoAnt}</th>
            <th className="text-right font-medium pb-1.5" style={{ color: COR_ATUAL }}>{anoAtual}</th>
            <th className="text-right font-medium pb-1.5">Variação</th>
          </tr>
        </thead>
        <tbody>
          {itens.map(([org, v]) => {
            const vr = variacao(v.ant, v.atual);
            return (
              <tr key={org} style={{ borderTop: '1px solid #16243A' }}>
                <td className="py-1.5 text-slate-300">{org}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-400">{brl(v.ant)}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-200">{brl(v.atual)}</td>
                <td className="py-1.5 text-right tabular-nums font-semibold" style={{ color: vr.cor }}>{vr.txt}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function LinhaVariacao({ antes, depois }: { antes: number; depois: number }) {
  const v = variacao(antes, depois);
  const dif = depois - antes;
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums" style={{ color: dif > 0 ? '#3FB07A' : dif < 0 ? '#E06A6A' : '#8A97AC' }}>
        {Math.abs(dif) < 0.01 ? '—' : `${dif > 0 ? '+' : '−'}${brl(Math.abs(dif))}`}
      </td>
      <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: v.cor }}>{v.txt}</td>
    </>
  );
}
