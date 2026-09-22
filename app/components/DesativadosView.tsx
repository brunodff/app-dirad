import { useFetcher } from 'react-router';
import { apelidoOperacao } from '~/lib/apelidoOperacao';

export type ConfigOperacao = {
  operacao: string;
  ativo: boolean;
  desativado_por: string | null;
  desativado_em: string | null;
  motivo: string | null;
};

export type MovimentoDescartado = {
  movimento_id: number;
  motivo: string;
  descartado_por: string | null;
  descartado_em: string | null;
  operacao: string;
  nc: string;
  nd_cod: string;
  valor: number;
  tipo_calculado: string;
  data: string;
};

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function tempoAtras(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function formatData(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function brl(v: number) {
  return Math.abs(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const TIPO_META: Record<string, { label: string; cor: string; valorCor: string }> = {
  RECEBIDO:          { label: 'Recebido',        cor: '#1B3A2B', valorCor: '#3FB07A' },
  DESCENTRALIZADO:   { label: 'Descentralizado', cor: '#3A2C0C', valorCor: '#E0B341' },
  DEVOLUCAO:         { label: 'Devolução',        cor: '#3A1212', valorCor: '#E06A6A' },
  RECEBIDO_UNIDADES: { label: 'Rec. Unidades',   cor: '#0F2A2A', valorCor: '#25A3A3' },
};

function CardDesativado({
  config,
  nomeDesativadoPor,
  podeEditar,
}: {
  config: ConfigOperacao;
  nomeDesativadoPor: string | null;
  podeEditar: boolean;
}) {
  const fetcher = useFetcher();
  const reativando = fetcher.state !== 'idle';

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: '#101C33', border: '1px solid #1E3050', borderLeft: '3px solid #E06A6A' }}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <h3 className="text-sm font-bold text-slate-300">{apelidoOperacao(config.operacao)}</h3>
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ background: '#3A1212', color: '#E06A6A' }}
        >
          DESATIVADA
        </span>
      </div>

      <div className="space-y-1.5 mb-4">
        {config.motivo && (
          <p className="text-xs text-slate-400">
            <span className="text-slate-600">Motivo: </span>{config.motivo}
          </p>
        )}
        <p className="text-[10px] text-slate-600">
          {nomeDesativadoPor && <span>Por <span className="text-slate-500">{nomeDesativadoPor}</span> · </span>}
          {config.desativado_em && (
            <span title={formatTs(config.desativado_em)}>
              {tempoAtras(config.desativado_em)} ({formatTs(config.desativado_em)})
            </span>
          )}
        </p>
      </div>

      {podeEditar && (
        <fetcher.Form method="post" action="/painel">
          <input type="hidden" name="intent" value="reativar" />
          <input type="hidden" name="operacao" value={config.operacao} />
          <button
            type="submit"
            disabled={reativando}
            className="text-xs font-semibold px-4 py-2 rounded-lg transition-all cursor-pointer disabled:opacity-50"
            style={{ background: '#1B3A2B', color: '#3FB07A', border: '1px solid #3FB07A33' }}
          >
            {reativando ? 'Reativando…' : '↑ Reativar operação'}
          </button>
        </fetcher.Form>
      )}
    </div>
  );
}

function CardMovDescartado({
  mov,
  nomeDescartadoPor,
  podeEditar,
}: {
  mov: MovimentoDescartado;
  nomeDescartadoPor: string | null;
  podeEditar: boolean;
}) {
  const fetcher = useFetcher();
  const reativando = fetcher.state !== 'idle';
  const meta = TIPO_META[mov.tipo_calculado] ?? TIPO_META.RECEBIDO;

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: '#101C33', border: '1px solid #1E3050', borderLeft: '3px solid #8A97AC' }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-300 truncate" title={mov.operacao}>{apelidoOperacao(mov.operacao)}</p>
          <p className="text-[10px] text-slate-600 font-mono mt-0.5">{mov.nc} · {mov.nd_cod}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: meta.cor, color: meta.valorCor }}
          >
            {meta.label}
          </span>
          <p className="text-xs font-bold tabular-nums mt-1" style={{ color: meta.valorCor }}>
            {brl(mov.valor)}
          </p>
        </div>
      </div>

      <div className="space-y-1.5 mb-3">
        <p className="text-xs text-slate-400">
          <span className="text-slate-600">Motivo: </span>{mov.motivo}
        </p>
        <p className="text-[10px] text-slate-600">
          {nomeDescartadoPor && <span>Por <span className="text-slate-500">{nomeDescartadoPor}</span> · </span>}
          {mov.descartado_em && (
            <span title={formatTs(mov.descartado_em)}>
              {tempoAtras(mov.descartado_em)} ({formatTs(mov.descartado_em)})
            </span>
          )}
          {mov.data && <span> · Mov. {formatData(mov.data)}</span>}
        </p>
      </div>

      {podeEditar && (
        <fetcher.Form method="post" action="/painel">
          <input type="hidden" name="intent" value="reativar_movimento" />
          <input type="hidden" name="movimento_id" value={mov.movimento_id} />
          <button
            type="submit"
            disabled={reativando}
            className="text-xs font-semibold px-4 py-2 rounded-lg transition-all cursor-pointer disabled:opacity-50"
            style={{ background: '#1B3A2B', color: '#3FB07A', border: '1px solid #3FB07A33' }}
          >
            {reativando ? 'Reativando…' : '↑ Reativar movimento'}
          </button>
        </fetcher.Form>
      )}
    </div>
  );
}

type Props = {
  desativadas: ConfigOperacao[];
  usuarios: { id: string; nome: string }[];
  podeEditar: boolean;
  movimentosDescartados: MovimentoDescartado[];
};

export function DesativadosView({ desativadas, usuarios, podeEditar, movimentosDescartados }: Props) {
  return (
    <div>
      <div
        className="px-5 py-4 border-b"
        style={{ background: '#080F1F', borderColor: '#1E3050' }}
      >
        <h2 className="text-sm font-bold text-white mb-0.5">Itens Desativados</h2>
        <p className="text-[10px] text-slate-500">
          Operações desativadas e movimentos descartados ficam ocultos do Feed e do resumo de Operações. Podem ser reativados a qualquer momento.
        </p>
      </div>

      <div className="p-5 space-y-8">
        {/* Operações Desativadas */}
        <section>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
            Operações Desativadas ({desativadas.length})
          </h3>
          {desativadas.length === 0 ? (
            <div className="flex items-center gap-2 text-slate-600 text-sm">
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
              Nenhuma operação desativada.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {desativadas.map(d => (
                <CardDesativado
                  key={d.operacao}
                  config={d}
                  nomeDesativadoPor={usuarios.find(u => u.id === d.desativado_por)?.nome ?? null}
                  podeEditar={podeEditar}
                />
              ))}
            </div>
          )}
        </section>

        {/* Movimentos Descartados */}
        <section>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
            Movimentos Descartados ({movimentosDescartados.length})
          </h3>
          {movimentosDescartados.length === 0 ? (
            <div className="flex items-center gap-2 text-slate-600 text-sm">
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
              Nenhum movimento descartado.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {movimentosDescartados.map(m => (
                <CardMovDescartado
                  key={m.movimento_id}
                  mov={m}
                  nomeDescartadoPor={usuarios.find(u => u.id === m.descartado_por)?.nome ?? null}
                  podeEditar={podeEditar}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
