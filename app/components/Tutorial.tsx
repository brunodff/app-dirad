import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';

type Step = {
  titulo: string;
  descricao: string;
  aba?: string;
  seletor?: string;
  posicao?: 'top' | 'bottom' | 'right' | 'center';
};

const STEPS: Step[] = [
  {
    titulo: 'Bem-vindo ao COMAE GERENCIAL',
    descricao: 'Painel orçamentário do Comando de Operações Aeroespaciais. Este tutorial apresenta as principais funcionalidades. Clique em Próximo para continuar ou Pular para encerrar.',
    posicao: 'center',
  },
  {
    titulo: 'Menu de navegação',
    descricao: 'O menu lateral dá acesso a todas as abas: Feed, Operações, Execução, Rascunho, SISCODEC e Configurações. As abas visíveis dependem do seu perfil.',
    seletor: 'aside',
    posicao: 'right',
  },
  {
    aba: 'feed',
    titulo: 'Feed de Movimentos',
    descricao: 'Exibe todos os movimentos de crédito em ordem cronológica — recebimentos, descentralizações e devoluções. Cada card mostra a operação, ND, NC e valor.',
    posicao: 'center',
  },
  {
    aba: 'feed',
    titulo: 'Filtros',
    descricao: 'Filtre por operação (com busca por texto), natureza de despesa, tipo de movimento e período. Os chips acima mostram os filtros ativos e podem ser removidos individualmente.',
    seletor: '[data-tour="filter-bar"]',
    posicao: 'bottom',
  },
  {
    aba: 'feed',
    titulo: 'Descartar movimento',
    descricao: 'Usuários autorizados podem descartar movimentos irrelevantes informando um motivo obrigatório. O movimento vai para a aba Desativados e pode ser reativado.',
    posicao: 'center',
  },
  {
    aba: 'operacoes',
    titulo: 'Painel de Operações',
    descricao: 'Resumo financeiro de cada operação: crédito total recebido, descentralizado para as unidades e saldo disponível. Usuários autorizados podem desativar operações inteiras.',
    posicao: 'center',
  },
  {
    aba: 'execucao',
    titulo: 'Execução Orçamentária',
    descricao: 'Fases da despesa por operação e UG Executora: disponível, a liquidar, em liquidação, líquidado a pagar e pago. Alterne entre visão COMAE e Unidades no canto superior direito.',
    posicao: 'center',
  },
  {
    aba: 'execucao',
    titulo: 'Filtro — Com crédito disponível',
    descricao: 'Ative este botão para exibir apenas UGs e NDs com saldo disponível, ocultando linhas onde o crédito já foi totalmente empenhado.',
    seletor: '[data-tour="credito-toggle"]',
    posicao: 'bottom',
  },
  {
    aba: 'rascunho',
    titulo: 'Rascunho',
    descricao: 'Crie quadros pessoais para acompanhar NCs e operações específicas. Cada quadro é privado, pode conter anotações e ser arquivado quando não for mais necessário.',
    posicao: 'center',
  },
  {
    aba: 'power-bi',
    titulo: 'Painel Power BI',
    descricao: 'Painel interativo com os dados orçamentários consolidados, ideal para apresentações em reuniões. Os gráficos e tabelas refletem a posição mais recente sincronizada com o sistema.',
    posicao: 'center',
  },
  {
    aba: 'siscodec',
    titulo: 'SISCODEC — Robô de Descentralização',
    descricao: 'Crie solicitações de descentralização aqui com anulações e suplementações. Instale a extensão Chrome e use o token desta página para que o robô preencha o SISCODEC automaticamente.',
    posicao: 'center',
  },
  {
    aba: 'configuracoes',
    titulo: 'Configurações',
    descricao: 'Atualize seu posto, nome de guerra, unidade e senha. Usuários autorizados também podem convidar novos usuários, alterar perfis e gerenciar acessos.',
    posicao: 'center',
  },
  {
    titulo: 'Tutorial concluído!',
    descricao: 'Você está pronto para usar o COMAE GERENCIAL. Clique no ícone ? na parte inferior da barra lateral a qualquer momento para revisar este tutorial.',
    posicao: 'center',
  },
];

type Rect = { top: number; left: number; width: number; height: number };

function tooltipStyle(rect: Rect | null, posicao: Step['posicao']): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'fixed',
    zIndex: 10001,
    width: 380,
    maxWidth: 'calc(100vw - 32px)',
  };

  if (!rect || posicao === 'center') {
    return { ...base, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }

  const gap = 16;

  if (posicao === 'bottom') {
    const left = Math.min(Math.max(rect.left, 16), window.innerWidth - 396);
    return { ...base, top: rect.top + rect.height + gap, left };
  }

  if (posicao === 'right') {
    const top = Math.min(Math.max(rect.top, 16), window.innerHeight - 260);
    return { ...base, top, left: rect.left + rect.width + gap };
  }

  // top
  const left = Math.min(Math.max(rect.left, 16), window.innerWidth - 396);
  return { ...base, bottom: window.innerHeight - rect.top + gap, left };
}

type Props = {
  userId: string;
  abaAtiva: string;
};

