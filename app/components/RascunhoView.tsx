import { useState, useEffect, useRef } from 'react';
import { useFetcher, Form, Link } from 'react-router';
import { apelidoOperacao } from '~/lib/apelidoOperacao';
import type { MovimentoRow } from './FeedView';
import type { OpcoesFiltro } from './FilterBar';

export type Quadro = {
  id: string;
  nome: string;
  nota: string | null;
  atualizado_em: string;
};

export type RascunhoItem = {
  id: number;
  tipo: 'nc' | 'operacao';
  referencia: string;
  nota: string | null;
};

const TIPO_META: Record<string, { label: string; cor: string }> = {
  RECEBIDO:          { label: 'Recebido',       cor: '#3FB07A' },
  DESCENTRALIZADO:   { label: 'Descentralizado', cor: '#E0B341' },
  DEVOLUCAO:         { label: 'Devolução',       cor: '#E06A6A' },
  RECEBIDO_UNIDADES: { label: 'Rec. Unidades',   cor: '#25A3A3' },
};

function brl(v: number): string {
  return Math.abs(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatData(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ── Nome editável inline ───────────────────────────────────────────────────
function EditableNome({ quadroId, nome }: { quadroId: string; nome: string }) {
  const fetcher = useFetcher();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(nome);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setValor(nome); }, [nome]);

  function salvar() {
    const trimmed = valor.trim();
    if (trimmed && trimmed !== nome) {
      fetcher.submit(
        { intent: 'renomear_quadro', quadro_id: quadroId, nome: trimmed },
        { method: 'post', action: '/painel' },
      );
    } else {
      setValor(nome);
    }
    setEditando(false);
  }

  if (editando) {
    return (
      <input
        ref={inputRef}
        value={valor}
        onChange={e => setValor(e.target.value)}
        onBlur={salvar}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); salvar(); }
          if (e.key === 'Escape') { setValor(nome); setEditando(false); }
        }}
        className="text-sm font-bold bg-transparent border-b outline-none w-full max-w-sm"
        style={{ color: '#EAF1FB', borderColor: '#5FA8E0' }}
        autoFocus
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditando(true)}
      className="text-sm font-bold text-white hover:text-slate-300 transition-colors text-left cursor-text group"
      title="Clique para renomear"
    >
      {nome}
      <span className="text-slate-600 ml-2 text-[10px] font-normal opacity-0 group-hover:opacity-100 transition-opacity">
        editar
      </span>
    </button>
  );
}

// ── Nota do quadro (auto-save no blur) ────────────────────────────────────
function NotaQuadro({ quadroId, nota }: { quadroId: string; nota: string | null }) {
  const fetcher = useFetcher();
  const [valor, setValor] = useState(nota ?? '');
  const [sujo, setSujo] = useState(false);

  useEffect(() => { setValor(nota ?? ''); setSujo(false); }, [nota]);

  function salvar() {
    if (!sujo) return;
    fetcher.submit(
      { intent: 'atualizar_nota', quadro_id: quadroId, nota: valor },
      { method: 'post', action: '/painel' },
    );
    setSujo(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">Notas</p>
        {sujo && (
          <button
            type="button"
            onClick={salvar}
            className="text-[10px] px-2 py-0.5 rounded cursor-pointer"
            style={{ background: '#1D4ED8', color: '#fff' }}
          >
            Salvar
          </button>
        )}
      </div>
      <textarea
        value={valor}
        onChange={e => { setValor(e.target.value); setSujo(true); }}
        onBlur={salvar}
        rows={3}
        placeholder="Anote o raciocínio, contexto ou conclusões desta análise..."
        className="w-full text-xs px-3 py-2 rounded-lg border outline-none resize-none"
        style={{
          background: '#0C1526',
          borderColor: sujo ? '#5FA8E0' : '#1E3050',
          color: '#EAF1FB',
        }}
      />
    </div>
  );
}

// ── Adicionar NCs ─────────────────────────────────────────────────────────
function AdicionarNCs({ quadroId }: { quadroId: string }) {
  const fetcher = useFetcher<{ ok?: boolean; adicionados?: number; duplicatas?: number; naoEncontradas?: number; erro?: string }>();
  const [ncs, setNcs] = useState('');
  const idle = fetcher.state === 'idle';

  useEffect(() => {
    if (idle && fetcher.data?.ok) setNcs('');
  }, [idle, fetcher.data]);

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Adicionar por NC</p>
      <fetcher.Form method="post" action="/painel">
        <input type="hidden" name="intent" value="adicionar_ncs" />
        <input type="hidden" name="quadro_id" value={quadroId} />
        <textarea
          name="ncs"
          value={ncs}
          onChange={e => setNcs(e.target.value)}
          rows={3}
          placeholder={'2026NC001234\n2026NC005678\n...'}
          className="w-full text-xs font-mono px-3 py-2 rounded-lg border outline-none resize-none mb-2"
          style={{ background: '#0C1526', borderColor: '#1E3050', color: '#EAF1FB' }}
        />
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="submit"
            disabled={!ncs.trim() || !idle}
            className="text-xs px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-40 transition-colors"
            style={{ background: '#1D4ED8', color: '#fff' }}
          >
            {idle ? 'Adicionar NCs' : 'Adicionando…'}
          </button>
          {idle && fetcher.data?.ok && (
            <span className="text-[10px] text-slate-400">
              +{fetcher.data.adicionados} adicionada{fetcher.data.adicionados !== 1 ? 's' : ''}
              {fetcher.data.duplicatas ? `, ${fetcher.data.duplicatas} já existiam` : ''}
            </span>
          )}
          {idle && fetcher.data?.erro && (
            <span className="text-[10px]" style={{ color: '#E06A6A' }}>{fetcher.data.erro}</span>
          )}
        </div>
      </fetcher.Form>
    </div>
  );
}

