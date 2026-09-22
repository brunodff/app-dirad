// background.js — service worker

let lastActiveTabId = null;
let mainWindowId    = null;  // janela onde o ícone foi clicado
let popupWindowId   = null;

// Ao clicar no ícone: captura a aba/janela ativas ANTES de abrir o popup
chrome.action.onClicked.addListener(async (tab) => {
  // tab é a aba que estava ativa no momento do clique — guarda para uso posterior
  if (tab?.id) lastActiveTabId = tab.id;
  if (tab?.windowId) mainWindowId = tab.windowId;

  if (popupWindowId !== null) {
    chrome.windows.get(popupWindowId, win => {
      if (chrome.runtime.lastError || !win) {
        popupWindowId = null;
        abrirJanela();
      } else {
        chrome.windows.update(popupWindowId, { focused: true });
      }
    });
  } else {
    abrirJanela();
  }
});

function abrirJanela() {
  chrome.windows.create({
    url:     chrome.runtime.getURL('popup.html'),
    type:    'popup',
    width:   420,
    height:  520,
    focused: true,
  }, win => {
    if (win) popupWindowId = win.id;
  });
}

chrome.windows.onRemoved.addListener(windowId => {
  if (windowId === popupWindowId) popupWindowId = null;
});

// Atualiza lastActiveTabId quando o usuário troca de aba na janela principal
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  if (windowId === popupWindowId) return; // ignora o próprio popup
  try {
    const tab = await chrome.tabs.get(tabId);
    if (
      tab.url &&
      !tab.url.startsWith('chrome-extension://') &&
      !tab.url.startsWith('moz-extension://') &&
      !tab.url.startsWith('chrome://') &&
      !tab.url.startsWith('about:')
    ) {
      lastActiveTabId = tabId;
      if (!mainWindowId) mainWindowId = windowId;
    }
  } catch {}
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.action === 'GET_LAST_TAB') {
    (async () => {
      // Estratégia 1: aba ativa ATUAL na janela principal (usuário pode ter trocado de aba)
      if (mainWindowId) {
        try {
          const [activeTab] = await chrome.tabs.query({ active: true, windowId: mainWindowId });
          if (activeTab?.id && !activeTab.url?.startsWith('chrome-extension://') && !activeTab.url?.startsWith('moz-extension://')) {
            sendResponse({ tabId: activeTab.id });
            return;
          }
        } catch {}
      }
      // Estratégia 2: qualquer aba ativa em qualquer janela normal
      try {
        const tabs = await chrome.tabs.query({ active: true, windowType: 'normal' });
        const valid = tabs.find(t => t.url && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('moz-extension://'));
        if (valid) { sendResponse({ tabId: valid.id }); return; }
      } catch {}
      // Fallback: última aba rastreada
      sendResponse({ tabId: lastActiveTabId });
    })();
    return true; // resposta assíncrona
  }

  // Relay: content.js → popup
  if (['PROGRESSO', 'CONCLUIDO', 'ERRO'].includes(msg.action)) {
    chrome.runtime.sendMessage(msg).catch(() => {});
  }
  sendResponse({ ok: true });
  return true;
});
