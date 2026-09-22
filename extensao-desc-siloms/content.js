/**
 * GAPMN — Criador de Descentralizações SILOMS
 * Content script: roda em cada carregamento de página SILOMS.
 * Estado persiste via chrome.storage.local → sobrevive qualquer navegação.
 *
 * Fluxo por página:
 *   'list'  → detecta página de lista → clica "Novo Subprocesso"
 *   'form'  → detecta formulário   → preenche campos + salva + captura Nr. Documento
 *   'fluxo' → detecta seleção fluxo (se nova página) → seleciona fluxo
 */

'use strict';

// ── Configuração — edite aqui para adaptar a extensão ────────────────────────

var STORAGE_KEY  = 'comae_desc';
var PANEL_ID     = '__comaedescPanel__';
var GSHEET_URL   = '';   // Cole aqui a URL do Apps Script da planilha de destino
var FLUXO_NOME   = 'Solicitação de Descentralização';
var PAG_FIXO     = '67201.000782/2026-39';   // PAG fixo da DIRAD — igual para todas as linhas
var EPAG_SIGLA   = 'COMAE';                  // Sigla da unidade ePAG no SILOMS
var HIDDEN_KEY   = 'comae_desc_hidden';
var RESP_KEY     = 'comae_desc_responsaveis';
var RESP_DEFAULT = [
  { nome: '2T FULANO',  peso: 33 },
  { nome: '3S BELTRANO', peso: 33 },
  { nome: '3S CICLANO',  peso: 34 }
];

// ── Utilitários ───────────────────────────────────────────────────────────────

function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function readState() {
  return new Promise(function (res) {
    chrome.storage.local.get(STORAGE_KEY, function (data) {
      res(data[STORAGE_KEY] || null);
    });
  });
}

function saveState(state) {
  return new Promise(function (res) {
    var obj = {};
    obj[STORAGE_KEY] = state;
    chrome.storage.local.set(obj, res);
  });
}

function clearState() {
  return new Promise(function (res) { chrome.storage.local.remove(STORAGE_KEY, res); });
}

// ── Responsáveis ──────────────────────────────────────────────────────────────

function loadResp() {
  return new Promise(function(res) {
    chrome.storage.local.get(RESP_KEY, function(data) {
      res(data[RESP_KEY] || JSON.parse(JSON.stringify(RESP_DEFAULT)));
    });
  });
}

function saveResp(resp) {
  return new Promise(function(res) {
    var obj = {};
    obj[RESP_KEY] = resp;
    chrome.storage.local.set(obj, res);
  });
}

function pickResponsavel(resp) {
  var total = resp.reduce(function(s, r) { return s + (r.peso || 0); }, 0);
  if (!total) return '';
  var rand = Math.random() * total;
  var acc  = 0;
  for (var i = 0; i < resp.length; i++) {
    acc += resp[i].peso;
    if (rand < acc) return resp[i].nome;
  }
  return resp[resp.length - 1].nome;
}

async function renderRespList() {
  var listEl = document.getElementById('__gssp_resp_list__');
  if (!listEl) return;
  var resp  = await loadResp();
  var total = resp.reduce(function(s, r) { return s + r.peso; }, 0);
  listEl.innerHTML = resp.map(function(r, i) {
    var pct = total ? Math.round(r.peso / total * 100) : 0;
    return '<div style="display:flex;align-items:center;gap:4px;padding:2px 0">' +
      '<span style="flex:1;color:#94a3b8;font-size:10px">' + r.nome + '</span>' +
      '<span style="color:#60a5fa;font-size:10px;width:28px;text-align:right">' + pct + '%</span>' +
      '<button data-idx="' + i + '" class="__gssp_rm__" style="padding:1px 5px;background:#7f1d1d;' +
      'color:#fca5a5;border:none;border-radius:3px;font-size:9px;cursor:pointer">&#x2715;</button>' +
    '</div>';
  }).join('');
  var rms = listEl.querySelectorAll('.__gssp_rm__');
  for (var i = 0; i < rms.length; i++) {
    rms[i].onclick = (function(btn) {
      return async function() {
        var idx = parseInt(btn.getAttribute('data-idx'));
        var r2  = await loadResp();
        r2.splice(idx, 1);
        await saveResp(r2);
        renderRespList();
      };
    })(rms[i]);
  }
}

// Todos os contextos acessíveis: document + iframes aninhados (recursivo)
function allDocs() {
  var list = [];
  var visited = [];
  function collect(doc) {
    if (!doc) return;
    for (var v = 0; v < visited.length; v++) { if (visited[v] === doc) return; }
    visited.push(doc);
    list.push(doc);
    try {
      var frames = doc.querySelectorAll('iframe, frame');
      for (var i = 0; i < frames.length; i++) {
        try { collect(frames[i].contentDocument); } catch (_) {}
      }
    } catch (_) {}
  }
  collect(document);
  return list;
}

// Retorna o documento do popup GeneXus (iframe cuja URL tem gxPopupLevel) — busca recursiva
function getPopupDoc() {
  var docs = allDocs();
  for (var di = 0; di < docs.length; di++) {
    try {
      var href = docs[di].location ? docs[di].location.href : '';
      if (/gxPopupLevel|GxPopup/i.test(href)) return docs[di];
    } catch (_) {}
  }
  return null;
}

async function waitPopup(ms, beforeDocs) {
  var end = Date.now() + (ms || 10000);
  while (Date.now() < end) {
    if (beforeDocs) {
      var current = allDocs();
      for (var i = 0; i < current.length; i++) {
        var isNew = true;
        for (var j = 0; j < beforeDocs.length; j++) {
          if (beforeDocs[j] === current[i]) { isNew = false; break; }
        }
        if (!isNew) continue;
        try {
          var href = '';
          try { href = current[i].location ? current[i].location.href : ''; } catch(_) {}
          if (!href || href === 'about:blank') continue;
          if (current[i].body && current[i].body.children.length > 1) return current[i];
        } catch(_) {}
      }
    } else {
      var pd = getPopupDoc();
      if (pd && pd.body && pd.body.children.length > 1) return pd;
    }
    await delay(300);
  }
  return null;
}

function findEl(sel, text, skipPopup) {
  var docs = allDocs();
  for (var di = 0; di < docs.length; di++) {
    var d = docs[di];
    if (skipPopup) {
      try { if (/gxPopupLevel|GxPopup/i.test(d.location.href)) continue; } catch (_) {}
    }
    try {
      var els = d.querySelectorAll(sel);
      for (var ei = 0; ei < els.length; ei++) {
        if (!text) return els[ei];
        var t = (els[ei].value || els[ei].textContent || '');
        if (t.toLowerCase().indexOf(text.toLowerCase()) !== -1) return els[ei];
      }
    } catch (_) {}
  }
  return null;
}

async function waitEl(sel, text, ms, skipPopup) {
  var end = Date.now() + (ms || 15000);
  while (Date.now() < end) {
    var el = findEl(sel, text, skipPopup);
    if (el) return el;
    await delay(350);
  }
  return null;
}

function fill(el, value) {
  try { el.focus(); } catch (_) {}
  try { el.value = value; } catch (_) {}
  ['input', 'change', 'blur'].forEach(function (ev) {
    try { el.dispatchEvent(new Event(ev, { bubbles: true })); } catch (_) {}
  });
}

function injectClickByText(pd, searchText) {
  try {
    var safe = JSON.stringify(searchText);
    var s = pd.createElement('script');
    s.textContent =
      '(function(){' +
      'var needle=' + safe + '.toLowerCase();' +
      'var all=document.querySelectorAll("a,td[onclick],tr[onclick]");' +
      'for(var i=0;i<all.length;i++){' +
        'var t=(all[i].textContent||"").trim();' +
        'if(t.toLowerCase().indexOf(needle)!==-1){all[i].click();return;}' +
      '}' +
      '})();';
    (pd.head || pd.body).appendChild(s);
    try { s.parentNode.removeChild(s); } catch(_) {}
    return true;
  } catch(e) { log('injectClickByText erro: ' + e.message, 'warn'); return false; }
}

