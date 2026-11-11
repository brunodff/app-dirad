// Painel COMAE — o Power BI "COMAE V2" refeito no sistema (páginas COMAE e Unidades).
// As regras e medidas ficam em lib/painelComae.ts; aqui só se guarda o estado da tela e se desenha.
// Os dados vêm do loader (aba power-bi) e são relidos a cada 5 minutos; os pedidos vêm à parte.

import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type FocusEvent, type MouseEvent, type ReactNode,
} from 'react';
import { Link, useFetcher, useRevalidator } from 'react-router';
import {
  corDaNd, fmtData, fmtDataCurta, fmtMoeda, fmtPct, opcoesComae, opcoesUnidades, paginaComae, paginaUnidades,
  type DadosComae, type Detalhe, type MovPedido, type Visao,
} from '~/lib/painelComae';
import './painelComae.css';

const RELER_A_CADA_MS = 5 * 60_000;

// ── Tooltip que acompanha a linha ────────────────────────────────────────────
// Abre no mouse, no foco do teclado e no toque. Um clique o FIXA: ele fica aberto ao tirar o mouse,
// aceita rolagem e seleção, e fecha no ✕, no Esc, num clique fora ou num novo clique no mesmo item.

type Dica = { el: HTMLElement; conteudo: ReactNode; fixa: boolean };

function useDica() {
  const [dica, setDica] = useState<Dica | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const fixaRef = useRef(false);
  fixaRef.current = !!dica?.fixa;

  const posicionar = useCallback((): boolean => {
    const caixa = ref.current;
    if (!caixa || !dica) return true;
    const r = dica.el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight, m = 10;
    if (r.bottom < 0 || r.top > vh || !dica.el.isConnected) return false;
    const { width: w, height: h } = caixa.getBoundingClientRect();
    // à esquerda da linha (listas ficam à direita da tela); sem espaço, à direita; sem espaço, embaixo
    let left = r.left - w - m;
    let top = r.top + r.height / 2 - h / 2;
    if (left < m) left = r.right + m;
    if (left + w > vw - m) {
      left = Math.min(Math.max(m, r.left), vw - w - m);
      top = r.bottom + 6;
      if (top + h > vh - m) top = r.top - h - 6;
    }
    caixa.style.left = `${Math.max(m, left)}px`;
    caixa.style.top = `${Math.min(Math.max(m, top), Math.max(m, vh - h - m))}px`;
    caixa.style.visibility = 'visible';
    return true;
  }, [dica]);

  useLayoutEffect(() => { posicionar(); }, [posicionar]);

  useEffect(() => {
    if (!dica) return;
    let quadro = 0;
    const acompanhar = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => { if (!posicionar()) setDica(null); });
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setDica(null); };
    // Fixo: fecha com clique fora da caixa e fora do item que o abriu
    const cliqueFora = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (dica.fixa && !ref.current?.contains(alvo) && !dica.el.contains(alvo)) setDica(null);
    };
    window.addEventListener('scroll', acompanhar, true);
    window.addEventListener('resize', acompanhar);
    window.addEventListener('keydown', tecla);
    document.addEventListener('pointerdown', cliqueFora);
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener('scroll', acompanhar, true);
      window.removeEventListener('resize', acompanhar);
      window.removeEventListener('keydown', tecla);
      document.removeEventListener('pointerdown', cliqueFora);
    };
  }, [dica, posicionar]);

  /** Props para o elemento que abre o tooltip. */
  const gatilho = (id: string, conteudo: () => ReactNode) => ({
    tabIndex: 0,
    'data-ativo': dica?.el.dataset.dica === id ? '1' : undefined,
    'data-dica': id,
    // Com um tooltip fixo aberto, passar o mouse em outros itens não o substitui
    onMouseEnter: (e: MouseEvent<HTMLElement>) => { if (!fixaRef.current) setDica({ el: e.currentTarget, conteudo: conteudo(), fixa: false }); },
    onMouseLeave: () => { if (!fixaRef.current) setDica(null); },
    onFocus: (e: FocusEvent<HTMLElement>) => { if (!fixaRef.current) setDica({ el: e.currentTarget, conteudo: conteudo(), fixa: false }); },
    onBlur: (e: FocusEvent<HTMLElement>) => {
      // o foco indo para dentro da caixa fixa (ex.: o ✕) não fecha
      if (!fixaRef.current && !ref.current?.contains(e.relatedTarget as Node | null)) setDica(null);
    },
    onClick: (e: MouseEvent<HTMLElement>) => {
      const el = e.currentTarget;
      setDica((atual) => (atual?.fixa && atual.el === el ? null : { el, conteudo: conteudo(), fixa: true }));
    },
  });

  const caixa = dica ? (
    <div ref={ref} className="pc-dica" role={dica.fixa ? 'dialog' : 'tooltip'} data-fixa={dica.fixa ? '1' : undefined}
      style={{ visibility: 'hidden', left: 0, top: 0 }}>
      {dica.fixa && (
        <button type="button" className="pc-dica-fechar" aria-label="Fechar" title="Fechar (Esc)" onClick={() => setDica(null)}>✕</button>
      )}
      {dica.conteudo}
      {!dica.fixa && <div className="pc-dica-dica">Clique para fixar</div>}
    </div>
  ) : null;

  return { gatilho, caixa };
}

