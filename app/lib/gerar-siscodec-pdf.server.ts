import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type PdfCelula = {
  tipo: 'ANULACAO' | 'SUPLEMENTACAO';
  ptres: string;
  nd: string;
  valor: number;
  obs?: string;
};

export type PdfInput = {
  operacao: string;
  num_desc: string;
  num_dor: string;
  destaque: string;
  signatario: string;
  pag: string;
  ug_exec_an_cod: string; ug_exec_an_sigla: string;
  ug_exec_sup_cod: string; ug_exec_sup_sigla: string;
  ug_cred_an_cod: string; ug_cred_an_sigla: string;
  ug_cred_sup_cod: string; ug_cred_sup_sigla: string;
  fonte: string;
  esfera: string;
  plano_interno: string;
  celulas: PdfCelula[];
};

const M = 28; // page margin (pts)

function clip(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + '.' : s; }

function ascii(s: string) {
  return s
    .replace(/[ÁÀÂÃ]/g, 'A').replace(/[áàâã]/g, 'a')
    .replace(/[ÉÈÊẼ]/g, 'E').replace(/[éèêẽ]/g, 'e')
    .replace(/[ÍÌÎĨ]/g, 'I').replace(/[íìîĩ]/g, 'i')
    .replace(/[ÓÒÔÕ]/g, 'O').replace(/[óòôõ]/g, 'o')
    .replace(/[ÚÙÛŨ]/g, 'U').replace(/[úùûũ]/g, 'u')
    .replace(/[Ç]/g, 'C').replace(/[ç]/g, 'c')
    .replace(/[Ñ]/g, 'N').replace(/[ñ]/g, 'n');
}