async function waitPopupClosed(ms) {
  var end = Date.now() + (ms || 8000);
  while (Date.now() < end) {
    var pd = getPopupDoc();
    if (!pd) return true;
    try { if (!pd.body || !pd.body.isConnected) return true; } catch(_) { return true; }
    await delay(300);
  }
  return false;
}

function forceClosePopup() {
  try {
    var s = document.createElement('script');
    s.textContent =
      '(function(){' +
      'if(typeof gxClosePopup==="function"){gxClosePopup(0);return;}' +
      'if(typeof gx!=="undefined"&&gx&&gx.popup&&gx.popup.Close){gx.popup.Close(0);return;}' +
      'var iframes=document.querySelectorAll("iframe,frame");' +
      'for(var i=0;i<iframes.length;i++){' +
        'var src=(iframes[i].src||"");' +
        'if(/gxPopupLevel|GxPopup/i.test(src)){' +
          'iframes[i].parentNode&&iframes[i].parentNode.removeChild(iframes[i]);break;' +
        '}' +
      '}' +
      'document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",keyCode:27,bubbles:true}));' +
      '})();';
    (document.head || document.body).appendChild(s);
    try { s.parentNode.removeChild(s); } catch(_) {}
  } catch(_) {}
}

function findArrowNear(labelText, excludeTexts) {
  var docs = allDocs();
  excludeTexts = excludeTexts || [];
  for (var di = 0; di < docs.length; di++) {
    var d = docs[di];
    try {
      var cells = d.querySelectorAll('td, th, label, span, b, div');
      for (var ci = 0; ci < cells.length; ci++) {
        var txt = (cells[ci].textContent || '').trim().toLowerCase();
        if (txt.indexOf(labelText.toLowerCase()) === -1 || txt.length > 60) continue;
        var skip = excludeTexts.some(function (x) { return txt.indexOf(x) !== -1; });
        if (skip) continue;
        var row = cells[ci].closest ? cells[ci].closest('tr') : cells[ci].parentElement;
        if (row) {
          var arr = row.querySelector('input[type="image"], img[onclick], img[src*="seta" i], img[src*="arrow" i], img[src*="lupa" i]');
          if (arr) return arr;
        }
      }
    } catch (_) {}
  }
  return null;
}

function clickSearchBtn(pd) {
  var btn = pd.querySelector(
    'input[value*="Renovar" i], input[value*="Pesquisar" i], input[value*="Buscar" i],' +
    'button[title*="Renovar" i], button[title*="Pesquisar" i]'
  );
  if (!btn) {
    var refInp = pd.getElementById ? pd.getElementById('vCSG_UNIDADE') : null;
    if (!refInp) refInp = pd.querySelector('input[name="vCSG_UNIDADE"]');
    if (refInp) {
      var parentRow = refInp.closest ? refInp.closest('tr') : null;
      if (!parentRow) {
        var p = refInp.parentElement;
        while (p && p.tagName !== 'TR' && p.tagName !== 'FORM') p = p.parentElement;
        if (p && p.tagName === 'TR') parentRow = p;
      }
      if (parentRow) btn = parentRow.querySelector('input[type="image"], img[onclick]');
    }
  }
  if (!btn) {
    var imgs = pd.querySelectorAll('input[type="image"]');
    for (var i = 0; i < imgs.length; i++) {
      var src = (imgs[i].src || '').toLowerCase();
      if (!/fechar|close|sair|exit|cancel|volta|voltar/i.test(src)) { btn = imgs[i]; break; }
    }
  }
  if (btn) {
    log('    Lupa: ' + (btn.src || btn.value || btn.tagName));
    btn.click();
    return true;
  }
  return false;
}

function findInputUnderHeader(pd, colLabel) {
  var headers = pd.querySelectorAll('th, td');
  for (var hi = 0; hi < headers.length; hi++) {
    var ht = (headers[hi].textContent || '').trim();
    if (ht.toLowerCase() !== colLabel.toLowerCase()) continue;
    var colIdx = 0;
    var s = headers[hi];
    while (s.previousElementSibling) { colIdx++; s = s.previousElementSibling; }
    var trs = pd.querySelectorAll('tr');
    for (var ti = 0; ti < trs.length; ti++) {
      var tds = trs[ti].querySelectorAll('td, th');
      if (tds.length > colIdx) {
        var inp = tds[colIdx].querySelector('input[type="text"], input:not([type])');
        if (inp) return inp;
      }
    }
  }
  return null;
}

async function gxSelectInPopup(pd, searchTerm, displayTerm, colHint) {
  await delay(400);

  var allInputs = pd.querySelectorAll('input[type="text"], input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="image"]):not([type="button"]):not([type="submit"])');
  for (var ii = 0; ii < allInputs.length; ii++) {
    log('    input[' + ii + '] name=' + (allInputs[ii].name||'?') + ' id=' + (allInputs[ii].id||'?'));
  }

  var sinp = colHint ? findInputUnderHeader(pd, colHint) : null;
  if (!sinp && allInputs.length > 1) {
    for (var fi = 0; fi < allInputs.length; fi++) {
      if ((allInputs[fi].name || '').toUpperCase() !== 'HELP') { sinp = allInputs[fi]; break; }
    }
  }
  if (!sinp) sinp = allInputs[0] || null;

  if (sinp) {
    log('    Preenchendo: name=' + (sinp.name||'?') + ' → "' + searchTerm + '"');
    fill(sinp, searchTerm); await delay(300);
  } else {
    log('    Nenhum campo de busca encontrado', 'warn');
  }

  var clicked = clickSearchBtn(pd);
  log('    Botão busca ' + (clicked ? 'clicado ✓' : 'não encontrado — tentando Enter'), clicked ? 'info' : 'warn');
  if (!clicked && sinp) {
    try { sinp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true })); } catch (_) {}
  }
  await delay(3000);

  try {
    if (!pd.body || !pd.body.isConnected) {
      log('    Popup fechou inesperadamente', 'warn');
      return false;
    }
  } catch (_) {}

  var links = pd.querySelectorAll('a[href], a[onclick]');
  log('    Links encontrados: ' + links.length);
  for (var li = 0; li < Math.min(links.length, 8); li++) {
    var lt = (links[li].textContent || '').trim();
    if (lt.length > 0 && lt.length < 100) log('    link[' + li + ']: ' + lt);
  }

  function gxClick(el, doc) {
    var onclick = (el.getAttribute ? el.getAttribute('onclick') : null) || '';
    var href    = (el.getAttribute ? el.getAttribute('href')    : null) || '';
    var code = onclick || (href.indexOf('javascript:') === 0 ? href.slice(11) : '');
    log('    gxClick: onclick="' + onclick.substring(0,60) + '" href="' + href.substring(0,80) + '"');
    if (code && doc) {
      try {
        var s = doc.createElement('script');
        s.textContent = '(function(){try{' + code + '}catch(e){console.error("[GAPMN]",e);}})();';
        doc.body.appendChild(s);
        try { doc.body.removeChild(s); } catch(_) {}
        log('    Script injetado ✓');
        return;
      } catch(e) { log('    Script injection falhou: ' + e.message, 'warn'); }
    }
    try { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); } catch(_) {}
    try { el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true })); } catch(_) {}
    try { el.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true })); } catch(_) {}
    try { el.click(); } catch(_) {}
    log('    MouseEvent disparado (fallback)');
  }

  var allLinks = pd.querySelectorAll('a');
  log('    Total links <a>: ' + allLinks.length);
  for (var li2 = 0; li2 < allLinks.length; li2++) {
    var lt2 = (allLinks[li2].textContent || '').trim();
    if (lt2.length > 0 && lt2.length < 80) log('    a[' + li2 + ']: ' + lt2);
  }
  for (var li3 = 0; li3 < allLinks.length; li3++) {
    var rtxt = (allLinks[li3].textContent || '').trim().toLowerCase();
    if (rtxt.indexOf(displayTerm.toLowerCase()) !== -1) {
      var linkTxt3 = allLinks[li3].textContent.trim();
      log('    Clicando: "' + linkTxt3 + '" onclick=' + (allLinks[li3].getAttribute('onclick')||'vazio').substring(0,60));
      if (!injectClickByText(pd, linkTxt3)) gxClick(allLinks[li3], pd);
      log('    "' + displayTerm + '" clicado — aguardando popup fechar…', 'ok');
      await delay(2000);
      return true;
    }
  }

  var trs = pd.querySelectorAll('tr');
  for (var ri2 = 0; ri2 < trs.length; ri2++) {
    if ((trs[ri2].textContent || '').toLowerCase().indexOf(displayTerm.toLowerCase()) === -1) continue;
    var trTxt = trs[ri2].textContent.trim().substring(0, 50);
    log('    Clicando TR: "' + trTxt + '"');
    if (!injectClickByText(pd, displayTerm)) {
      var clickTarget = trs[ri2].querySelector('a, td[onclick]') || trs[ri2];
      gxClick(clickTarget, pd);
    }
    log('    "' + displayTerm + '" clicado ✓', 'ok');
    await delay(2000);
    return true;
  }
  return false;
}

