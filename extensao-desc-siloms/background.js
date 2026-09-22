// Service worker MV3 — envia mensagem ao content script quando o ícone é clicado
chrome.action.onClicked.addListener(function (tab) {
  chrome.tabs.sendMessage(tab.id, { type: 'GAPMNDESC_TOGGLE_PANEL' });
});
