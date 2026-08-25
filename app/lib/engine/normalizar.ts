// Utilitários de normalização de texto — espelham normalizar_() e extrairAno_() do Leitor.gs.

/** Remove acentos, converte para maiúsculas, colapsa espaços. */
export function normalizar(s: unknown): string {
  return String(s ?? '')
    .toUpperCase()
    .replace(/[ÁÀÂÃÄ]/g, 'A')
    .replace(/[ÉÈÊË]/g, 'E')
    .replace(/[ÍÌÎÏ]/g, 'I')
    .replace(/[ÓÒÔÕÖ]/g, 'O')
    .replace(/[ÚÙÛÜ]/g, 'U')
    .replace(/Ç/g, 'C')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrai o ano de uma data em vários formatos. Retorna '' se inválida. */
export function extrairAno(data: unknown): string {
  if (!data) return '';
  // ISO string '2026-03-15' ou 'YYYY-MM-DDTHH:mm:ssZ'
  if (typeof data === 'string') {
    const m = data.match(/^(\d{4})-/);
    if (m) return m[1];
    // dd/mm/yyyy (formato brasileiro)
    const m2 = data.match(/^\d{2}\/\d{2}\/(\d{4})/);
    if (m2) return m2[1];
  }
  // Date object ou timestamp numérico
  const d = new Date(data as string | number);
  if (isNaN(d.getTime())) return '';
  return String(d.getUTCFullYear());
}

/**
 * Converte valor de data bruto (vindo do Apps Script via JSON) para string ISO.
 * Apps Script serializa Date como ISO; Sheets pode armazenar serial de Excel (número)
 * ou string dd/mm/yyyy.
 */
export function parseData(raw: unknown): string {
  if (!raw) return '';
  // ISO string direto
  if (typeof raw === 'string') {
    // ISO: 2026-03-15 ou 2026-03-15T00:00:00.000Z
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    // dd/mm/yyyy
    const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  // Serial de Excel (número de dias desde 30/12/1899)
  if (typeof raw === 'number') {
    const ms = (raw - 25569) * 86400 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  // Date serializado
  const d = new Date(raw as string);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}

/** Normaliza código de Natureza de Despesa: remove apostrofo, .0, espaços. */
export function normalizaNd(nd: unknown): string {
  return String(nd ?? '')
    .trim()
    .replace(/^'/, '')
    .replace(/\.0+$/, '');
}

/** Normaliza código de UG: remove apostrofo e espaços. */
export function normalizaUg(cod: unknown): string {
  return String(cod ?? '').trim().replace(/^'/, '');
}

/** Normaliza valor monetário: aceita número, string com vírgula ou ponto. */
export function parseValor(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '0')
    .trim()
    .replace(/\./g, '')   // separador de milhar
    .replace(',', '.');   // separador decimal brasileiro
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** UG "sem informação": código −9 ou nome com SEM INFORMACAO. */
export function ehSemInfo(cod: string, nome: string): boolean {
  const c = String(cod).trim();
  if (/^-0*9$/.test(c)) return true;
  return normalizar(nome).includes('SEM INFORMAC');
}