// ── Adicionar Operação ────────────────────────────────────────────────────
function AdicionarOperacao({ quadroId, operacoes }: { quadroId: string; operacoes: string[] }) {
  const fetcher = useFetcher<{ ok?: boolean; duplicata?: boolean; erro?: string }>();
  const [op, setOp] = useState('');
  const idle = fetcher.state === 'idle';

  useEffect(() => {
    if (idle && fetcher.data?.ok && !fetcher.data.duplicata) setOp('');
  }, [idle, fetcher.data]);

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Adicionar operação inteira</p>
      <fetcher.Form method="post" action="/painel" className="flex items-stretch gap-2">
        <input type="hidden" name="intent" value="adicionar_operacao" />
        <input type="hidden" name="quadro_id" value={quadroId} />
        <select
          name="operacao"
          value={op}
          onChange={e => setOp(e.target.value)}
          className="flex-1 text-xs px-3 py-2 rounded-lg border outline-none"
          style={{ background: '#0C1526', borderColor: '#1E3050', color: op ? '#EAF1FB' : '#4A5B73' }}
        >
          <option value="">Selecione a operação…</option>
          {operacoes.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <button
          type="submit"
          disabled={!op || !idle}
          className="text-xs px-3 py-2 rounded-lg cursor-pointer disabled:opacity-40 flex-shrink-0 transition-colors"
          style={{ background: '#1D4ED8', color: '#fff' }}
        >
          Adicionar
        </button>
      </fetcher.Form>
      {idle && fetcher.data?.duplicata && (
        <p className="text-[10px] text-slate-500 mt-1">Esta operação já está no quadro.</p>
      )}
    </div>
  );
}