// ── Peças ─────────────────────────────────────────────────────────────────────

const Nd = ({ nd }: { nd: string }) => (
  <mark className="pc-nd" style={{ background: corDaNd(nd) }}>{nd}</mark>
);

function IconeAlternar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2" /><path d="M21 4v5h-5M3 20v-5h5" />
    </svg>
  );
}

function Selecao({ rotulo, valor, opcoes, aoMudar }: {
  rotulo: string; valor: string | null; opcoes: string[]; aoMudar: (v: string | null) => void;
}) {
  return (
    <label className="pc-sel">
      <span>{rotulo}</span>
      <select value={valor ?? ''} onChange={(e) => aoMudar(e.target.value || null)}>
        <option value="">Todos</option>
        {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function TabelaDetalhe({ titulo, sub, detalhe, vazio }: { titulo: string; sub: string; detalhe: Detalhe; vazio: string }) {
  return (
    <div className="pc-tp">
      <div className="pc-tp-tit">{titulo}</div>
      <div className="pc-tp-sub">{sub}</div>
      <table>
        <thead><tr><th>UG Executora</th><th>UG Responsável</th><th>ND</th><th className="pc-num">Disponível</th></tr></thead>
        <tbody>
          {detalhe.linhas.length === 0 ? (
            <tr><td colSpan={4}>{vazio}</td></tr>
          ) : detalhe.linhas.map((l, i) => (
            <tr key={i}><td className="pc-forte">{l.ugExec || '—'}</td><td>{l.ugResp || '—'}</td><td><Nd nd={l.nd} /></td><td className="pc-num pc-forte">{fmtMoeda(l.valor)}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={3}>Total Disponível</td><td className="pc-num pc-azul">{fmtMoeda(detalhe.total)}</td></tr></tfoot>
      </table>
    </div>
  );
}

function ItemRank({ rank, nome, sub, valor, gatilho }: {
  rank: number; nome: string; sub: string; valor: number; gatilho: object;
}) {
  return (
    <li>
      <div className="pc-rk" {...gatilho} aria-label={`${rank}º ${nome}: ${fmtMoeda(valor)}`}>
        <span className="pc-rk-n">{rank}</span>
        <span className="pc-rk-txt"><b title={nome}>{nome}</b><small>{sub}</small></span>
        <span className="pc-rk-v">{fmtMoeda(valor)}</span>
      </div>
    </li>
  );
}

// ── Desativar operação (a mesma ação da aba Operações: config_operacoes + auditoria) ─────────

/** Operação a desativar: nome gravado em config_operacoes e rótulo exibido. */
type AlvoDesativar = { operacao: string; rotulo: string };
type PedirDesativar = ((alvo: AlvoDesativar) => void) | null;

function DesativarOperacao({ alvo, aoFechar }: { alvo: AlvoDesativar; aoFechar: () => void }) {
  const fetcher = useFetcher<{ ok?: boolean; erro?: string }>();
  const [motivo, setMotivo] = useState('');
  const enviando = fetcher.state !== 'idle';
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { campo.current?.focus(); }, []);
  useEffect(() => { if (fetcher.state === 'idle' && fetcher.data?.ok) aoFechar(); }, [fetcher.state, fetcher.data, aoFechar]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !enviando) aoFechar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [enviando, aoFechar]);

  return (
    <div className="pc-modal" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !enviando) aoFechar(); }}>
      <fetcher.Form method="post" action="/painel" className="pc-modal-caixa" role="dialog" aria-modal="true" aria-labelledby="pc-desat-tit">
        <input type="hidden" name="intent" value="desativar" />
        <input type="hidden" name="operacao" value={alvo.operacao} />
        <h3 id="pc-desat-tit">Desativar operação</h3>
        <p className="pc-modal-op">{alvo.rotulo}{alvo.rotulo !== alvo.operacao && <small className="pc-mono">{alvo.operacao}</small>}</p>
        <p className="pc-modal-txt">
          A operação sai deste painel e das demais abas do sistema. Os números das outras operações não mudam.
          Para trazê-la de volta, use a aba <b>Desativados</b>.
        </p>
        <label className="pc-modal-campo">
          <span>Motivo (obrigatório, mínimo 10 caracteres)</span>
          <textarea ref={campo} name="motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: operação encerrada; não é mais de responsabilidade do COMAE" />
        </label>
        {fetcher.data?.erro && <p className="pc-modal-erro" role="alert">{fetcher.data.erro}</p>}
        <div className="pc-modal-acoes">
          <button type="button" className="pc-btn" onClick={aoFechar} disabled={enviando}>Cancelar</button>
          <button type="submit" className="pc-btn pc-btn-perigo" disabled={enviando || motivo.trim().length < 10}>
            {enviando ? 'Desativando…' : 'Desativar'}
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}

/** Aviso no filtro: quantas operações estão fora do painel e onde reativar. */
function AvisoDesativadas({ dados, podeEditar }: { dados: DadosComae; podeEditar: boolean }) {
  const n = dados.desativadas.length;
  if (!n) return null;
  return (
    <span className="pc-desativadas" title={dados.desativadas.join(`\n`)}>
      {n} {n === 1 ? 'operação desativada' : 'operações desativadas'} fora do painel
      {podeEditar && <> · <Link to="/painel?aba=desativados">reativar</Link></>}
    </span>
  );
}

/** Botão ao lado do filtro de operação, quando há uma operação escolhida. */
function BotaoDesativarFiltro({ dados, operacao, pedir }: { dados: DadosComae; operacao: string | null; pedir: PedirDesativar }) {
  if (!pedir || !operacao) return null;
  const nome = dados.opsPorCurta[operacao] ?? operacao;
  return (
    <button type="button" className="pc-btn pc-btn-perigo pc-btn-filtro" onClick={() => pedir({ operacao: nome, rotulo: operacao })}>
      Desativar operação
    </button>
  );
}

// ── Página COMAE ──────────────────────────────────────────────────────────────

function PaginaComae({ dados, ano, pedidos, carregarPedidos, pedidosErro, podeEditar, pedir }: {
  dados: DadosComae; ano: string | null; pedidos: MovPedido[] | null; carregarPedidos: () => void; pedidosErro: string | null;
  podeEditar: boolean; pedir: PedirDesativar;
}) {
  const [operacao, setOperacao] = useState<string | null>(null);
  const [om, setOm] = useState<string | null>(null);
  const [visao, setVisao] = useState<Visao>(null);
  const [modo, setModo] = useState<'controle' | 'pedidos'>('controle');
  const { gatilho, caixa } = useDica();

  const p = useMemo(() => paginaComae({ ...dados, pedidos: pedidos ?? [] }, { ano, operacao, om, visao }),
    [dados, pedidos, ano, operacao, om, visao]);
  const opcoes = useMemo(() => opcoesComae(dados, { ano, operacao }), [dados, ano, operacao]);

  useEffect(() => { if (modo === 'pedidos' && !pedidos) carregarPedidos(); }, [modo, pedidos, carregarPedidos]);

  const corVisao = p.nds.visao === 'Recebido' ? '#1F9D6B' : '#3E86C9';
  const codigos = [...new Set(dados.comae.map((m) => m.nd))].filter((n) => n && n !== '339000').sort();

  return (
    <>
      <header className="pc-cx pc-titulo">
        <h2>Acompanhamento Orçamentário das Operações</h2>
        {p.cabecalho.om ? (
          <div className="pc-titulo-vals">
            <div title={`Saídas do COMAE para ${p.cabecalho.om.nome}, menos as devoluções dela ao COMAE`}>
              <span>Descentralizado pelo COMAE</span><b style={{ color: '#E0B341' }}>{fmtMoeda(p.cabecalho.om.descentralizado)}</b>
            </div>
            <div title="Crédito que a unidade recebeu direto do EMAER, sem passar pelo COMAE">
              <span>Recebido direto (sem COMAE)</span><b style={{ color: '#25A3A3' }}>{fmtMoeda(p.cabecalho.om.recebidoDireto)}</b>
            </div>
            <div><span>Total recebido pela OM</span><b style={{ color: '#3FB07A' }}>{fmtMoeda(p.cabecalho.om.descentralizado + p.cabecalho.om.recebidoDireto)}</b></div>
          </div>
        ) : (
          <div className="pc-titulo-vals">
            <div><span>Crédito recebido</span><b style={{ color: '#3FB07A' }}>{fmtMoeda(p.cabecalho.recebido)}</b></div>
            <div><span>Descentralizado</span><b style={{ color: '#E0B341' }}>{fmtMoeda(p.cabecalho.descentralizado)}</b></div>
          </div>
        )}
      </header>

      <section className="pc-cx" aria-label="Naturezas de despesa">
        <div className="pc-cx-cab"><h3>Naturezas de Despesa</h3><span className="pc-mono">{codigos.join(' · ')}</span></div>
        <div className="pc-faixa">
          <div className="pc-tag" title={p.nds.om ? `Descentralizado pelo COMAE para ${p.nds.om}` : undefined}>
            <strong style={{ background: corVisao }}>{p.nds.om ? 'Descentralizado p/ a OM' : p.nds.visao}</strong>
            <em>{fmtMoeda(p.nds.total)}</em>
          </div>
          {p.nds.cards.length === 0 ? (
            <div className="pc-vazio">
              {p.nds.om ? `O COMAE não descentralizou crédito para ${p.nds.om} na seleção atual` : 'Sem movimentações para a seleção atual'}
            </div>
          ) : (
            <div className="pc-cards">
              {p.nds.cards.map((c) => (
                <div className="pc-card" key={c.nd} title={`${c.nd} — ${c.ndNome}`}>
                  <Nd nd={c.nd} />
                  <div><b>{fmtMoeda(c.valor)}</b><i style={{ color: corDaNd(c.nd) }}>{fmtPct(c.pct)} · do total</i></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="pc-cx pc-filtros" aria-label="Filtros">
        <span className="pc-filtros-rot">Filtros</span>
        <Selecao rotulo="Selecione a Operação" valor={operacao} opcoes={opcoes.operacoes} aoMudar={(v) => { setOperacao(v); setOm(null); }} />
        <Selecao rotulo="Selecione a OM" valor={om} opcoes={opcoes.oms} aoMudar={setOm} />
        <BotaoDesativarFiltro dados={dados} operacao={operacao} pedir={pedir} />
        <div className="pc-visao" role="group" aria-label="Visão do crédito">
          {(['Recebido', 'Descentralizado'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={p.nds.om ? v === 'Descentralizado' : visao === v}
              disabled={!!p.nds.om}
              title={p.nds.om ? 'Com uma unidade no filtro de OM, as NDs mostram o que o COMAE descentralizou para ela' : undefined}
              onClick={() => setVisao(visao === v ? null : v)}>{v}</button>
          ))}
        </div>
      </section>

      <div className="pc-baixo">
        <section className="pc-cx pc-painel" aria-label={modo === 'controle' ? 'Controle geral das operações' : 'Pedidos'}>
          <div className="pc-cx-cab">
            <h3>{modo === 'controle' ? 'Controle Geral das Operações' : 'Pedidos'}</h3>
            <AvisoDesativadas dados={dados} podeEditar={podeEditar} />
            <button type="button" className="pc-alternar" onClick={() => setModo(modo === 'controle' ? 'pedidos' : 'controle')}
              title={modo === 'controle' ? 'Ver a lista de pedidos' : 'Voltar ao controle geral'}>
              <IconeAlternar />
            </button>
          </div>
          {modo === 'controle' ? (
            <div className="pc-rolagem">
              <table className="pc-tab">
                <colgroup><col className="pc-c-op" /><col /><col /><col /><col /></colgroup>
                <thead><tr>
                  <th className="pc-esq">Operação</th><th>Recebido COMAE [A]</th><th>Descentralizado [B]</th>
                  <th>Empenhado COMAE [E]</th><th className="pc-sep">Disponível [A−B−E]</th>
                </tr></thead>
                <tbody>
                  {p.controle.linhas.map((l) => (
                    <tr key={l.opEf}>
                      <td className="pc-esq pc-op" title={l.rotulo}>
                        <span className="pc-op-cel">
                          <span className="pc-op-nome">{l.rotulo}</span>
                          {pedir && (
                            <button type="button" className="pc-desat" title={'Desativar ' + l.rotulo} aria-label={'Desativar ' + l.rotulo}
                              onClick={() => pedir({ operacao: l.opEf, rotulo: l.rotulo })}>⊘</button>
                          )}
                        </span>
                      </td>
                      <td style={{ color: '#3FB07A' }}>{fmtMoeda(l.a)}</td>
                      <td style={{ color: '#E0B341' }}>{fmtMoeda(l.b)}</td>
                      <td style={{ color: '#C77DD6' }}>{fmtMoeda(l.e)}</td>
                      <td className="pc-sep" style={{ color: l.d < 0 ? '#E06A6A' : '#5FA8E0' }}>{fmtMoeda(l.d)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr>
                  <td className="pc-esq">Total</td>
                  <td style={{ color: '#3FB07A' }}>{fmtMoeda(p.controle.total.a)}</td>
                  <td style={{ color: '#E0B341' }}>{fmtMoeda(p.controle.total.b)}</td>
                  <td style={{ color: '#C77DD6' }}>{fmtMoeda(p.controle.total.e)}</td>
                  <td className="pc-sep" style={{ color: '#5FA8E0' }}>{fmtMoeda(p.controle.total.d)}</td>
                </tr></tfoot>
              </table>
            </div>
          ) : !pedidos ? (
            <div className="pc-vazio">{pedidosErro ? `Não foi possível carregar os pedidos. ${pedidosErro}` : 'Carregando os pedidos…'}</div>
          ) : p.pedidos.qtd === 0 ? (
            <div className="pc-vazio">Nenhum pedido no filtro atual</div>
          ) : (
            <div className="pc-pd">
              <div className="pc-pd-cab">
                <b>{p.pedidos.qtd.toLocaleString('pt-BR')}</b> pedidos {p.pedidos.rotulo}
                <em data-neg={p.pedidos.total < 0 ? '1' : undefined}>{fmtMoeda(p.pedidos.total)}</em>
              </div>
              <div className="pc-rolagem">
                {p.pedidos.linhas.map((l) => (
                  <div className="pc-pd-lin" key={l.pedido} data-neg={l.valor < 0 ? '1' : undefined}>
                    <b className="pc-pd-num">{l.pedido}<span style={{ width: `${l.pct}%` }} /></b>
                    <i>{fmtDataCurta(l.data)}</i>
                    <mark>{l.nd || '—'}</mark>
                    <em>{l.valor < 0 ? '▼' : '▲'} {fmtMoeda(Math.abs(l.valor))}</em>
                    <u title={l.om}>{l.om}</u>
                    <s>{l.desc}</s>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="pc-cx pc-painel pc-disp" aria-label="Crédito disponível no COMAE">
          <div className="pc-cx-cab pc-ouro"><h3>Crédito Disponível</h3><span className="pc-mono">no COMAE</span></div>
          {p.disponivel.length === 0 ? (
            <div className="pc-vazio">Nenhuma operação com disponível.</div>
          ) : (
            <ul className="pc-rolagem pc-lista">
              {p.disponivel.map((x) => (
                <ItemRank key={x.opEf} rank={x.rank} nome={x.rotulo} sub="Disponível no COMAE" valor={x.valor}
                  gatilho={gatilho('c-' + x.opEf, () => (
                    <TabelaDetalhe titulo={x.rotulo} detalhe={x.detalhe} vazio="Sem disponível para esta operação."
                      sub={x.detalhe.fonte === 'credito'
                        ? `Disponível por ND · calculado pelo crédito (operação sem PI próprio) · ${x.detalhe.linhas.length} linhas`
                        : `Detalhe do disponível no COMAE · ${x.detalhe.linhas.length} linhas`} />
                  ))} />
              ))}
            </ul>
          )}
        </aside>
      </div>
      {caixa}
    </>
  );
}

// ── Página Unidades ───────────────────────────────────────────────────────────

function PaginaUnidades({ dados, podeEditar, pedir }: { dados: DadosComae; podeEditar: boolean; pedir: PedirDesativar }) {
  const [operacao, setOperacao] = useState<string | null>(null);
  const [om, setOm] = useState<string | null>(null);
  const [modo, setModo] = useState<'detalhe' | 'operacao'>('detalhe');
  const { gatilho, caixa } = useDica();

  const u = useMemo(() => paginaUnidades(dados, { operacao, om }), [dados, operacao, om]);
  const opcoes = useMemo(() => opcoesUnidades(dados, { operacao, om }), [dados, operacao, om]);
  const I = u.indicadores;
  const pct = (v: number) => (I.total ? fmtPct(v / I.total) : '—');
  const indicadores = [
    { rot: 'Disponível', v: I.disp, cor: '#5FA8E0' },
    { rot: 'A Liquidar', v: I.aLiq, cor: '#E0B341' },
    { rot: 'Liq. a Pagar', v: I.liqPagar, cor: '#C77DD6' },
    { rot: 'Pago', v: I.pago, cor: '#3FB07A' },
  ];

  return (
    <>
      <header className="pc-cx pc-titulo"><h2>Acompanhamento Orçamentário das Unidades</h2></header>

      <section className="pc-cx" aria-label="Acompanhamento orçamentário">
        <div className="pc-cx-cab"><h3>Acompanhamento Orçamentário</h3></div>
        <div className="pc-faixa">
          <div className="pc-tag"><strong style={{ background: '#2E6DB4' }}>Execução</strong><em>{fmtMoeda(I.total)}</em></div>
          {I.total === 0 ? (
            <div className="pc-vazio">Sem dados de execução para a seleção atual</div>
          ) : (
            <div className="pc-cards">
              {indicadores.map((x) => (
                <div className="pc-card pc-ind" key={x.rot} style={{ ['--cor' as string]: x.cor }}>
                  <div><h4>{x.rot}</h4><b>{fmtMoeda(x.v)}</b><i style={{ color: x.cor }}>{pct(x.v)} do total</i></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="pc-cx pc-filtros" aria-label="Filtros">
        <span className="pc-filtros-rot">Filtros</span>
        <Selecao rotulo="Selecione a Operação" valor={operacao} opcoes={opcoes.operacoes} aoMudar={(v) => { setOperacao(v); setOm(null); }} />
        <Selecao rotulo="Selecione a OM" valor={om} opcoes={opcoes.oms} aoMudar={setOm} />
        <BotaoDesativarFiltro dados={dados} operacao={operacao} pedir={pedir} />
      </section>

      {u.omPorNd && om && (
        <section className="pc-cx" aria-label={`${om} por natureza de despesa`}>
          <div className="pc-cx-cab">
            <h3>{om} · por natureza de despesa</h3>
            <span className="pc-mono">descentralizado pelo COMAE × execução da OM</span>
          </div>
          {u.omPorNd.length === 0 ? (
            <div className="pc-vazio">Sem descentralização do COMAE nem execução para esta OM na seleção atual</div>
          ) : (
            <table className="pc-tab">
              <thead><tr>
                <th className="pc-esq">ND</th><th className="pc-esq">Natureza de Despesa</th>
                <th title="Saídas do COMAE para a OM, menos as devoluções">Descentralizado pelo COMAE</th>
                <th>Disponível</th><th>A Liquidar</th><th>Liq. a Pagar</th><th>Pago</th>
              </tr></thead>
              <tbody>
                {u.omPorNd.map((n) => (
                  <tr key={n.nd}>
                    <td className="pc-esq"><Nd nd={n.nd} /></td>
                    <td className="pc-esq">{n.ndNome}</td>
                    <td style={{ color: '#E0B341' }}>{fmtMoeda(n.descentralizado)}</td>
                    <td style={{ color: '#5FA8E0' }}>{fmtMoeda(n.disp)}</td>
                    <td style={{ color: '#E0B341' }}>{fmtMoeda(n.aLiq)}</td>
                    <td style={{ color: '#C77DD6' }}>{fmtMoeda(n.liqPagar)}</td>
                    <td style={{ color: '#3FB07A' }}>{fmtMoeda(n.pago)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr>
                <td className="pc-esq" colSpan={2}>Total</td>
                {(['descentralizado', 'disp', 'aLiq', 'liqPagar', 'pago'] as const).map((k) => (
                  <td key={k}>{fmtMoeda(u.omPorNd!.reduce((s, n) => s + n[k], 0))}</td>
                ))}
              </tr></tfoot>
            </table>
          )}
        </section>
      )}

      <div className="pc-baixo">
        <section className="pc-cx pc-painel" aria-label="Controle orçamentário das operações">
          <div className="pc-cx-cab"><h3>Controle Orçamentário das Operações</h3><AvisoDesativadas dados={dados} podeEditar={podeEditar} /></div>
          <div className="pc-rolagem">
            <table className="pc-tab">
              <colgroup><col className="pc-c-un" /><col /><col /><col /></colgroup>
              <thead><tr><th className="pc-esq">Unidade (UG Responsável)</th><th>A Liquidar</th><th>Liquidado a Pagar</th><th>Pago</th></tr></thead>
              <tbody>
                {u.unidades.map((x) => (
                  <tr key={x.ugResp} {...gatilho('u-' + x.ugResp, () => (
                    <div className="pc-tp">
                      <div className="pc-tp-tit">{x.ugResp}</div>
                      <div className="pc-tp-sub">Execução por natureza de despesa · {x.porNd.length} ND</div>
                      <table>
                        <thead><tr><th>ND</th><th>Natureza de Despesa</th><th className="pc-num">A Liquidar</th><th className="pc-num">Liq. a Pagar</th><th className="pc-num">Pago</th></tr></thead>
                        <tbody>
                          {x.porNd.map((n) => (
                            <tr key={n.nd}>
                              <td><Nd nd={n.nd} /></td><td>{n.ndNome}</td>
                              <td className="pc-num" style={{ color: '#E0B341' }}>{fmtMoeda(n.aLiq)}</td>
                              <td className="pc-num" style={{ color: '#C77DD6' }}>{fmtMoeda(n.liqPagar)}</td>
                              <td className="pc-num" style={{ color: '#3FB07A' }}>{fmtMoeda(n.pago)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot><tr>
                          <td colSpan={2}>Total</td>
                          <td className="pc-num" style={{ color: '#E0B341' }}>{fmtMoeda(x.aLiq)}</td>
                          <td className="pc-num" style={{ color: '#C77DD6' }}>{fmtMoeda(x.liqPagar)}</td>
                          <td className="pc-num" style={{ color: '#3FB07A' }}>{fmtMoeda(x.pago)}</td>
                        </tr></tfoot>
                      </table>
                    </div>
                  ))}>
                    <td className="pc-esq pc-op" title={x.ugResp}>{x.ugResp}</td>
                    <td style={{ color: '#E0B341' }}>{fmtMoeda(x.aLiq)}</td>
                    <td style={{ color: '#C77DD6' }}>{fmtMoeda(x.liqPagar)}</td>
                    <td style={{ color: '#3FB07A' }}>{fmtMoeda(x.pago)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="pc-cx pc-painel pc-disp" aria-label="Crédito disponível nas unidades">
          <div className="pc-cx-cab pc-ouro">
            <h3>Crédito Disponível</h3>
            <button type="button" className="pc-alternar" onClick={() => setModo(modo === 'detalhe' ? 'operacao' : 'detalhe')}
              title={modo === 'detalhe' ? 'Ver o total por operação' : 'Ver o detalhe por unidade'}>
              <IconeAlternar />
            </button>
            <span className="pc-mono">nas unidades</span>
          </div>
          {modo === 'detalhe' ? (
            u.dispDetalhe.linhas === 0 ? (
              <div className="pc-vazio">Sem disponível nas unidades para a seleção atual</div>
            ) : (
              <div className="pc-rolagem pc-du">
                <div className="pc-du-topo">
                  <h4>Disponível nas Unidades</h4>
                  <span>{u.dispDetalhe.linhas} linhas</span>
                  <strong>{fmtMoeda(u.dispDetalhe.total)}</strong>
                </div>
                {u.dispDetalhe.operacoes.map((o) => (
                  <div className="pc-du-op" key={o.op}>
                    <div className="pc-du-oph"><span title={o.rotulo}>{o.rotulo}</span><b>{fmtMoeda(o.total)}</b></div>
                    <table><tbody>
                      {o.linhas.map((l, i) => (
                        <tr key={i}><td><span className="pc-du-ur" title={l.ugResp}>{l.ugResp}</span></td><td><Nd nd={l.nd} /></td><td className="pc-num">{fmtMoeda(l.valor)}</td></tr>
                      ))}
                    </tbody></table>
                  </div>
                ))}
              </div>
            )
          ) : (
            <ul className="pc-rolagem pc-lista">
              {u.dispPorOperacao.map((x) => (
                <ItemRank key={x.op} rank={x.rank} nome={x.rotulo} sub="Disponível nas unidades" valor={x.valor}
                  gatilho={gatilho('o-' + x.op, () => (
                    <TabelaDetalhe titulo={x.rotulo} detalhe={x.detalhe} vazio="Sem disponível nas unidades para esta operação."
                      sub={`Detalhe do disponível nas unidades · ${x.detalhe.linhas.length} linhas`} />
                  ))} />
              ))}
            </ul>
          )}
        </aside>
      </div>
      {caixa}
    </>
  );
}

// ── Painel ────────────────────────────────────────────────────────────────────

export function PainelComaeView({ dados, podeEditar }: { dados: DadosComae; podeEditar: boolean }) {
  const [desativar, setDesativar] = useState<AlvoDesativar | null>(null);
  const pedir: PedirDesativar = podeEditar ? setDesativar : null;
  const fecharDesativar = useCallback(() => setDesativar(null), []);
  const [pagina, setPagina] = useState<'comae' | 'unidades'>('comae');
  const anoPadrao = dados.atualizadoEm?.slice(0, 4) ?? dados.anos[dados.anos.length - 1] ?? null;
  const [ano, setAno] = useState<string | null>(anoPadrao && dados.anos.includes(anoPadrao) ? anoPadrao : null);
  const [pedidos, setPedidos] = useState<MovPedido[] | null>(null);
  const [pedidosErro, setPedidosErro] = useState<string | null>(null);
  const [lidoEm, setLidoEm] = useState(() => new Date());
  const [cheia, setCheia] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const revalidador = useRevalidator();
  const buscando = useRef(false);

  // Dados novos do loader (releitura): marca a hora e descarta os pedidos antigos.
  useEffect(() => { setLidoEm(new Date()); setPedidos(null); }, [dados]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible' && revalidador.state === 'idle') revalidador.revalidate();
    }, RELER_A_CADA_MS);
    return () => clearInterval(id);
  }, [revalidador]);

  const carregarPedidos = useCallback(() => {
    if (buscando.current) return;
    buscando.current = true;
    setPedidosErro(null);
    fetch('/api/painel-comae', { headers: { Accept: 'application/json' } })
      .then(async (r) => {
        if (!r.ok) throw new Error(`O servidor respondeu ${r.status}.`);
        const j = (await r.json()) as { pedidos: MovPedido[] };
        setPedidos(j.pedidos);
      })
      .catch((e: unknown) => setPedidosErro(e instanceof Error ? e.message : 'Falha de rede.'))
      .finally(() => { buscando.current = false; });
  }, []);

  useEffect(() => {
    const aoMudar = () => setCheia(!!raiz.current && document.fullscreenElement === raiz.current);
    document.addEventListener('fullscreenchange', aoMudar);
    return () => document.removeEventListener('fullscreenchange', aoMudar);
  }, []);
  const alternarTelaCheia = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void raiz.current?.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <div className="pc" ref={raiz} data-cheia={cheia ? '1' : undefined}>
      <div className="pc-grade">
        <nav className="pc-lado" aria-label="Painel COMAE">
          <div className="pc-marca">
            <img src="/comae-logo.png" alt="" />
            <strong>COMAE</strong>
            <span>Comando de Operações Aeroespaciais</span>
          </div>
          <div className="pc-lado-bloco">
            <span className="pc-lado-rot">Navegação</span>
            {(['comae', 'unidades'] as const).map((pg) => (
              <button key={pg} type="button" className="pc-nav" aria-current={pagina === pg ? 'page' : undefined} onClick={() => setPagina(pg)}>
                {pg === 'comae' ? 'COMAE' : 'Unidades'}
              </button>
            ))}
          </div>
          <label className="pc-lado-bloco pc-ano">
            <span className="pc-lado-rot">Exercício</span>
            <select value={ano ?? ''} onChange={(e) => setAno(e.target.value || null)}>
              <option value="">Todos</option>
              {dados.anos.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <div className="pc-lado-pe">
            <img className="pc-gladio" src="/gladio.png" alt="" />
            <button type="button" className="pc-cheia" onClick={alternarTelaCheia}>{cheia ? 'Sair da tela cheia' : 'Tela cheia'}</button>
            <div className="pc-atualizado" title={`Dados lidos do sistema às ${lidoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}; relidos a cada 5 minutos`}>
              <i aria-hidden="true" /> Atualizado em {fmtData(dados.atualizadoEm)}
            </div>
          </div>
        </nav>

        <div className="pc-conteudo">
          {pagina === 'comae'
            ? <PaginaComae dados={dados} ano={ano} pedidos={pedidos} carregarPedidos={carregarPedidos} pedidosErro={pedidosErro} podeEditar={podeEditar} pedir={pedir} />
            : <PaginaUnidades dados={dados} podeEditar={podeEditar} pedir={pedir} />}
          <footer className="pc-rodape pc-mono">Suporte técnico · 2T Bruno · GAP-MN</footer>
        </div>
      </div>
      {desativar && <DesativarOperacao alvo={desativar} aoFechar={fecharDesativar} />}
    </div>
  );
}