async function gxSelect(arrow, searchTerm, displayTerm, colHint) {
  if (!arrow) { log('Seta não encontrada — preencha manualmente', 'warn'); return false; }
  var beforeDocs = allDocs();
  arrow.click();
  log('    Popup abrindo…');

  var pd = await waitPopup(12000, beforeDocs);
  if (!pd) { log('    Popup não carregou', 'warn'); return false; }
  log('    Popup carregado ✓ — URL: ' + (pd.location ? pd.location.href.split('/').pop() : '?'));

  var found = await gxSelectInPopup(pd, searchTerm, displayTerm, colHint);
  if (!found) { log('    "' + displayTerm + '" não encontrado no popup', 'warn'); return false; }

  log('    Aguardando popup fechar…');
  var closed = await waitPopupClosed(6000);
  if (!closed) {
    log('    Popup não fechou — forçando…', 'warn');
    forceClosePopup();
    await delay(1500);
    closed = !(getPopupDoc());
  }
  log('    Popup ' + (closed ? 'fechado ✓' : 'ainda aberto'), closed ? 'ok' : 'warn');
  return true;
}

async function searchPAGInPopup(pd, pagNr, tipo) {
  await delay(400);
  var pagInp = null;
  var allInps = pd.querySelectorAll('input[type="text"]');
  log('    Popup PAG inputs: ' + allInps.length);
  for (var ii = 0; ii < allInps.length; ii++) {
    log('    inp[' + ii + '] name=' + (allInps[ii].name||'?'));
  }
  if (allInps.length > 0) pagInp = allInps[0];

  if (pagInp) { fill(pagInp, pagNr); await delay(200); }
  else log('    Campo PAG não encontrado no popup', 'warn');

  if (tipo) {
    var sels = pd.querySelectorAll('select');
    for (var si = 0; si < sels.length; si++) {
      var opts = sels[si].options;
      for (var oi = 0; oi < opts.length; oi++) {
        if (opts[oi].text.toLowerCase().indexOf(tipo.toLowerCase()) !== -1) {
          sels[si].value = opts[oi].value;
          sels[si].dispatchEvent(new Event('change', { bubbles: true }));
          log('    Tipo → "' + opts[oi].text + '"');
          break;
        }
      }
    }
    await delay(300);
  }

  var clicked = clickSearchBtn(pd);
  log('    Lupa PAG ' + (clicked ? 'clicada ✓' : 'não encontrada'), clicked ? 'info' : 'warn');
  await delay(3000);

  var links = pd.querySelectorAll('a[href], a[onclick], td[onclick], tr[onclick], img[onclick]');
  log('    Resultados: ' + links.length + ' links/imgs/trs');

  for (var li2 = 0; li2 < links.length; li2++) {
    var rt = (links[li2].textContent || '').trim();
    if (rt.toLowerCase().indexOf(pagNr.toLowerCase()) !== -1) {
      log('    Selecionando via link: "' + rt.substring(0,60) + '"');
      if (!injectClickByText(pd, rt)) links[li2].click();
      log('    PAG "' + pagNr + '" selecionado ✓', 'ok');
      await delay(800);
      return true;
    }
  }

  var trs = pd.querySelectorAll('tr');
  for (var tri = 0; tri < trs.length; tri++) {
    var trTxt = (trs[tri].textContent || '').replace(/\s+/g, ' ').trim();
    if (trTxt.toLowerCase().indexOf(pagNr.toLowerCase()) === -1) continue;

    log('    TR com PAG: "' + trTxt.substring(0, 80) + '"');

    try {
      var needle = JSON.stringify(pagNr);
      var s2 = pd.createElement('script');
      s2.textContent =
        '(function(){' +
        'var needle=' + needle + '.toLowerCase();' +
        'var trs=document.querySelectorAll("tr");' +
        'for(var i=0;i<trs.length;i++){' +
          'if((trs[i].textContent||"").toLowerCase().indexOf(needle)===-1)continue;' +
          'var t=trs[i].querySelector("img[onclick]")||' +
               'trs[i].querySelector("input[type=image]")||' +
               'trs[i].querySelector("img")||' +
               'trs[i].querySelector("td[onclick]")||' +
               'trs[i];' +
          'if(t){t.click();return;}' +
        '}' +
        '})();';
      (pd.head || pd.body).appendChild(s2);
      try { s2.parentNode.removeChild(s2); } catch(_) {}
    } catch(e) {
      var chk = trs[tri].querySelector('img[onclick]') ||
                trs[tri].querySelector('input[type="image"]') ||
                trs[tri].querySelector('img') ||
                trs[tri].querySelector('td[onclick]') ||
                trs[tri];
      if (chk) chk.click();
    }

    log('    PAG "' + pagNr + '" selecionado ✓', 'ok');
    await delay(800);
    return true;
  }
  return false;
}

