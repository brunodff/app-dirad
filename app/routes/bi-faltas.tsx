// app/routes/bi-faltas.tsx
import * as React from "react";
import { Link } from "react-router";
import { jsPDF } from "jspdf";

/** ===== Config ===== */
const API_KEY = import.meta.env.VITE_API_KEY || "Kzec*3152";
const DIRAD_SHEET_ID = "16Wif7-ec17llhnAHAv33aDxVAhBKCkhU_6Cv75-VRLM";
const DIRAD_SHEET_NAME = ""; // se tiver nome fixo da aba, coloque aqui

/** ===== Utils ===== */
async function fetchArray(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  try { return normalizeToArray(await res.json()); } catch { return []; }
}
function normalizeToArray(input: any): any[] {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object") {
    if (Array.isArray((input as any).data)) return (input as any).data;
    if (Array.isArray((input as any).rows)) return (input as any).rows;
    if (Array.isArray((input as any).items)) return (input as any).items;
    return [input];
  }
  return [];
}

type Profile = { id?: string; email?: string | null; data?: { email?: string | null } | null; };
type Scan = {
  id?: string; day?: string; day_local?: string; scanned_at?: string;
  scanner_id?: string | null; scanned_email?: string | null; matched_email?: string | null;
};
type DirectoryRow = { email: string; divisao: string; setor: string; entraForma: boolean; };

