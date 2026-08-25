/**
 * COMAE GERENCIAL — Push para a aplicação web
 *
 * COMO USAR:
 *  1. Abra o editor do Apps Script vinculado à planilha COMAE.
 *  2. Cole este arquivo (ou adicione as funções abaixo ao script existente).
 *  3. Preencha as constantes COMAE_GERENCIAL_URL e COMAE_GERENCIAL_TOKEN.
 *  4. No final da função sincronizarTudo() existente, adicione a linha:
 *       pushParaComaeGerencial();
 *  5. Execute instalarTriggerPolling() UMA VEZ para ativar o polling de 5 min.
 *
 * O push acontece automaticamente:
 *  • Após cada sincronizarTudo() (trigger manual ou por e-mail).
 *  • A cada 5 minutos (polling de segurança).
 */

// ── CONFIGURAÇÃO ─────────────────────────────────────────────────────────────
// Substitua pelos valores reais antes de usar.
var COMAE_GERENCIAL_URL   = 'https://SEU-DOMINIO.railway.app/api/sync';
var COMAE_GERENCIAL_TOKEN = 'SEU_SYNC_SECRET_TOKEN';  // igual ao .env do servidor

// ── FUNÇÃO PRINCIPAL ─────────────────────────────────────────────────────────
/**
 * Lê BD_CREDITO e BD_EMPENHOS e envia para o servidor COMAE Gerencial.
 * Seguro chamar repetidamente — a ingestão é idempotente no servidor.
 */
function pushParaComaeGerencial() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var abaCred = ss.getSheetByName('BD_CREDITO');
  var abaEmp  = ss.getSheetByName('BD_EMPENHOS');

  if (!abaCred || !abaEmp) {
    Logger.log('[COMAE Push] Abas BD_CREDITO ou BD_EMPENHOS não encontradas.' +
               ' Execute Sincronizar tudo primeiro.');
    return;
  }

  var linhasCred = abaCred.getDataRange().getValues();
  var linhasEmp  = abaEmp.getDataRange().getValues();

  if (linhasCred.length < 2) {
    Logger.log('[COMAE Push] BD_CREDITO vazia — nada a enviar.');
    return;
  }

  var payload = {
    token:    COMAE_GERENCIAL_TOKEN,
    credito:  converterParaObjetos_(linhasCred),
    empenhos: linhasEmp.length >= 2 ? converterParaObjetos_(linhasEmp) : [],
    timestamp: new Date().toISOString()
  };

  var payloadJson = JSON.stringify(payload);
  Logger.log('[COMAE Push] Enviando ' + payload.credito.length +
             ' linhas de crédito + ' + payload.empenhos.length + ' de empenhos...');

  try {
    var resp = UrlFetchApp.fetch(COMAE_GERENCIAL_URL, {
      method:          'post',
      contentType:     'application/json',
      payload:         payloadJson,
      muteHttpExceptions: true,
      // Timeout generoso para payloads grandes
      followRedirects: true
    });

    var codigo = resp.getResponseCode();
    var corpo  = resp.getContentText();

    if (codigo === 200) {
      Logger.log('[COMAE Push] ✔ Sucesso: ' + corpo);
    } else {
      Logger.log('[COMAE Push] ✖ Erro HTTP ' + codigo + ': ' + corpo);
    }
  } catch (e) {
    Logger.log('[COMAE Push] ✖ Exceção: ' + e.message);
  }
}

// ── POLLING ───────────────────────────────────────────────────────────────────
/**
 * Instala trigger de tempo para chamar pushParaComaeGerencial a cada 5 minutos.
 * Execute esta função UMA VEZ manualmente.
 */
function instalarTriggerPolling() {
  // Remove triggers antigos para evitar duplicatas
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'pushParaComaeGerencial') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('pushParaComaeGerencial')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('[COMAE Push] Trigger de 5 min instalado com sucesso.');
}

/** Remove o trigger de polling (se precisar desativar). */
function removerTriggerPolling() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'pushParaComaeGerencial') {
      ScriptApp.deleteTrigger(t);
      Logger.log('[COMAE Push] Trigger removido.');
    }
  });
}

// ── HELPER ───────────────────────────────────────────────────────────────────
/**
 * Converte array 2D (linhas × colunas) para array de objetos usando o cabeçalho.
 * Datas são serializadas como ISO string. Células vazias ficam como ''.
 */
function converterParaObjetos_(linhas) {
  if (!linhas || linhas.length < 2) return [];

  var header = linhas[0].map(function(h) { return String(h).trim(); });
  var objs = [];

  for (var i = 1; i < linhas.length; i++) {
    var row = linhas[i];

    // Pula linhas totalmente vazias
    var temConteudo = row.some(function(v) { return v !== '' && v !== null; });
    if (!temConteudo) continue;

    var obj = {};
    header.forEach(function(h, j) {
      var v = row[j];
      if (v instanceof Date) {
        // Serializa data como ISO para parsing confiável no servidor
        obj[h] = v.toISOString();
      } else {
        obj[h] = (v === null || v === undefined) ? '' : v;
      }
    });
    objs.push(obj);
  }

  return objs;
}