async function gxSelectPAG(arrow, pagNr) {
  if (!arrow) { log('  Seta PAG não encontrada', 'warn'); return false; }

  log('  PAG seta: tag=' + arrow.tagName +
      ' id=' + (arrow.id||'—') +
      ' name=' + (arrow.name||'—') +
      ' src=' + (arrow.src||'—').split('/').pop() +
      ' onclick=' + ((arrow.getAttribute&&arrow.getAttribute('onclick'))||'vazio'));

  var arrowDoc = null;
  var allD = allDocs();
  for (var di0 = 0; di0 < allD.length; di0++) {
    try { if (allD[di0].contains(arrow)) { arrowDoc = allD[di0]; break; } } catch(_) {}
  }

  var iframeState = [];
  allDocs().forEach(function(d) {
    try { iframeState.push({ doc: d, href: (d.location ? d.location.href : '') }); } catch(_) {}
  });

  var arrowOnclick = (arrow.getAttribute && arrow.getAttribute('onclick')) || '';
  if (arrowOnclick && arrowDoc) {
    try {
      var s0 = arrowDoc.createElement('script');
      s0.textContent = '(function(){try{' + arrowOnclick + '}catch(e){console.error("[GAPMN PAG]",e);}})();';
      (arrowDoc.head || arrowDoc.body).appendChild(s0);
      try { s0.parentNode.removeChild(s0); } catch(_) {}
      log('  PAG onclick injetado ✓');
    } catch(e) { log('  Injeção onclick falhou: ' + e.message, 'warn'); }
  }

  if (arrowDoc) {
    try {
      var s1 = arrowDoc.createElement('script');
      s1.textContent = '(function(){' +
        'var cells=document.querySelectorAll("td,th,label,span,b,div");' +
        'for(var i=0;i<cells.length;i++){' +
          'var t=(cells[i].textContent||"").trim();' +
          'if(!/^pag:?$/i.test(t))continue;' +
          'var row=cells[i].closest?cells[i].closest("tr"):cells[i].parentElement;' +
          'if(!row)continue;' +
          'var inp=row.querySelector("input[type=image]");' +
          'if(inp){inp.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true}));inp.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,cancelable:true}));inp.click();return;}' +
        '}' +
      '})();';
      (arrowDoc.head || arrowDoc.body).appendChild(s1);
      try { s1.parentNode.removeChild(s1); } catch(_) {}
      log('  PAG label injection ✓');
    } catch(e) { log('  Injeção label falhou: ' + e.message, 'warn'); }
  }

  try { arrow.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true })); } catch(_) {}
  try { arrow.dispatchEvent(new MouseEvent('mousedown',  { bubbles: true, cancelable: true })); } catch(_) {}
  try { arrow.dispatchEvent(new MouseEvent('mouseup',    { bubbles: true, cancelable: true })); } catch(_) {}
  try { arrow.click(); } catch(_) {}
  log('  PAG mouse events + click disparados');
  log('  Popup PAG abrindo…');

  var pd = null;
  var endMs = Date.now() + 12000;
  while (Date.now() < endMs && !pd) {
    var curDocs = allDocs();
    for (var di2 = 0; di2 < curDocs.length; di2++) {
      try {
        var curHref = '';
        try { curHref = curDocs[di2].location ? curDocs[di2].location.href : ''; } catch(_) {}
        if (!curHref || curHref === 'about:blank') continue;
        if (!curDocs[di2].body || curDocs[di2].body.children.length < 2) continue;

        var prevHref = null;
        var isKnown = false;
        for (var di3 = 0; di3 < iframeState.length; di3++) {
          if (iframeState[di3].doc === curDocs[di2]) {
            isKnown = true; prevHref = iframeState[di3].href; break;
          }
        }

        var isNew = !isKnown;
        var urlChanged = isKnown && prevHref !== curHref;

        if (isNew || urlChanged) {
          pd = curDocs[di2];
          log('  Popup PAG: ' + (isNew ? 'novo iframe' : 'iframe reutilizado') +
              ' | URL: ' + curHref.split('/').pop(), 'ok');
          break;
        }
      } catch(_) {}
    }
    if (!pd) await delay(300);
  }

  if (!pd) { log('  Popup PAG não carregou (12s)', 'warn'); return false; }
  log('  Popup PAG carregado ✓');

  var found = await searchPAGInPopup(pd, pagNr, null);
  if (found) {
    await waitPopupClosed(6000);
    return true;
  }

  log('  PAG não encontrado — tentando "Outros"…', 'warn');

  var selects = pd.querySelectorAll('select');
  var changed = false;
  for (var si = 0; si < selects.length; si++) {
    var opts = selects[si].options;
    for (var oi = 0; oi < opts.length; oi++) {
      if (/outros/i.test(opts[oi].text)) {
        selects[si].value = opts[oi].value;
        selects[si].dispatchEvent(new Event('change', { bubbles: true }));
        changed = true;
        log('  Tipo alterado para "Outros"');
        break;
      }
    }
    if (changed) break;
  }

  await delay(300);
  found = await searchPAGInPopup(pd, pagNr, null);
  if (found) {
    await waitPopupClosed(6000);
    return true;
  }

  log('  ✗ PAG "' + pagNr + '" não encontrado', 'err');
  try {
    var closeBtn = pd.querySelector('input[type="image"][src*="fechar" i], input[type="image"][src*="close" i]');
    if (!closeBtn) closeBtn = pd.querySelector('img[onclick*="close" i], a[onclick*="close" i]');
    if (closeBtn) closeBtn.click();
  } catch (_) {}
  return false;
}

async function captureNrDoc() {
  var end = Date.now() + 15000;
  while (Date.now() < end) {
    var docs = allDocs();
    for (var di = 0; di < docs.length; di++) {
      var d = docs[di];
      try {
        var cells = d.querySelectorAll('td, span, div, b, label');
        for (var ci = 0; ci < cells.length; ci++) {
          var txt = (cells[ci].textContent || '').trim();
          if (!/nr\.?\s*documento/i.test(txt)) continue;
          var m = txt.match(/nr\.?\s*documento\s+(\d[\d\.\/\-]{1,20})/i);
          if (m && m[1] !== '0') return m[1].trim();
          var next = cells[ci].nextElementSibling;
          if (next) {
            var v = (next.textContent || next.value || '').trim();
            if (v && v !== '0' && /\d/.test(v) && v.length < 30) return v;
          }
        }
      } catch (_) {}
    }
    await delay(500);
  }
  return '(verificar)';
}

// ── Painel de Log ─────────────────────────────────────────────────────────────

var logEl = null;