const pad = (n: number) => String(n).padStart(2, "0");
function toDateOnly(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return String(s);
    return "";
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toDateBR(yyyy_mm_dd: string) {
  const m = yyyy_mm_dd?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return yyyy_mm_dd || "";
  const [, y, mo, d] = m; return `${d}/${mo}/${y}`;
}
function toTimeBR(s?: string | null) {
  if (!s) return ""; const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return ""; return d.toLocaleTimeString("pt-BR");
}
function asBool(v: any) { return ["sim","true","1","x","y","s"].includes(String(v??"").trim().toLowerCase()); }

/** ===== Planilha Google via GViz CSV ===== */
async function fetchDirectorySheet(id: string, sheetName = ""): Promise<DirectoryRow[]> {
  const base = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`;
  const url = sheetName ? `${base}&sheet=${encodeURIComponent(sheetName)}` : base;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].split(",").map(h => h.trim().toLowerCase());
  const idxEmail = header.findIndex(h => h.includes("email"));
  const idxDiv   = header.findIndex(h => h.includes("divis"));
  const idxSetor = header.findIndex(h => h.includes("setor"));
  const idxEntra = header.findIndex(h => h.replace(/\s+/g,"").includes("entraemforma") || h.includes("entra"));
  const rows: DirectoryRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const email = (cols[idxEmail] || "").trim().toLowerCase();
    if (!email) continue;
    rows.push({
      email,
      divisao: (cols[idxDiv] || "").trim(),
      setor: (cols[idxSetor] || "").trim(),
      entraForma: asBool(cols[idxEntra]),
    });
  }
  return rows;
}
function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ""; let inQ = false;
  for (let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){ if(inQ&&line[i+1]==='"'){cur+='"'; i++;} else inQ=!inQ; }
    else if(c===","&&!inQ){ out.push(cur); cur=""; }
    else { cur+=c; }
  }
  out.push(cur); return out.map(s=>s.trim());
}

/** =============== Página =============== */
export default function BIFaltas() {
  // Default: hoje
  const todayStr = React.useMemo(() => new Date().toISOString().slice(0,10), []);
  const [selectedDate, setSelectedDate] = React.useState<string>(todayStr);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string>("");

  const [rowsAll, setRowsAll] = React.useState<{ date:string; time:string; by:string; present:string }[]>([]);
  const [datesAvail, setDatesAvail] = React.useState<string[]>([]);

  const [logoDataUrl, setLogoDataUrl] = React.useState<string | null>(null);

  const [directory, setDirectory] = React.useState<DirectoryRow[]>([]);
  const [divisoes, setDivisoes] = React.useState<string[]>([]);
  const [divSel, setDivSel] = React.useState<string>("");
  const [setorSel, setSetorSel] = React.useState<string>("");
  const [setores, setSetores] = React.useState<string[]>([]);

  const [justMap, setJustMap] = React.useState<Record<string, boolean>>({}); // `${date}|${email}` => true

  // carrega logo para PDF
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/dirad.png");
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onload = () => setLogoDataUrl(String(reader.result));
        reader.readAsDataURL(blob);
      } catch {}
    })();
  }, []);

  React.useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError("");
      try {
        const [profilesRaw, scansRaw, dirRows] = await Promise.all([
          fetchArray(`/api/profiles?key=${encodeURIComponent(API_KEY)}`),
          fetchArray(`/api/scan?key=${encodeURIComponent(API_KEY)}`),
          fetchDirectorySheet(DIRAD_SHEET_ID, DIRAD_SHEET_NAME),
        ]);

        // Índices de perfis
        const profiles = profilesRaw as Profile[];
        const byId = new Map<string, Profile>();
        const byEmail = new Map<string, Profile>();
        const byDataEmail = new Map<string, Profile>();
        for (const p of profiles) {
          if (p?.id) byId.set((p.id||"").toLowerCase(), p);
          const e1 = (p?.email||"")?.toLowerCase(); if (e1) byEmail.set(e1, p);
          const e2 = (p?.data?.email||"")?.toLowerCase(); if (e2) byDataEmail.set(e2, p);
        }

        // Normaliza scans
        const scans = (scansRaw as Scan[]).map(s=>{
          const date = s.day || s.day_local || toDateOnly(s.scanned_at) || "";
          const time = toTimeBR(s.scanned_at) || "";
          const scanner = (s.scanner_id || "").toLowerCase();
          let by = "";
          if (scanner) {
            by = byDataEmail.get(scanner)?.data?.email || "";
            if (!by) by = byEmail.get(scanner)?.email || "";
            if (!by && byId.has(scanner)) by = byId.get(scanner)?.email || byId.get(scanner)?.data?.email || "";
            if (!by && /\S+@\S+\.\S+/.test(scanner)) by = scanner;
          }
          const present = (s.matched_email || s.scanned_email || "").toLowerCase();
          return { date, time, by: by.toLowerCase(), present: present || "" };
        }).filter(r=>r.date && r.present);

        // Datas disponíveis
        const uniqDates = Array.from(new Set(scans.map(r=>r.date))).sort((a,b)=>a<b?1:a>b?-1:0);

        // Diretório
        const dir = dirRows.filter(r=>r?.email).map(r=>({
          email: r.email.toLowerCase(), divisao: r.divisao||"", setor: r.setor||"", entraForma: !!r.entraForma
        }));
        const uniqDivs = Array.from(new Set(dir.map(d=>d.divisao).filter(Boolean))).sort();

        if (!active) return;
        setRowsAll(scans);
        setDatesAvail(uniqDates);
        // seleciona hoje se existir, senão a mais recente
        setSelectedDate(uniqDates.includes(todayStr) ? todayStr : (uniqDates[0] || todayStr));

        setDirectory(dir);
        setDivisoes(uniqDivs);
        // setores globais iniciais
        setSetores(Array.from(new Set(dir.map(d=>d.setor).filter(Boolean))).sort());
      } catch (e:any) {
        if (!active) return;
        setError(String(e?.message || e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return ()=>{ active = false; };
  }, [todayStr]);

  // Slicer encadeado: Setor depende da Divisão
  const setoresFiltrados = React.useMemo(()=>{
    const base = directory.filter(d => !divSel || d.divisao === divSel);
    return Array.from(new Set(base.map(d=>d.setor).filter(Boolean))).sort();
  }, [directory, divSel]);
  React.useEffect(()=>{
    setSetores(setoresFiltrados);
    if (setorSel && !setoresFiltrados.includes(setorSel)) setSetorSel("");
  }, [setoresFiltrados]); // eslint-disable-line

  // Leituras do dia (raw)
  const rowsOfDayRaw = React.useMemo(
    ()=> rowsAll.filter(r=>!selectedDate || r.date === selectedDate),
    [rowsAll, selectedDate]
  );
  // Dedup por (date, present)
  const rowsOfDay = React.useMemo(()=>{
    const seen = new Set<string>(); const out: typeof rowsOfDayRaw = [];
    for (const r of rowsOfDayRaw) { const key = `${r.date}|${r.present}`; if (seen.has(key)) continue; seen.add(key); out.push(r); }
    out.sort((a,b)=>a.time<b.time?-1:a.time>b.time?1:0); return out;
  }, [rowsOfDayRaw]);

  // Pessoas esperadas (entra em forma) pelo filtro divisão/setor
  const esperados = React.useMemo(()=> directory.filter(d=>{
    if (!d.entraForma) return false;
    if (divSel && d.divisao !== divSel) return false;
    if (setorSel && d.setor !== setorSel) return false;
    return true;
  }), [directory, divSel, setorSel]);

  const groupEmails = React.useMemo(()=> new Set(esperados.map(e=>e.email)), [esperados]);

  // PRESENTES restritos ao filtro divisão/setor (para KPI e para "Leituras do dia")
  const presentesFiltrados = React.useMemo(
    ()=> rowsOfDay.filter(r => groupEmails.has(r.present)),
    [rowsOfDay, groupEmails]
  );
  const presentesUnicosFiltrados = React.useMemo(
    ()=> Array.from(new Set(presentesFiltrados.map(r=>r.present))).sort(),
    [presentesFiltrados]
  );
  const presentCountFiltered = React.useMemo(()=> presentesUnicosFiltrados.length, [presentesUnicosFiltrados]);

  // Quem retirou (todos escaneadores no dia)
  const byDistinctAllWhoScanned = React.useMemo(()=>{
    const s = new Set(rowsOfDayRaw.map(r=>r.by).filter(Boolean));
    return Array.from(s.values());
  }, [rowsOfDayRaw]);

  // Faltantes = esperados - presentes
  const faltantes = React.useMemo(
    ()=> esperados.filter(d=> !presentesUnicosFiltrados.includes(d.email)),
    [esperados, presentesUnicosFiltrados]
  );

  // Justificada
  const isJustificada = (email:string)=> !!justMap[`${selectedDate}|${email}`];
  const toggleJustificada = (email:string)=> setJustMap(m=>({ ...m, [`${selectedDate}|${email}`]: !m[`${selectedDate}|${email}`] }));

  /** ====== XLS — 3 colunas e aba por SETOR ====== */
  function handleExportXLS() {
    // setores a incluir (respeita filtros atuais)
    const basePeople = directory.filter(d =>
      d.entraForma &&
      (!divSel || d.divisao === divSel) &&
      (!setorSel || d.setor === setorSel)
    );
    const groups = new Map<string, DirectoryRow[]>();
    for (const d of basePeople) {
      const key = d.setor || "(Sem Setor)";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    }

    const presentesSetDia = new Set(rowsOfDay.map(r=>r.present));

    const xmlHeader = `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>`;
    const openWB = `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`;
    const closeWB = `</Workbook>`;
    const esc = (v:string)=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const rowXml = (cells:string[]) => `<Row>`+cells.map(c=>`<Cell><Data ss:Type="String">${esc(c)}</Data></Cell>`).join("")+`</Row>`;

    const sheets: string[] = [];
    for (const [setorName, people] of groups) {
      const emailsGroup = new Set(people.map(p=>p.email));
      const presentes = Array.from(presentesSetDia).filter(e=>emailsGroup.has(e)).sort();
      const faltas = people.filter(p=>!presentes.includes(p.email)); // array de DirectoryRow
      const maxLen = Math.max(presentes.length, faltas.length);

      let ws = `<Worksheet ss:Name="${esc(setorName.slice(0,31))}"><Table>`;

      // título + linha em branco
      ws += rowXml([`Retirada de Faltas — ${selectedDate ? toDateBR(selectedDate) : "-"}`]);
      ws += rowXml([``]);

      // cabeçalho da grade
      ws += rowXml(["Presentes", "Faltantes", "Justificada?"]);

      // linhas (alinha pelas 3 colunas)
      for (let i = 0; i < maxLen; i++) {
        const pres = presentes[i] || "";
        const falt = faltas[i]?.email || "";
        const just = falt ? (isJustificada(falt) ? "Sim" : "Não") : "";
        ws += rowXml([pres, falt, just]);
      }

      ws += `</Table></Worksheet>`;
      sheets.push(ws);
    }

    const xml = xmlHeader + openWB + sheets.join("") + closeWB;
    const blob = new Blob([xml], { type:"application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Retirada_Faltas_${selectedDate}_PorSetor.xls`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  /** ====== PDF — estável, sem quebra visual ====== */
  function handleExportPDF() {
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    // Layout
    const M = 40;
    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const RIGHT = PAGE_W - M;
    const HEADER_LOGO_W = 120;
    const HEADER_LOGO_H = 120;
    const TITLE_FS = 20;
    const ROW_H = 22;
    const THEAD_H = 24;

    let currentPageTitle = "";

    const drawHeader = (title: string) => {
      currentPageTitle = title;
      let y = M;
      if (logoDataUrl) {
        try { doc.addImage(logoDataUrl, "PNG", M, y, HEADER_LOGO_W, HEADER_LOGO_H); } catch {}
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(TITLE_FS);
      doc.text(title, M + HEADER_LOGO_W + 18, y + 28);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      const meta = [
        selectedDate ? `Data: ${toDateBR(selectedDate)}` : "Data: —",
        divSel ? `Divisão: ${divSel}` : "Divisão: (todas)",
        setorSel ? `Setor: ${setorSel}` : "Setor: (todos)",
        `Quem retirou: ${byDistinctAllWhoScanned.join(", ") || "—"}`
      ];
      let my = y + 48;
      for (const m of meta) { doc.text(m, M + HEADER_LOGO_W + 18, my); my += 14; }

      const yb = Math.max(y + HEADER_LOGO_H, my) + 12;
      doc.setDrawColor(170);
      doc.line(M, yb, RIGHT, yb);
      return yb + 14;
    };

    function renderTable(startY: number, columns: { title: string; x: number; width?: number }[], rows: string[][]) {
      let y = startY;

      const drawThead = () => {
        doc.setFillColor(235, 240, 245);
        doc.rect(M - 2, y - (THEAD_H - 14), RIGHT - (M - 2), THEAD_H, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        for (const c of columns) doc.text(c.title, c.x, y);
        doc.setFont("helvetica", "normal");
        y += 16;
      };

      drawThead();

      for (let i = 0; i < rows.length; i++) {
        if (y + ROW_H > PAGE_H - M) {
          doc.addPage();
          y = drawHeader(currentPageTitle) + 4;
          drawThead();
        }

        if (i % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(M - 2, y - (ROW_H - 14), RIGHT - (M - 2), ROW_H, "F");
        }

        rows[i].forEach((text, idx) => {
          const col = columns[idx];
          const maxW = (col.width ?? (idx === columns.length - 1 ? RIGHT - col.x : columns[idx + 1].x - col.x - 8));
          let drawText = (text && text.length) ? text : "–";
          while (doc.getTextWidth(drawText) > maxW && drawText.length > 3) {
            drawText = drawText.slice(0, -4) + "…";
          }
          doc.text(drawText, col.x, y);
        });

        y += ROW_H;
      }
    }

    // Página 1 — Presentes
    let y = drawHeader("Retirada de Faltas — Presentes");
    const colsPres = [{ title: "Email", x: M }];
    const rowsPres = presentesUnicosFiltrados.map(e => [e]);
    renderTable(y, colsPres, rowsPres);

    // Página 2 — Faltantes (duas seções)
    doc.addPage();
    y = drawHeader("Retirada de Faltas — Faltantes");

    const colsFalt = [
      { title: "Email", x: M, width: (RIGHT - M) - 120 },
      { title: "Justificada?", x: RIGHT - 110, width: 110 },
    ];

    const faltJust = faltantes.filter(f => isJustificada(f.email));
    const faltNao  = faltantes.filter(f => !isJustificada(f.email));

    // Seção 1
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(`Justificadas (${faltJust.length})`, M, y);
    y += 18;
    renderTable(y, colsFalt, faltJust.map(f => [f.email, "Sim"]));

    // Força nova página para a segunda seção (evita sobreposição)
    doc.addPage();
    y = drawHeader("Retirada de Faltas — Faltantes");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(`Não justificadas (${faltNao.length})`, M, y);
    y += 18;
    renderTable(y, colsFalt, faltNao.map(f => [f.email, "Não"]));

    doc.save(`retirada-faltas-${selectedDate}.pdf`);
  }

  return (
    <main className="section" style={{ paddingTop: 12 }}>
      <div className="wrap" style={{ width: "min(1300px, 96vw)", margin: "0 auto" }}>
        {/* Cabeçalho */}
        <header style={{ position:"relative", marginBottom: 14, paddingTop: 4, paddingBottom: 4 }}>
          <h1 style={{
            margin:0, textAlign:"center",
            display:"flex", justifyContent:"center", alignItems:"center", gap: 16,
            fontSize: 40, lineHeight: 1.1
          }}>
            <img
              src="/dirad.png" alt="DIRAD"
              style={{ height: 56, objectFit:"contain" }}
              onError={(e)=>(((e.target as HTMLImageElement).style.display="none"))}
            />
            Relatório de Faltas
          </h1>
          <div style={{ position:"absolute", right:0, top:0, display:"flex", gap:8 }}>
            <button className="btn pill" onClick={handleExportPDF} style={{ padding:"8px 14px", fontSize:14 }}>PDF</button>
            <button className="btn pill" onClick={handleExportXLS} style={{ padding:"8px 14px", fontSize:14 }}>XLS</button>
            <Link className="btn pill" to="/secretaria" style={{ padding:"8px 14px", fontSize:14 }}>Voltar</Link>
          </div>
        </header>

        {/* Filtros */}
        <div style={{
          display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12
        }}>
          {/* Data */}
          <div className="card" style={{ padding:14 }}>
            <div style={{ fontSize:16, opacity:.9, marginBottom:6 }}>Selecione a data</div>
            <input
              type="date"
              value={selectedDate}
              min={datesAvail[datesAvail.length-1] || undefined}
              max={datesAvail[0] || undefined}
              onChange={(e)=>setSelectedDate(e.target.value)}
              style={{
                width:"100%", padding:"10px 12px", borderRadius:10,
                border:"1px solid rgba(255,255,255,.22)",
                background:"rgba(255,255,255,.18)", /* claro p/ leitura */
                color:"#0e1b22", outline:"none",
              }}
            />
            <div style={{ marginTop:8, fontSize:13, opacity:.85, color:"#eaf7f0" }}>
              Data: <strong>{selectedDate ? toDateBR(selectedDate) : "—"}</strong>
            </div>
          </div>

          {/* Divisão */}
          <div className="card" style={{ padding:14 }}>
            <div style={{ fontSize:16, opacity:.9, marginBottom:6 }}>Divisão</div>
            <select
              value={divSel} onChange={(e)=>setDivSel(e.target.value)}
              style={{
                width:"100%", padding:"10px 12px", borderRadius:10,
                border:"1px solid rgba(255,255,255,.22)",
                background:"rgba(255,255,255,.18)", color:"#0e1b22", outline:"none"
              }}
            >
              <option value="">(todas)</option>
              {divisoes.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Setor (encadeado) */}
          <div className="card" style={{ padding:14 }}>
            <div style={{ fontSize:16, opacity:.9, marginBottom:6 }}>Setor</div>
            <select
              value={setorSel} onChange={(e)=>setSetorSel(e.target.value)}
              style={{
                width:"100%", padding:"10px 12px", borderRadius:10,
                border:"1px solid rgba(255,255,255,.22)",
                background:"rgba(255,255,255,.18)", color:"#0e1b22", outline:"none"
              }}
            >
              <option value="">(todos)</option>
              {setores.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
          <div className="card" style={{ padding:14 }}>
            <div style={{ fontSize:16, opacity:.9, marginBottom:6 }}>Quem retirou as faltas</div>
            {byDistinctAllWhoScanned.length === 0
              ? <div style={{ fontSize:18, fontWeight:700 }}>—</div>
              : <div style={{ fontSize:18, fontWeight:700, display:"grid", gap:2 }}>
                  {byDistinctAllWhoScanned.map((e,i)=><span key={i}>{e}</span>)}
                </div>}
          </div>

          <div className="card" style={{ padding:14, display:"flex", flexDirection:"column", justifyContent:"center" }}>
            <div style={{ fontSize:16, opacity:.9, marginBottom:6 }}>Presentes no dia</div>
            <div style={{ fontSize:42, fontWeight:900, lineHeight:1 }}>{presentCountFiltered}</div>
          </div>

          <div className="card" style={{ padding:14, display:"flex", flexDirection:"column", justifyContent:"center" }}>
            <div style={{ fontSize:16, opacity:.9, marginBottom:6 }}>Efetivo</div>
            <div style={{ fontSize:42, fontWeight:900, lineHeight:1 }}>{esperados.length}</div>
          </div>
        </div>

        {/* Tabelas lado a lado */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          {/* Leituras do dia (apenas os da divisão/setor) */}
          <div className="card" style={{ padding:14 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <strong>Leituras do dia {selectedDate ? toDateBR(selectedDate) : "—"}</strong>
              <small style={{ opacity:.8 }}>{presentesUnicosFiltrados.length} presente(s)</small>
            </div>

            {error && <div className="error" style={{ padding:12 }}>Falha ao carregar: {error}</div>}
            {!error && (
              <div style={{ overflowX:"auto", marginTop:8 }}>
                <table style={{ width:"100%", borderCollapse:"collapse", color:"#eaf7f0" }}>
                  <thead>
                    <tr style={{ opacity:.85 }}>
                      <th style={{ textAlign:"left", padding:"6px 8px", borderBottom:"1px solid rgba(255,255,255,.14)" }}>
                        Militar presente
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {presentesUnicosFiltrados.length === 0 ? (
                      <tr><td style={{ padding:"8px" }}>—</td></tr>
                    ) : (
                      presentesUnicosFiltrados.map((email, i)=>(
                        <tr key={email} style={{ background: i%2 ? "rgba(255,255,255,.035)" : "transparent" }}>
                          <td style={{ padding:"8px" }}>{email}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Faltas do dia */}
          <div className="card" style={{ padding:14 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <strong>Faltas do dia {selectedDate ? toDateBR(selectedDate) : "—"}</strong>
              <small style={{ opacity:.8 }}>{faltantes.length} faltante(s)</small>
            </div>

            <div style={{ overflowX:"auto", marginTop:8 }}>
              <table style={{ width:"100%", borderCollapse:"collapse", color:"#eaf7f0" }}>
                <thead>
                  <tr style={{ opacity:.85 }}>
                    <th style={{ textAlign:"left", padding:"6px 8px", borderBottom:"1px solid rgba(255,255,255,.14)" }}>Email</th>
                    <th style={{ textAlign:"left", padding:"6px 8px", borderBottom:"1px solid rgba(255,255,255,.14)" }}>Divisão</th>
                    <th style={{ textAlign:"left", padding:"6px 8px", borderBottom:"1px solid rgba(255,255,255,.14)" }}>Setor</th>
                    <th style={{ textAlign:"left", padding:"6px 8px", borderBottom:"1px solid rgba(255,255,255,.14)" }}>
                      Falta justificada?
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {faltantes.length === 0 ? (
                    <tr><td style={{ padding:"8px" }} colSpan={4}>—</td></tr>
                  ) : (
                    faltantes.map((f,i)=>(
                      <tr key={f.email} style={{ background: i%2 ? "rgba(255,255,255,.035)" : "transparent" }}>
                        <td style={{ padding:"8px" }}>{f.email}</td>
                        <td style={{ padding:"8px" }}>{f.divisao}</td>
                        <td style={{ padding:"8px" }}>{f.setor}</td>
                        <td style={{ padding:"8px" }}>
                          <label style={{ display:"inline-flex", alignItems:"center", gap:8, cursor:"pointer" }}>
                            <input type="checkbox" checked={isJustificada(f.email)} onChange={()=>toggleJustificada(f.email)} />
                            <span>{isJustificada(f.email) ? "Sim" : ""}</span>
                          </label>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
