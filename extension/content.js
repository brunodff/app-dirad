/**
 * content.js — Robô SISCODEC
 * Arquitetura de fases (cada troca de página recarrega o script):
 *
 *  FASE 1  → preenche cabeçalho → salva estado → clica CONFIRMAR → navega
 *  FASE 2  → detecta página de células → salva estado → clica INSERIR CÉLULA → navega
 *  FASE 3  → preenche formulário de célula → salva estado → clica CONFIRMAR → volta à FASE 2
 */

(function () {
  'use strict';

  if (window.__COMAE_SISCODEC_LOADED__) return;
  window.__COMAE_SISCODEC_LOADED__ = true;

  const STORAGE_KEY = 'comae_siscodec_state';
  const LOG = (...a) => console.log('[COMAE]', ...a);

  // ── HUD ─────────────────────────────────────────────────────────────────

  const HUD = (() => {
    const el = document.createElement('div');
    el.id = 'comae-hud';
    Object.assign(el.style, {
      position: 'fixed', bottom: '20px', right: '20px', zIndex: '999999',
      width: '300px', background: '#080F1F', color: '#EAF1FB',
      border: '1px solid #1E3050', borderRadius: '10px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '12px', boxShadow: '0 8px 32px rgba(0,0,0,.6)',
      overflow: 'hidden', display: 'none',
    });
    el.innerHTML = `
      <div style="padding:10px 12px 8px;background:#0C1526;display:flex;align-items:center;justify-content:space-between;gap:6px">
        <span style="font-size:10px;font-weight:700;color:#5FA8E0;letter-spacing:.05em;flex:1">COMAE SISCODEC</span>
        <button id="comae-pause" style="background:none;border:1px solid #1E3050;color:#8A97AC;font-size:9px;padding:2px 8px;border-radius:4px;cursor:pointer">Pausar</button>
        <button id="comae-close" style="background:none;border:1px solid #1E3050;color:#8A97AC;font-size:10px;width:20px;height:20px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>
      </div>
      <div style="padding:10px 12px">
        <div id="comae-step" style="font-size:11px;color:#EAF1FB;margin-bottom:6px">Iniciando…</div>
        <div style="height:4px;background:#1E3050;border-radius:2px">
          <div id="comae-prog" style="height:100%;width:0%;background:#5FA8E0;border-radius:2px;transition:width .3s"></div>
        </div>
        <div id="comae-info" style="font-size:9px;color:#8A97AC;margin-top:6px;min-height:14px"></div>
      </div>
    `;
    document.body.appendChild(el);

    let pausado = false;
    document.getElementById('comae-pause').addEventListener('click', () => {
      pausado = !pausado;
      document.getElementById('comae-pause').textContent = pausado ? 'Retomar' : 'Pausar';
    });
    document.getElementById('comae-close').addEventListener('click', () => {
      el.style.display = 'none';
      limparEstado();
    });

    return {
      mostrar()  { el.style.display = 'block'; },
      passo(txt, pct = null, info = '') {
        document.getElementById('comae-step').textContent = txt;
        if (pct !== null) document.getElementById('comae-prog').style.width = `${pct}%`;
        document.getElementById('comae-info').textContent = info;
      },
      erro(msg) {
        document.getElementById('comae-prog').style.background = '#E06A6A';
        document.getElementById('comae-step').style.color = '#E06A6A';
        document.getElementById('comae-step').textContent = `✗ ${msg}`;
        document.getElementById('comae-pause').style.display = 'none';
      },
      ok() {
        document.getElementById('comae-prog').style.width = '100%';
        document.getElementById('comae-prog').style.background = '#3FB07A';
        document.getElementById('comae-step').textContent = '✓ Concluído com sucesso!';
        document.getElementById('comae-step').style.color = '#3FB07A';
      },
      get pausado() { return pausado; },
      esperar() {
        return new Promise(res => {
          const check = setInterval(() => { if (!pausado) { clearInterval(check); res(); } }, 200);
        });
      },
    };
  })();

  // ── Persistência ─────────────────────────────────────────────────────────

  const salvarEstado  = estado => new Promise(res => chrome.storage.local.set({ [STORAGE_KEY]: JSON.stringify(estado) }, res));
  const lerEstado     = () => new Promise(res => chrome.storage.local.get([STORAGE_KEY], d => {
    try { res(d[STORAGE_KEY] ? JSON.parse(d[STORAGE_KEY]) : null); } catch { res(null); }
  }));
  const limparEstado  = () => new Promise(res => chrome.storage.local.remove(STORAGE_KEY, res));

  // ── Helpers ───────────────────────────────────────────────────────────────

  const delay = ms => new Promise(res => setTimeout(res, ms));

  let pedidoAtual = null;

  function notificar(action, extra = {}) {
    chrome.runtime.sendMessage({ action, pedidoId: pedidoAtual?.id, ...extra });
  }

  function hud(txt, pct, info = '') {
    HUD.passo(txt, pct, info);
    HUD.esperar();
    notificar('PROGRESSO', { step: txt, progress: pct });
  }

  // Clica num elemento disparando um MouseEvent completo (funciona com JSF/PrimeFaces)
  function clicar(el) {
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true, view: window }));
  }

  /**
   * Busca o elemento clicável mais próximo que contenha o texto.
   * Prefere: <a>, <button>, <input[submit/button]>, elementos com onclick/href.
   * Mais específico primeiro (texto mais curto = mais provável ser o label do botão).
   */
  function encontrarPorTexto(texto) {
    const lc = texto.toLowerCase();

    // 1. Busca direta em elementos interativos
    const interativos = [
      ...document.querySelectorAll('a, button, input[type="submit"], input[type="button"], [onclick]'),
    ];
    // Ordena por comprimento do texto (mais curto = mais específico)
    const candidatos = interativos
      .filter(el => {
        const t = (el.textContent || el.value || el.getAttribute('value') || el.title || '').toLowerCase();
        return t.includes(lc);
      })
      .sort((a, b) => {
        const ta = (a.textContent || a.value || '').trim().length;
        const tb = (b.textContent || b.value || '').trim().length;
        return ta - tb;
      });

    if (candidatos.length > 0) {
      LOG('Clicando (interativo):', candidatos[0].tagName, candidatos[0].textContent?.trim().slice(0, 60));
      return candidatos[0];
    }

    // 2. TreeWalker: percorre nós de texto, sobe para encontrar clicável
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const t = node.textContent.toLowerCase();
      if (t.includes(lc) && t.length < 200) {
        textNodes.push(node);
      }
    }

    // Ordena por comprimento (mais curto = mais específico)
    textNodes.sort((a, b) => a.textContent.trim().length - b.textContent.trim().length);

    for (const node of textNodes) {
      let el = node.parentElement;
      for (let i = 0; i < 8 && el && el !== document.body; i++) {
        const tag = el.tagName;
        if (['A', 'BUTTON', 'INPUT', 'SPAN', 'TD', 'LI', 'DIV'].includes(tag) &&
            (el.onclick || el.getAttribute('onclick') || el.getAttribute('href') ||
             tag === 'A' || tag === 'BUTTON')) {
          LOG('Clicando (TreeWalker nível', i, '):', tag, node.textContent.trim().slice(0, 60));
          return el;
        }
        el = el.parentElement;
      }
    }

    return null;
  }

  function clicarPorTexto(texto) {
    const el = encontrarPorTexto(texto);
    if (!el) { LOG('NÃO ENCONTROU:', texto); return false; }
    clicar(el);
    return true;
  }

  function aguardar(seletor, timeout = 12000) {
    return new Promise((res, rej) => {
      const found = document.querySelector(seletor);
      if (found) return res(found);
      const obs = new MutationObserver(() => {
        const f = document.querySelector(seletor);
        if (f) { obs.disconnect(); res(f); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); rej(new Error(`Timeout: ${seletor}`)); }, timeout);
    });
  }

  function aguardarTexto(texto, timeout = 15000) {
    return new Promise((res, rej) => {
      const lc = texto.toLowerCase();
      const existe = () => {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        while (w.nextNode()) if (w.currentNode.textContent.toLowerCase().includes(lc)) return true;
        return false;
      };
      if (existe()) return res();
      const obs = new MutationObserver(() => { if (existe()) { obs.disconnect(); res(); } });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); rej(new Error(`Timeout: "${texto}"`)); }, timeout);
    });
  }

  function findField(keywords) {
    const kw = Array.isArray(keywords) ? keywords : [keywords];
    for (const k of kw) {
      const lk = k.toLowerCase();
      // 1. por name/id/placeholder
      const byAttr = document.querySelector(
        `input[name*="${k}"], input[id*="${k}"], textarea[name*="${k}"], textarea[id*="${k}"], select[name*="${k}"], select[id*="${k}"]`
      );
      if (byAttr) return byAttr;

      // 2. por label/texto próximo
      for (const lbl of document.querySelectorAll('label, th, td, span, div')) {
        if (lbl.children.length > 0) continue;
        if (!lbl.textContent.trim().toLowerCase().includes(lk)) continue;
        const forAttr = lbl.getAttribute('for');
        if (forAttr) { const f = document.getElementById(forAttr); if (f) return f; }
        const parent = lbl.parentElement;
        const input  = parent?.querySelector('input, textarea, select') ||
                       lbl.nextElementSibling?.querySelector('input, textarea, select') ||
                       lbl.nextElementSibling;
        if (input && ['INPUT', 'TEXTAREA', 'SELECT'].includes(input?.tagName)) return input;
      }

      // 3. por placeholder
      const byPh = document.querySelector(`input[placeholder*="${k}"], textarea[placeholder*="${k}"]`);
      if (byPh) return byPh;
    }
    return null;
  }

  function preencherCampo(el, valor) {
    if (!el) return false;
    el.focus();
    if (el.tagName === 'SELECT') {
      const opt = [...el.options].find(o =>
        o.value.toLowerCase() === String(valor).toLowerCase() ||
        o.text.toLowerCase().includes(String(valor).toLowerCase())
      );
      if (opt) { el.value = opt.value; }
    } else {
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, valor);
      else el.value = valor;
    }
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    return true;
  }

  // Debug: loga todos os campos encontrados na página
  function debugCampos() {
    const campos = [...document.querySelectorAll('input, select, textarea')];
    LOG(`Campos encontrados na página (${campos.length}):`);
    campos.forEach((c, i) => LOG(`  [${i}] ${c.tagName} name="${c.name}" id="${c.id}" type="${c.type}" placeholder="${c.placeholder}"`));
    const clicaveis = [...document.querySelectorAll('a, button, input[type="submit"], input[type="button"], [onclick]')];
    LOG(`Elementos clicáveis (${clicaveis.length}):`);
    clicaveis.slice(0, 20).forEach((el, i) => LOG(`  [${i}] ${el.tagName} text="${(el.textContent||el.value||'').trim().slice(0,40)}"`));
  }

  // ── FASE 1: Cabeçalho ─────────────────────────────────────────────────────

  async function executarFase1(pedido) {
    pedidoAtual = pedido;
    HUD.mostrar();
    try {
      hud('Preenchendo cabeçalho…', 5);

      const campoDestaque = findField(['destaque', 'Destaque', 'DESTAQUE']);
      if (!campoDestaque) throw new Error('Campo Destaque não encontrado. Abra o formulário de Nova Solicitação no SISCODEC.');
      preencherCampo(campoDestaque, pedido.destaque);

      const campoExterior = findField(['exterior', 'Exterior', 'bem do exterior', 'Entrada de Bem', 'Entrada Bem']);
      if (campoExterior) preencherCampo(campoExterior, pedido.entrada_exterior || 'Não');

      if (pedido.obs) {
        const campoObs = findField(['obs', 'Obs', 'descr', 'Descr', 'observa', 'nota']);
        if (campoObs) preencherCampo(campoObs, pedido.obs);
      }

      const celulasOrdenadas = [...(pedido.celulas || [])].sort((a, b) => {
        if (a.tipo !== b.tipo) return a.tipo === 'ANULACAO' ? -1 : 1;
        return (a.ordem ?? 0) - (b.ordem ?? 0);
      });

      await salvarEstado({
        pedido,
        fase: 'celulas',
        celulas_restantes: celulasOrdenadas,
        celulas_total: celulasOrdenadas.length,
        celulas_feitas: 0,
        ts: Date.now(),
      });

      hud('Confirmando cabeçalho…', 15);
      const clicou = clicarPorTexto('confirmar');
      if (!clicou) throw new Error('Botão CONFIRMAR não encontrado.');
      HUD.passo('Aguardando próxima página…', 20, 'O robô continuará automaticamente');

    } catch (err) {
      await limparEstado();
      HUD.erro(err.message);
      notificar('ERRO', { mensagem: err.message });
    }
  }

  // ── FASE 2: Página de células — clicar INSERIR CÉLULA ────────────────────

  async function executarFase2(estado) {
    pedidoAtual = estado.pedido;
    HUD.mostrar();
    try {
      const { pedido, celulas_restantes, celulas_total, celulas_feitas } = estado;
      const feitas = celulas_feitas ?? 0;
      const total  = celulas_total  ?? (celulas_restantes?.length ?? 0);

      if (!celulas_restantes || celulas_restantes.length === 0) {
        HUD.ok();
        await limparEstado();
        notificar('CONCLUIDO');
        // Tenta navegar para a página "Solicitar Descentralização" para novo pedido
        await delay(800);
        const voltou = clicarPorTexto('Solicitar Descentralização') || clicarPorTexto('Solicitar Descentralizacao');
        if (!voltou) {
          // Tenta via menu pai
          clicarPorTexto('Envio de Solicitação') || clicarPorTexto('Envio de Solicitacao');
          await delay(600);
          clicarPorTexto('Solicitar Descentralização') || clicarPorTexto('Solicitar Descentralizacao');
        }
        HUD.passo(
          '✓ Robô concluído — aguardando validação do usuário',
          100,
          '⚠ Por segurança, o despacho NÃO é feito automaticamente. Revise e despache manualmente.'
        );
        return;
      }

      const c      = celulas_restantes[0];
      const tipoBR = c.tipo === 'ANULACAO' ? 'Anulação' : 'Suplementação';
      const numCell = feitas + 1;
      const pct     = Math.round((feitas / Math.max(total, 1)) * 85);

      hud(`Célula ${numCell}/${total} — ${tipoBR}: clicando "Inserir Célula"…`, pct, `PTRES ${c.ptres}`);

      // Debug: mostra o que está na página
      debugCampos();

      // Salva estado ANTES de navegar
      await salvarEstado({
        pedido,
        fase: 'celula_form',
        celula_atual: c,
        celulas_restantes: celulas_restantes.slice(1),
        celulas_total: total,
        celulas_feitas: feitas,
        ts: Date.now(),
      });

      // Tenta clicar INSERIR CÉLULA com múltiplas estratégias
      let clicou = false;

      // Estratégia 1: texto "inserir célula" (específico)
      clicou = clicarPorTexto('inserir célula') || clicarPorTexto('inserir celula');

      // Estratégia 2: texto "inserir c" (prefixo)
      if (!clicou) clicou = clicarPorTexto('inserir c');

      // Estratégia 3: qualquer botão com "inserir"
      if (!clicou) {
        const el = encontrarPorTexto('inserir');
        if (el) { clicar(el); clicou = true; }
      }

      if (!clicou) {
        await limparEstado();
        throw new Error(
          '"INSERIR CÉLULA ORÇAMENTÁRIA" não encontrado. Abra o console F12 para ver o debug. ' +
          'Verifique se está na aba CÉLULAS ORÇAMENTÁRIAS do SISCODEC.'
        );
      }

      HUD.passo(
        `Abrindo formulário da célula ${numCell}/${total}…`,
        pct,
        'O robô continuará automaticamente na próxima página'
      );

    } catch (err) {
      await limparEstado();
      HUD.erro(err.message);
      notificar('ERRO', { mensagem: err.message });
    }
  }

  // ── FASE 3: Formulário de célula — preencher ──────────────────────────────

  async function executarCelulaForm(estado) {
    pedidoAtual = estado.pedido;
    HUD.mostrar();
    try {
      const { pedido, celula_atual: c, celulas_restantes, celulas_total, celulas_feitas } = estado;
      const feitas  = celulas_feitas ?? 0;
      const total   = celulas_total  ?? 1;
      const tipoEN  = c.tipo === 'ANULACAO' ? 'ANULACAO' : 'SUPLEMENTACAO';
      const tipoBR  = c.tipo === 'ANULACAO' ? 'Anulação' : 'Suplementação';
      const numCell = feitas + 1;
      const basePct = Math.round((feitas / Math.max(total, 1)) * 85);

      hud(`Célula ${numCell}/${total} — preenchendo ${tipoBR}…`, basePct, `PTRES ${c.ptres}`);
      debugCampos();

      // Operação (select: ANULACAO / SUPLEMENTACAO)
      const campoOp = findField(['operação', 'operacao', 'OPERACAO', 'Operação', 'operac']);
      if (campoOp) {
        preencherCampo(campoOp, tipoEN);
        await delay(150);
      }

      // Valor
      const campoValor = findField(['valor', 'VALOR', 'Valor']);
      if (!campoValor) throw new Error(`Campo Valor não encontrado (célula ${numCell}). Veja o console F12.`);
      preencherCampo(campoValor, Number(c.valor).toFixed(2).replace('.', ','));
      await delay(100);

      // UG EXEC
      if (c.ug_exec) {
        const campoUgExec = findField(['ug exec', 'UG EXEC', 'ugexec', 'ug_exec', 'ugExec']);
        if (campoUgExec) { preencherCampo(campoUgExec, c.ug_exec); await delay(350); }
      }

      // Esfera
      if (c.esfera) {
        const campoEsfera = findField(['esfera', 'ESFERA', 'Esfera']);
        if (campoEsfera) { preencherCampo(campoEsfera, c.esfera); await delay(100); }
      }

      // PTRES
      const campoPtres = findField(['ptres', 'PTRES']);
      if (!campoPtres) throw new Error(`Campo PTRES não encontrado (célula ${numCell}). Veja o console F12.`);
      preencherCampo(campoPtres, c.ptres);
      await delay(500); // Ação auto-preenche após PTRES

      // FONTE
      if (c.fonte) {
        const campoFonte = findField(['fonte', 'FONTE', 'Fonte']);
        if (campoFonte) { preencherCampo(campoFonte, c.fonte); await delay(100); }
      }

      // NATUREZA (ND)
      const campoNd = findField(['natureza', 'NATUREZA', 'Natureza', 'nd', 'ND']);
      if (!campoNd) throw new Error(`Campo Natureza não encontrado (célula ${numCell}). Veja o console F12.`);
      preencherCampo(campoNd, c.nd);
      await delay(100);

      // PLANO INTERNO
      if (c.plano_interno) {
        const campoPI = findField(['plano interno', 'PLANO INTERNO', 'plano_interno', 'planoInterno']);
        if (campoPI) { preencherCampo(campoPI, c.plano_interno); await delay(100); }
      }

      // UG CRED
      if (c.ug_cred) {
        const campoUgCred = findField(['ug cred', 'UG CRED', 'ugcred', 'ug_cred']);
        if (campoUgCred) { preencherCampo(campoUgCred, c.ug_cred); await delay(350); }
      }

      // Obs Linha 1
      if (c.obs_linha1) {
        const campoObs1 = findField(['obs linha 1', 'Obs Linha 1', 'OBS LINHA 1', 'linha 1', 'obs1']);
        if (campoObs1) { preencherCampo(campoObs1, c.obs_linha1); await delay(100); }
      }

      // Obs Linha 2
      if (c.obs_linha2) {
        const campoObs2 = findField(['obs linha 2', 'Obs Linha 2', 'OBS LINHA 2', 'linha 2', 'obs2']);
        if (campoObs2) { preencherCampo(campoObs2, c.obs_linha2); await delay(100); }
      }

      // Salva estado ANTES de confirmar
      await salvarEstado({
        pedido,
        fase: 'celulas',
        celulas_restantes,
        celulas_total: total,
        celulas_feitas: feitas + 1,
        ts: Date.now(),
      });

      hud(`Célula ${numCell} — CONFIRMAR…`, basePct + 5, `${tipoEN} · PTRES ${c.ptres}`);

      const clicouConf =
        clicarPorTexto('confirmar') ||
        clicarPorTexto('salvar')    ||
        clicarPorTexto('gravar')    ||
        clicarPorTexto('incluir');

      if (!clicouConf) {
        await limparEstado();
        throw new Error(`Botão CONFIRMAR não encontrado (célula ${numCell}). Veja o console F12.`);
      }

      HUD.passo(
        `Célula ${numCell} confirmada — voltando…`,
        Math.round(((feitas + 1) / Math.max(total, 1)) * 85),
        'O robô continuará automaticamente'
      );

    } catch (err) {
      await limparEstado();
      HUD.erro(err.message);
      notificar('ERRO', { mensagem: err.message });
    }
  }

  // ── Retomada automática a cada carregamento de página ────────────────────

  async function verificarEstadoPendente() {
    const estado = await lerEstado();
    if (!estado) return;
    if (Date.now() - estado.ts > 10 * 60 * 1000) { await limparEstado(); return; }

    LOG('Estado recuperado:', estado.fase, '— células restantes:', estado.celulas_restantes?.length ?? 0);

    if (estado.fase === 'celulas') {
      // Aguarda botão aparecer (máx 4s), depois tenta de qualquer forma
      try { await aguardarTexto('inserir', 4000); } catch { /* proceed */ }
      await executarFase2(estado);

    } else if (estado.fase === 'celula_form') {
      // Pequena folga para JSF renderizar campos (máx 4s)
      try { await aguardar('input[type="text"], select', 4000); } catch { /* proceed */ }
      await executarCelulaForm(estado);
    }
  }

  verificarEstadoPendente();

  // ── Listener (popup → content script) ────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'INICIAR') {
      executarFase1(msg.pedido);
      sendResponse({ ok: true });
    }
    return true;
  });

})();