function injectPanel(forceShow) {
  if (document.getElementById(PANEL_ID)) return;

  var startVisible = !!forceShow;

  var panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.cssText = [
    'position:fixed;bottom:16px;right:16px;width:360px;max-height:88vh',
    'background:#0f172a;color:#e2e8f0',
    'border:1px solid #334155;border-radius:12px',
    'font:12px/1.5 system-ui,sans-serif',
    'z-index:2147483647;box-shadow:0 8px 32px rgba(0,0,0,.85)',
    'overflow:hidden;display:' + (startVisible ? 'flex' : 'none') + ';flex-direction:column'
  ].join(';');

  panel.innerHTML = [
    '<div style="padding:10px 14px;background:#0f172a;border-bottom:1px solid #1e293b;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">',
      '<div>',
        '<div style="font-weight:700;color:#60a5fa;font-size:13px">Criador de Descentralizações</div>',
        '<div id="__gssp_sub__" style="font-size:10px;color:#475569">Aguardando…</div>',
      '</div>',
      '<button id="__gssp_close__" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:18px;padding:0 2px;line-height:1">&times;</button>',
    '</div>',

    '<div id="__gssp_import__" style="padding:12px 14px">',
      '<p style="color:#94a3b8;font-size:11px;margin-bottom:8px">Col. <b style="color:#60a5fa">A</b> = N&uacute;mero da Descentraliza&ccedil;&atilde;o</p>',
      '<div id="__gssp_drop__" style="border:2px dashed #334155;border-radius:8px;padding:16px;text-align:center;cursor:pointer;color:#64748b;font-size:11px;transition:border-color .2s">',
        'Clique ou arraste o arquivo .xlsx',
        '<input type="file" id="__gssp_file__" accept=".xlsx,.xls" style="display:none">',
      '</div>',
      '<div id="__gssp_preview__" style="display:none;margin-top:8px">',
        '<div id="__gssp_list__" style="background:#1e293b;border-radius:6px;padding:8px;font-size:10px;color:#94a3b8;max-height:100px;overflow-y:auto;margin-bottom:8px"></div>',
        '<button id="__gssp_start__" style="width:100%;padding:9px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">&#9654; Iniciar cria&ccedil;&atilde;o</button>',
      '</div>',

      '<div id="__gssp_resp__" style="margin-top:10px;border-top:1px solid #1e293b;padding-top:8px">',
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">',
          '<span style="color:#94a3b8;font-size:11px;font-weight:600">Respons&aacute;veis</span>',
          '<button id="__gssp_resp_toggle__" style="font-size:10px;color:#60a5fa;background:none;border:none;cursor:pointer">&#9660; ver</button>',
        '</div>',
        '<div id="__gssp_resp_body__" style="display:none">',
          '<div id="__gssp_resp_list__" style="margin-bottom:6px"></div>',
          '<div style="display:flex;gap:4px">',
            '<input id="__gssp_resp_name__" placeholder="Nome" style="flex:1;padding:4px 6px;border-radius:5px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:10px">',
            '<input id="__gssp_resp_peso__" placeholder="%" type="number" min="1" max="100" style="width:40px;padding:4px 4px;border-radius:5px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:10px;text-align:center">',
            '<button id="__gssp_resp_add__" style="padding:4px 8px;background:#1d4ed8;color:#fff;border:none;border-radius:5px;font-size:10px;cursor:pointer">+</button>',
          '</div>',
        '</div>',
      '</div>',
    '</div>',

    '<div id="__gssp_prog__" style="display:none;padding:8px 14px 0">',
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">',
        '<span id="__gssp_pt__" style="font-size:10px;color:#94a3b8">0/0</span>',
        '<button id="__gssp_abort__" style="font-size:10px;padding:2px 8px;background:#7f1d1d;color:#fca5a5;border:none;border-radius:4px;cursor:pointer">Abortar</button>',
      '</div>',
      '<div style="background:#1e293b;border-radius:3px;height:5px;overflow:hidden;margin-bottom:8px">',
        '<div id="__gssp_bar__" style="height:100%;background:#2563eb;width:0%;transition:width .3s"></div>',
      '</div>',
    '</div>',

    '<div id="__gssp_log__" style="background:#0a0f1a;border-top:1px solid #1e293b;padding:6px 10px;min-height:80px;max-height:260px;overflow-y:auto;font-family:monospace;font-size:10px;line-height:1.7;flex:1"></div>',
  ].join('');

  document.body.appendChild(panel);

  logEl = document.getElementById('__gssp_log__');

  var tab = document.createElement('button');
  tab.id = '__gssp_tab__';
  tab.textContent = 'D';
  tab.title = 'Abrir Criador de Descentralizações';
  tab.style.cssText = [
    'position:fixed;bottom:16px;right:16px',
    'width:40px;height:40px;border-radius:50%',
    'background:#1e40af;color:#fff;border:none;cursor:pointer',
    'font-size:14px;font-weight:700;z-index:2147483647',
    'box-shadow:0 4px 12px rgba(0,0,0,.5)',
    'display:' + (startVisible ? 'none' : 'flex') + ';align-items:center;justify-content:center',
    'transition:background .2s'
  ].join(';');
  tab.onmouseenter = function () { tab.style.background = '#1d4ed8'; };
  tab.onmouseleave = function () { tab.style.background = '#1e40af'; };
  tab.onclick = function () {
    localStorage.removeItem(HIDDEN_KEY);
    panel.style.display = 'flex';
    tab.style.display = 'none';
  };
  document.body.appendChild(tab);

  document.getElementById('__gssp_close__').onclick = function () {
    panel.style.display = 'none';
    tab.style.display = 'flex';
  };

  var dropEl = document.getElementById('__gssp_drop__');
  dropEl.onclick = function () { document.getElementById('__gssp_file__').click(); };
  document.getElementById('__gssp_file__').onchange = function () { handleFile(this.files[0]); };
  dropEl.ondragover  = function (e) { e.preventDefault(); dropEl.style.borderColor = '#2563eb'; };
  dropEl.ondragleave = function ()  { dropEl.style.borderColor = '#334155'; };
  dropEl.ondrop = function (e) {
    e.preventDefault(); dropEl.style.borderColor = '#334155';
    handleFile(e.dataTransfer.files[0]);
  };

  document.getElementById('__gssp_start__').onclick = function () {
    if (!pendingItems.length) return;
    startAutomation(pendingItems);
  };

  document.getElementById('__gssp_resp_toggle__').onclick = function() {
    var body  = document.getElementById('__gssp_resp_body__');
    var btn   = document.getElementById('__gssp_resp_toggle__');
    var open  = body.style.display !== 'none';
    body.style.display = open ? 'none' : '';
    btn.textContent    = open ? '▼ ver' : '▲ ocultar';
    if (!open) renderRespList();
  };

  document.getElementById('__gssp_resp_add__').onclick = async function() {
    var nameEl = document.getElementById('__gssp_resp_name__');
    var pesoEl = document.getElementById('__gssp_resp_peso__');
    var nome   = (nameEl.value || '').trim().toUpperCase();
    var peso   = parseInt(pesoEl.value) || 0;
    if (!nome || !peso) return;
    var resp = await loadResp();
    resp.push({ nome: nome, peso: peso });
    await saveResp(resp);
    nameEl.value = '';
    pesoEl.value = '';
    renderRespList();
  };

  document.getElementById('__gssp_abort__').onclick = async function () {
    await clearState();
    window.location.reload();
  };
}

function log(msg, lvl) {
  if (!logEl) logEl = document.getElementById('__gssp_log__');
  if (!logEl) return;
  var c = { info:'#cbd5e1', ok:'#4ade80', warn:'#fcd34d', err:'#f87171' };
  var d = document.createElement('div');
  d.style.color = c[lvl] || c.info;
  var ts = new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  d.textContent = '[' + ts + '] ' + msg;
  logEl.appendChild(d);
  logEl.scrollTop = logEl.scrollHeight;
}

function setSub(t) {
  var el = document.getElementById('__gssp_sub__');
  if (el) el.textContent = t;
}

function setProgress(cur, total) {
  var pt = document.getElementById('__gssp_pt__');
  var bar = document.getElementById('__gssp_bar__');
  if (pt)  pt.textContent = cur + '/' + total;
  if (bar) bar.style.width = (total ? (cur / total * 100) : 0) + '%';
}

// ── Excel ─────────────────────────────────────────────────────────────────────

var pendingItems = [];

