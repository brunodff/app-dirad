const APELIDOS: Array<{ match: RegExp; label: string }> = [
  { match: /APOIO\s+LOG[IÍ]STICO/i,           label: 'GVA - Aeronáutica' },
  { match: /GARANTIA\s+DE\s+VOTACAO/i,         label: 'GVA - Terrestre' },
  { match: /OPERACAO\s+GOTA/i,                 label: 'TED.GOTA' },
  { match: /TED\s*[-–]\s*TRANSP/i,             label: 'TED.TOTEQ' },
  { match: /OP\s+CATRIMANI\s+II/i,             label: 'CATRIMANI II / ZIDA' },
];

export function apelidoOperacao(op: string): string {
  for (const { match, label } of APELIDOS) {
    if (match.test(op)) return label;
  }
  return op;
}
