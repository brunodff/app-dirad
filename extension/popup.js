// popup.js — lógica do painel COMAE SISCODEC

const API_URL = 'https://www.comaegerencial.app';

let CONFIG      = { token: '' };
let tabStatus   = 'PENDENTE';
let modoOffline = false;
let pedidosCache = [];   // lista atual exibida
let filaExecucao = [];   // pedidos pendentes após o clicado (batch)

// ── Config ────────────────────────────────────────────────────────────────

async function carregarConfig() {
  return new Promise(resolve => {
    chrome.storage.local.get(['apiToken'], data => {
      CONFIG.token = data.apiToken || '';
      resolve();
    });
  });
}

async function salvarConfig() {
  const token = document.getElementById('cfg-token').value.trim();
  if (!token) return alert('Cole seu token de API.');
  await chrome.storage.local.set({ apiToken: token });
  CONFIG.token = token;
  mostrarMainPanel();
  carregarPedidos();
}

// ── Painéis ───────────────────────────────────────────────────────────────

function mostrarConfigPanel() {
  document.getElementById('config-panel').style.display = 'block';
  document.getElementById('main-panel').style.display   = 'none';
  document.getElementById('cfg-token').value = CONFIG.token;
}

function mostrarMainPanel() {
  document.getElementById('config-panel').style.display = 'none';
  document.getElementById('main-panel').style.display   = 'block';
}

// ── API ───────────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const resp = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.token}`,
      ...(options.headers || {}),
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// ── Cache offline ─────────────────────────────────────────────────────────

async function salvarCachePedidos(pedidos) {
  await chrome.storage.local.set({ siscodec_cache: JSON.stringify({ pedidos, ts: Date.now() }) });
}

async function lerCachePedidos() {
  return new Promise(resolve => {
    chrome.storage.local.get(['siscodec_cache'], data => {
      if (!data.siscodec_cache) return resolve([]);
      try { resolve(JSON.parse(data.siscodec_cache).pedidos || []); }
      catch { resolve([]); }
    });
  });
}

async function enfileirarUpdate(pedidoId, status, erroMsg = '') {
  const stored = await new Promise(r => chrome.storage.local.get(['siscodec_pending'], d => r(d.siscodec_pending || '[]')));
  const fila = JSON.parse(stored);
  fila.push({ pedido_id: pedidoId, status, erro_msg: erroMsg, ts: Date.now() });
  await chrome.storage.local.set({ siscodec_pending: JSON.stringify(fila) });
}

async function tentarFlushPendentes() {
  const stored = await new Promise(r => chrome.storage.local.get(['siscodec_pending'], d => r(d.siscodec_pending || '[]')));
  let fila = JSON.parse(stored);
  if (fila.length === 0) return;
  const restantes = [];
  for (const upd of fila) {
    try {
      await apiFetch('/api/siscodec', {
        method: 'POST',
        body: JSON.stringify({ pedido_id: upd.pedido_id, status: upd.status, erro_msg: upd.erro_msg }),
      });
    } catch { restantes.push(upd); }
  }
  await chrome.storage.local.set({ siscodec_pending: JSON.stringify(restantes) });
}

async function atualizarPedido(pedidoId, status, erroMsg = '') {
  try {
    return await apiFetch('/api/siscodec', {
      method: 'POST',
      body: JSON.stringify({ pedido_id: pedidoId, status, erro_msg: erroMsg }),
    });
  } catch {
    await enfileirarUpdate(pedidoId, status, erroMsg);
  }
}

// ── Lista de pedidos ──────────────────────────────────────────────────────