export async function gerarSiscodecPDF(input: PdfInput): Promise<Uint8Array> {
  const doc  = await PDFDocument.create();
  const page = doc.addPage([841.89, 595.28]); // A4 landscape
  const { width, height } = page.getSize();

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg  = await doc.embedFont(StandardFonts.Helvetica);

  const black = rgb(0, 0, 0);
  const lgray = rgb(0.85, 0.85, 0.85);

  const cW = width - 2 * M;
  let y = height - M;

  function t(str: string, x: number, yy: number, sz: number, font = reg, color = black) {
    page.drawText(ascii(str), { x, y: yy, size: sz, font, color });
  }
  function tc(str: string, yy: number, sz: number, font = reg, color = black) {
    const w = font.widthOfTextAtSize(ascii(str), sz);
    t(str, width / 2 - w / 2, yy, sz, font, color);
  }

  // ── Header ────────────────────────────────────────────────────────────────
  tc('MINISTERIO DA DEFESA', y, 7, bold); y -= 9;
  tc('COMANDO DA AERONAUTICA', y, 7, bold); y -= 9;
  tc('COMANDO DE OPERACOES AEROESPACIAIS', y, 7, bold); y -= 14;

  // ── Title (underlined) ────────────────────────────────────────────────────
  const titleStr = `SOLICITACAO DE DESCENTRALIZACAO - COMAE - ${ascii(input.operacao).toUpperCase()}`;
  const tSz = 9;
  const tW  = bold.widthOfTextAtSize(titleStr, tSz);
  const tX  = width / 2 - tW / 2;
  t(titleStr, tX, y, tSz, bold);
  page.drawLine({ start: { x: tX, y: y - 1.5 }, end: { x: tX + tW, y: y - 1.5 }, thickness: 0.75, color: black });
  y -= 13;

  // ── Reference number — centered, bold, below title ────────────────────────
  const refStr = `${input.num_desc}/D10/DOR${input.num_dor}/2026`;
  tc(refStr, y, 10, bold);
  y -= 14;

  // ── Small 4-column meta table ─────────────────────────────────────────────
  const smH = 22;
  const smCols = [
    { label: 'ENTRADA DE BEM DO EXTERIOR?', val: 'Nao',                                  fw: cW * 0.27 },
    { label: 'DESTAQUE?',                   val: ascii(input.destaque || 'Nao'),          fw: cW * 0.18 },
    { label: 'No TED',                      val: '',                                      fw: cW * 0.27 },
    { label: 'MOEDA?',                      val: 'REAL',                                  fw: cW * 0.28 },
  ];
  page.drawRectangle({ x: M, y: y - smH, width: cW, height: smH, borderColor: black, borderWidth: 0.5 });
  let smX = M;
  for (const col of smCols) {
    if (smX > M) page.drawLine({ start: { x: smX, y: y - smH }, end: { x: smX, y }, thickness: 0.5, color: black });
    t(col.label, smX + 2, y - 7, 5, bold);
    t(col.val,   smX + 2, y - 16, 6.5, reg);
    smX += col.fw;
  }
  y -= smH + 3;

  // ── Main table ────────────────────────────────────────────────────────────
  // "TIPO" column replaced by "OPERACAO" showing Anulacao/Suplementacao text
  type Col = { id: string; label: string; w: number; parent?: string; align?: 'l'|'r'|'c' };
  const cols: Col[] = [
    { id: 'op',    label: 'OPERACAO',    w: 90,    align: 'c' },
    { id: 'val',   label: 'VALOR',       w: 68,    align: 'r' },
    { id: 'ugec',  label: 'CODIGO',      w: 48,    parent: 'UG EXEC', align: 'c' },
    { id: 'uges',  label: 'SIGLA',       w: 44,    parent: 'UG EXEC', align: 'c' },
    { id: 'esf',   label: 'ESFERA',      w: 34,    align: 'c' },
    { id: 'ptres', label: 'PTRES',       w: 52,    align: 'c' },
    { id: 'fonte', label: 'FONTE',       w: 84,    align: 'c' },
    { id: 'nd',    label: 'ND',          w: 45,    align: 'c' },
    { id: 'plano', label: 'PLANO INT.',  w: 72,    align: 'c' },
    { id: 'ugcc',  label: 'CODIGO',      w: 48,    parent: 'UG CRED', align: 'c' },
    { id: 'ugcs',  label: 'SIGLA',       w: 44,    parent: 'UG CRED', align: 'c' },
    { id: 'obs',   label: 'OBSERV. NC',  w: cW - 90 - 68 - 48 - 44 - 34 - 52 - 84 - 45 - 72 - 48 - 44, align: 'l' },
  ];

  const hdr1H = 13;
  const hdr2H = 12;
  const totalHdrH = hdr1H + hdr2H;
  const rowH = 20;

  type ParentGroup = { startX: number; totalW: number };
  const parentMap = new Map<string, ParentGroup>();
  let cx = M;
  for (const col of cols) {
    if (col.parent) {
      if (!parentMap.has(col.parent)) parentMap.set(col.parent, { startX: cx, totalW: 0 });
      parentMap.get(col.parent)!.totalW += col.w;
    }
    cx += col.w;
  }

  page.drawRectangle({ x: M, y: y - totalHdrH, width: cW, height: totalHdrH, color: lgray, borderColor: black, borderWidth: 0.5 });

  cx = M;
  for (const col of cols) {
    if (cx > M) page.drawLine({ start: { x: cx, y: y - totalHdrH }, end: { x: cx, y }, thickness: 0.5, color: black });
    if (!col.parent) {
      const lW = bold.widthOfTextAtSize(col.label, 5.5);
      t(col.label, cx + col.w / 2 - lW / 2, y - totalHdrH / 2 - 2, 5.5, bold);
    }
    cx += col.w;
  }

  for (const [label, grp] of parentMap) {
    const lW = bold.widthOfTextAtSize(label, 5.5);
    t(label, grp.startX + grp.totalW / 2 - lW / 2, y - hdr1H / 2 - 2, 5.5, bold);
  }

  for (const [, grp] of parentMap) {
    page.drawLine({
      start: { x: grp.startX, y: y - hdr1H },
      end:   { x: grp.startX + grp.totalW, y: y - hdr1H },
      thickness: 0.5, color: black,
    });
  }

  cx = M;
  for (const col of cols) {
    if (col.parent) {
      const lW = bold.widthOfTextAtSize(col.label, 5);
      t(col.label, cx + col.w / 2 - lW / 2, y - hdr1H - hdr2H / 2 - 2, 5, bold);
    }
    cx += col.w;
  }
  y -= totalHdrH;

  // ── Data rows ─────────────────────────────────────────────────────────────
  for (const cel of input.celulas) {
    const isAn = cel.tipo === 'ANULACAO';
    const ugec  = isAn ? input.ug_exec_an_cod  : input.ug_exec_sup_cod;
    const uges  = isAn ? input.ug_exec_an_sigla : input.ug_exec_sup_sigla;
    const ugcc  = isAn ? input.ug_cred_an_cod  : input.ug_cred_sup_cod;
    const ugcs  = isAn ? input.ug_cred_an_sigla : input.ug_cred_sup_sigla;
    const valor = cel.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const opLabel = isAn ? 'Anulacao' : 'Suplementacao';

    const rowData: Record<string, string> = {
      op:    opLabel,
      val:   valor,
      ugec,  uges,
      esf:   input.esfera,
      ptres: cel.ptres,
      fonte: input.fonte,
      nd:    cel.nd,
      plano: input.plano_interno,
      ugcc,  ugcs,
      obs:   clip(ascii(cel.obs ?? ''), 30),
    };

    page.drawRectangle({ x: M, y: y - rowH, width: cW, height: rowH, borderColor: black, borderWidth: 0.5 });

    cx = M;
    for (const col of cols) {
      if (cx > M) page.drawLine({ start: { x: cx, y: y - rowH }, end: { x: cx, y }, thickness: 0.3, color: black });
      const val = rowData[col.id] ?? '';
      const sz  = 6;
      const vW  = reg.widthOfTextAtSize(val, sz);
      let tx: number;
      if (col.align === 'r') tx = cx + col.w - vW - 2;
      else if (col.align === 'c') tx = cx + col.w / 2 - vW / 2;
      else tx = cx + 2;
      t(val, tx, y - rowH / 2 - 2.5, sz);
      cx += col.w;
    }
    y -= rowH;
  }

  // ── Signature section ─────────────────────────────────────────────────────
  y -= 16;
  tc('Brasilia, datado conforme assinatura digital.', y, 7, reg);
  y -= 12;
  tc('Autorizado por:', y, 7, bold);
  y -= 18;
  const sigCx = width / 2;
  page.drawLine({ start: { x: sigCx - 110, y }, end: { x: sigCx + 110, y }, thickness: 0.75, color: black });
  y -= 10;
  const sigW = bold.widthOfTextAtSize(ascii(input.signatario), 7);
  t(input.signatario, sigCx - sigW / 2, y, 7, bold);
  y -= 9;
  const cargoW = reg.widthOfTextAtSize('Comandante de Operacoes Aeroespaciais', 6.5);
  t('Comandante de Operacoes Aeroespaciais', sigCx - cargoW / 2, y, 6.5, reg);

  // ── Footer ────────────────────────────────────────────────────────────────
  t(`PAG: ${input.pag}`, M, M, 6, reg);

  return doc.save();
}
