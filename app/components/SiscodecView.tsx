import { useState, useRef, useEffect, useCallback } from 'react';
import { useFetcher } from 'react-router';
import { apelidoOperacao } from '~/lib/apelidoOperacao';
import { UNIDADES } from '~/lib/unidades';
import { loadConfig, saveConfig, CONFIG_PADRAO } from '~/lib/siscodec-doc-config';
import type { SiscodecDocConfig } from '~/lib/siscodec-doc-config';
import { LISTA_UGS, EXEC_POR_RESP } from '~/lib/ugs';

function UgCombobox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (cod: string) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const q = query.trim().toUpperCase();
  const filtrados = q.length < 1 ? [] : LISTA_UGS.filter(u =>
    u.cod.includes(q) ||
    u.nome.toUpperCase().includes(q) ||
    u.sigla.toUpperCase().includes(q)
  ).slice(0, 30);

  const ugAtual = LISTA_UGS.find(u => u.cod === value);

  const selecionar = useCallback((cod: string) => {
    onChange(cod);
    setQuery('');
    setOpen(false);
  }, [onChange]);

  // Close on click outside
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[idx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open || filtrados.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, filtrados.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); selecionar(filtrados[idx].cod); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={query || (open ? '' : value)}
        onChange={e => { setQuery(e.target.value); setIdx(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder={open ? 'código, sigla ou nome…' : placeholder}
        className="w-full text-xs rounded px-2 py-1 font-mono"
        style={{
          background: '#101C33',
          border: value ? '1px solid #2A6049' : '1px solid #1E3050',
          color: '#EAF1FB',
          outline: 'none',
        }}
        autoComplete="off"
      />
      {ugAtual && !open && (
        <div className="text-[9px] mt-0.5 truncate" style={{ color: '#7A9BBF' }}>
          {ugAtual.sigla ? `${ugAtual.sigla} — ` : ''}{ugAtual.nome}
        </div>
      )}
      {open && filtrados.length > 0 && (
        <ul
          ref={listRef}
          style={{
            position: 'absolute', zIndex: 50, top: '100%', left: 0, right: 0,
            background: '#0D1B2E', border: '1px solid #1E3050', borderRadius: 4,
            maxHeight: 220, overflowY: 'auto', margin: 0, padding: 0, listStyle: 'none',
          }}
        >
          {filtrados.map((u, i) => (
            <li
              key={u.cod}
              onMouseDown={() => selecionar(u.cod)}
              style={{
                padding: '4px 8px',
                cursor: 'pointer',
                background: i === idx ? '#1A3050' : 'transparent',
                borderBottom: '1px solid #1A2A3A',
              }}
            >
              <span className="font-mono text-[10px]" style={{ color: '#5BC4A0' }}>{u.cod}</span>
              {u.sigla && <span className="text-[10px] ml-1" style={{ color: '#EAF1FB' }}> {u.sigla}</span>}
              <span className="text-[9px] ml-1 truncate block" style={{ color: '#7A9BBF' }}>{u.nome}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type SiscodecCelula = {
  id: number;
  ordem: number;
  tipo: 'ANULACAO' | 'SUPLEMENTACAO';
  ptres: string;
  nd: string;
  valor: number;
  ug_exec?: string | null;
  esfera?: string | null;
  fonte?: string | null;
  plano_interno?: string | null;
  ug_cred?: string | null;
  obs_linha1?: string | null;
  obs_linha2?: string | null;
};

export type SiscodecPedido = {
  id: number;
  status: 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'ERRO' | 'CANCELADO';
  descricao: string;
  operacao: string;
  destaque: string;
  entrada_exterior: string;
  obs: string;
  num_desc?: number | null;
  criado_em: string;
  concluido_em: string | null;
  concluido_email: string | null;
  erro_msg: string | null;
  siscodec_celulas: SiscodecCelula[];
};

export type SolicitacaoDesc = {
  id: number;
  status: 'AGUARDANDO' | 'SOLICITADA' | 'ATENDIDA' | 'CANCELADA';
  data_oficio: string;
  ugr_sigla: string;
  nd_cod: string;
  nd_nome: string;
  valor: number;
  descricao: string;
  operacao: string;
  criado_por: string | null;
  criado_em: string;
};

export type SiscodecModeloCelula = {
  tipo: 'ANULACAO' | 'SUPLEMENTACAO';
  ptres: string;
  nd: string;
  ug_exec: string;
  esfera: string;
  fonte: string;
  plano_interno: string;
  ug_cred: string;
  obs_linha1: string;
  obs_linha2: string;
};

export type SiscodecModelo = {
  id: number;
  operacao: string;
  obs: string | null;
  destaque: string;
  entrada_exterior: string;
  celulas: SiscodecModeloCelula[];
  criado_por_nome: string | null;
  criado_em: string;
};

type PreFillData = {
  descricao: string;
  nd: string;
  valor: number;
  operacao: string;
  ugr_sigla: string;
  ugr_cod: string;
};

type CelulaForm = {
  key: string;
  tipo: 'ANULACAO' | 'SUPLEMENTACAO';
  ptres: string;
  nd: string;
  valor: string;
  ug_exec: string;
  esfera: string;
  fonte: string;
  plano_interno: string;
  ug_cred: string;
  obs_linha1: string;
  obs_linha2: string;
};

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function tempoAtras(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.floor(diff / 60_000)}min atrás`;
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

const STATUS_META: Record<string, { label: string; cor: string; bg: string }> = {
  PENDENTE:      { label: 'Pendente',     cor: '#E0B341', bg: '#3A2C0C' },
  EM_ANDAMENTO:  { label: 'Em andamento', cor: '#5FA8E0', bg: '#0F2033' },
  CONCLUIDO:     { label: 'Concluído',    cor: '#3FB07A', bg: '#1B3A2B' },
  ERRO:          { label: 'Erro',         cor: '#E06A6A', bg: '#3A1212' },
  CANCELADO:     { label: 'Cancelado',    cor: '#8A97AC', bg: '#1A2840' },
};

const SOL_STATUS_META: Record<string, { label: string; cor: string; bg: string }> = {
  AGUARDANDO: { label: 'Aguardando', cor: '#E0B341', bg: '#3A2C0C' },
  SOLICITADA: { label: 'Solicitada', cor: '#5FA8E0', bg: '#0F2033' },
  ATENDIDA:   { label: 'Atendida',   cor: '#3FB07A', bg: '#1B3A2B' },
  CANCELADA:  { label: 'Cancelada',  cor: '#8A97AC', bg: '#1A2840' },
};

const TIPO_COR: Record<string, { cor: string; bg: string }> = {
  ANULACAO:      { cor: '#E06A6A', bg: '#3A1212' },
  SUPLEMENTACAO: { cor: '#3FB07A', bg: '#1B3A2B' },
};

// ── Token Section ──────────────────────────────────────────────────────────

function TokenSection({ apiToken }: { apiToken: string }) {
  const [copiado, setCopiado] = useState(false);
  const [mostrar, setMostrar] = useState(false);
  const fetcher = useFetcher();

  function copiar() {
    navigator.clipboard.writeText(apiToken).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  const tokenMask = apiToken
    ? (mostrar ? apiToken : apiToken.slice(0, 8) + '••••••••-••••-••••' + apiToken.slice(-4))
    : '—';

  return (
    <div
      className="rounded-xl p-4 mb-5"
      style={{ background: '#0C1526', border: '1px solid #1E3050' }}
    >
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Token da Extensão</p>
      <div className="flex items-center gap-2 flex-wrap">
        <code
          className="text-xs font-mono flex-1 min-w-0 truncate"
          style={{ color: '#5FA8E0' }}
        >
          {tokenMask}
        </code>
        <button
          type="button"
          onClick={() => setMostrar(v => !v)}
          className="text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer"
        >
          {mostrar ? 'ocultar' : 'mostrar'}
        </button>
        <button
          type="button"
          onClick={copiar}
          className="text-[10px] font-semibold px-2 py-1 rounded cursor-pointer"
          style={{ background: '#1E3050', color: copiado ? '#3FB07A' : '#EAF1FB' }}
        >
          {copiado ? '✓ Copiado' : 'Copiar'}
        </button>
        <fetcher.Form method="post" action="/painel">
          <input type="hidden" name="intent" value="regenerar_token" />
          <button
            type="submit"
            className="text-[10px] text-slate-600 hover:text-slate-400 cursor-pointer"
            title="Gera novo token — o antigo deixa de funcionar"
          >
            regenerar
          </button>
        </fetcher.Form>
      </div>
    </div>
  );
}

// ── Modal de configuração e geração de PDF ────────────────────────────────

function SiscodecDocModal({
  pedidoId, operacao, destaque, pedidoNumDesc, onClose,
}: { pedidoId: number; operacao: string; destaque: string; pedidoNumDesc: number | null; onClose: () => void }) {
  const [cfg, setCfg] = useState<SiscodecDocConfig>(CONFIG_PADRAO);
  const [numDesc, setNumDesc] = useState(pedidoNumDesc !== null ? String(pedidoNumDesc) : '');
  const [numDor,  setNumDor]  = useState('');
  const [opNome,  setOpNome]  = useState(operacao);
  const [baixando, setBaixando] = useState(false);
  const [avancado, setAvancado] = useState(false);
  const fetcher = useFetcher();

  // Load from localStorage on mount (client-only)
  useEffect(() => { setCfg(loadConfig()); }, []);

  const emailOk   = fetcher.state === 'idle' && (fetcher.data as { ok?: boolean })?.ok === true;
  const emailErro = (fetcher.data as { erro?: string } | null)?.erro;
  const enviadoPara = emailOk ? (fetcher.data as { destinatario?: string })?.destinatario : '';

  async function handleDownload() {
    saveConfig(cfg);
    setBaixando(true);
    try {
      const r = await fetch('/api/pdf-solicitacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ pedido_id: pedidoId, config: cfg, num_desc: numDesc, num_dor: numDor, operacao: opNome }),
      });
      if (!r.ok) { alert('Erro ao gerar PDF'); return; }
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `solicitacao-desc-${opNome.replace(/[^a-zA-Z0-9]/g, '-') || 'comae'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBaixando(false);
    }
  }

  function Field({ label, value, onChange, mono, sm }: {
    label: string; value: string; onChange: (v: string) => void; mono?: boolean; sm?: boolean;
  }) {
    return (
      <div>
        <label className={`text-[${sm ? '9' : '10'}px] text-slate-500 block mb-0.5`}>{label}</label>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`w-full text-xs rounded px-2 py-1.5 ${mono ? 'font-mono' : ''}`}
          style={{ background: '#080F1F', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }}
        />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        style={{ background: '#080F1F', border: '1px solid #1E3050' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 z-10"
          style={{ background: '#0C1526', borderColor: '#1E3050' }}>
          <div>
            <h3 className="text-sm font-bold text-white">Gerar Documento</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Solicitação de Descentralização</p>
          </div>
          <button type="button" onClick={onClose}
            className="text-slate-500 hover:text-white cursor-pointer text-lg leading-none">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Identificadores */}
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Identificação do Documento</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nº Descentralização" value={numDesc} onChange={setNumDesc} mono />
              <Field label="Nº DOR" value={numDor} onChange={setNumDor} mono />
              <div className="col-span-2">
                <Field label="Nome da Operação" value={opNome} onChange={setOpNome} />
              </div>
            </div>
          </div>

          {/* Signatário */}
          <Field label="Signatário" value={cfg.signatario} onChange={v => setCfg(c => ({ ...c, signatario: v }))} />

          {/* Email */}
          <Field label="Email do destinatário" value={cfg.email_destinatario}
            onChange={v => setCfg(c => ({ ...c, email_destinatario: v }))} />

          {/* Config avançada */}
          <div>
            <button type="button" onClick={() => setAvancado(v => !v)}
              className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer">
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                style={{ transform: avancado ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
              Configurações do documento
              <span className="text-[9px] text-slate-600">(UG EXEC/CRED, fonte, esfera…)</span>
            </button>

            {avancado && (
              <div className="mt-3 p-3 rounded-lg space-y-2" style={{ background: '#0C1526', border: '1px solid #1A2840' }}>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['UG EXEC Anulação (Cód.)',      'ug_exec_an_cod'   ],
                    ['UG EXEC Anulação (Sigla)',     'ug_exec_an_sigla' ],
                    ['UG EXEC Suplementação (Cód.)', 'ug_exec_sup_cod'  ],
                    ['UG EXEC Suplementação (Sigla)','ug_exec_sup_sigla'],
                    ['UG CRED Anulação (Cód.)',      'ug_cred_an_cod'   ],
                    ['UG CRED Anulação (Sigla)',     'ug_cred_an_sigla' ],
                    ['UG CRED Suplementação (Cód.)', 'ug_cred_sup_cod'  ],
                    ['UG CRED Suplementação (Sigla)','ug_cred_sup_sigla'],
                    ['Fonte',                        'fonte'            ],
                    ['Esfera',                       'esfera'           ],
                  ] as [string, keyof SiscodecDocConfig][]).map(([label, key]) => (
                    <div key={key}>
                      <label className="text-[9px] text-slate-600 block mb-0.5">{label}</label>
                      <input
                        value={cfg[key]}
                        onChange={e => setCfg(c => ({ ...c, [key]: e.target.value }))}
                        className="w-full text-xs rounded px-2 py-1 font-mono"
                        style={{ background: '#080F1F', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }}
                      />
                    </div>
                  ))}
                  <div className="col-span-2">
                    <label className="text-[9px] text-slate-600 block mb-0.5">Plano Interno</label>
                    <input value={cfg.plano_interno} onChange={e => setCfg(c => ({ ...c, plano_interno: e.target.value }))}
                      className="w-full text-xs rounded px-2 py-1 font-mono"
                      style={{ background: '#080F1F', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[9px] text-slate-600 block mb-0.5">Nº PAG</label>
                    <input value={cfg.pag} onChange={e => setCfg(c => ({ ...c, pag: e.target.value }))}
                      className="w-full text-xs rounded px-2 py-1 font-mono"
                      style={{ background: '#080F1F', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }} />
                  </div>
                </div>
                <p className="text-[9px] text-slate-600 pt-1">As configurações são salvas localmente e pré-preenchidas na próxima vez.</p>
              </div>
            )}
          </div>

          {/* Ações */}
          {emailOk ? (
            <div className="rounded-lg px-3 py-3 text-center" style={{ background: '#1B3A2B', border: '1px solid #3FB07A33' }}>
              <p className="text-xs font-semibold" style={{ color: '#3FB07A' }}>✓ Email enviado com PDF em anexo</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Para: {enviadoPara}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={baixando}
                className="w-full text-xs font-bold py-2.5 rounded-lg cursor-pointer disabled:opacity-40 transition-all"
                style={{ background: '#1E3050', color: '#5FA8E0', border: '1px solid #5FA8E033' }}
              >
                {baixando ? 'Gerando PDF…' : '⬇ Baixar PDF'}
              </button>

              <fetcher.Form method="post" action="/painel"
                onSubmit={() => saveConfig(cfg)}>
                <input type="hidden" name="intent"    value="enviar_doc_pdf" />
                <input type="hidden" name="pedido_id" value={pedidoId} />
                <input type="hidden" name="num_desc"  value={numDesc} />
                <input type="hidden" name="num_dor"   value={numDor} />
                <input type="hidden" name="operacao"  value={opNome} />
                <input type="hidden" name="config"    value={JSON.stringify(cfg)} />
                <button
                  type="submit"
                  disabled={fetcher.state !== 'idle' || !cfg.email_destinatario.includes('@')}
                  className="w-full text-xs font-bold py-2.5 rounded-lg cursor-pointer disabled:opacity-40 transition-all"
                  style={{ background: '#1A1406', color: '#E0B341', border: '1px solid #E0B34144' }}
                >
                  {fetcher.state !== 'idle' ? 'Enviando…' : `✉ Enviar PDF para ${cfg.email_destinatario}`}
                </button>
              </fetcher.Form>

              {emailErro && <p className="text-[11px] text-center" style={{ color: '#E06A6A' }}>{emailErro}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Criar pedido form ──────────────────────────────────────────────────────


function CriarPedidoForm({
  operacoes,
  initialData,
  solIdBase,
  proximoNumDesc,
  modelos,
}: {
  operacoes: string[];
  initialData?: PreFillData | null;
  solIdBase?: number | null;
  proximoNumDesc: number | null;
  modelos: SiscodecModelo[];
}) {
  const fetcher = useFetcher();
  const [numDesc, setNumDesc] = useState<string>(() => proximoNumDesc !== null ? String(proximoNumDesc) : '');
  const [opSelecionada, setOpSelecionada] = useState<string>(() => initialData?.operacao ?? '');

  const [celulas, setCelulas] = useState<CelulaForm[]>(() => {
    if (initialData) {
      return [
        {
          key: crypto.randomUUID(), tipo: 'ANULACAO' as const,
          ptres: '', nd: initialData.nd, valor: String(initialData.valor),
          ug_exec: '120625', esfera: '1-FISCAL', fonte: '', plano_interno: '',
          ug_cred: '120115', obs_linha1: '', obs_linha2: '',
        },
        {
          key: crypto.randomUUID(), tipo: 'SUPLEMENTACAO' as const,
          ptres: '', nd: initialData.nd, valor: String(initialData.valor),
          ug_exec: EXEC_POR_RESP[initialData.ugr_cod] ?? '',
          esfera: '1-FISCAL', fonte: '', plano_interno: '',
          ug_cred: initialData.ugr_cod, obs_linha1: '', obs_linha2: '',
        },
      ];
    }
    return [];
  });

  const celulaRef = useRef<HTMLInputElement>(null);
  const [aberta, setAberta] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [obsVal, setObsVal] = useState(initialData?.descricao ?? '');
  const [destaqueVal, setDestaqueVal] = useState('Não');
  const [entradaExteriorVal, setEntradaExteriorVal] = useState('Não');

  const sucesso = fetcher.state === 'idle' && (fetcher.data as { ok?: boolean })?.ok === true && !dismissed;
  const solCriada   = sucesso ? (fetcher.data as { solicitacao?: SolicitacaoDesc | null }).solicitacao ?? null : null;
  const pedidoIdRes  = sucesso ? (fetcher.data as { pedidoId?: number }).pedidoId ?? null : null;
  const pedidoOp     = sucesso ? (fetcher.data as { operacao?: string }).operacao ?? '' : '';
  const pedidoDest   = sucesso ? (fetcher.data as { destaque?: string }).destaque ?? '' : '';
  const pedidoNumRes = sucesso ? (fetcher.data as { numDesc?: number | null }).numDesc ?? null : null;
  const [showDocModal, setShowDocModal] = useState(false);

  useEffect(() => {
    if (fetcher.state === 'submitting') { setDismissed(false); setShowDocModal(false); }
    // After success, advance the counter suggestion
    if (fetcher.state === 'idle' && pedidoNumRes !== null) {
      setNumDesc(String(pedidoNumRes + 1));
    }
  }, [fetcher.state, pedidoNumRes]);

  function addCelula(tipo: 'ANULACAO' | 'SUPLEMENTACAO') {
    const ultimaAnulacao = [...celulas].reverse().find(c => c.tipo === 'ANULACAO');
    const base = tipo === 'SUPLEMENTACAO' && ultimaAnulacao ? ultimaAnulacao : null;
    setCelulas(prev => [
      ...prev,
      {
        key:           crypto.randomUUID(),
        tipo,
        ptres:         base?.ptres         ?? '',
        nd:            base?.nd            ?? '',
        valor:         base?.valor         ?? '',
        ug_exec:       base?.ug_exec       ?? '',
        esfera:        base?.esfera        ?? '1-FISCAL',
        fonte:         base?.fonte         ?? '',
        plano_interno: base?.plano_interno ?? '',
        ug_cred:       base?.ug_cred       ?? '',
        obs_linha1:    base?.obs_linha1    ?? '',
        obs_linha2:    base?.obs_linha2    ?? '',
      },
    ]);
  }

  function removerCelula(key: string) { setCelulas(prev => prev.filter(c => c.key !== key)); }

  function atualizarCelula(key: string, field: keyof Omit<CelulaForm, 'key' | 'tipo'>, value: string) {
    setCelulas(prev => prev.map(c => {
      if (c.key !== key) return c;
      const updated = { ...c, [field]: value };
      if (field === 'ug_cred') {
        // Atualiza UG EXEC se vazio ou se ainda tem o valor auto-sugerido pelo UG CRED anterior
        const execAnteriorSugerida = EXEC_POR_RESP[c.ug_cred] ?? '';
        if (!c.ug_exec || c.ug_exec === execAnteriorSugerida) {
          updated.ug_exec = EXEC_POR_RESP[value] ?? '';
        }
      }
      return updated;
    }));
  }

  function handleSubmit() {
    if (celulaRef.current) {
      celulaRef.current.value = JSON.stringify(
        celulas.map(c => ({
          tipo: c.tipo, ptres: c.ptres.trim(), nd: c.nd.trim(), valor: parseFloat(c.valor) || 0,
          ug_exec:       c.ug_exec.trim()       || null,
          esfera:        c.esfera               || null,
          fonte:         c.fonte.trim()         || null,
          plano_interno: c.plano_interno.trim() || null,
          ug_cred:       c.ug_cred.trim()       || null,
          obs_linha1:    c.obs_linha1.trim()    || null,
          obs_linha2:    c.obs_linha2.trim()    || null,
        }))
      );
    }
  }

  function aplicarModelo(modelo: SiscodecModelo) {
    if (modelo.obs && !obsVal.trim()) setObsVal(modelo.obs);
    setDestaqueVal(modelo.destaque);
    setEntradaExteriorVal(modelo.entrada_exterior);
    setCelulas(prev => {
      if (prev.length === 0) {
        return modelo.celulas.map(c => ({
          key: crypto.randomUUID(),
          tipo: c.tipo, ptres: c.ptres, nd: c.nd, valor: '',
          ug_exec: c.ug_exec, esfera: c.esfera, fonte: c.fonte,
          plano_interno: c.plano_interno, ug_cred: c.ug_cred,
          obs_linha1: c.obs_linha1, obs_linha2: c.obs_linha2,
        }));
      }
      return prev.map(existing => {
        const mc = modelo.celulas.find(c => c.tipo === existing.tipo);
        if (!mc) return existing;
        return {
          ...existing,
          ptres:         mc.ptres         || existing.ptres,
          nd:            mc.nd            || existing.nd,
          ug_exec:       mc.ug_exec       || existing.ug_exec,
          esfera:        mc.esfera        || existing.esfera,
          fonte:         mc.fonte         || existing.fonte,
          plano_interno: mc.plano_interno || existing.plano_interno,
          ug_cred:       mc.ug_cred       || existing.ug_cred,
          obs_linha1:    mc.obs_linha1    || existing.obs_linha1,
          obs_linha2:    mc.obs_linha2    || existing.obs_linha2,
        };
      });
    });
  }

  const totalAnulacao    = celulas.filter(c => c.tipo === 'ANULACAO').reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
  const totalSup         = celulas.filter(c => c.tipo === 'SUPLEMENTACAO').reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
  const valoresNaoBatem   = celulas.length > 0 && celulas.some(c => c.tipo === 'SUPLEMENTACAO') && Math.abs(totalAnulacao - totalSup) > 0.005;
  const planoInternoVazio = celulas.some(c => !c.plano_interno.trim());
  const camposVazios      = celulas.some(c =>
    !c.ptres.trim() || !c.nd.trim() || !(parseFloat(c.valor) > 0) ||
    !c.ug_exec.trim() || !c.fonte.trim() || !c.ug_cred.trim()
  );

  /* ── Card de sucesso ──────────────────────────────────────────────────── */
  if (sucesso) {
    return (
      <div className="rounded-xl overflow-hidden mb-5" style={{ border: '1px solid #3FB07A44' }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ background: '#0D1F15' }}>
          <span className="text-xs font-bold" style={{ color: '#3FB07A' }}>✓ Pedido SISCODEC criado — entrou na fila</span>
          <button
            type="button"
            onClick={() => { setDismissed(true); setCelulas([]); setOpSelecionada(''); setObsVal(''); setDestaqueVal('Não'); setEntradaExteriorVal('Não'); setFormKey(k => k + 1); }}
            className="text-[10px] cursor-pointer"
            style={{ color: '#4A5B73' }}
          >
            + Novo pedido
          </button>
        </div>

        {solCriada && (() => {
          const dataFmt  = new Date(`${solCriada.data_oficio}T00:00:00`).toLocaleDateString('pt-BR');
          const valorFmt = solCriada.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          return (
            <div className="p-4 space-y-3" style={{ background: '#0A1A0F' }}>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Solicitação vinculada — aguardando robô</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-[10px] text-slate-500 mb-0.5">Unidade / UGR</p>
                  <p className="font-bold text-white">{solCriada.ugr_sigla}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 mb-0.5">Data do Ofício</p>
                  <p className="font-bold text-white">{dataFmt}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 mb-0.5">ND</p>
                  <p className="font-mono" style={{ color: '#5FA8E0' }}>{solCriada.nd_cod}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 mb-0.5">Valor</p>
                  <p className="font-bold" style={{ color: '#3FB07A' }}>{valorFmt}</p>
                </div>
              </div>
              {pedidoIdRes && (
                <button
                  type="button"
                  onClick={() => setShowDocModal(true)}
                  className="w-full text-xs font-bold py-2 rounded-lg cursor-pointer transition-all"
                  style={{ background: '#1E3050', color: '#5FA8E0', border: '1px solid #5FA8E033' }}
                >
                  📄 Gerar PDF / Enviar para aprovação
                </button>
              )}
            </div>
          );
        })()}

        {!solCriada && (
          <div className="px-4 py-3" style={{ background: '#0A1A0F' }}>
            <p className="text-[11px] text-slate-500">Pedido entrou na fila. Aguardando o robô processar.</p>
            {pedidoIdRes && (
              <button
                type="button"
                onClick={() => setShowDocModal(true)}
                className="mt-2 w-full text-xs font-bold py-2 rounded-lg cursor-pointer transition-all"
                style={{ background: '#1E3050', color: '#5FA8E0', border: '1px solid #5FA8E033' }}
              >
                📄 Gerar PDF / Enviar para aprovação
              </button>
            )}
          </div>
        )}

        {showDocModal && pedidoIdRes && (
          <SiscodecDocModal
            pedidoId={pedidoIdRes}
            operacao={pedidoOp}
            destaque={pedidoDest}
            pedidoNumDesc={pedidoNumRes}
            onClose={() => setShowDocModal(false)}
          />
        )}
      </div>
    );
  }

  /* ── Formulário ───────────────────────────────────────────────────────── */
  const erro = (fetcher.data as { erro?: string } | null)?.erro;

  return (
    <div className="rounded-xl overflow-hidden mb-5" style={{ border: '1px solid #1E3050' }}>
      <button
        type="button"
        onClick={() => setAberta(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
        style={{ background: '#0C1526' }}
      >
        <span className="text-xs font-bold text-white">Nova Solicitação SISCODEC</span>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#8A97AC" strokeWidth={2}
          style={{ transform: aberta ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {aberta && (
        <fetcher.Form key={formKey} method="post" action="/painel" onSubmit={handleSubmit}>
          <input type="hidden" name="intent" value="criar_pedido" />
          <input type="hidden" name="celulas" ref={celulaRef} />
          {solIdBase && <input type="hidden" name="sol_id_base" value={solIdBase} />}

          <div className="p-4 space-y-3" style={{ background: '#101C33' }}>
            {/* Nº Desc + Operação */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">Nº Desc.</label>
                <input
                  name="num_desc"
                  value={numDesc}
                  onChange={e => setNumDesc(e.target.value)}
                  placeholder={proximoNumDesc !== null ? String(proximoNumDesc) : '—'}
                  type="number"
                  min="1"
                  className="w-full text-xs rounded px-2 py-1.5 font-mono tabular-nums"
                  style={{ background: '#0C1526', border: '1px solid #1E3050', color: numDesc ? '#E0B341' : '#EAF1FB', outline: 'none' }}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">Operação</label>
                <select
                  name="operacao"
                  value={opSelecionada}
                  onChange={e => setOpSelecionada(e.target.value)}
                  className="w-full text-xs rounded px-2 py-1.5"
                  style={{ background: '#0C1526', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }}
                >
                  <option value="">— Selecionar —</option>
                  <option value="ZIDA">ZIDA</option>
                  {operacoes.map(op => <option key={op} value={op}>{op}</option>)}
                </select>
              </div>
            </div>

            {/* Usar modelo */}
            {(() => {
              const modelosFiltrados = opSelecionada
                ? modelos.filter(m => m.operacao === opSelecionada)
                : modelos;
              return modelosFiltrados.length > 0
                ? <ModeloDropdown modelos={modelosFiltrados} onAplicar={aplicarModelo} />
                : null;
            })()}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">Destaque *</label>
                <select name="destaque" required value={destaqueVal} onChange={e => setDestaqueVal(e.target.value)}
                  className="w-full text-xs rounded px-2 py-1.5"
                  style={{ background: '#0C1526', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }}>
                  <option value="Não">Não</option>
                  <option value="Sim">Sim</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">Com Entrada de Bem do Exterior?</label>
                <select name="entrada_exterior" value={entradaExteriorVal} onChange={e => setEntradaExteriorVal(e.target.value)}
                  className="w-full text-xs rounded px-2 py-1.5"
                  style={{ background: '#0C1526', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }}>
                  <option value="Não">Não</option>
                  <option value="Sim">Sim</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Obs/Descr *</label>
              <input name="obs" required value={obsVal} onChange={e => setObsVal(e.target.value)}
                placeholder="Ex: Descentralização CATRIMANI — Ago/26"
                className="w-full text-xs rounded px-2 py-1.5"
                style={{ background: '#0C1526', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }} />
            </div>

            {/* Células */}
            {celulas.length > 0 && (
              <div className="space-y-2 mt-1">
                {celulas.map((c, idx) => {
                  const meta = TIPO_COR[c.tipo];
                  return (
                    <div key={c.key} className="rounded-lg p-2.5 space-y-2"
                      style={{ background: '#0C1526', border: `1px solid ${meta.cor}33` }}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                          style={{ background: meta.bg, color: meta.cor }}>
                          {c.tipo === 'ANULACAO' ? 'ANULAÇÃO' : 'SUPLEMENTAÇÃO'} #{idx + 1}
                        </span>
                        <button type="button" onClick={() => removerCelula(c.key)}
                          className="text-slate-600 hover:text-red-400 cursor-pointer text-sm leading-none" title="Remover">×</button>
                      </div>
                      {(() => {
                        const borda = (v: string) => `1px solid ${!v.trim() ? '#E06A6A66' : '#1E3050'}`;
                        const bordaNum = (v: string) => `1px solid ${!(parseFloat(v) > 0) ? '#E06A6A66' : '#1E3050'}`;
                        return (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[9px] text-slate-600 block mb-0.5">PTRES *</label>
                            <input value={c.ptres} onChange={e => atualizarCelula(c.key, 'ptres', e.target.value)}
                              placeholder="168919" className="w-full text-xs rounded px-2 py-1 font-mono"
                              style={{ background: '#101C33', border: borda(c.ptres), color: '#EAF1FB', outline: 'none' }} />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-600 block mb-0.5">Natureza (ND) *</label>
                            <input value={c.nd} onChange={e => atualizarCelula(c.key, 'nd', e.target.value)}
                              placeholder="339039" className="w-full text-xs rounded px-2 py-1 font-mono"
                              style={{ background: '#101C33', border: borda(c.nd), color: '#EAF1FB', outline: 'none' }} />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-600 block mb-0.5">Valor (R$) *</label>
                            <input value={c.valor} onChange={e => atualizarCelula(c.key, 'valor', e.target.value)}
                              placeholder="0,00" type="number" step="0.01" min="0"
                              className="w-full text-xs rounded px-2 py-1 tabular-nums"
                              style={{ background: '#101C33', border: bordaNum(c.valor), color: '#EAF1FB', outline: 'none' }} />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-600 block mb-0.5">Esfera *</label>
                            <select value={c.esfera} onChange={e => atualizarCelula(c.key, 'esfera', e.target.value)}
                              className="w-full text-xs rounded px-2 py-1"
                              style={{ background: '#101C33', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }}>
                              <option value="1-FISCAL">1-FISCAL</option>
                              <option value="2-SEG.SOCIAL">2-SEG.SOCIAL</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-600 block mb-0.5">UG EXEC *</label>
                            <UgCombobox
                              value={c.ug_exec ?? ''}
                              onChange={cod => atualizarCelula(c.key, 'ug_exec', cod)}
                              placeholder="120002"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-600 block mb-0.5">FONTE *</label>
                            <input value={c.fonte} onChange={e => atualizarCelula(c.key, 'fonte', e.target.value)}
                              placeholder="1050000140" className="w-full text-xs rounded px-2 py-1 font-mono"
                              style={{ background: '#101C33', border: borda(c.fonte), color: '#EAF1FB', outline: 'none' }} />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-600 block mb-0.5">UG CRED *</label>
                            <UgCombobox
                              value={c.ug_cred ?? ''}
                              onChange={cod => atualizarCelula(c.key, 'ug_cred', cod)}
                              placeholder="120115"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-600 block mb-0.5">Plano Interno *</label>
                            <input value={c.plano_interno} onChange={e => atualizarCelula(c.key, 'plano_interno', e.target.value)}
                              placeholder="SF063100600" className="w-full text-xs rounded px-2 py-1 font-mono"
                              style={{ background: '#101C33', border: borda(c.plano_interno), color: '#EAF1FB', outline: 'none' }} />
                          </div>
                        </div>
                        );
                      })()}
                      <div>
                        <label className="text-[9px] text-slate-600 block mb-0.5">Obs Linha 1</label>
                        <input value={c.obs_linha1} onChange={e => atualizarCelula(c.key, 'obs_linha1', e.target.value)}
                          placeholder="Obs linha 1 (opcional)" className="w-full text-xs rounded px-2 py-1"
                          style={{ background: '#101C33', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }} />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-600 block mb-0.5">Obs Linha 2</label>
                        <input value={c.obs_linha2} onChange={e => atualizarCelula(c.key, 'obs_linha2', e.target.value)}
                          placeholder="Obs linha 2 (opcional)" className="w-full text-xs rounded px-2 py-1"
                          style={{ background: '#101C33', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }} />
                      </div>
                    </div>
                  );
                })}
                {(totalAnulacao > 0 || totalSup > 0) && (
                  <div className="space-y-1 pt-1 border-t" style={{ borderColor: '#1E3050' }}>
                    <div className="flex gap-4 text-[10px]">
                      <span style={{ color: '#E06A6A' }}>Anulações: {brl(totalAnulacao)}</span>
                      <span style={{ color: '#3FB07A' }}>Suplementações: {brl(totalSup)}</span>
                    </div>
                    {valoresNaoBatem && (
                      <p className="text-[10px] font-semibold" style={{ color: '#E06A6A' }}>
                        ✕ Os valores de anulação e suplementação precisam ser iguais ({brl(Math.abs(totalAnulacao - totalSup))} de diferença)
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => addCelula('ANULACAO')}
                className="text-xs font-semibold px-3 py-1.5 rounded cursor-pointer"
                style={{ background: '#3A1212', color: '#E06A6A', border: '1px solid #E06A6A33' }}>
                + Anulação
              </button>
              <button type="button" onClick={() => addCelula('SUPLEMENTACAO')}
                className="text-xs font-semibold px-3 py-1.5 rounded cursor-pointer"
                style={{ background: '#1B3A2B', color: '#3FB07A', border: '1px solid #3FB07A33' }}>
                + Suplementação
              </button>
              {celulas.length > 0 && (
                <button type="button" onClick={() => setCelulas([])}
                  className="text-xs text-slate-600 hover:text-slate-400 cursor-pointer ml-auto">
                  Limpar tudo
                </button>
              )}
            </div>

            {erro && <p className="text-[11px]" style={{ color: '#E06A6A' }}>{erro}</p>}
            {camposVazios && celulas.length > 0 && (
              <p className="text-[10px] font-semibold" style={{ color: '#E06A6A' }}>
                ✕ Preencha todos os campos obrigatórios (*) em cada célula
              </p>
            )}
            {planoInternoVazio && !camposVazios && celulas.length > 0 && (
              <p className="text-[10px] font-semibold" style={{ color: '#E06A6A' }}>
                ✕ Plano Interno é obrigatório em todas as células
              </p>
            )}

            {solIdBase && (
              <p className="text-[10px] px-2 py-1 rounded" style={{ background: '#3A2C0C', color: '#E0B341' }}>
                ↓ Usando solicitação como base — será marcada como Pendente ao criar
              </p>
            )}

            <button
              type="submit"
              disabled={celulas.length === 0 || valoresNaoBatem || planoInternoVazio || camposVazios || fetcher.state !== 'idle'}
              className="w-full text-xs font-bold py-2 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              style={{ background: '#1E3A6E', color: '#5FA8E0', border: '1px solid #5FA8E033' }}
            >
              {fetcher.state !== 'idle' ? 'Criando…' : `Criar solicitação (${celulas.length} ${celulas.length === 1 ? 'célula' : 'células'})`}
            </button>
          </div>
        </fetcher.Form>
      )}
    </div>
  );
}

// ── Pedido Card ────────────────────────────────────────────────────────────

function PedidoCard({ pedido, podeEditar }: { pedido: SiscodecPedido; podeEditar: boolean }) {
  const [expandido, setExpandido] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const fetcher = useFetcher<{ ok?: boolean; erro?: string }>();
  const meta = STATUS_META[pedido.status] ?? STATUS_META.PENDENTE;

  const totalAnulacao = pedido.siscodec_celulas
    .filter(c => c.tipo === 'ANULACAO')
    .reduce((s, c) => s + c.valor, 0);
  const totalSup = pedido.siscodec_celulas
    .filter(c => c.tipo === 'SUPLEMENTACAO')
    .reduce((s, c) => s + c.valor, 0);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: '#101C33', border: '1px solid #1E3050' }}
    >
      <button
        type="button"
        onClick={() => setExpandido(v => !v)}
        className="w-full px-4 py-3 flex items-start gap-3 text-left cursor-pointer hover:brightness-110 transition-all"
      >
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5"
          style={{ background: meta.bg, color: meta.cor }}
        >
          {meta.label}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white truncate">{pedido.descricao}</p>
          {pedido.operacao && (
            <p className="text-[10px] text-slate-500 truncate">{apelidoOperacao(pedido.operacao)}</p>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-xs font-bold tabular-nums" style={{ color: '#5FA8E0' }}>
            {brl(totalAnulacao)}
          </p>
          <p className="text-[10px] text-slate-600">{pedido.siscodec_celulas.length} cél.</p>
        </div>
      </button>

      {expandido && (
        <div className="border-t px-4 pb-4 space-y-3" style={{ borderColor: '#1E3050' }}>
          {/* Detalhes do cabeçalho */}
          <div className="pt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
            <p className="text-slate-500">Destaque: <span className="text-slate-300">{pedido.destaque || '—'}</span></p>
            <p className="text-slate-500">Ext. Bem: <span className="text-slate-300">{pedido.entrada_exterior || 'Não'}</span></p>
            <p className="text-slate-500">Criado: <span className="text-slate-300">{tempoAtras(pedido.criado_em)}</span></p>
            {pedido.obs && <p className="col-span-2 text-slate-500">Obs/Descr: <span className="text-slate-300">{pedido.obs}</span></p>}
            {pedido.concluido_email && (
              <p className="col-span-2 text-slate-500">
                Concluído por: <span className="text-slate-300">{pedido.concluido_email}</span>
              </p>
            )}
            {pedido.erro_msg && (
              <p className="col-span-2" style={{ color: '#E06A6A' }}>Erro: {pedido.erro_msg}</p>
            )}
          </div>

          {/* Células */}
          <div className="space-y-1">
            {[...pedido.siscodec_celulas].sort((a, b) => a.ordem - b.ordem).map(c => {
              const meta = TIPO_COR[c.tipo];
              return (
                <div key={c.id} className="flex items-center gap-2 text-[10px]">
                  <span
                    className="font-bold px-1.5 py-0.5 rounded"
                    style={{ background: meta.bg, color: meta.cor, minWidth: 60, textAlign: 'center' }}
                  >
                    {c.tipo === 'ANULACAO' ? 'ANULAÇ.' : 'SUPLEM.'}
                  </span>
                  <span className="font-mono text-slate-400">{c.ptres}</span>
                  <span className="font-mono text-slate-500">{c.nd}</span>
                  <span className="ml-auto font-bold tabular-nums" style={{ color: meta.cor }}>
                    {brl(c.valor)}
                  </span>
                </div>
              );
            })}
            {(totalAnulacao > 0 || totalSup > 0) && (
              <div className="flex gap-4 pt-2 border-t text-[10px]" style={{ borderColor: '#1A2840' }}>
                <span style={{ color: '#E06A6A' }}>Anulaç.: {brl(totalAnulacao)}</span>
                <span style={{ color: '#3FB07A' }}>Suplem.: {brl(totalSup)}</span>
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="flex items-center gap-4 flex-wrap">
            {podeEditar && pedido.status === 'PENDENTE' && (
              <fetcher.Form method="post" action="/painel">
                <input type="hidden" name="intent" value="cancelar_pedido" />
                <input type="hidden" name="pedido_id" value={pedido.id} />
                <button
                  type="submit"
                  disabled={fetcher.state !== 'idle'}
                  className="text-[10px] text-slate-600 hover:text-red-400 cursor-pointer disabled:opacity-40 transition-colors"
                >
                  {fetcher.state !== 'idle' ? 'Cancelando…' : '× Cancelar solicitação'}
                </button>
              </fetcher.Form>
            )}
            {podeEditar && (
              confirmando ? (
                <fetcher.Form method="post" action="/painel" className="flex items-center gap-2">
                  <input type="hidden" name="intent" value="excluir_pedido" />
                  <input type="hidden" name="pedido_id" value={pedido.id} />
                  <button
                    type="submit"
                    disabled={fetcher.state !== 'idle'}
                    className="text-[10px] font-semibold cursor-pointer disabled:opacity-40"
                    style={{ color: '#E06A6A' }}
                  >
                    {fetcher.state !== 'idle' ? 'Excluindo…' : 'Confirmar exclusão'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmando(false)}
                    className="text-[10px] text-slate-600 hover:text-slate-400 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </fetcher.Form>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmando(true)}
                  className="text-[10px] text-slate-600 hover:text-red-500 cursor-pointer transition-colors"
                >
                  ⌫ Excluir registro
                </button>
              )
            )}
            {fetcher.data?.erro && (
              <span className="text-[10px]" style={{ color: '#E06A6A' }}>{fetcher.data.erro}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tutorial de instalação da extensão ────────────────────────────────────

function TutorialExtensao() {
  const [aberto, setAberto] = useState(false);

  const passos = [
    { n: 1, txt: 'Clique em "Baixar extensão" acima e salve o ZIP.' },
    { n: 2, txt: 'Extraia a pasta do ZIP (ex: botão direito → Extrair aqui).' },
    { n: 3, txt: 'Abra o Chrome e acesse: chrome://extensions' },
    { n: 4, txt: 'Ative o "Modo de desenvolvedor" (chave no canto superior direito).' },
    { n: 5, txt: 'Clique em "Carregar sem compactação" e selecione a pasta extraída.' },
    { n: 6, txt: 'O ícone da extensão aparecerá na barra do Chrome. Clique nele.' },
    { n: 7, txt: 'Em "Configurações", cole a URL do app e copie o token desta página.' },
    { n: 8, txt: 'Acesse o SISCODEC, crie uma solicitação aqui e clique em "Iniciar robô".' },
  ];

  return (
    <div
      className="rounded-xl overflow-hidden mb-5"
      style={{ border: '1px solid #1E3050' }}
    >
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
        style={{ background: '#0C1526' }}
      >
        <div className="flex items-center gap-2">
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#5FA8E0" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx={12} cy={12} r={10} /><path d="M12 16v-4M12 8h.01" />
          </svg>
          <span className="text-xs font-bold text-white">Como instalar a extensão</span>
        </div>
        <svg
          width={13} height={13} viewBox="0 0 24 24" fill="none"
          stroke="#8A97AC" strokeWidth={2}
          style={{ transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {aberto && (
        <div className="px-4 pb-4 pt-3 space-y-3" style={{ background: '#101C33' }}>
          {/* Download */}
          <a
            href="/comae-siscodec-extensao.zip"
            download
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-xs font-bold transition-all"
            style={{ background: '#1B3A2B', color: '#3FB07A', border: '1px solid #3FB07A33', textDecoration: 'none' }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            Baixar extensão (.zip)
          </a>

          {/* Passos */}
          <ol className="space-y-2">
            {passos.map(p => (
              <li key={p.n} className="flex gap-3 items-start">
                <span
                  className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{ background: '#1E3050', color: '#5FA8E0' }}
                >
                  {p.n}
                </span>
                <span className="text-[11px] text-slate-400 leading-relaxed pt-0.5">{p.txt}</span>
              </li>
            ))}
          </ol>

          {/* Nota */}
          <p className="text-[10px] text-slate-600 pt-1 border-t" style={{ borderColor: '#1A2840' }}>
            A extensão funciona apenas no Google Chrome. O robô preenche o formulário mas
            <strong className="text-slate-500"> não submete automaticamente</strong> — você revisa e clica em Salvar.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Bloco de envio por email (reutilizável nos dois cards de sucesso) ─────

const EMAIL_PADRAO = 'brunobff.fab@gmail.com';

function EmailEnvio({ solId }: { solId: number }) {
  const fetcher = useFetcher();
  const [email, setEmail] = useState(EMAIL_PADRAO);
  const [editando, setEditando] = useState(false);
  const ok    = fetcher.state === 'idle' && (fetcher.data as { ok?: boolean })?.ok === true;
  const erro  = (fetcher.data as { erro?: string } | null)?.erro;

  if (ok) {
    return (
      <div className="rounded-lg px-3 py-2 text-xs font-semibold text-center"
        style={{ background: '#1B3A2B', color: '#3FB07A', border: '1px solid #3FB07A33' }}>
        ✓ Email enviado para {email}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 flex-shrink-0">Para:</span>
        {editando ? (
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onBlur={() => setEditando(false)}
            autoFocus
            className="flex-1 text-xs rounded px-2 py-1"
            style={{ background: '#0C1526', border: '1px solid #5FA8E0', color: '#EAF1FB', outline: 'none' }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="flex-1 text-left text-xs px-2 py-1 rounded cursor-pointer transition-colors"
            style={{ background: '#0C1526', color: '#5FA8E0', border: '1px solid #1E3050' }}
            title="Clique para editar o destinatário"
          >
            {email}
            <span className="ml-1.5 text-[9px] text-slate-600">✎</span>
          </button>
        )}
      </div>
      <fetcher.Form method="post" action="/painel">
        <input type="hidden" name="intent" value="enviar_solicitacao_email" />
        <input type="hidden" name="sol_id" value={solId} />
        <input type="hidden" name="destinatario" value={email} />
        <button
          type="submit"
          disabled={fetcher.state !== 'idle' || !email.includes('@')}
          className="w-full text-xs font-semibold py-2 rounded-lg cursor-pointer disabled:opacity-40 transition-all"
          style={{ background: '#1A1406', color: '#E0B341', border: '1px solid #E0B34144' }}
        >
          {fetcher.state !== 'idle' ? 'Enviando…' : '✉ Enviar para aprovação'}
        </button>
      </fetcher.Form>
      {erro && <p className="text-[11px]" style={{ color: '#E06A6A' }}>{erro}</p>}
    </div>
  );
}

// ── Formulário AUXILIAR ────────────────────────────────────────────────────

function gerarPDF(sol: SolicitacaoDesc) {
  const win = window.open('', '_blank', 'width=820,height=680');
  if (!win) return;
  const dataFmt  = new Date(`${sol.data_oficio}T00:00:00`).toLocaleDateString('pt-BR');
  const valorFmt = sol.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<title>Solicitação de Descentralização — ${sol.ugr_sigla}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;padding:48px;color:#000;font-size:12px;line-height:1.5}
.hdr{text-align:center;border-bottom:2px solid #000;padding-bottom:14px;margin-bottom:24px}
.hdr h1{font-size:14px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
.hdr p{font-size:11px;color:#555}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
.campo label{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#666;display:block;margin-bottom:3px}
.campo span{font-size:13px;font-weight:700}
.valor{font-size:20px}
.desc-box{border:1px solid #ccc;border-radius:4px;padding:12px;font-size:12px;min-height:80px;line-height:1.6}
.assinatura{margin-top:64px;text-align:center}
.assinatura .linha{border-top:1px solid #000;width:280px;margin:0 auto 8px}
.assinatura p{font-size:11px}
.btn{margin-top:24px;display:block;text-align:center}
.btn button{padding:8px 24px;background:#1a3a6e;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px}
@media print{.btn{display:none}}
</style></head><body>
<div class="hdr">
  <h1>Solicitação de Descentralização de Crédito</h1>
  <p>COMANDO DE OPERAÇÕES AEROESPACIAIS — COMAE</p>
</div>
<div class="grid">
  <div class="campo"><label>Unidade Solicitante (UGR)</label><span>${sol.ugr_sigla}</span></div>
  <div class="campo"><label>Data do Ofício</label><span>${dataFmt}</span></div>
  <div class="campo"><label>Natureza da Despesa</label><span>${sol.nd_cod} — ${sol.nd_nome}</span></div>
  <div class="campo"><label>Valor Solicitado</label><span class="valor">${valorFmt}</span></div>
</div>
<div class="campo"><label>Descrição / Justificativa</label><div class="desc-box">${sol.descricao}</div></div>
<div class="assinatura">
  <div class="linha"></div>
  <p>Seção de Descentralizações — COMAE</p>
</div>
<div class="btn"><button onclick="window.print()">🖨️ Imprimir / Salvar como PDF</button></div>
</body></html>`);
  win.document.close();
}

function SolicitacaoForm({ operacoes = [] }: { operacoes?: string[] }) {
  const fetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);
  const [ultimaSol, setUltimaSol] = useState<SolicitacaoDesc | null>(null);
  const [ultimoAviso, setUltimoAviso] = useState<string | null>(null);
  const [ugrQuery, setUgrQuery] = useState('');
  const [ugrOpen, setUgrOpen] = useState(false);
  const [ugrIdx, setUgrIdx] = useState(0);

  const ugrSugestoes = ugrQuery.length >= 1
    ? UNIDADES.filter(u => u.toLowerCase().includes(ugrQuery.toLowerCase())).slice(0, 9)
    : [];

  function selecionarUGR(u: string) {
    setUgrQuery(u);
    setUgrOpen(false);
  }

  function handleUgrKey(e: React.KeyboardEvent) {
    if (!ugrOpen || ugrSugestoes.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setUgrIdx(i => Math.min(i + 1, ugrSugestoes.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setUgrIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); selecionarUGR(ugrSugestoes[ugrIdx]); }
    else if (e.key === 'Escape') setUgrOpen(false);
  }

  useEffect(() => { setUgrIdx(0); }, [ugrQuery]);

  useEffect(() => {
    if (fetcher.state === 'idle' && (fetcher.data as { ok?: boolean })?.ok) {
      const sol = (fetcher.data as { solicitacao?: SolicitacaoDesc }).solicitacao ?? null;
      const aviso = (fetcher.data as { aviso?: string }).aviso ?? null;
      formRef.current?.reset();
      setUgrQuery('');
      setUgrOpen(false);
      setUltimaSol(sol);
      setUltimoAviso(aviso);
    }
  }, [fetcher.state, fetcher.data]);

  const erro = (fetcher.data as { erro?: string } | null)?.erro;

  if (ultimaSol) {
    const dataFmt  = new Date(`${ultimaSol.data_oficio}T00:00:00`).toLocaleDateString('pt-BR');
    const valorFmt = ultimaSol.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return (
      <div className="rounded-xl overflow-hidden mb-5" style={{ border: '1px solid #3FB07A44' }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ background: '#0D1F15' }}>
          <span className="text-xs font-bold" style={{ color: '#3FB07A' }}>✓ Solicitação registrada</span>
          <button
            type="button"
            onClick={() => { setUltimaSol(null); setUltimoAviso(null); }}
            className="text-[10px] cursor-pointer transition-colors"
            style={{ color: '#4A5B73' }}
          >
            + Nova solicitação
          </button>
        </div>
        <div className="p-4 space-y-3" style={{ background: '#0A1A0F' }}>
          {/* Aviso de duplicata */}
          {ultimoAviso && (
            <div className="rounded-lg px-3 py-2 text-[11px] font-semibold"
              style={{ background: '#3A2C0C', color: '#E0B341', border: '1px solid #E0B34133' }}>
              ⚠ {ultimoAviso}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-[10px] text-slate-500 mb-0.5">Unidade / UGR</p>
              <p className="font-bold text-white">{ultimaSol.ugr_sigla}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 mb-0.5">Data do Ofício</p>
              <p className="font-bold text-white">{dataFmt}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 mb-0.5">ND</p>
              <p className="font-mono" style={{ color: '#5FA8E0' }}>{ultimaSol.nd_cod}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 mb-0.5">Valor</p>
              <p className="font-bold" style={{ color: '#3FB07A' }}>{valorFmt}</p>
            </div>
          </div>
          {ultimaSol.operacao && (
            <div>
              <p className="text-[10px] text-slate-500 mb-0.5">Operação</p>
              <p className="text-xs text-slate-400">{ultimaSol.operacao}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] text-slate-500 mb-0.5">Descrição</p>
            <p className="text-xs text-slate-400 leading-relaxed">{ultimaSol.descricao}</p>
          </div>

          {/* Ações */}
          <button
            type="button"
            onClick={() => gerarPDF(ultimaSol)}
            className="w-full text-xs font-semibold py-2 rounded-lg cursor-pointer transition-all"
            style={{ background: '#1E3050', color: '#5FA8E0', border: '1px solid #5FA8E033' }}
          >
            🖨️ Imprimir / PDF
          </button>
          <EmailEnvio solId={ultimaSol.id} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden mb-5" style={{ border: '1px solid #1E3050' }}>
      <div className="px-4 py-3" style={{ background: '#0C1526' }}>
        <span className="text-xs font-bold text-white">Nova Solicitação</span>
      </div>
      <fetcher.Form method="post" action="/painel" ref={formRef}>
        <input type="hidden" name="intent" value="criar_solicitacao" />
        <div className="p-4 space-y-3" style={{ background: '#101C33' }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Data do Ofício *</label>
              <input
                type="date"
                name="data_oficio"
                required
                className="w-full text-xs rounded px-2 py-1.5"
                style={{ background: '#0C1526', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }}
              />
            </div>
            <div className="relative">
              <label className="text-[10px] text-slate-500 block mb-1">Unidade / UGR *</label>
              <input
                name="ugr_sigla"
                required
                value={ugrQuery}
                autoComplete="off"
                placeholder="Pesquisar unidade..."
                onChange={e => { setUgrQuery(e.target.value); setUgrOpen(true); }}
                onFocus={() => { if (ugrQuery) setUgrOpen(true); }}
                onBlur={() => setTimeout(() => setUgrOpen(false), 150)}
                onKeyDown={handleUgrKey}
                className="w-full text-xs rounded px-2 py-1.5"
                style={{ background: '#0C1526', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }}
              />
              {ugrOpen && ugrSugestoes.length > 0 && (
                <div
                  className="absolute z-50 w-full mt-0.5 rounded-lg overflow-y-auto"
                  style={{ background: '#0C1526', border: '1px solid #1E3050', top: '100%', maxHeight: '180px', boxShadow: '0 8px 24px #00000066' }}
                >
                  {ugrSugestoes.map((u, i) => (
                    <div
                      key={u}
                      onMouseDown={() => selecionarUGR(u)}
                      onMouseEnter={() => setUgrIdx(i)}
                      className="px-3 py-2 text-xs cursor-pointer"
                      style={i === ugrIdx
                        ? { background: '#1E3050', color: '#EAF1FB' }
                        : { color: '#8A97AC' }}
                    >
                      {u}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-500 block mb-1">ND (código) *</label>
            <input
              name="nd_cod"
              required
              placeholder="339030"
              className="w-full text-xs rounded px-2 py-1 font-mono"
              style={{ background: '#0C1526', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }}
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-500 block mb-1">Valor (R$) *</label>
            <input
              type="number"
              name="valor"
              required
              min="0.01"
              step="0.01"
              placeholder="0,00"
              className="w-full text-xs rounded px-2 py-1.5 tabular-nums"
              style={{ background: '#0C1526', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }}
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-500 block mb-1">Descrição *</label>
            <textarea
              name="descricao"
              required
              rows={3}
              placeholder="Motivo da solicitação de descentralização..."
              className="w-full text-xs rounded px-2 py-1.5 resize-none"
              style={{ background: '#0C1526', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }}
            />
          </div>

          {operacoes.length > 0 && (
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Operação (opcional)</label>
              <select
                name="operacao"
                className="w-full text-xs rounded px-2 py-1.5"
                style={{ background: '#0C1526', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }}
              >
                <option value="">— Sem operação —</option>
                {operacoes.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
            </div>
          )}

          {erro && <p className="text-[11px]" style={{ color: '#E06A6A' }}>{erro}</p>}

          <button
            type="submit"
            disabled={fetcher.state !== 'idle'}
            className="w-full text-xs font-bold py-2 rounded-lg cursor-pointer disabled:opacity-40 transition-all"
            style={{ background: '#1E3A6E', color: '#5FA8E0', border: '1px solid #5FA8E033' }}
          >
            {fetcher.state !== 'idle' ? 'Registrando…' : 'Registrar Solicitação'}
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}

// ── Fila de solicitações (para ADEZ/CMT/DEV) ──────────────────────────────

function SolicitacoesQueue({ solicitacoes, onUsar }: { solicitacoes: SolicitacaoDesc[]; onUsar: (sol: SolicitacaoDesc) => void }) {
  const [aberta, setAberta] = useState(true);
  const [atendidaAberta, setAtendidaAberta] = useState(false);
  const [confirmandoDel, setConfirmandoDel] = useState<number | null>(null);
  const fetcher = useFetcher();
  const pendentes  = solicitacoes.filter(s => s.status === 'AGUARDANDO');
  const atendidas  = solicitacoes.filter(s => s.status === 'ATENDIDA');

  if (pendentes.length === 0 && atendidas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2">
        <p className="text-slate-600 text-sm">Nenhuma solicitação aguardando.</p>
      </div>
    );
  }

  function SolCard({ sol }: { sol: SolicitacaoDesc }) {
    const isPendente = sol.status === 'AGUARDANDO';
    return (
      <div className="rounded-lg p-3" style={{ background: isPendente ? '#1A1608' : '#0D1A12', border: `1px solid ${isPendente ? '#E0B34122' : '#3FB07A22'}` }}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className="text-[11px] font-bold text-white">{sol.ugr_sigla}</span>
          <span className="text-xs font-bold tabular-nums flex-shrink-0" style={{ color: isPendente ? '#E0B341' : '#3FB07A' }}>{brl(sol.valor)}</span>
        </div>
        <p className="text-[10px] text-slate-400 mb-1 line-clamp-2">{sol.descricao}</p>
        {sol.operacao && (
          <p className="text-[10px] mb-0.5" style={{ color: '#5FA8E0' }}>{sol.operacao}</p>
        )}
        <p className="text-[10px] mb-2" style={{ color: '#4A5B73' }}>
          <span className="font-mono">{sol.nd_cod}</span>
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {isPendente && (
            <>
              <button
                type="button"
                onClick={() => onUsar(sol)}
                className="text-[10px] font-semibold px-2 py-1 rounded cursor-pointer"
                style={{ background: '#3A2C0C', color: '#E0B341', border: '1px solid #E0B34133' }}
              >
                ↓ Usar como base
              </button>
              <fetcher.Form method="post" action="/painel">
                <input type="hidden" name="intent" value="atender_solicitacao" />
                <input type="hidden" name="sol_id" value={sol.id} />
                <button
                  type="submit"
                  disabled={fetcher.state !== 'idle'}
                  className="text-[10px] font-semibold px-2 py-1 rounded cursor-pointer disabled:opacity-40"
                  style={{ background: '#1B3A2B', color: '#3FB07A', border: '1px solid #3FB07A33' }}
                >
                  ✓ Atendida
                </button>
              </fetcher.Form>
            </>
          )}
          {confirmandoDel === sol.id ? (
            <div className="flex items-center gap-1 ml-auto">
              <fetcher.Form method="post" action="/painel">
                <input type="hidden" name="intent" value="excluir_solicitacao" />
                <input type="hidden" name="sol_id" value={sol.id} />
                <button
                  type="submit"
                  disabled={fetcher.state !== 'idle'}
                  className="text-[10px] font-semibold px-2 py-1 rounded cursor-pointer"
                  style={{ background: '#5A1212', color: '#E06A6A', border: '1px solid #E06A6A33' }}
                >
                  Confirmar exclusão
                </button>
              </fetcher.Form>
              <button type="button" onClick={() => setConfirmandoDel(null)}
                className="text-[10px] text-slate-600 hover:text-slate-400 cursor-pointer">cancelar</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmandoDel(sol.id)}
              className="text-[10px] text-slate-700 hover:text-red-400 cursor-pointer ml-auto">excluir</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 mb-5">
      {/* Pendentes */}
      {pendentes.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E0B34144' }}>
          <button
            type="button"
            onClick={() => setAberta(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
            style={{ background: '#1A1406' }}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ background: '#3A2C0C', color: '#E0B341' }}
              >
                {pendentes.length}
              </span>
              <span className="text-xs font-bold" style={{ color: '#E0B341' }}>Aguardando Atendimento</span>
            </div>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#E0B341" strokeWidth={2}
              style={{ transform: aberta ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {aberta && (
            <div className="p-3 space-y-2" style={{ background: '#100E04' }}>
              {pendentes.map(sol => <SolCard key={sol.id} sol={sol} />)}
            </div>
          )}
        </div>
      )}

      {/* Atendidas */}
      {atendidas.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #3FB07A33' }}>
          <button
            type="button"
            onClick={() => setAtendidaAberta(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
            style={{ background: '#0A1810' }}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ background: '#1B3A2B', color: '#3FB07A' }}
              >
                {atendidas.length}
              </span>
              <span className="text-xs font-bold" style={{ color: '#3FB07A' }}>Atendidas</span>
            </div>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#3FB07A" strokeWidth={2}
              style={{ transform: atendidaAberta ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {atendidaAberta && (
            <div className="p-3 space-y-2" style={{ background: '#080F0A' }}>
              {atendidas.map(sol => <SolCard key={sol.id} sol={sol} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Painel direito AUXILIAR ────────────────────────────────────────────────

function AuxiliarPainel({ solicitacoes, podeAtender }: { solicitacoes: SolicitacaoDesc[]; podeAtender?: boolean }) {
  const [filtro, setFiltro] = useState<string>('AGUARDANDO');
  const fetcher = useFetcher();

  const grupos: Record<string, SolicitacaoDesc[]> = {
    AGUARDANDO: solicitacoes.filter(s => s.status === 'AGUARDANDO'),
    SOLICITADA: solicitacoes.filter(s => s.status === 'SOLICITADA'),
    ATENDIDA:   solicitacoes.filter(s => s.status === 'ATENDIDA'),
    CANCELADA:  solicitacoes.filter(s => s.status === 'CANCELADA'),
  };

  const filtradas = grupos[filtro] ?? [];

  return (
    <div>
      <div className="flex gap-1 mb-4 flex-wrap">
        {Object.entries(SOL_STATUS_META).map(([status, meta]) => {
          const count = grupos[status]?.length ?? 0;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setFiltro(status)}
              className="text-[10px] font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-all"
              style={filtro === status
                ? { background: meta.bg, color: meta.cor, border: `1px solid ${meta.cor}44` }
                : { background: '#101C33', color: '#8A97AC', border: '1px solid #1E3050' }}
            >
              {meta.label} {count > 0 && `(${count})`}
            </button>
          );
        })}
      </div>

      {filtradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48">
          <p className="text-slate-600 text-sm">Nenhuma solicitação {SOL_STATUS_META[filtro]?.label.toLowerCase()}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtradas.map(sol => {
            const meta = SOL_STATUS_META[sol.status] ?? SOL_STATUS_META.AGUARDANDO;
            return (
              <div key={sol.id} className="rounded-xl p-4" style={{ background: '#101C33', border: '1px solid #1E3050' }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: meta.bg, color: meta.cor }}
                    >
                      {meta.label}
                    </span>
                    <span className="text-xs font-semibold text-white">{sol.ugr_sigla}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 flex-shrink-0">
                    Ofício: {new Date(sol.data_oficio + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mb-2">{sol.descricao}</p>
                {sol.operacao && (
                  <p className="text-[10px] mb-1" style={{ color: '#5FA8E0' }}>{sol.operacao}</p>
                )}
                <div className="flex items-center gap-3 text-[10px] text-slate-500">
                  <span>ND: <span className="font-mono text-slate-400">{sol.nd_cod}</span></span>
                  <span className="ml-auto font-bold tabular-nums" style={{ color: '#5FA8E0' }}>{brl(sol.valor)}</span>
                </div>
                {sol.status === 'AGUARDANDO' && (
                  <fetcher.Form method="post" action="/painel" className="mt-3">
                    <input type="hidden" name="intent" value={podeAtender ? 'atender_solicitacao' : 'cancelar_solicitacao'} />
                    <input type="hidden" name="sol_id" value={sol.id} />
                    <button
                      type="submit"
                      disabled={fetcher.state !== 'idle'}
                      className={podeAtender
                        ? 'text-[10px] font-semibold px-2 py-1 rounded cursor-pointer disabled:opacity-40'
                        : 'text-[10px] text-slate-600 hover:text-red-400 cursor-pointer disabled:opacity-40 transition-colors'}
                      style={podeAtender ? { background: '#1B3A2B', color: '#3FB07A', border: '1px solid #3FB07A33' } : {}}
                    >
                      {podeAtender ? '✓ Marcar como Atendida' : '× Cancelar solicitação'}
                    </button>
                  </fetcher.Form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Modelos ──────────────────────────────────────────────────────────────────

function ModeloDropdown({ modelos, onAplicar }: { modelos: SiscodecModelo[]; onAplicar: (m: SiscodecModelo) => void }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setAberto(v => !v)}
        className="text-xs px-3 py-1.5 rounded cursor-pointer w-full text-left"
        style={{ background: '#0C1526', border: '1px solid #2A4A7A', color: '#5FA8E0' }}>
        Usar modelo…
      </button>
      {aberto && (
        <div style={{ position: 'absolute', zIndex: 50, top: '100%', left: 0, right: 0, background: '#0D1B2E', border: '1px solid #1E3050', borderRadius: 4, maxHeight: 200, overflowY: 'auto' }}>
          {modelos.map(m => (
            <button key={m.id} type="button"
              onClick={() => { onAplicar(m); setAberto(false); }}
              className="w-full text-left px-3 py-2 text-xs cursor-pointer"
              style={{ borderBottom: '1px solid #1A2840', color: '#EAF1FB', background: 'transparent' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#1A3050'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
              <span className="font-semibold">{m.operacao}</span>
              {m.criado_por_nome && <span className="text-slate-500 ml-2 text-[10px]">por {m.criado_por_nome}</span>}
              {m.celulas.length > 0 && <span className="text-slate-600 ml-1 text-[10px]">· {m.celulas.length} células</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type ModeloCelulaFormState = {
  key: string;
  tipo: 'ANULACAO' | 'SUPLEMENTACAO';
  ptres: string;
  nd: string;
  ug_exec: string;
  esfera: string;
  fonte: string;
  plano_interno: string;
  ug_cred: string;
  obs_linha1: string;
  obs_linha2: string;
};

const TIPO_COR_MOD = {
  ANULACAO:      { cor: '#E06A6A', bg: '#3A1212' },
  SUPLEMENTACAO: { cor: '#3FB07A', bg: '#1B3A2B' },
};

function ModeloFormInline({
  operacoes,
  modelo,
  onDismiss,
}: {
  operacoes: string[];
  modelo?: SiscodecModelo;
  onDismiss: () => void;
}) {
  const fetcher = useFetcher();
  const celulaRef = useRef<HTMLInputElement>(null);
  const [operacao, setOperacao] = useState(modelo?.operacao ?? '');
  const [obs, setObs] = useState(modelo?.obs ?? '');
  const [destaque, setDestaque] = useState(modelo?.destaque ?? 'Não');
  const [entradaExterior, setEntradaExterior] = useState(modelo?.entrada_exterior ?? 'Não');
  const [celulas, setCelulas] = useState<ModeloCelulaFormState[]>(() =>
    (modelo?.celulas ?? []).map(c => ({ key: crypto.randomUUID(), ...c }))
  );
  const isEditing = !!modelo;
  const sucesso = fetcher.state === 'idle' && (fetcher.data as { ok?: boolean })?.ok === true;

  useEffect(() => { if (sucesso) onDismiss(); }, [sucesso, onDismiss]);

  function addCelula(tipo: 'ANULACAO' | 'SUPLEMENTACAO') {
    setCelulas(prev => [...prev, {
      key: crypto.randomUUID(), tipo, ptres: '', nd: '', ug_exec: '',
      esfera: '1-FISCAL', fonte: '', plano_interno: '', ug_cred: '', obs_linha1: '', obs_linha2: '',
    }]);
  }
  function removerCelula(key: string) { setCelulas(prev => prev.filter(c => c.key !== key)); }
  function atualizarCelula(key: string, field: keyof Omit<ModeloCelulaFormState, 'key' | 'tipo'>, value: string) {
    setCelulas(prev => prev.map(c => c.key !== key ? c : { ...c, [field]: value }));
  }
  function handleSubmit() {
    if (celulaRef.current) {
      celulaRef.current.value = JSON.stringify(
        celulas.map(c => ({
          tipo: c.tipo, ptres: c.ptres.trim(), nd: c.nd.trim(),
          ug_exec: c.ug_exec.trim() || null, esfera: c.esfera || null,
          fonte: c.fonte.trim() || null, plano_interno: c.plano_interno.trim() || null,
          ug_cred: c.ug_cred.trim() || null,
          obs_linha1: c.obs_linha1.trim() || null, obs_linha2: c.obs_linha2.trim() || null,
        }))
      );
    }
  }

  return (
    <div className="rounded-xl overflow-hidden mb-3" style={{ border: '1px solid #2A4A7A', background: '#080F1F' }}>
      <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: '#0A1628', borderBottom: '1px solid #1E3050' }}>
        <span className="text-xs font-bold" style={{ color: '#5FA8E0' }}>{isEditing ? 'Editar Modelo' : 'Novo Modelo'}</span>
        <button type="button" onClick={onDismiss} className="text-slate-600 hover:text-slate-400 cursor-pointer text-sm leading-none">×</button>
      </div>
      <fetcher.Form method="post" action="/painel" onSubmit={handleSubmit}>
        <input type="hidden" name="intent" value={isEditing ? 'editar_modelo' : 'criar_modelo'} />
        {isEditing && <input type="hidden" name="modelo_id" value={modelo.id} />}
        <input type="hidden" name="celulas_modelo" ref={celulaRef} />
        <div className="p-4 space-y-3">
          <div>
            <label className="text-[10px] text-slate-500 block mb-1">Operação *</label>
            <select name="operacao" required value={operacao} onChange={e => setOperacao(e.target.value)}
              className="w-full text-xs rounded px-2 py-1.5"
              style={{ background: '#0C1526', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }}>
              <option value="">— Selecionar —</option>
              <option value="ZIDA">ZIDA</option>
              {operacoes.map(op => <option key={op} value={op}>{op}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Destaque</label>
              <select name="destaque" value={destaque} onChange={e => setDestaque(e.target.value)}
                className="w-full text-xs rounded px-2 py-1.5"
                style={{ background: '#0C1526', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }}>
                <option value="Não">Não</option>
                <option value="Sim">Sim</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Entrada de Bem do Exterior?</label>
              <select name="entrada_exterior" value={entradaExterior} onChange={e => setEntradaExterior(e.target.value)}
                className="w-full text-xs rounded px-2 py-1.5"
                style={{ background: '#0C1526', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }}>
                <option value="Não">Não</option>
                <option value="Sim">Sim</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 block mb-1">Obs/Descr (opcional)</label>
            <input name="obs" value={obs} onChange={e => setObs(e.target.value)}
              placeholder="Deixe vazio se varia por solicitação"
              className="w-full text-xs rounded px-2 py-1.5"
              style={{ background: '#0C1526', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }} />
          </div>

          {celulas.length > 0 && (
            <div className="space-y-2">
              {celulas.map((c, idx) => {
                const meta = TIPO_COR_MOD[c.tipo];
                return (
                  <div key={c.key} className="rounded-lg p-2.5 space-y-2"
                    style={{ background: '#0C1526', border: `1px solid ${meta.cor}33` }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                        style={{ background: meta.bg, color: meta.cor }}>
                        {c.tipo === 'ANULACAO' ? 'ANULAÇÃO' : 'SUPLEMENTAÇÃO'} #{idx + 1}
                      </span>
                      <button type="button" onClick={() => removerCelula(c.key)}
                        className="text-slate-600 hover:text-red-400 cursor-pointer text-sm leading-none">×</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] text-slate-500 block mb-0.5">PTRES</label>
                        <input value={c.ptres} onChange={e => atualizarCelula(c.key, 'ptres', e.target.value)}
                          placeholder="" className="w-full text-[11px] rounded px-1.5 py-1 font-mono"
                          style={{ background: '#080F1F', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }} />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-500 block mb-0.5">ND (vazio = variável)</label>
                        <input value={c.nd} onChange={e => atualizarCelula(c.key, 'nd', e.target.value)}
                          placeholder="Ex: 339015" className="w-full text-[11px] rounded px-1.5 py-1 font-mono"
                          style={{ background: '#080F1F', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }} />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-500 block mb-0.5">UG Exec</label>
                        <UgCombobox value={c.ug_exec} onChange={v => atualizarCelula(c.key, 'ug_exec', v)} placeholder="UG Executora" />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-500 block mb-0.5">Esfera</label>
                        <select value={c.esfera} onChange={e => atualizarCelula(c.key, 'esfera', e.target.value)}
                          className="w-full text-[11px] rounded px-1.5 py-1"
                          style={{ background: '#080F1F', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }}>
                          <option value="1-FISCAL">1-FISCAL</option>
                          <option value="2-SEGURIDADE">2-SEGURIDADE</option>
                          <option value="3-INVESTIMENTO">3-INVESTIMENTO</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-500 block mb-0.5">Fonte</label>
                        <input value={c.fonte} onChange={e => atualizarCelula(c.key, 'fonte', e.target.value)}
                          placeholder="" className="w-full text-[11px] rounded px-1.5 py-1 font-mono"
                          style={{ background: '#080F1F', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }} />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-500 block mb-0.5">Plano Interno (PI)</label>
                        <input value={c.plano_interno} onChange={e => atualizarCelula(c.key, 'plano_interno', e.target.value)}
                          placeholder="" className="w-full text-[11px] rounded px-1.5 py-1 font-mono"
                          style={{ background: '#080F1F', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[9px] text-slate-500 block mb-0.5">UG Cred</label>
                        <UgCombobox value={c.ug_cred} onChange={v => atualizarCelula(c.key, 'ug_cred', v)} placeholder="UG Credora" />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-500 block mb-0.5">Obs linha 1</label>
                        <input value={c.obs_linha1} onChange={e => atualizarCelula(c.key, 'obs_linha1', e.target.value)}
                          className="w-full text-[11px] rounded px-1.5 py-1"
                          style={{ background: '#080F1F', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }} />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-500 block mb-0.5">Obs linha 2</label>
                        <input value={c.obs_linha2} onChange={e => atualizarCelula(c.key, 'obs_linha2', e.target.value)}
                          className="w-full text-[11px] rounded px-1.5 py-1"
                          style={{ background: '#080F1F', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={() => addCelula('ANULACAO')}
              className="text-[11px] px-2 py-1.5 rounded cursor-pointer"
              style={{ background: '#3A1212', color: '#E06A6A', border: '1px solid #E06A6A33' }}>
              + Anulação
            </button>
            <button type="button" onClick={() => addCelula('SUPLEMENTACAO')}
              className="text-[11px] px-2 py-1.5 rounded cursor-pointer"
              style={{ background: '#1B3A2B', color: '#3FB07A', border: '1px solid #3FB07A33' }}>
              + Suplementação
            </button>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={!operacao || fetcher.state !== 'idle'}
              className="text-xs font-semibold px-3 py-1.5 rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: '#0A2040', color: '#5FA8E0', border: '1px solid #5FA8E033' }}>
              {fetcher.state !== 'idle' ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Salvar modelo'}
            </button>
            <button type="button" onClick={onDismiss}
              className="text-xs px-3 py-1.5 rounded cursor-pointer"
              style={{ color: '#8A97AC' }}>
              Cancelar
            </button>
          </div>
        </div>
      </fetcher.Form>
    </div>
  );
}

function ModelosSection({
  modelos,
  operacoes,
  perfil,
  semToggle,
}: {
  modelos: SiscodecModelo[];
  operacoes: string[];
  perfil: string;
  semToggle?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [criando, setCriando] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const deleteFetcher = useFetcher();
  const canManage = ['ADEZ', 'CMT', 'DEV'].includes(perfil);

  return (
    <div className={semToggle ? '' : 'mb-4 rounded-xl overflow-hidden'} style={semToggle ? {} : { border: '1px solid #1E3050' }}>
      {!semToggle && (
        <button type="button" onClick={() => setAberto(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer"
          style={{ background: '#0C1526' }}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-300">Modelos de Solicitação</span>
            {modelos.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ background: '#1A3050', color: '#5FA8E0' }}>{modelos.length}</span>
            )}
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4A5B73" strokeWidth="2"
            style={{ transform: aberto ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}

      {(aberto || semToggle) && (
        <div style={{ background: '#080F1F' }}>
          {canManage && !criando && editandoId === null && (
            <div className="px-4 pt-3">
              <button type="button" onClick={() => setCriando(true)}
                className="text-xs px-3 py-1.5 rounded cursor-pointer"
                style={{ background: '#0A2040', color: '#5FA8E0', border: '1px solid #5FA8E033' }}>
                + Novo Modelo
              </button>
            </div>
          )}
          {criando && (
            <div className="p-4">
              <ModeloFormInline operacoes={operacoes} onDismiss={() => setCriando(false)} />
            </div>
          )}
          {modelos.length === 0 && !criando ? (
            <p className="text-[10px] text-slate-600 px-4 py-3">Nenhum modelo criado ainda.</p>
          ) : (
            <div className="p-4 pt-2 space-y-2">
              {modelos.map(m => (
                <div key={m.id}>
                  {editandoId === m.id ? (
                    <ModeloFormInline operacoes={operacoes} modelo={m} onDismiss={() => setEditandoId(null)} />
                  ) : (
                    <div className="rounded-lg px-3 py-2.5 flex items-start justify-between gap-2"
                      style={{ background: '#0C1526', border: '1px solid #1E3050' }}>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white">{m.operacao}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5">
                          {m.celulas.length} célula{m.celulas.length !== 1 ? 's' : ''}
                          {m.celulas.find(c => c.ptres) && ` · PTRES: ${m.celulas.find(c => c.ptres)?.ptres}`}
                          {m.celulas.find(c => c.plano_interno) && ` · PI: ${m.celulas.find(c => c.plano_interno)?.plano_interno}`}
                        </p>
                        {m.criado_por_nome && (
                          <p className="text-[9px] text-slate-600 mt-0.5">
                            por {m.criado_por_nome} · {new Date(m.criado_em).toLocaleDateString('pt-BR')}
                          </p>
                        )}
                      </div>
                      {canManage && (
                        <div className="flex gap-1 flex-shrink-0">
                          <button type="button" onClick={() => setEditandoId(m.id)}
                            className="text-[10px] px-2 py-1 rounded cursor-pointer"
                            style={{ color: '#5FA8E0', border: '1px solid #5FA8E033' }}>
                            Editar
                          </button>
                          <deleteFetcher.Form method="post" action="/painel">
                            <input type="hidden" name="intent" value="excluir_modelo" />
                            <input type="hidden" name="modelo_id" value={m.id} />
                            <button type="submit"
                              className="text-[10px] px-2 py-1 rounded cursor-pointer"
                              style={{ color: '#E06A6A', border: '1px solid #E06A6A33' }}>
                              Excluir
                            </button>
                          </deleteFetcher.Form>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main View ──────────────────────────────────────────────────────────────

type Props = {
  pedidos: SiscodecPedido[];
  apiToken: string;
  opcoes: { operacoes: string[] };
  podeEditar: boolean;
  solicitacoes: SolicitacaoDesc[];
  perfil: string;
  proximoNumDesc: number | null;
  modelos: SiscodecModelo[];
};

export function SiscodecView({ pedidos, apiToken, opcoes, podeEditar, solicitacoes, perfil, proximoNumDesc, modelos }: Props) {
  const [filtro, setFiltro] = useState<string>('PENDENTE');
  const [preFill, setPreFill] = useState<PreFillData | null>(null);
  const [preFillKey, setPreFillKey] = useState(0);
  const [preFillSolId, setPreFillSolId] = useState<number | null>(null);
  const [abaRight, setAbaRight] = useState<'pedidos' | 'solicitacoes' | 'modelos'>('pedidos');
  const [textoBusca, setTextoBusca] = useState('');
  const [ndBusca, setNdBusca] = useState('');

  const grupos = {
    PENDENTE:     pedidos.filter(p => p.status === 'PENDENTE'),
    EM_ANDAMENTO: pedidos.filter(p => p.status === 'EM_ANDAMENTO'),
    CONCLUIDO:    pedidos.filter(p => p.status === 'CONCLUIDO'),
    ERRO:         pedidos.filter(p => p.status === 'ERRO'),
    CANCELADO:    pedidos.filter(p => p.status === 'CANCELADO'),
  };

  const filtradosBase = grupos[filtro as keyof typeof grupos] ?? [];
  const filtrados = filtradosBase.filter(p => {
    if (textoBusca.trim()) {
      const q = textoBusca.trim().toLowerCase();
      const matchDescricao = p.descricao.toLowerCase().includes(q);
      const matchNumDesc   = p.num_desc !== undefined && p.num_desc !== null && String(p.num_desc).includes(q);
      if (!matchDescricao && !matchNumDesc) return false;
    }
    if (ndBusca.trim()) {
      const q = ndBusca.trim().toLowerCase();
      if (!p.siscodec_celulas.some(c => c.nd.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  function handleUsarSolicitacao(sol: SolicitacaoDesc) {
    const ugr_cod = LISTA_UGS.find(u => u.sigla === sol.ugr_sigla)?.cod ?? '';
    setPreFill({
      descricao: `Desc. ${sol.ugr_sigla} — ${sol.descricao}`,
      nd: sol.nd_cod,
      valor: sol.valor,
      operacao: sol.operacao ?? '',
      ugr_sigla: sol.ugr_sigla,
      ugr_cod,
    });
    setPreFillSolId(sol.id);
    setPreFillKey(k => k + 1);
  }

  if (perfil === 'AUXILIAR') {
    return (
      <div>
        <div className="px-5 py-4 border-b" style={{ background: '#080F1F', borderColor: '#1E3050' }}>
          <h2 className="text-sm font-bold text-white mb-0.5">Solicitações de Descentralização</h2>
          <p className="text-[10px] text-slate-500">Registre as solicitações recebidas por ofício das unidades.</p>
        </div>
        <div className="grid grid-cols-[340px_1fr] h-[calc(100vh-73px)]">
          <div className="overflow-y-auto p-4 border-r" style={{ borderColor: '#1E3050', background: '#080F1F' }}>
            <SolicitacaoForm operacoes={opcoes.operacoes} />
          </div>
          <div className="overflow-y-auto p-4">
            <AuxiliarPainel solicitacoes={solicitacoes} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div
        className="px-5 py-4 border-b"
        style={{ background: '#080F1F', borderColor: '#1E3050' }}
      >
        <h2 className="text-sm font-bold text-white mb-0.5">SISCODEC — Robô de Descentralização</h2>
        <p className="text-[10px] text-slate-500">
          Crie as solicitações aqui e use a extensão para preencher automaticamente no SISCODEC.
        </p>
      </div>

      <div className="grid grid-cols-[340px_1fr] h-[calc(100vh-73px)]">
        {/* Painel esquerdo: token + tutorial + criar */}
        <div
          className="overflow-y-auto p-4 border-r"
          style={{ borderColor: '#1E3050', background: '#080F1F' }}
        >
          <TokenSection apiToken={apiToken} />
          <TutorialExtensao />
          <CriarPedidoForm key={preFillKey} operacoes={opcoes.operacoes} initialData={preFill} solIdBase={preFillSolId} proximoNumDesc={proximoNumDesc} modelos={modelos} />
        </div>

        {/* Painel direito */}
        <div className="overflow-y-auto p-4">
          {/* Main tabs: Pedidos SISCODEC | Levantamento Operações */}
          <div className="flex gap-2 mb-4 pb-3 border-b" style={{ borderColor: '#1E3050' }}>
            <button
              type="button"
              onClick={() => setAbaRight('pedidos')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-all"
              style={abaRight === 'pedidos'
                ? { background: '#1E3050', color: '#EAF1FB', border: '1px solid #5FA8E044' }
                : { background: 'transparent', color: '#4A5B73', border: '1px solid #1E3050' }}
            >
              Pedidos SISCODEC
            </button>
            <button
              type="button"
              onClick={() => setAbaRight('solicitacoes')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-all"
              style={abaRight === 'solicitacoes'
                ? { background: '#3A2C0C', color: '#E0B341', border: '1px solid #E0B34144' }
                : { background: 'transparent', color: '#4A5B73', border: '1px solid #1E3050' }}
            >
              Levantamento Operações
            </button>
            <button
              type="button"
              onClick={() => setAbaRight('modelos')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-all"
              style={abaRight === 'modelos'
                ? { background: '#0A2040', color: '#5FA8E0', border: '1px solid #5FA8E044' }
                : { background: 'transparent', color: '#4A5B73', border: '1px solid #1E3050' }}
            >
              Modelos de Solicitação
              {modelos.length > 0 && (
                <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded-full"
                  style={{ background: '#1A3050', color: '#5FA8E0' }}>{modelos.length}</span>
              )}
            </button>
          </div>

          {abaRight === 'pedidos' && (
            <>
              {/* Filtros de texto e ND */}
              <div className="flex gap-2 mb-3">
                <input
                  value={textoBusca}
                  onChange={e => setTextoBusca(e.target.value)}
                  placeholder="Buscar descrição ou nº desc..."
                  className="text-xs rounded px-2 py-1.5 flex-1"
                  style={{ background: '#080F1F', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }}
                />
                <input
                  value={ndBusca}
                  onChange={e => setNdBusca(e.target.value)}
                  placeholder="Filtrar ND..."
                  className="text-xs rounded px-2 py-1.5 w-28"
                  style={{ background: '#080F1F', border: '1px solid #1E3050', color: '#EAF1FB', outline: 'none' }}
                />
              </div>

              {/* Filtro tabs — "Aguardando" especial + status de pedido */}
              <div className="flex gap-1 mb-4 flex-wrap">
                {/* Aguardando — solicitações que ainda não viraram pedido */}
                {(() => {
                  const count = solicitacoes.filter(s => s.status === 'AGUARDANDO').length;
                  const ativo = filtro === 'AGUARDANDO';
                  return (
                    <button
                      key="AGUARDANDO"
                      type="button"
                      onClick={() => setFiltro('AGUARDANDO')}
                      className="text-[10px] font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-all flex items-center gap-1.5"
                      style={ativo
                        ? { background: '#3A2C0C', color: '#E0B341', border: '1px solid #E0B34144' }
                        : { background: '#101C33', color: '#8A97AC', border: '1px solid #1E3050' }}
                    >
                      Aguardando {count > 0 && `(${count})`}
                    </button>
                  );
                })()}
                {Object.entries(STATUS_META).map(([status, meta]) => {
                  const count = grupos[status as keyof typeof grupos]?.length ?? 0;
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setFiltro(status)}
                      className="text-[10px] font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                      style={filtro === status
                        ? { background: meta.bg, color: meta.cor, border: `1px solid ${meta.cor}44` }
                        : { background: '#101C33', color: '#8A97AC', border: '1px solid #1E3050' }
                      }
                    >
                      {meta.label} {count > 0 && `(${count})`}
                    </button>
                  );
                })}
              </div>

              {filtro === 'AGUARDANDO' ? (
                <SolicitacoesQueue solicitacoes={solicitacoes} onUsar={handleUsarSolicitacao} />
              ) : filtrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-2">
                  <p className="text-slate-600 text-sm">Nenhum pedido {STATUS_META[filtro]?.label.toLowerCase()}.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtrados.map(p => (
                    <PedidoCard key={p.id} pedido={p} podeEditar={podeEditar} />
                  ))}
                </div>
              )}
            </>
          )}

          {abaRight === 'solicitacoes' && (
            <SolicitacaoForm operacoes={opcoes.operacoes} />
          )}

          {abaRight === 'modelos' && (
            <ModelosSection modelos={modelos} operacoes={opcoes.operacoes} perfil={perfil} semToggle />
          )}
        </div>
      </div>
    </div>
  );
}