async function carregarPedidos() {
  const lista = document.getElementById('lista-pedidos');
  const badge = document.getElementById('offline-badge');

  if (!CONFIG.token) {
    lista.innerHTML = '<div class="empty">Configure o token primeiro.</div>';
    return;
  }

  lista.innerHTML = '<div class="empty">Carregando…</div>';
  let pedidos = [];

  try {
    await tentarFlushPendentes();
    const data = await apiFetch(`/api/siscodec?status=${tabStatus}`);
    pedidos = data.pedidos || [];
    modoOffline = false;
    badge.style.display = 'none';
    if (tabStatus === 'PENDENTE') await salvarCachePedidos(pedidos);
  } catch {
    modoOffline = true;
    badge.style.display = 'block';
    if (tabStatus === 'PENDENTE') pedidos = await lerCachePedidos();
  }

  pedidosCache = pedidos;

  if (pedidos.length === 0) {
    const sufixo = modoOffline ? ' em cache' : '';
    lista.innerHTML = `<div class="empty">Nenhuma solicitação ${statusLabel(tabStatus).toLowerCase()}${sufixo}.</div>`;
    return;
  }

  lista.innerHTML = pedidos.map(p => renderPedido(p)).join('');
  pedidos.forEach(p => bindPedido(p));
}

function statusLabel(s) {
  return { PENDENTE: 'Pendente', EM_ANDAMENTO: 'Em andamento', CONCLUIDO: 'Concluído', ERRO: 'Erro', CANCELADO: 'Cancelado' }[s] || s;
}

function renderPedido(p) {
  const totalVal = (p.siscodec_celulas || [])
    .filter(c => c.tipo === 'ANULACAO')
    .reduce((s, c) => s + Number(c.valor), 0)
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const celulas = (p.siscodec_celulas || []).sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'ANULACAO' ? -1 : 1;
    return a.ordem - b.ordem;
  });
  const celulaRows = celulas.map(c =>
    `<div style="font-size:9px;color:#8A97AC;display:flex;gap:8px;padding:2px 0">
      <span style="color:${c.tipo === 'ANULACAO' ? '#E06A6A' : '#3FB07A'};font-weight:700;min-width:50px">${c.tipo === 'ANULACAO' ? 'ANULAÇ.' : 'SUPLEM.'}</span>
      <span style="font-family:monospace">${c.ptres}</span>
      <span style="font-family:monospace">${c.nd}</span>
      <span style="margin-left:auto;font-weight:600">${Number(c.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
    </div>`
  ).join('');

  return `
    <div class="pedido-card" id="pedido-${p.id}">
      <div class="pedido-top">
        <span class="pedido-desc" title="${p.descricao}">${p.descricao}</span>
        <span class="celulas-count">${celulas.length} cél.</span>
      </div>
      <div class="pedido-meta">${p.operacao ? p.operacao + ' · ' : ''}${totalVal}</div>
      <div style="margin-bottom:8px;border:1px solid #1E3050;border-radius:4px;padding:6px 8px">${celulaRows}</div>
      ${tabStatus === 'PENDENTE' ? `
        <button class="btn-start" id="start-${p.id}" data-id="${p.id}">
          ▶ Iniciar robô
        </button>
        <div class="status-bar" id="status-${p.id}">
          <div class="step" id="step-${p.id}">Aguardando…</div>
          <div class="progress-bar"><div class="progress-fill" id="prog-${p.id}" style="width:0%"></div></div>
        </div>
      ` : ''}
      ${tabStatus === 'CONCLUIDO' ? `<div style="font-size:9px;color:#3FB07A">✓ ${p.concluido_email || ''}</div>` : ''}
      ${tabStatus === 'ERRO' ? `<div style="font-size:9px;color:#E06A6A">${p.erro_msg || 'Erro desconhecido'}</div>` : ''}
    </div>`;
}

function bindPedido(p) {
  const btn = document.getElementById(`start-${p.id}`);
  if (!btn) return;
  btn.addEventListener('click', () => {
    // Monta fila com todos os pedidos PENDENTES a partir do próximo
    const idx = pedidosCache.findIndex(x => x.id === p.id);
    filaExecucao = idx >= 0 ? pedidosCache.slice(idx + 1) : [];
    iniciarRobo(p);
  });
}