function parseExcel(file) {
  return new Promise(function (res, rej) {
    if (typeof XLSX === 'undefined') { rej(new Error('XLSX não carregado — verifique xlsx.full.min.js na pasta da extensão')); return; }
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var wb   = XLSX.read(e.target.result, { type: 'binary' });
        var ws   = wb.Sheets[wb.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        for (var d = 0; d < Math.min(4, rows.length); d++) {
          console.log('[GAPMN Desc] linha ' + d + ' | colA=' + JSON.stringify(rows[d][0]));
        }
        var items = [];
        for (var i = 0; i < rows.length; i++) {
          var numero = String(rows[i][0] || '').trim();
          // Pula cabeçalhos e linhas vazias
          if (!numero || /^(n[úu]m|nro|n\.|#|x$)/i.test(numero)) continue;
          items.push({ numero: numero });
        }
        res(items);
      } catch (e2) { rej(e2); }
    };
    reader.onerror = rej;
    reader.readAsBinaryString(file);
  });
}

function handleFile(file) {
  if (!file) return;
  log('Lendo ' + file.name + '…');
  parseExcel(file).then(function (items) {
    if (!items.length) { log('Nenhum item encontrado na coluna A', 'warn'); return; }
    pendingItems = items;
    var listEl = document.getElementById('__gssp_list__');
    if (listEl) listEl.innerHTML = items.map(function (it, i) {
      return '<span style="color:#60a5fa">' + (i+1) + '.</span> Descentralização ' + it.numero;
    }).join('<br>');
    var prev = document.getElementById('__gssp_preview__');
    if (prev) prev.style.display = '';
    log(items.length + ' itens prontos. PAG fixo: ' + PAG_FIXO, 'ok');
  }).catch(function (e) { log('Erro Excel: ' + e.message, 'err'); });
}

// ── Inicia automação ──────────────────────────────────────────────────────────

async function startAutomation(items) {
  var resp = await loadResp();
  items = items.map(function(it) {
    return Object.assign({}, it, { responsavel: pickResponsavel(resp) });
  });

  var state = {
    running: true,
    queue: items,
    current: 0,
    results: [],
    step: 'list',
    currentNome: '',
  };
  await saveState(state);

  document.getElementById('__gssp_import__').style.display = 'none';
  document.getElementById('__gssp_prog__').style.display   = '';
  setProgress(1, items.length);

  log('Iniciando com ' + items.length + ' itens… PAG fixo: ' + PAG_FIXO, 'ok');
  await executePage(state);
}

// ── Executora de página ───────────────────────────────────────────────────────

async function executePage(state) {
  if (!state || !state.running) return;

  var item = state.queue[state.current];
  if (!item) { await finalize(state); return; }

  setSub('Descentralização ' + item.numero + ' (' + (state.current + 1) + '/' + state.queue.length + ')');
  setProgress(state.current + 1, state.queue.length);

  if (state.step === 'list') {
    await execListPage(state, item);
  } else if (state.step === 'form') {
    await execFormPage(state, item);
  }
}

// ── Ação na página de LISTA ───────────────────────────────────────────────────

async function execListPage(state, item) {
  log('━━ [' + (state.current+1) + '/' + state.queue.length + '] Descentralização ' + item.numero);
  log('  Buscando "Novo Subprocesso"…');

  var btn = await waitEl(
    'input[type="button"], button, a, input[type="submit"]',
    'Novo Subprocesso', 12000, true
  );
  if (!btn) { log('  ✗ Botão não encontrado', 'err'); return; }

  state.step = 'form';
  state.currentNome = 'Solicitação de Descentralização ' + item.numero;
  await saveState(state);

  btn.click();
}

// ── Ação na página de FORMULÁRIO ──────────────────────────────────────────────

async function execFormPage(state, item) {
  log('  [form] Formulário carregado ✓');
  await delay(800);

  var nomeVal = state.currentNome || ('Solicitação de Descentralização ' + item.numero);

  // Campo Nome
  log('  [1] Nome…');
  var nomeEl = null;
  var docs = allDocs();
  outer:
  for (var di = 0; di < docs.length; di++) {
    var d = docs[di];
    var cells = d.querySelectorAll('td, th, label, span, b');
    for (var ci = 0; ci < cells.length; ci++) {
      var ct = (cells[ci].textContent || '').trim().toLowerCase();
      if (ct !== 'nome' && ct !== 'nome:') continue;
      var next = cells[ci].nextElementSibling || (cells[ci].parentElement && cells[ci].parentElement.nextElementSibling);
      var inp = next ? (next.tagName === 'INPUT' ? next : next.querySelector('input[type="text"]')) : null;
      if (inp && !inp.readOnly) { nomeEl = inp; break outer; }
    }
    var inputs = d.querySelectorAll('input[type="text"]');
    for (var ii = 0; ii < inputs.length; ii++) {
      if (!inputs[ii].readOnly && !inputs[ii].disabled) { nomeEl = inputs[ii]; break outer; }
    }
  }
  if (nomeEl) { fill(nomeEl, nomeVal); await delay(200); }
  else log('  Campo Nome não encontrado', 'warn');

  // Campo Assunto (textarea)
  log('  [2] Assunto…');
  var ta = findEl('textarea', null, true);
  if (ta) { fill(ta, nomeVal); await delay(200); }

  // ePAG
  log('  [3] ePAG → ' + EPAG_SIGLA + '…');
  var epagArrow = findArrowNear('epag', []) || findArrowNear('unidade do epag', []);
  var epagOk = await gxSelect(epagArrow, EPAG_SIGLA, EPAG_SIGLA, 'Sigla');
  if (!epagOk) log('  ePAG não selecionado — verifique manualmente', 'warn');
  await delay(2000);

  // PAG (valor fixo)
  log('  [4] PAG: ' + PAG_FIXO + '…');
  var pagOk = false;
  var pagArrow = findArrowNear('pag', ['epag', 'origem', 'uasg', 'unidade']);
  log('  Seta PAG ' + (pagArrow ? 'encontrada: ' + (pagArrow.src||'').split('/').pop() : 'NÃO ENCONTRADA'), pagArrow ? 'ok' : 'warn');
  if (pagArrow) {
    pagOk = await gxSelectPAG(pagArrow, PAG_FIXO);
  } else {
    log('  Seta PAG não encontrada na página', 'warn');
  }

  if (!pagOk) {
    var errResults = (state.results || []).concat([{ numero: item.numero, pag: PAG_FIXO, docNr: 'ERRO: PAG não encontrado', responsavel: item.responsavel || '' }]);
    var nextIdxErr = state.current + 1;
    if (nextIdxErr >= state.queue.length) {
      var fs = Object.assign({}, state, { running: false, results: errResults, step: 'done' });
      await saveState(fs); await finalize(fs);
    } else {
      var ns = Object.assign({}, state, { current: nextIdxErr, results: errResults, step: 'list', currentNome: '' });
      await saveState(ns);
      log('  Voltando à lista para próximo item…');
      var ml = findEl('a, td, span', 'Documentos na Unidade', true);
      if (ml) ml.click();
    }
    return;
  }
  await delay(1500);

  // Salvar — passo [5]
  log('  [5] Salvando…');
  var saveBtn = null;
  var docs3 = allDocs();

  log('  ── botões disponíveis ──');
  for (var di3x = 0; di3x < docs3.length; di3x++) {
    var allImgs3 = docs3[di3x].querySelectorAll('input[type="image"]');
    for (var ix = 0; ix < allImgs3.length; ix++) {
      var imgSrc = (allImgs3[ix].src||'').split('/').pop();
      var imgAlt = allImgs3[ix].alt || allImgs3[ix].title || '';
      log('  [img] ' + imgSrc + (imgAlt ? ' | alt=' + imgAlt : ''));
    }
    var allBtns3 = docs3[di3x].querySelectorAll('input[type="button"],input[type="submit"],button');
    for (var bxi = 0; bxi < allBtns3.length; bxi++) {
      var bxt3 = (allBtns3[bxi].value || allBtns3[bxi].textContent || '').trim();
      if (bxt3) log('  [btn] "' + bxt3 + '"');
    }
  }
  log('  ───────────────────────');

  var isSaveBtn = function(el) {
    var src = (el.src || '').toLowerCase();
    var alt = (el.alt || el.title || el.value || '').toLowerCase();
    return /(\bok\b|okay|okay1|commit|check|salv|gravar|confirm|btn_ok|verde|certo|tick|confirma)/.test(src) ||
           /(\bok\b|salvar|gravar|confirmar|commit)/.test(alt);
  };
  var isCancelBtn = function(el) {
    var src = (el.src || '').toLowerCase();
    return /(cancel|fechar|close|sair|exit|volta|discard|nao\b|desfaz|arrow|seta|lupa|binocul)/i.test(src);
  };

  for (var di3 = 0; di3 < docs3.length; di3++) {
    var imgs3 = docs3[di3].querySelectorAll('input[type="image"]');
    for (var ii3 = 0; ii3 < imgs3.length; ii3++) {
      if (isSaveBtn(imgs3[ii3])) { saveBtn = imgs3[ii3]; break; }
    }
    if (!saveBtn) {
      var btns3 = docs3[di3].querySelectorAll('input[type="button"],input[type="submit"],button');
      for (var bi3 = 0; bi3 < btns3.length; bi3++) {
        var bv3 = (btns3[bi3].value || btns3[bi3].textContent || '').toLowerCase().trim();
        if (/^(salvar|confirmar|gravar|ok|commit)$/.test(bv3)) { saveBtn = btns3[bi3]; break; }
      }
    }
    if (saveBtn) break;
  }

  if (!saveBtn) {
    outer3:
    for (var di4 = 0; di4 < docs3.length; di4++) {
      var imgs4 = docs3[di4].querySelectorAll('input[type="image"]');
      for (var ii4 = 0; ii4 < imgs4.length; ii4++) {
        if (!isCancelBtn(imgs4[ii4])) {
          saveBtn = imgs4[ii4];
          log('  Fallback save: ' + (saveBtn.src||'').split('/').pop(), 'warn');
          break outer3;
        }
      }
    }
  }

  if (!saveBtn) {
    log('  ✗ Botão salvar não encontrado', 'err');
    var errR2 = (state.results || []).concat([{ numero: item.numero, pag: PAG_FIXO, docNr: 'ERRO: botão salvar não encontrado', responsavel: item.responsavel || '' }]);
    var ni2 = state.current + 1;
    if (ni2 >= state.queue.length) {
      var fs2 = Object.assign({}, state, { running: false, results: errR2, step: 'done' });
      await saveState(fs2); await finalize(fs2);
    } else {
      var ns2 = Object.assign({}, state, { current: ni2, results: errR2, step: 'list', currentNome: '' });
      await saveState(ns2);
      var ml2 = findEl('a, td, span', 'Documentos na Unidade', true);
      if (ml2) ml2.click();
    }
    return;
  }

  log('  Clicando salvar: ' + (saveBtn.src||'').split('/').pop(), 'ok');

  var stateAssoc = Object.assign({}, state, { step: 'associar' });
  await saveState(stateAssoc);

  var saveBtnDoc = null;
  for (var di5 = 0; di5 < docs3.length; di5++) {
    try { if (docs3[di5].contains(saveBtn)) { saveBtnDoc = docs3[di5]; break; } } catch(_) {}
  }
  var saveOnclick = (saveBtn.getAttribute && saveBtn.getAttribute('onclick')) || '';
  if (saveOnclick && saveBtnDoc) {
    try {
      var ss = saveBtnDoc.createElement('script');
      ss.textContent = '(function(){try{' + saveOnclick + '}catch(e){console.error("[GAPMN save]",e);}})();';
      (saveBtnDoc.head || saveBtnDoc.body).appendChild(ss);
      try { ss.parentNode.removeChild(ss); } catch(_) {}
    } catch(e) { saveBtn.click(); }
  } else {
    saveBtn.click();
  }

  await execAssociarPage(stateAssoc, item);
}

// ── Pós-save: captura Nr.Doc + associa fluxo ─────────────────────────────────

async function execAssociarPage(state, item) {
  log('  [pós-save] Aguardando modo view…');
  await delay(1500);

  log('  [6] Capturando Nr. Documento…');
  var docNr = await captureNrDoc();
  log('  Nr. Documento: ' + docNr, 'ok');

  log('  [7] Associando fluxo "' + FLUXO_NOME + '"…');
  await associarFluxo();

  await waitPopupClosed(4000);
  await delay(500);

  var newResults = (state.results || []).concat([{ numero: item.numero, pag: PAG_FIXO, docNr: docNr, responsavel: item.responsavel || '' }]);
  var nextIdx = state.current + 1;

  if (nextIdx >= state.queue.length) {
    var finalState = Object.assign({}, state, { running: false, results: newResults, step: 'done' });
    await saveState(finalState);
    await finalize(finalState);
  } else {
    var nextState = Object.assign({}, state, {
      current: nextIdx,
      results: newResults,
      step: 'list',
      currentNome: '',
    });
    await saveState(nextState);
    log('  Voltando à lista para próximo item…');

    var allDbk = allDocs();
    var backBtn = null;
    outer_bk:
    for (var dbk2 = 0; dbk2 < allDbk.length; dbk2++) {
      try {
        var bkImgs = allDbk[dbk2].querySelectorAll('input[type="image"]');
        for (var ibk2 = 0; ibk2 < bkImgs.length; ibk2++) {
          var bkSrc = (bkImgs[ibk2].src || '').toLowerCase();
          if (/(cancel|sair|fechar|close|exit|voltar|volta\b|back\b|return)/i.test(bkSrc)) {
            backBtn = bkImgs[ibk2]; break outer_bk;
          }
        }
      } catch(_) {}
    }

    if (backBtn) {
      log('  Clicando voltar: ' + (backBtn.src||'').split('/').pop(), 'ok');
      backBtn.click();
    } else {
      var docLink = null;
      for (var dbk3 = 0; dbk3 < allDbk.length; dbk3++) {
        try {
          var lks = allDbk[dbk3].querySelectorAll('a[href], a[onclick], td[onclick]');
          for (var lbk = 0; lbk < lks.length; lbk++) {
            if ((lks[lbk].textContent||'').toLowerCase().indexOf('documentos na unidade') !== -1) {
              docLink = lks[lbk]; break;
            }
          }
        } catch(_) {}
        if (docLink) break;
      }
      if (docLink) {
        log('  Clicando menu "Documentos na Unidade"', 'ok');
        docLink.click();
      } else {
        log('  Botão voltar não encontrado — navegue manualmente', 'warn');
      }
    }
  }
}

// ── Associar Fluxo ────────────────────────────────────────────────────────────

async function associarFluxo() {
  var assocBtn = await waitEl(
    'input[type="button"], input[type="submit"], button, a, td',
    'Associar Fluxo', 10000, true
  );
  if (!assocBtn) { log('  Botão "Associar Fluxo" não encontrado', 'warn'); return; }

  var beforeDocsAssoc = allDocs();

  var btnDoc = null;
  for (var dbi = 0; dbi < beforeDocsAssoc.length; dbi++) {
    try { if (beforeDocsAssoc[dbi].contains(assocBtn)) { btnDoc = beforeDocsAssoc[dbi]; break; } } catch(_) {}
  }

  var assocOnclick = (assocBtn.getAttribute && assocBtn.getAttribute('onclick')) || '';
  if (assocOnclick && btnDoc) {
    try {
      var sa = btnDoc.createElement('script');
      sa.textContent = '(function(){try{' + assocOnclick + '}catch(e){console.error("[GAPMN assoc]",e);}})();';
      (btnDoc.head || btnDoc.body).appendChild(sa);
      try { sa.parentNode.removeChild(sa); } catch(_) {}
    } catch(e) { assocBtn.click(); }
  } else if (btnDoc) {
    try {
      var sa2 = btnDoc.createElement('script');
      sa2.textContent = '(function(){' +
        'var els=document.querySelectorAll("input[type=button],button,a,td,input[type=submit]");' +
        'for(var i=0;i<els.length;i++){' +
          'if((els[i].value||els[i].textContent||"").trim().toLowerCase()==="associar fluxo"){' +
            'els[i].click();return;' +
          '}' +
        '}' +
      '})();';
      (btnDoc.head || btnDoc.body).appendChild(sa2);
      try { sa2.parentNode.removeChild(sa2); } catch(_) {}
    } catch(e) { assocBtn.click(); }
  } else {
    assocBtn.click();
  }

  log('  Aguardando popup fluxo…');
  await delay(500);

  var pd = await waitPopup(10000, beforeDocsAssoc);

  if (!pd) { log('  Popup fluxo não abriu', 'warn'); return; }
  log('  Popup fluxo aberto ✓ — ' + (pd.location ? pd.location.href.split('/').pop() : '?'));

  await delay(500);

  // Preenche campo com o nome do fluxo e pesquisa
  var fluxoInp = pd.querySelector('input[type="text"]');
  if (fluxoInp) { fill(fluxoInp, FLUXO_NOME); await delay(300); }
  clickSearchBtn(pd);
  await delay(3000);

  // Clica no fluxo via injection
  var fluxoTxt = FLUXO_NOME;
  if (injectClickByText(pd, fluxoTxt)) {
    log('  Fluxo associado ✓', 'ok');
    await delay(1500);
    return;
  }

  // Fallback: busca link/tr contendo palavras do nome do fluxo
  var palavras = FLUXO_NOME.toLowerCase().split(/[\s\/\-]+/).filter(function(p){ return p.length > 3; });
  var allRows = pd.querySelectorAll('a, tr');
  for (var ri = 0; ri < allRows.length; ri++) {
    var rt = (allRows[ri].textContent || '').toLowerCase();
    var match = palavras.every(function(p) { return rt.indexOf(p) !== -1; });
    if (match) {
      var clickT = allRows[ri].tagName === 'TR'
        ? (allRows[ri].querySelector('a') || allRows[ri]) : allRows[ri];
      clickT.click();
      log('  Fluxo associado ✓ (fallback)', 'ok');
      await delay(1500);
      return;
    }
  }
  log('  Fluxo não encontrado no popup — associe manualmente', 'warn');
}

// ── Finalização ───────────────────────────────────────────────────────────────

async function finalize(state) {
  log('━━ Concluído! ' + (state.results || []).length + ' descentralizações criadas.', 'ok');
  setSub('Concluído!');

  var prog = document.getElementById('__gssp_prog__');
  if (prog) prog.style.display = 'none';

  var res = state.results || [];
  var ok = res.filter(function (r) { return !String(r.docNr).startsWith('ERRO'); }).length;
  var rows = res.map(function (r) {
    var err = String(r.docNr).startsWith('ERRO');
    return '<tr><td style="padding:2px 5px;color:#94a3b8">' + r.numero + '</td>' +
           '<td style="padding:2px 5px;color:' + (err?'#f87171':'#4ade80') + '">' + r.docNr + '</td>' +
           '<td style="padding:2px 5px;color:#a78bfa">' + (r.responsavel || '—') + '</td></tr>';
  }).join('');
  var tbl = document.createElement('div');
  tbl.innerHTML = '<div style="color:#4ade80;font-size:11px;margin:6px 0 4px">&#x2705; ' + ok + '/' + res.length + ' criadas:</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:10px">' +
    '<tr><th style="text-align:left;color:#64748b;padding:2px 5px">N&#xBA;</th>' +
    '<th style="text-align:left;color:#64748b;padding:2px 5px">Nr. Doc.</th>' +
    '<th style="text-align:left;color:#64748b;padding:2px 5px">Respons&aacute;vel</th></tr>' +
    rows + '</table>';
  if (logEl) { logEl.appendChild(tbl); logEl.scrollTop = logEl.scrollHeight; }

  if (GSHEET_URL) {
    try {
      await fetch(GSHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ acao: 'addDescentralizacoes', dados: res, dataHora: new Date().toLocaleString('pt-BR') }),
      });
      log('Dados enviados à planilha ✓', 'ok');
    } catch (e) { log('Aviso planilha: ' + e.message, 'warn'); }
  }

  await clearState();
}