export function Tutorial({ userId, abaAtiva }: Props) {
  const STORAGE_KEY = `tutorial_done_${userId}`;
  const [ativo, setAtivo]         = useState(false);
  const [step, setStep]           = useState(0);
  const [rect, setRect]           = useState<Rect | null>(null);
  const navigatingRef             = useRef(false);
  const navigate                  = useNavigate();

  // Abre automaticamente no primeiro acesso
  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setAtivo(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = STEPS[step];

  // Lida com navegação e spotlight quando o step ou aba muda
  useEffect(() => {
    if (!ativo) return;

    // Precisa navegar para outra aba
    if (s.aba && s.aba !== abaAtiva) {
      if (!navigatingRef.current) {
        navigatingRef.current = true;
        setRect(null);
        navigate(`/painel?aba=${s.aba}`);
      }
      return;
    }

    navigatingRef.current = false;

    // Spotlight no elemento
    if (s.seletor) {
      const tentar = (tentativa = 0) => {
        const el = document.querySelector(s.seletor!);
        if (el) {
          const r = el.getBoundingClientRect();
          setRect({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 });
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else if (tentativa < 5) {
          setTimeout(() => tentar(tentativa + 1), 200);
        }
      };
      setTimeout(() => tentar(), 100);
    } else {
      setRect(null);
    }
  }, [step, ativo, abaAtiva, navigate, s]);

  function concluir() {
    localStorage.setItem(STORAGE_KEY, '1');
    setAtivo(false);
    setRect(null);
  }

  function abrirTutorial() {
    setStep(0);
    setRect(null);
    navigatingRef.current = false;
    setAtivo(true);
  }

  function proximo() {
    if (step >= STEPS.length - 1) { concluir(); return; }
    setRect(null);
    setStep(n => n + 1);
  }

  function anterior() {
    setRect(null);
    setStep(n => Math.max(0, n - 1));
  }

  const isUltimo = step === STEPS.length - 1;

  return (
    <>
      {/* Botão ? sempre visível na sidebar */}
      <button
        type="button"
        onClick={abrirTutorial}
        title="Abrir tutorial"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: ativo ? '#5FA8E0' : '#1E3050',
          border: '1px solid #5FA8E044',
          color: ativo ? '#080F1F' : '#5FA8E0',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          zIndex: 9997,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
          transition: 'all .2s',
        }}
      >
        ?
      </button>

      {!ativo && null}

      {ativo && (
        <>
          {/* Overlay escuro */}
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 9998,
              background: 'rgba(8,15,31,0.80)',
              pointerEvents: 'all',
            }}
            onClick={e => { if (e.target === e.currentTarget) concluir(); }}
          />

          {/* Spotlight */}
          {rect && (
            <div
              style={{
                position: 'fixed',
                zIndex: 9999,
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
                borderRadius: 8,
                outline: '3px solid #5FA8E0',
                outlineOffset: 2,
                boxShadow: '0 0 0 9999px rgba(8,15,31,0.80)',
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Card do passo */}
          <div
            style={{
              ...tooltipStyle(rect, s.posicao),
              background: '#0C1526',
              border: '1px solid #1E3050',
              borderRadius: 12,
              padding: '20px 22px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
          >
            {/* Progresso */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: i === step ? 20 : 6,
                      height: 6,
                      borderRadius: 3,
                      background: i === step ? '#5FA8E0' : i < step ? '#3FB07A' : '#1E3050',
                      transition: 'all .2s',
                    }}
                  />
                ))}
              </div>
              <span style={{ fontSize: 10, color: '#4A5B73' }}>{step + 1} / {STEPS.length}</span>
            </div>

            {/* Conteúdo */}
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#EAF1FB', margin: '0 0 8px' }}>
              {s.titulo}
            </h3>
            <p style={{ fontSize: 12, color: '#8A97AC', lineHeight: 1.6, margin: '0 0 18px' }}>
              {s.descricao}
            </p>

            {/* Ações */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {step > 0 && (
                <button
                  type="button"
                  onClick={anterior}
                  style={{
                    background: 'transparent', color: '#5FA8E0',
                    border: '1px solid #1E3050', borderRadius: 6,
                    fontSize: 11, padding: '6px 12px', cursor: 'pointer',
                  }}
                >
                  ← Anterior
                </button>
              )}

              <button
                type="button"
                onClick={proximo}
                style={{
                  background: isUltimo ? '#3FB07A' : '#1E3A6E',
                  color: isUltimo ? '#080F1F' : '#5FA8E0',
                  border: 'none', borderRadius: 6,
                  fontSize: 11, fontWeight: 700,
                  padding: '6px 14px', cursor: 'pointer',
                  marginLeft: step === 0 ? 0 : undefined,
                }}
              >
                {isUltimo ? '✓ Concluir tutorial' : 'Próximo →'}
              </button>

              {!isUltimo && (
                <button
                  type="button"
                  onClick={concluir}
                  style={{
                    marginLeft: 'auto', background: 'transparent',
                    color: '#3A4B63', border: 'none',
                    fontSize: 10, cursor: 'pointer',
                  }}
                >
                  Pular tutorial
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