// ── Comunicação com content script ───────────────────────────────────────

async function iniciarRobo(pedido) {
  const resp = await chrome.runtime.sendMessage({ action: 'GET_LAST_TAB' });
  const tabId = resp?.tabId;
  if (!tabId) return alert('Nenhuma aba detectada. Abra a página do SISCODEC em outra aba antes de iniciar.');

  const btn       = document.getElementById(`start-${pedido.id}`);
  const statusBar = document.getElementById(`status-${pedido.id}`);
  const stepEl    = document.getElementById(`step-${pedido.id}`);
  const progEl    = document.getElementById(`prog-${pedido.id}`);

  if (btn)       btn.disabled = true;
  if (statusBar) statusBar.classList.add('show');

  atualizarPedido(pedido.id, 'EM_ANDAMENTO'); // fire-and-forget: não bloqueia o início

  function el(id) { return document.getElementById(id); } // helper de re-query

  function onMensagem(msg) {
    if (msg.pedidoId !== pedido.id) return;

    if (msg.action === 'PROGRESSO') {
      const s = el(`step-${pedido.id}`);
      const p = el(`prog-${pedido.id}`);
      if (s) s.textContent = msg.step || '…';
      if (p) p.style.width = `${msg.progress || 0}%`;
    }

    if (msg.action === 'CONCLUIDO') {
      chrome.runtime.onMessage.removeListener(onMensagem);
      const s = el(`step-${pedido.id}`);
      const p = el(`prog-${pedido.id}`);
      if (s) s.textContent = '✓ Concluído!';
      if (p) { p.style.width = '100%'; p.style.background = '#3FB07A'; }
      atualizarPedido(pedido.id, 'CONCLUIDO').then(async () => {
        await carregarPedidos();
        if (filaExecucao.length > 0) {
          const proximo = filaExecucao.shift();
          await new Promise(r => setTimeout(r, 1500));
          iniciarRobo(proximo);
        }
      });
    }

    if (msg.action === 'ERRO') {
      chrome.runtime.onMessage.removeListener(onMensagem);
      const s = el(`step-${pedido.id}`);
      const p = el(`prog-${pedido.id}`);
      const b = el(`start-${pedido.id}`);
      if (s) s.textContent = `✗ ${msg.mensagem}`;
      if (p) p.style.background = '#E06A6A';
      if (b) b.disabled = false;
      filaExecucao = [];
      atualizarPedido(pedido.id, 'PENDENTE');
    }
  }

  chrome.runtime.onMessage.addListener(onMensagem);

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  } catch { /* já injetado */ }

  chrome.tabs.sendMessage(tabId, {
    action: 'INICIAR',
    pedido: {
      id:               pedido.id,
      destaque:         pedido.destaque,
      entrada_exterior: pedido.entrada_exterior || 'Não',
      obs:              pedido.obs || '',
      celulas:          (pedido.siscodec_celulas || []).sort((a, b) => {
        if (a.tipo !== b.tipo) return a.tipo === 'ANULACAO' ? -1 : 1;
        return a.ordem - b.ordem;
      }),
    },
  });
}

// ── Init ──────────────────────────────────────────────────────────────────

async function init() {
  await carregarConfig();

  if (!CONFIG.token) {
    mostrarConfigPanel();
  } else {
    mostrarMainPanel();
    carregarPedidos();
  }

  document.getElementById('btn-fechar').addEventListener('click', () => window.close());

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tabStatus = btn.dataset.status;
      carregarPedidos();
    });
  });

  document.getElementById('settings-link').addEventListener('click', mostrarConfigPanel);
  document.getElementById('back-link').addEventListener('click', () => { mostrarMainPanel(); carregarPedidos(); });
  document.getElementById('btn-save-cfg').addEventListener('click', salvarConfig);
}

init();
