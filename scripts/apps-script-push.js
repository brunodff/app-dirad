/**
 * COMAE GERENCIAL — Push da planilha "Crédito Disponível" para https://comaegerencial.app
 *
 * COMO USAR:
 *  1. No editor do Apps Script da planilha, substitua o arquivo de push por este.
 *  2. Configurações do projeto → Propriedades do script → COMAE_TOKEN = token do Cloudflare
 *     (SYNC_SECRET_TOKEN). O token NÃO fica no código.
 *  3. Mantenha a chamada pushParaComaeGerencial(); no final de sincronizarTudo().
 *  4. Execute instalarTriggerPolling() UMA VEZ. Ele troca o gatilho antigo pelo novo.
 *
 * O QUE O GATILHO DE 5 MIN FAZ (verificarEEnviar):
 *  • Se o relatório mudou (CREDITO_COMAE ou DADOS_EMPENHOS), roda sincronizarTudo(), que
 *    remonta BD_CREDITO/BD_EMPENHOS e envia ao site. Antes, isso só acontecia quando alguém
 *    rodava "Sincronizar tudo"; o gatilho reenviava a BD antiga o dia inteiro.
 *  • Envia BD_CREDITO/BD_EMPENHOS só quando mudaram (ou 1x por hora, para o site mostrar que
 *    a sincronização está viva). Reenviar dados iguais a cada 5 min gastava a cota diária de
 *    execução de gatilhos.
 *  • Envia a aba CREDITO_COMAE (todos os anos) para o Comparativo quando ela muda.
 *
 * SE O PUSH PARAR DE FUNCIONAR: execute diagnosticarPush() e leia o Log.
 */

// ── CONFIGURAÇÃO ─────────────────────────────────────────────────────────────
// URL final, sem redirect: um 301/302 faria o Apps Script trocar o POST por GET e perder o corpo.
const COMAE_GERENCIAL_URL = 'https://comaegerencial.app/api/sync';
const COMAE_COMPARATIVO_URL = 'https://comaegerencial.app/api/sync-comae';

const ABAS_FONTE = ['CREDITO_COMAE', 'DADOS_EMPENHOS']; // relatórios que alimentam as BD_*
const REENVIO_MINIMO_MIN = 60;                          // reenvia a BD igual no máximo 1x/hora

function obterToken_() {
  const t = PropertiesService.getScriptProperties().getProperty('COMAE_TOKEN');
  if (!t) throw new Error('COMAE_TOKEN não configurado em Configurações do projeto → Propriedades do script.');
  return t.trim();
}

function md5_(texto) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, texto));
}

function postar_(url, corpo) {
  return UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true,
    followRedirects: false
  });
}

// ── GATILHO DE 5 MIN ─────────────────────────────────────────────────────────
/**
 * Verifica se os relatórios mudaram; se sim, remonta as BD_* (sincronizarTudo) e envia.
 * É esta função que o gatilho de 5 min chama.
 */
function verificarEEnviar() {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(1000)) { Logger.log('[COMAE] Outra execução em andamento — pulando.'); return; }
  let falha = null;
  try {
    const props = PropertiesService.getScriptProperties();
    const digitalFonte = impressaoDigitalFonte_();

    if (digitalFonte !== props.getProperty('FONTE_HASH')) {
      Logger.log('[COMAE] Relatório mudou — rodando sincronizarTudo().');
      if (typeof sincronizarTudo !== 'function') {
        falha = new Error('sincronizarTudo() não existe neste projeto — a BD não foi remontada.');
      } else {
        try {
          sincronizarTudo();      // remonta BD_* e, no final, chama pushParaComaeGerencial()
          props.setProperty('FONTE_HASH', digitalFonte);
        } catch (e) {
          // Ex.: sincronizarTudo() usa SpreadsheetApp.getUi(), que não existe em gatilho.
          // Não grava o hash: tenta de novo no próximo ciclo.
          falha = new Error('sincronizarTudo() falhou no gatilho: ' + e.message);
        }
      }
    }

    pushParaComaeGerencial();     // só envia se a BD mudou ou se já passou 1 hora
    pushCreditoComae();           // só envia se a aba mudou
  } finally {
    trava.releaseLock();
  }
  if (falha) {
    Logger.log('[COMAE] ✖ ' + falha.message);
    throw falha; // aparece em "Execuções" do Apps Script
  }
}

/**
 * Assinatura barata dos relatórios: nº de linhas + colunas de NC e valor do CREDITO_COMAE,
 * e a aba DADOS_EMPENHOS inteira (saldos mudam sem mudar o número de linhas).
 */