// ── Detecta a página atual ────────────────────────────────────────────────────

function detectPage() {
  var body = document.body ? document.body.textContent : '';
  if (findEl('input[type="button"], button, a', 'Novo Subprocesso', true)) return 'list';
  if (/nr\.?\s*documento/i.test(body)) return 'form';
  return 'unknown';
}

// ── Popup PAG standalone ──────────────────────────────────────────────────────

function looksLikePAGPopup() {
  if (document.querySelector('frameset, frame')) return false;
  var hasInputs = document.querySelectorAll('input[type="text"], select').length > 0;
  var isSubprocForm = /nr\.?\s*documento/i.test(document.body ? document.body.textContent : '');
  var isList = !!document.querySelector('a, button, input[type="button"]') &&
               /Novo Subprocesso/i.test(document.body ? document.body.textContent : '');
  return hasInputs && !isSubprocForm && !isList;
}

async function handlePAGPopupPage(state) {
  var bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#1e40af;color:#fff;' +
    'font:bold 12px system-ui;padding:6px 12px;z-index:2147483647;text-align:center';
  bar.textContent = 'GAPMN: buscando PAG ' + PAG_FIXO + '…';
  document.body.appendChild(bar);

  function setBar(msg, color) {
    bar.textContent = msg;
    bar.style.background = color || '#1e40af';
    console.log('[GAPMN PAG popup] ' + msg);
  }

  await delay(800);

  async function trySearch(tipoHint) {
    if (tipoHint) {
      var sels = document.querySelectorAll('select');
      for (var si = 0; si < sels.length; si++) {
        for (var oi = 0; oi < sels[si].options.length; oi++) {
          if (sels[si].options[oi].text.toLowerCase().indexOf(tipoHint.toLowerCase()) !== -1) {
            sels[si].value = sels[si].options[oi].value;
            sels[si].dispatchEvent(new Event('change', { bubbles: true }));
            setBar('Tipo → ' + sels[si].options[oi].text);
            break;
          }
        }
      }
      await delay(400);
    }

    var inp = document.querySelector('input[type="text"]');
    if (inp) {
      setBar('Preenchendo PAG: ' + PAG_FIXO);
      fill(inp, PAG_FIXO);
      await delay(300);
    }

    var clicked = clickSearchBtn(document);
    setBar('Lupa ' + (clicked ? 'clicada ✓' : 'não encontrada') + ' — aguardando…');
    await delay(3500);

    var links = document.querySelectorAll('a, td[onclick]');
    for (var li = 0; li < links.length; li++) {
      var lt = (links[li].textContent || '').trim();
      if (lt.toLowerCase().indexOf(PAG_FIXO.toLowerCase()) !== -1) {
        setBar('PAG encontrado: ' + lt, '#15803d');
        await saveState(Object.assign({}, state, { pagToSearch: undefined, pagResult: 'ok' }));
        await delay(300);
        links[li].click();
        return true;
      }
    }
    return false;
  }

  var found = await trySearch(null);
  if (!found) {
    setBar('Não encontrado — tentando tipo "Outros"…', '#92400e');
    found = await trySearch('outros');
  }
  if (!found) {
    setBar('PAG não encontrado em nenhum tipo', '#991b1b');
    await saveState(Object.assign({}, state, { pagToSearch: undefined, pagResult: 'nao_encontrado' }));
    await delay(2000);
    try { window.close(); } catch (_) {}
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  var state = await readState();

  if (state && state.running && state.pagToSearch) {
    if (looksLikePAGPopup()) {
      await delay(800);
      await handlePAGPopupPage(state);
      return;
    }
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg.type !== 'GAPMNDESC_TOGGLE_PANEL') return;
    var panel = document.getElementById(PANEL_ID);
    var tabBtn = document.getElementById('__gssp_tab__');
    if (!panel) { injectPanel(true); return; }
    if (panel.style.display === 'none') {
      panel.style.display = 'flex';
      if (tabBtn) tabBtn.style.display = 'none';
    } else {
      panel.style.display = 'none';
      if (tabBtn) tabBtn.style.display = 'flex';
    }
  });

  injectPanel(state && state.running);

  if (!state || !state.running) {
    log('Extensão ativa. Importe a planilha para começar.');
    return;
  }

  var importDiv = document.getElementById('__gssp_import__');
  var progDiv   = document.getElementById('__gssp_prog__');
  if (importDiv) importDiv.style.display = 'none';
  if (progDiv)   progDiv.style.display   = '';
  setProgress(state.current + 1, state.queue.length);

  var page = detectPage();
  var item = state.queue[state.current];

  log('Página: ' + page + ' | Etapa: ' + state.step + ' | Item: ' + (item ? item.numero : '—'));

  if (state.step === 'list' && page === 'list') {
    await delay(600);
    await execListPage(state, item);
  } else if (state.step === 'form' && page === 'form') {
    await delay(800);
    await execFormPage(state, item);
  } else if (state.step === 'associar') {
    await delay(1000);
    await execAssociarPage(state, item);
  } else if (state.step === 'done') {
    await finalize(state);
  } else {
    log('Aguardando página correta (step=' + state.step + ', page=' + page + ')…', 'warn');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  setTimeout(main, 800);
}
