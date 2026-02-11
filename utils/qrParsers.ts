// app/utils/qrParsers.ts

export type ParsedQR = { nome: string; posto: string } | null;

/**
 * 1) Nosso formato antigo (DIRAD):
 *    "DIRADQR|PST=3S|NOM=JOAO SILVA"
 */
function parseDiradKV(text: string): ParsedQR {
  const QR_PREFIX = "DIRADQR|";
  if (!text?.startsWith(QR_PREFIX)) return null;
  const parts = text.slice(QR_PREFIX.length).split("|");
  const map = Object.fromEntries(parts.map((p) => p.split("=")));
  const posto = (map["PST"] || "").toUpperCase().trim();
  const nome = (map["NOM"] || "").toUpperCase().trim();
  return posto && nome ? { posto, nome } : null;
}

/**
 * 2) Variante "SISUB" estilo KV (caso a app do amigo use algo assim):
 *    "SISUBQR|PST=CB|NOM=MARIA SOUZA"
 *    (prefixo ilustrativo; se o externo usar "SISUB|" é só ajustar aqui)
 */
function parseSisubKV(text: string): ParsedQR {
  const PREFIXES = ["SISUBQR|", "SISUB|"];
  const prefix = PREFIXES.find((p) => text?.startsWith(p));
  if (!prefix) return null;
  const parts = text.slice(prefix.length).split("|");
  const map = Object.fromEntries(parts.map((p) => p.split("=")));
  const posto = (map["PST"] || map["posto"] || "").toUpperCase().trim();
  const nome = (map["NOM"] || map["nome"] || "").toUpperCase().trim();
  return posto && nome ? { posto, nome } : null;
}

/**
 * 3) JSON direto no QR:
 *    {"nome":"JOAO SILVA","posto":"3S"}
 */
function parseJson(text: string): ParsedQR {
  try {
    const obj = JSON.parse(text);
    const nome = String(obj?.nome ?? obj?.NOM ?? "").toUpperCase().trim();
    const posto = String(obj?.posto ?? obj?.PST ?? "").toUpperCase().trim();
    return nome && posto ? { nome, posto } : null;
  } catch {
    return null;
  }
}

/**
 * 4) CSV simples:
 *    "3S,JOAO SILVA"  ou  "JOAO SILVA;3S"
 */
function parseCsv(text: string): ParsedQR {
  const tryDelim = (d: string) => {
    const parts = text.split(d).map((s) => s.trim());
    if (parts.length !== 2) return null;
    // heurística: se o primeiro tem dígitos/letras curtas, pode ser posto
    const [a, b] = parts;
    const maybePostoFirst = /^[A-Za-z0-9]{1,4}$/i.test(a);
    const nome = (maybePostoFirst ? b : a).toUpperCase();
    const posto = (maybePostoFirst ? a : b).toUpperCase();
    return nome && posto ? { nome, posto } : null;
  };
  return tryDelim(",") || tryDelim(";") || null;
}

/**
 * 5) E-mail no QR -> resolve posto padrão + nome do e-mail (fallback)
 *    "nome.sobrenome@dominio" => nome: "NOME SOBRENOME", posto: "SD" (exemplo)
 *    (Útil quando o QR externo só guarda e-mail)
 */
function parseEmailHeuristic(text: string): ParsedQR {
  if (!/@/.test(text)) return null;
  const local = text.split("@")[0] || "";
  const nome = local.replace(/[._-]+/g, " ").trim().toUpperCase();
  if (!nome) return null;
  // posto genérico (ajuste se quiser outra regra)
  const posto = "SD";
  return { nome, posto };
}

/**
 * Tenta todos os parsers locais.
 */
export function tryParseLocally(text: string): ParsedQR {
  return (
    parseDiradKV(text) ||
    parseSisubKV(text) ||
    parseJson(text) ||
    parseCsv(text) ||
    parseEmailHeuristic(text) ||
    null
  );
}

/**
 * Heurística simples: payload "parece" um código/UUID quando:
 * - não tem espaços
 * - e tem muitos hífens/letras/números
 */
export function looksLikeCode(text: string): boolean {
  if (!text || /\s/.test(text)) return false;
  // UUID ou código compacto
  if (/^[a-f0-9-]{16,}$/i.test(text)) return true;
  // Base58/Base36 "grandinho"
  if (/^[A-Za-z0-9_-]{10,}$/.test(text)) return true;
  return false;
}