function impressaoDigitalFonte_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const partes = [];
  ABAS_FONTE.forEach(function (nome) {
    const aba = ss.getSheetByName(nome);
    if (!aba) { partes.push(nome + ':ausente'); return; }
    const n = aba.getLastRow();
    if (n < 1) { partes.push(nome + ':vazia'); return; }
    if (nome === 'CREDITO_COMAE') {
      partes.push(nome, n,
        JSON.stringify(aba.getRange(1, 8, n, 1).getDisplayValues()),   // H: NC
        JSON.stringify(aba.getRange(1, 18, n, 1).getDisplayValues())); // R: valor
    } else {
      partes.push(nome, n, JSON.stringify(aba.getDataRange().getDisplayValues()));
    }
  });
  return md5_(partes.join('|'));
}

// ── BD_CREDITO + BD_EMPENHOS → /api/sync ─────────────────────────────────────
/**
 * Envia BD_CREDITO e BD_EMPENHOS. Pula o envio se nada mudou desde o último envio com
 * sucesso e ainda não passou REENVIO_MINIMO_MIN. Use pushParaComaeGerencial(true) para forçar.
 */
function pushParaComaeGerencial(forcar) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abaCred = ss.getSheetByName('BD_CREDITO');
  const abaEmp  = ss.getSheetByName('BD_EMPENHOS');
  if (!abaCred || !abaEmp) {
    Logger.log('[COMAE Push] Abas BD_CREDITO ou BD_EMPENHOS não encontradas. Execute Sincronizar tudo primeiro.');
    return;
  }

  const linhasCred = abaCred.getDataRange().getValues();
  const linhasEmp  = abaEmp.getDataRange().getValues();
  if (linhasCred.length < 2) { Logger.log('[COMAE Push] BD_CREDITO vazia — nada a enviar.'); return; }

  const credito  = converterParaObjetos_(linhasCred);
  const empenhos = linhasEmp.length >= 2 ? converterParaObjetos_(linhasEmp) : [];
  const dadosJson = JSON.stringify({ credito: credito, empenhos: empenhos });
  const hash = md5_(dadosJson);

  const props = PropertiesService.getScriptProperties();
  const ultimoEnvio = Number(props.getProperty('BD_ENVIADO_EM') || 0);
  const minutosDesde = (Date.now() - ultimoEnvio) / 60000;
  if (forcar !== true && hash === props.getProperty('BD_HASH') && minutosDesde < REENVIO_MINIMO_MIN) {
    Logger.log('[COMAE Push] BD sem mudanças (último envio há ' + Math.round(minutosDesde) + ' min) — pulando.');
    return;
  }

  Logger.log('[COMAE Push] Enviando ' + credito.length + ' linhas de crédito + ' + empenhos.length +
             ' de empenhos (' + Math.round(dadosJson.length / 1024) + ' KB)...');
  try {
    const resp = postar_(COMAE_GERENCIAL_URL, {
      token: obterToken_(), credito: credito, empenhos: empenhos, timestamp: new Date().toISOString()
    });
    const codigo = resp.getResponseCode();
    const corpo  = resp.getContentText();
    if (codigo >= 200 && codigo < 300) {
      props.setProperty('BD_HASH', hash);
      props.setProperty('BD_ENVIADO_EM', String(Date.now()));
      Logger.log('[COMAE Push] ✔ HTTP ' + codigo + ': ' + corpo.substring(0, 300));
    } else if (codigo >= 300 && codigo < 400) {
      const h = resp.getHeaders();
      Logger.log('[COMAE Push] ✖ REDIRECT ' + codigo + ' → ' + (h['Location'] || h['location'] || '(sem Location)') +
                 '. Troque COMAE_GERENCIAL_URL pela URL final.');
    } else {
      Logger.log('[COMAE Push] ✖ HTTP ' + codigo + ': ' + corpo.substring(0, 500) + ' — execute diagnosticarPush().');
    }
  } catch (e) {
    Logger.log('[COMAE Push] ✖ Exceção: ' + e.message);
  }
}

// ── CREDITO_COMAE (todos os anos) → /api/sync-comae (aba Comparativo) ───────
/** Envia a aba CREDITO_COMAE (colunas A:R, valores exibidos) quando ela muda. */
function pushCreditoComae(forcar) {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CREDITO_COMAE');
  if (!aba) { Logger.log('[CREDITO_COMAE] Aba não encontrada.'); return; }

  const linhas = aba.getRange(1, 1, aba.getLastRow(), 18).getDisplayValues();
  const hash = md5_(JSON.stringify(linhas));
  const props = PropertiesService.getScriptProperties();
  if (forcar !== true && props.getProperty('CREDITO_COMAE_HASH') === hash) {
    Logger.log('[CREDITO_COMAE] Sem mudanças — nada a enviar.');
    return;
  }

  try {
    const resp = postar_(COMAE_COMPARATIVO_URL, { token: obterToken_(), linhas: linhas });
    const codigo = resp.getResponseCode();
    Logger.log('[CREDITO_COMAE] HTTP ' + codigo + ': ' + resp.getContentText().substring(0, 300));
    if (codigo === 200) props.setProperty('CREDITO_COMAE_HASH', hash);
  } catch (e) {
    Logger.log('[CREDITO_COMAE] ✖ Exceção: ' + e.message);
  }
}

