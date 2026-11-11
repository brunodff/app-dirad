const APELIDOS: Array<{ match: RegExp; label: string }> = [
  { match: /APOIO\s+LOG[IÍ]STICO\s*-\s*AERON/i,               label: 'GVA - Aeronáutica' },
  { match: /GARANTIA\s+DE\s+VOTACAO\b.*\bAERON/i,             label: 'GVA - Terrestre' },
  { match: /OPERACAO\s+GOTA/i,                 label: 'TED.GOTA' },
  { match: /TED\s*[-–]\s*TRANSP/i,             label: 'TED.TOTEQ' },
  { match: /OP\s+CATRIMANI\s+II/i,             label: 'CATRIMANI II / ZIDA' },
  { match: /\bCOP\s*30\b/i,                    label: 'COP30' },
  { match: /\bBRICS\b/i,                       label: 'BRICS' },
];

export function apelidoOperacao(op: string): string {
  for (const { match, label } of APELIDOS) {
    if (match.test(op)) return label;
  }
  return op;
}
