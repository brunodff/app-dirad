import { useState, useEffect } from 'react';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copiado, setCopiado] = useState(false);
  function copiar() {
    navigator.clipboard.writeText(text).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    });
  }
  return (
    <button
      type="button"
      onClick={copiar}
      className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-all"
      style={copiado
        ? { background: '#1B3A2B', color: '#3FB07A', border: '1px solid #3FB07A44' }
        : { background: '#1E3050', color: '#5FA8E0', border: '1px solid #5FA8E033' }}
    >
      {copiado ? '✓ Copiado!' : label}
    </button>
  );
}

function Passo({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <span
        className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
        style={{ background: '#1E3050', color: '#5FA8E0' }}
      >
        {num}
      </span>
      <p className="text-xs text-slate-400 leading-relaxed">{children}</p>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2 font-mono text-[11px] text-slate-300 break-all leading-relaxed"
      style={{ background: '#060D1A', border: '1px solid #1E3050' }}
    >
      {children}
    </div>
  );
}

export function FerramentasView() {
  const [bookmarklet, setBookmarklet] = useState('');
  const [extensaoUrl, setExtensaoUrl] = useState('');

  useEffect(() => {
    const origin = window.location.origin;
    const bm = `javascript:(function(){var s=document.createElement('script');s.src='${origin}/siloms-despacho.js?t='+Date.now();document.body.appendChild(s)})();`;
    setBookmarklet(bm);
    setExtensaoUrl(`${origin}/comae-siscodec-extensao.zip`);
  }, []);

  return (
    <div>
      <div className="px-5 py-4 border-b" style={{ background: '#080F1F', borderColor: '#1E3050' }}>
        <h2 className="text-sm font-bold text-white mb-0.5">Ferramentas</h2>
        <p className="text-[10px] text-slate-500">Robôs e extensões para automação no SILOMS.</p>
      </div>

      <div className="p-5 space-y-6 max-w-3xl">

        {/* ── SILAS ──────────────────────────────────────────────── */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1E3050' }}>
          <div className="px-5 py-3 flex items-center gap-3" style={{ background: '#0C1526' }}>
            <span className="text-base">⚡</span>
            <div>
              <h3 className="text-sm font-bold text-white">SILAS — Despachante Virtual</h3>
              <p className="text-[10px] text-slate-500">Bookmarklet de preenchimento automático de despachos no SILOMS</p>
            </div>
          </div>

          <div className="p-5 space-y-5" style={{ background: '#0A1628' }}>
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">O que é</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                O SILAS é um bookmarklet que abre um painel flutuante dentro do SILOMS para preencher despachos
                automaticamente a partir de frases pré-cadastradas. Suas frases ficam salvas na nuvem e sincronizadas
                entre computadores usando seu nome de guerra como identificador.
              </p>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Instalação</p>
              <div className="space-y-3">
                <Passo num={1}>
                  Copie o código do bookmarklet abaixo clicando no botão.
                </Passo>
                {bookmarklet && (
                  <div className="ml-8 space-y-2">
                    <CodeBlock>{bookmarklet}</CodeBlock>
                    <CopyButton text={bookmarklet} label="Copiar código do bookmarklet" />
                  </div>
                )}
                <Passo num={2}>
                  No Chrome, pressione <strong className="text-white">Ctrl+Shift+B</strong> para mostrar a barra de favoritos
                  (se não estiver visível). Depois clique com o botão direito na barra e escolha{' '}
                  <strong className="text-white">"Adicionar página..."</strong>.
                </Passo>
                <Passo num={3}>
                  No campo <strong className="text-white">Nome</strong>, escreva{' '}
                  <span className="font-mono text-[11px] px-1 rounded" style={{ background: '#1E3050', color: '#5FA8E0' }}>SILAS</span>.
                  No campo <strong className="text-white">URL</strong>, cole o código copiado. Clique em Salvar.
                </Passo>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Como usar</p>
              <div className="space-y-3">
                <Passo num={1}>
                  Acesse o SILOMS e navegue até a ficha onde deseja inserir o despacho.
                </Passo>
                <Passo num={2}>
                  Clique no bookmarklet <strong className="text-white">SILAS</strong> na barra de favoritos.
                  Um painel flutuante aparecerá no canto inferior direito da tela.
                </Passo>
                <Passo num={3}>
                  Na primeira vez, informe seu <strong className="text-white">nome de guerra</strong> para sincronização
                  com a nuvem. Suas frases serão carregadas automaticamente.
                </Passo>
                <Passo num={4}>
                  Selecione ou pesquise a frase desejada. Clique em{' '}
                  <strong className="text-white">Inserir no campo</strong> para preencher automaticamente o campo de
                  despacho ativo na página.
                </Passo>
                <Passo num={5}>
                  Para <strong className="text-white">cadastrar novas frases</strong>, clique em "+" no painel e escreva
                  a frase. Ela será salva na nuvem e disponível em qualquer computador.
                </Passo>
              </div>
            </div>
          </div>
        </div>

        {/* ── Extensão Chrome ────────────────────────────────────── */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1E3050' }}>
          <div className="px-5 py-3 flex items-center gap-3" style={{ background: '#0C1526' }}>
            <span className="text-base">🧩</span>
            <div>
              <h3 className="text-sm font-bold text-white">Extensão Chrome — Criador de Subprocessos SISCODEC</h3>
              <p className="text-[10px] text-slate-500">Cria Solicitações de Descentralização no SISCODEC a partir de planilha Excel</p>
            </div>
          </div>

          <div className="p-5 space-y-5" style={{ background: '#0A1628' }}>
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">O que é</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Extensão do Chrome que injeta um painel no SILOMS para criar automaticamente os subprocessos de
                Solicitação de Descentralização (SISCODEC). Carrega uma planilha Excel com as informações das unidades
                e preenche os campos do sistema um a um, com pausa entre cada envio.
              </p>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Instalação</p>
              <div className="space-y-3">
                <Passo num={1}>
                  Baixe o arquivo ZIP da extensão:
                </Passo>
                {extensaoUrl && (
                  <div className="ml-8">
                    <a
                      href={extensaoUrl}
                      download
                      className="inline-block text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                      style={{ background: '#1E3050', color: '#5FA8E0', border: '1px solid #5FA8E033' }}
                    >
                      ↓ Baixar extensão (.zip)
                    </a>
                  </div>
                )}
                <Passo num={2}>
                  Extraia o conteúdo do ZIP em uma pasta permanente no seu computador (ex:{' '}
                  <span className="font-mono text-[11px] px-1 rounded" style={{ background: '#1E3050', color: '#5FA8E0' }}>
                    Documentos\comae-extensao
                  </span>
                  ). Não delete essa pasta após instalar.
                </Passo>
                <Passo num={3}>
                  Abra o Chrome e acesse{' '}
                  <span className="font-mono text-[11px] px-1 rounded" style={{ background: '#1E3050', color: '#5FA8E0' }}>
                    chrome://extensions
                  </span>
                  . Ative o <strong className="text-white">Modo do desenvolvedor</strong> (botão no canto superior direito).
                </Passo>
                <Passo num={4}>
                  Clique em <strong className="text-white">"Carregar sem compactação"</strong> e selecione a pasta
                  onde extraiu o ZIP. A extensão COMAE aparecerá na lista.
                </Passo>
                <Passo num={5}>
                  Fixe a extensão na barra de ferramentas: clique no ícone de quebra-cabeça (🧩) no Chrome e
                  clique no alfinete ao lado de <strong className="text-white">COMAE — Criador de Descentralizações SILOMS</strong>.
                </Passo>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Configuração da planilha</p>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">
                A planilha Excel deve ter as seguintes colunas (na ordem exata):
              </p>
              <div className="rounded-lg overflow-hidden text-[11px]" style={{ border: '1px solid #1E3050' }}>
                <table className="w-full">
                  <thead>
                    <tr style={{ background: '#0C1526', color: '#5FA8E0' }}>
                      <th className="px-3 py-2 text-left font-semibold">Coluna</th>
                      <th className="px-3 py-2 text-left font-semibold">Conteúdo</th>
                      <th className="px-3 py-2 text-left font-semibold">Exemplo</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-400">
                    {[
                      ['A', 'Sigla da UGR', 'BAAN'],
                      ['B', 'Nome da ND (Natureza da Despesa)', 'Material de Consumo'],
                      ['C', 'Código da ND', '339030'],
                      ['D', 'Valor em reais', '15000.00'],
                      ['E', 'Descrição / Justificativa', 'Apoio logístico ao exercício...'],
                    ].map(([col, cont, ex], i) => (
                      <tr key={col} style={{ background: i % 2 === 0 ? '#080F1F' : '#060D1A' }}>
                        <td className="px-3 py-2 font-mono font-bold" style={{ color: '#E0B341' }}>{col}</td>
                        <td className="px-3 py-2">{cont}</td>
                        <td className="px-3 py-2 font-mono text-slate-500">{ex}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-slate-600 mt-2">A primeira linha deve ser o cabeçalho (será ignorada automaticamente).</p>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Como usar</p>
              <div className="space-y-3">
                <Passo num={1}>
                  Acesse o SILOMS e navegue até a tela de Solicitações de Descentralização (SISCODEC).
                  Esteja dentro do processo correto antes de iniciar.
                </Passo>
                <Passo num={2}>
                  Clique no ícone da extensão COMAE na barra do Chrome. O painel lateral abrirá na página.
                </Passo>
                <Passo num={3}>
                  Clique em <strong className="text-white">"Carregar planilha"</strong> e selecione o arquivo
                  Excel com os dados das unidades.
                </Passo>
                <Passo num={4}>
                  Confira a lista de itens carregados. Ajuste se necessário. Clique em{' '}
                  <strong className="text-white">"Iniciar criação automática"</strong>.
                </Passo>
                <Passo num={5}>
                  O robô preencherá os campos um por um automaticamente. Não feche a aba nem interaja
                  com o SILOMS durante o processo. Acompanhe o progresso pelo painel.
                </Passo>
                <Passo num={6}>
                  Ao finalizar, o painel exibirá um resumo com quantos subprocessos foram criados
                  e se houve algum erro. Erros ficam marcados para reprocessamento.
                </Passo>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