// ── Itens do quadro (chips removíveis) ────────────────────────────────────
function ItemList({ quadroId, itens }: { quadroId: string; itens: RascunhoItem[] }) {
  const fetcher = useFetcher();

  function remover(itemId: number) {
    fetcher.submit(
      { intent: 'remover_item', quadro_id: quadroId, item_id: String(itemId) },
      { method: 'post', action: '/painel' },
    );
  }

  if (itens.length === 0) return null;

  const ops = itens.filter(i => i.tipo === 'operacao');
  const ncs = itens.filter(i => i.tipo === 'nc');

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
        Itens — {itens.length} referência{itens.length !== 1 ? 's' : ''}
      </p>
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #1E3050' }}>
        {ops.map(item => (
          <div key={item.id} className="flex items-center gap-2 px-3 py-2 border-b" style={{ background: '#0F1D30', borderColor: '#1A2840' }}>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#1E3050', color: '#5FA8E0' }}>OP</span>
            <span className="text-xs text-white flex-1 font-medium">{item.referencia}</span>
            <button type="button" onClick={() => remover(item.id)} className="text-slate-600 hover:text-slate-300 text-[10px] cursor-pointer transition-colors">remover</button>
          </div>
        ))}
        {ncs.length > 0 && (
          <div className="px-3 py-2" style={{ background: '#0D1828' }}>
            <div className="flex flex-wrap gap-1.5">
              {ncs.map(item => (
                <span
                  key={item.id}
                  className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ background: '#1A2840', color: '#8A97AC' }}
                >
                  {item.referencia}
                  <button type="button" onClick={() => remover(item.id)} className="hover:text-slate-300 cursor-pointer leading-none">×</button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tabela de movimentos ──────────────────────────────────────────────────
function MovimentosTable({ movimentos }: { movimentos: MovimentoRow[] }) {
  if (movimentos.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 px-5">
        <p className="text-slate-600 text-xs">Nenhum movimento encontrado para os itens do quadro.</p>
      </div>
    );
  }

  const totalRec  = movimentos.filter(m => m.tipo_calculado === 'RECEBIDO').reduce((s, m) => s + m.valor, 0);
  const totalDesc = movimentos.filter(m => m.tipo_calculado === 'DESCENTRALIZADO').reduce((s, m) => s + Math.abs(m.valor), 0);
  const totalDev  = movimentos.filter(m => m.tipo_calculado === 'DEVOLUCAO').reduce((s, m) => s + Math.abs(m.valor), 0);

  return (
    <div>
      {/* Resumo */}
      <div className="flex flex-wrap items-center gap-4 px-5 py-2.5 border-b text-[10px]" style={{ background: '#080F1F', borderColor: '#1E3050' }}>
        <span className="text-slate-500">{movimentos.length} movimento{movimentos.length !== 1 ? 's' : ''}</span>
        {totalRec  > 0 && <span style={{ color: '#3FB07A' }}>+{brl(totalRec)} recebido</span>}
        {totalDesc > 0 && <span style={{ color: '#E0B341' }}>−{brl(totalDesc)} descentralizado</span>}
        {totalDev  > 0 && <span style={{ color: '#E06A6A' }}>−{brl(totalDev)} devolvido</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 680 }}>
          <thead>
            <tr style={{ background: '#080F1F', borderBottom: '1px solid #1E3050' }}>
              {[
                { h: 'Data',          align: 'left' },
                { h: 'NC',            align: 'left' },
                { h: 'Operação',      align: 'left' },
                { h: 'Tipo',          align: 'left' },
                { h: 'ND',            align: 'left' },
                { h: 'Valor',         align: 'right' },
                { h: 'UG Responsável', align: 'right' },
              ].map(col => (
                <th
                  key={col.h}
                  className="px-3 py-2.5 text-[10px] text-slate-500 font-medium"
                  style={{ textAlign: col.align as 'left' | 'right' }}
                >
                  {col.h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {movimentos.map((m, i) => {
              const meta = TIPO_META[m.tipo_calculado] ?? TIPO_META.RECEBIDO;
              const sinal = m.tipo_calculado === 'DESCENTRALIZADO' || m.tipo_calculado === 'DEVOLUCAO' ? '−' : '+';
              return (
                <tr
                  key={m.id}
                  style={{ background: i % 2 === 0 ? '#101C33' : '#0D1828', borderBottom: '1px solid #141F35' }}
                >
                  <td className="px-3 py-2 text-slate-400 tabular-nums text-[11px]">{formatData(m.data)}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-400">{m.nc}</td>
                  <td className="px-3 py-2 text-white text-[11px] max-w-[180px]">
                    <span className="truncate block" title={m.operacao}>{apelidoOperacao(m.operacao)}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-[10px] font-bold" style={{ color: meta.cor }}>{meta.label}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-400">{m.nd_cod}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-[11px]" style={{ color: meta.cor }}>
                    {sinal}{brl(m.valor)}
                  </td>
                  <td className="px-3 py-2 text-right text-[11px] text-slate-500 max-w-[160px]">
                    <span className="truncate block" title={m.ug_resp_nome}>{m.ug_resp_nome}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── QuadroList (left panel) ───────────────────────────────────────────────
function QuadroList({ quadros, quadroAtivoId }: { quadros: Quadro[]; quadroAtivoId?: string }) {
  return (
    <aside className="w-56 flex-shrink-0 flex flex-col overflow-y-auto" style={{ background: '#080F1F', borderRight: '1px solid #1E3050' }}>
      <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: '#1E3050' }}>
        <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-3">Meus Quadros</p>
        <Form method="post" action="/painel">
          <input type="hidden" name="intent" value="criar_quadro" />
          <button
            type="submit"
            className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-lg cursor-pointer transition-all hover:brightness-125"
            style={{ background: '#1E3050', color: '#5FA8E0', border: '1px solid #2A4070' }}
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Novo quadro
          </button>
        </Form>
      </div>

      <div className="flex-1 py-2">
        {quadros.length === 0 && (
          <p className="px-4 py-3 text-[10px] text-slate-600">Nenhum quadro ainda.</p>
        )}
        {quadros.map(q => {
          const ativo = q.id === quadroAtivoId;
          return (
            <Link
              key={q.id}
              to={`/painel?aba=rascunho&quadro=${q.id}`}
              className="flex items-center gap-2 px-4 py-2.5 transition-all"
              style={{
                background: ativo ? '#1E3050' : 'transparent',
                borderLeft: `2px solid ${ativo ? '#5FA8E0' : 'transparent'}`,
                color: ativo ? '#EAF1FB' : '#8A97AC',
              }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="text-xs truncate">{q.nome}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

// ── Main export ───────────────────────────────────────────────────────────
type Props = {
  quadros: Quadro[];
  quadroAtivo: Quadro | null;
  rascunhoItens: RascunhoItem[];
  rascunhoMovimentos: MovimentoRow[];
  opcoes: OpcoesFiltro;
};

export function RascunhoView({ quadros, quadroAtivo, rascunhoItens, rascunhoMovimentos, opcoes }: Props) {
  return (
    <div className="flex h-full overflow-hidden" style={{ minHeight: 0 }}>
      <QuadroList quadros={quadros} quadroAtivoId={quadroAtivo?.id} />

      <div className="flex-1 overflow-y-auto min-w-0 flex flex-col">
        {/* Faixa de aviso */}
        <div
          className="px-4 py-1.5 text-center text-[10px] flex-shrink-0"
          style={{ background: '#071510', color: '#3FB07A', borderBottom: '1px solid #0F2A1E' }}
        >
          Área de rascunho — não altera os dados oficiais
        </div>

        {!quadroAtivo ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3">
            <svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke="#2A3A53" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <p className="text-slate-500 text-sm">Selecione ou crie um quadro</p>
            <p className="text-slate-700 text-xs">Monte análises a partir dos dados oficiais sem alterá-los</p>
          </div>
        ) : (
          <>
            {/* Cabeçalho do quadro */}
            <div className="px-5 py-4 border-b flex items-center justify-between gap-4 flex-shrink-0" style={{ borderColor: '#1E3050', background: '#080F1F' }}>
              <EditableNome quadroId={quadroAtivo.id} nome={quadroAtivo.nome} />
              <Form method="post" action="/painel">
                <input type="hidden" name="intent" value="arquivar_quadro" />
                <input type="hidden" name="quadro_id" value={quadroAtivo.id} />
                <button
                  type="submit"
                  className="text-[10px] px-2.5 py-1.5 rounded-lg border cursor-pointer hover:brightness-125 transition-all"
                  style={{ borderColor: '#2A3A53', color: '#4A5B73' }}
                  onClick={e => { if (!window.confirm('Arquivar este quadro?')) e.preventDefault(); }}
                >
                  Arquivar
                </button>
              </Form>
            </div>

            {/* Conteúdo */}
            <div className="p-5 space-y-6 flex-shrink-0">
              <NotaQuadro quadroId={quadroAtivo.id} nota={quadroAtivo.nota} />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <AdicionarNCs quadroId={quadroAtivo.id} />
                <AdicionarOperacao quadroId={quadroAtivo.id} operacoes={opcoes.operacoes} />
              </div>

              <ItemList quadroId={quadroAtivo.id} itens={rascunhoItens} />
            </div>

            {/* Movimentos */}
            {rascunhoItens.length > 0 && (
              <div className="border-t flex-1 min-h-0" style={{ borderColor: '#1E3050' }}>
                <div className="px-5 py-3 border-b flex-shrink-0" style={{ background: '#080F1F', borderColor: '#1E3050' }}>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Movimentos do quadro</p>
                </div>
                <MovimentosTable movimentos={rascunhoMovimentos} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