// ── GATILHO ──────────────────────────────────────────────────────────────────
/**
 * Instala o gatilho de 5 min em verificarEEnviar() e remove o antigo (pushParaComaeGerencial).
 * Execute UMA VEZ.
 */
function instalarTriggerPolling() {
  removerTriggerPolling();
  ScriptApp.newTrigger('verificarEEnviar').timeBased().everyMinutes(5).create();
  Logger.log('[COMAE] Gatilho de 5 min instalado em verificarEEnviar().');
}

/** Remove os gatilhos de polling (antigo e novo). */
function removerTriggerPolling() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const f = t.getHandlerFunction();
    if (f === 'pushParaComaeGerencial' || f === 'verificarEEnviar') {
      ScriptApp.deleteTrigger(t);
      Logger.log('[COMAE] Gatilho removido: ' + f);
    }
  });
}

/** Envia tudo agora, mesmo sem mudanças (para testar depois de instalar). */
function enviarTudoAgora() {
  pushParaComaeGerencial(true);
  pushCreditoComae(true);
}

// ── DIAGNÓSTICO ──────────────────────────────────────────────────────────────
/** Testa token, URLs, redirects e bloqueios. Execute quando o push falhar e leia o Log. */
function diagnosticarPush() {
  Logger.log('════ DIAGNÓSTICO DO PUSH — COMAE GERENCIAL ════');
  let token = '';
  try {
    token = obterToken_();
    Logger.log('Token: configurado (' + token.length + ' caracteres)');
  } catch (e) {
    Logger.log('Token: ✖ ' + e.message);
  }

  const props = PropertiesService.getScriptProperties();
  const envio = Number(props.getProperty('BD_ENVIADO_EM') || 0);
  Logger.log('Último envio da BD com sucesso: ' + (envio ? new Date(envio).toLocaleString('pt-BR') : 'nunca (por este script)'));
  const gatilhos = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  Logger.log('Gatilhos instalados: ' + (gatilhos.length ? gatilhos.join(', ') : 'nenhum') +
             (gatilhos.indexOf('verificarEEnviar') === -1 ? '  ✖ falta verificarEEnviar — rode instalarTriggerPolling()' : ''));

  [COMAE_GERENCIAL_URL, COMAE_COMPARATIVO_URL].forEach(function (url) {
    Logger.log('\n── Testando: ' + url);
    try {
      const r = postar_(url, { token: token, teste: true, credito: [], empenhos: [], linhas: [] });
      const c = r.getResponseCode();
      const corpo = r.getContentText();
      if (c >= 300 && c < 400) {
        const h = r.getHeaders();
        Logger.log('  ✖ REDIRECT ' + c + ' → ' + (h['Location'] || h['location']) + ' — use a URL final.');
        return;
      }
      Logger.log('  Status: ' + c + ' | Corpo: ' + corpo.substring(0, 200));
      if (corpo.indexOf('<html') !== -1 || corpo.indexOf('<!DOCTYPE') !== -1) {
        Logger.log('  ✖ O servidor devolveu HTML: bloqueio do Cloudflare (WAF) ou rota inexistente.');
      }
      if (c === 400) Logger.log('  ✔ Token aceito (400 = teste vazio recusado, como esperado).');
      if (c === 401) Logger.log('  ✖ Token recusado: confira COMAE_TOKEN e o SYNC_SECRET_TOKEN do Cloudflare.');
      if (c === 404) Logger.log('  ✖ Rota não encontrada: confira o deploy do Cloudflare.');
      if (c >= 500) Logger.log('  ✖ Erro no servidor: veja os logs em Workers & Pages.');
    } catch (e) {
      Logger.log('  ✖ Exceção: ' + e.message);
    }
  });
  Logger.log('\n════ FIM DO DIAGNÓSTICO ════');
}

// ── HELPER ───────────────────────────────────────────────────────────────────
/** Array 2D (linhas × colunas) → array de objetos pelo cabeçalho. Datas viram ISO. */
function converterParaObjetos_(linhas) {
  if (!linhas || linhas.length < 2) return [];
  const header = linhas[0].map(function (h) { return String(h).trim(); });
  const objs = [];
  for (let i = 1; i < linhas.length; i++) {
    const row = linhas[i];
    if (!row.some(function (v) { return v !== '' && v !== null; })) continue;
    const obj = {};
    header.forEach(function (h, j) {
      const v = row[j];
      obj[h] = (v instanceof Date) ? v.toISOString() : (v === null || v === undefined) ? '' : v;
    });
    objs.push(obj);
  }
  return objs;
}
