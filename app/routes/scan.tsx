import * as React from "react";
import { useNavigate } from "react-router";
import { Scanner } from "@yudiel/react-qr-scanner";
import supabase from "../../utils/supabase";
import { lookupExternalByToken } from "../../utils/externalSupabase";
import { jsPDF } from "jspdf";

/** ====== Configs ====== */
const COOLDOWN_SECONDS = 5; // mesmo comportamento do antigo
const BEEP_DATA_URL =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQwAAAAAAP8AAP//AAD//wAA//8AAP//AAD/AAAA/wAA"; // beep curtinho

/** Extrai um token do QR (JSON, URL com ?id=..., ?code=..., ?token=..., ou texto). */
function extractToken(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;

  // 1) JSON?
  try {
    const j = JSON.parse(raw);
    const v = j.id ?? j.code ?? j.token ?? null;
    if (v && typeof v === "string") return v.trim();
  } catch {}

  // 2) URL?
  try {
    const u = new URL(raw);
    for (const k of ["id", "code", "token"]) {
      const v = u.searchParams.get(k);
      if (v) return v.trim();
    }
  } catch {}

  // 3) Texto puro (uuid / alfanum >= 6)
  const m = raw.match(/[A-Za-z0-9\-_]{6,}/);
  return m ? m[0] : null;
}

/** Linha usada no histórico da sessão (para relatórios) */
type ScanRow = {
  when: string; // hora local humanizada (p/ UI)
  iso: string;  // ISO completo (p/ ordenar e imprimir hora exata)
  token?: string;
  email?: string;
  saved: boolean;
  error?: string;
};

export default function Scan() {
  const nav = useNavigate();

  const [busy, setBusy] = React.useState(false);
  const [last, setLast] = React.useState<ScanRow | null>(null);
  const [history, setHistory] = React.useState<ScanRow[]>([]);
  const [msg, setMsg] = React.useState<string>("");

  const [cameraOn, setCameraOn] = React.useState(true);
  const [finished, setFinished] = React.useState(false);

  const [scannerEmail, setScannerEmail] = React.useState<string>("");
  const [logoDataUrl, setLogoDataUrl] = React.useState<string | null>(null);

  // cooldown (com contador na tela)
  const [cooldown, setCooldown] = React.useState<number>(0);
  const cooldownRef = React.useRef<number>(0);
  React.useEffect(() => {
    cooldownRef.current = cooldown;
    if (cooldown <= 0) return;
    const t = window.setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, [cooldown]);

  // debounce (protege de frames repetidos do mesmo QR)
  const lastTokenRef = React.useRef<string | null>(null);
  const lastSeenAtRef = React.useRef<number>(0);

  // carregar e-mail do responsável e a logo (para o PDF)
  React.useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setScannerEmail(data.session?.user?.email ?? "");
      try {
        const res = await fetch("/dirad.png");
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onload = () => setLogoDataUrl(String(reader.result));
        reader.readAsDataURL(blob);
      } catch { /* silencioso */ }
    })();
  }, []);

  // jogador de beep
  const beepRef = React.useRef<HTMLAudioElement | null>(null);
  React.useEffect(() => {
    const a = new Audio(BEEP_DATA_URL);
    beepRef.current = a;
  }, []);

  /** Somente leituras salvas e com e-mail — usadas nos relatórios */
  const sessionRows = React.useMemo(
    () =>
      history
        .filter((r) => r.saved && r.email)
        .sort((a, b) => a.iso.localeCompare(b.iso)),
    [history]
  );

  function showMsg(text: string) {
    setMsg(text);
    window.setTimeout(() => setMsg(""), 2200);
  }

  /** Lê um frame decodificado do QR */
  async function handleDetect(detected: { rawValue: string }[]) {
    if (busy || !cameraOn || finished) return;
    const raw = detected?.[0]?.rawValue?.trim() ?? "";
    if (!raw) return;

    // cooldown “duro”: bloqueia novas leituras
    if (cooldownRef.current > 0) return;

    const token = extractToken(raw);
    if (!token) {
      showMsg("QR inválido ou sem código reconhecido.");
      return;
    }

    // debounce
    const now = Date.now();
    if (lastTokenRef.current === token && now - lastSeenAtRef.current < 2500) return;
    lastTokenRef.current = token;
    lastSeenAtRef.current = now;

    setBusy(true);

    try {
      // quem está escaneando
      const { data: sess } = await supabase.auth.getSession();
      const scannerId = sess?.session?.user?.id ?? null;

      // lookup no EXTERNO
      const ext = await lookupExternalByToken(token);

      if (!ext) {
        const row: ScanRow = {
          when: new Date().toLocaleString("pt-BR"),
          iso: new Date().toISOString(),
          token,
          saved: false,
          error: "Não encontrado no cadastro externo.",
        };
        setLast(row);
        setHistory((h) => [row, ...h].slice(0, 200));
        setCooldown(COOLDOWN_SECONDS);
        return;
      }

      // grava na SUA external_scans (mesmo payload mínimo de antes)
      const payload = {
        scanned_at: new Date().toISOString(),
        scanner_id: scannerId,
        scanned_user_id: ext.user_id,
        scanned_email: ext.email,
        token,
      };

      const { error: insErr } = await supabase.from("external_scans").insert(payload);
      const saved = !insErr;

      const row: ScanRow = {
        when: new Date().toLocaleString("pt-BR"),
        iso: payload.scanned_at,
        token,
        email: ext.email,
        saved,
        error: insErr ? "Falha ao salvar no meu banco." : undefined,
      };
      setLast(row);
      setHistory((h) => [row, ...h].slice(0, 200));
      showMsg(row.error ? row.error : "Leitura registrada.");
      if (!row.error) {
        // beep somente quando foi sucesso
        try { await beepRef.current?.play(); } catch {}
      }
      setCooldown(COOLDOWN_SECONDS);
    } catch (e: any) {
      const row: ScanRow = {
        when: new Date().toLocaleString("pt-BR"),
        iso: new Date().toISOString(),
        token,
        saved: false,
        error: String(e?.message || e),
      };
      setLast(row);
      setHistory((h) => [row, ...h].slice(0, 200));
      showMsg(row.error ?? "Erro ao processar QR.");
      setCooldown(COOLDOWN_SECONDS);
    } finally {
      setBusy(false);
    }
  }

  function toggleCamera() {
    setCameraOn((v) => !v);
  }
  function finalize() {
    setFinished(true);
    setCameraOn(false);
  }
  function resume() {
    setFinished(false);
    setCameraOn(true);
  }

  /** ======== Export: PDF (jsPDF) ======== */
  function generatePDF() {
    const rows = sessionRows;
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    // margens
    const M = 40;
    const PAGE_W = 595.28; // A4 pt
    const RIGHT = PAGE_W - M;
    let y = M;

    // logo
    if (logoDataUrl) {
      try { doc.addImage(logoDataUrl, "PNG", M, y, 90, 90); } catch {}
    }

    // título + metadados
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Relatório de Retirada de Faltas", M + 90 + 16, y + 26);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const meta = [
      `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
      `Responsável: ${scannerEmail || "-"}`,
    ];
    let my = y + 46;
    meta.forEach((m) => { doc.text(m, M + 90 + 16, my); my += 14; });

    const headBottom = Math.max(y + 90, my) + 12;
    doc.setDrawColor(170);
    doc.line(M, headBottom, RIGHT, headBottom);

    // cabeçalho da tabela
    const colHoraX = M;
    const colEmailX = M + 110;
    let ty = headBottom + 22;

    doc.setFillColor(235, 240, 245);
    doc.rect(M - 2, ty - 14, RIGHT - (M - 2), 22, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Hora", colHoraX, ty);
    doc.text("E-mail", colEmailX, ty);

    ty += 16;
    doc.setFont("helvetica", "normal");

    const lineH = 18;
    const MAX_Y = 800;

    rows.forEach((r, idx) => {
      if (ty > MAX_Y) {
        doc.addPage();
        ty = M + 10;
        doc.setFillColor(235, 240, 245);
        doc.rect(M - 2, ty - 14, RIGHT - (M - 2), 22, "F");
        doc.setFont("helvetica", "bold");
        doc.text("Hora", colHoraX, ty);
        doc.text("E-mail", colEmailX, ty);
        ty += 16;
        doc.setFont("helvetica", "normal");
      }

      // hora
      doc.text(new Date(r.iso).toLocaleTimeString("pt-BR"), colHoraX, ty);

      // email (quebra se necessário)
      const maxW = RIGHT - colEmailX;
      const lines = doc.splitTextToSize(r.email ?? "", maxW);
      lines.forEach((ln: string, i: number) => {
        doc.text(ln, colEmailX, ty + i * lineH);
      });

      // zebra suave
      if ((idx & 1) === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(M - 2, ty - lineH, RIGHT - (M - 2), lineH, "F");
      }

      ty += lineH * Math.max(1, lines.length);
    });

    const filename = `relatorio-faltas-${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
  }

  /** ======== Export: XLS (SpreadsheetML) ======== */
  function generateXLS() {
    const rows = sessionRows;
    if (rows.length === 0) {
      showMsg("Nada para exportar.");
      return;
    }

    const xmlHeader = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>`;
    const openWB = `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`;
    const openWS = `<Worksheet ss:Name="Relatorio"><Table>`;
    const closeWS = `</Table></Worksheet>`;
    const closeWB = `</Workbook>`;

    const esc = (v: string) =>
      String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const rowXml = (cells: string[]) =>
      `<Row>` +
      cells.map((c) => `<Cell><Data ss:Type="String">${esc(c)}</Data></Cell>`).join("") +
      `</Row>`;

    const head = rowXml(["Hora", "E-mail"]);
    const body = rows
      .map((r) =>
        rowXml([new Date(r.iso).toLocaleTimeString("pt-BR"), r.email || ""])
      )
      .join("");

    const xml = xmlHeader + openWB + openWS + head + body + closeWS + closeWB;
    const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-faltas-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="scan-page" style={{ padding: 16 }}>
      <h1 style={{ marginBottom: 8 }}>Leitura de QR — Retirada de Faltas</h1>

      {/* Ações principais */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {!finished && (
          <>
            <button className="btn" onClick={toggleCamera}>
              {cameraOn ? "Fechar câmera" : "Abrir câmera"}
            </button>
            <button
              className="btn"
              onClick={finalize}
              disabled={sessionRows.length === 0}
              title={
                sessionRows.length === 0
                  ? "Faça ao menos 1 leitura válida para finalizar"
                  : "Finalizar e gerar relatórios"
              }
            >
              Finalizar retirada de faltas
            </button>
          </>
        )}

        {finished && (
          <>
            <button className="btn" onClick={generatePDF}>Gerar PDF</button>
            <button className="btn" onClick={generateXLS}>Gerar XLS</button>
            <button className="btn" onClick={resume}>Retornar para retirada de faltas</button>
          </>
        )}
      </div>

      {/* Scanner */}
      {!finished && cameraOn && (
        <div style={{ maxWidth: 720, margin: "0 auto", borderRadius: 12, overflow: "hidden", position: "relative" }}>
          <Scanner
            onScan={handleDetect}
            onError={(err) =>
              setMsg(typeof err === "object" && err !== null && "message" in err
                ? String((err as any).message)
                : String(err))}
            constraints={{ facingMode: "environment" }}
          />
          {cooldown > 0 && (
            <div
              style={{
                position: "absolute",
                left: 0, right: 0, bottom: 0,
                display: "grid", placeItems: "center",
                padding: "10px 12px",
                background: "rgba(0,0,0,.55)",
                color: "#cfe9df",
                fontWeight: 800,
                borderTop: "1px solid rgba(255,255,255,.18)",
              }}
            >
              Aguarde {cooldown}s para ler o próximo QR…
            </div>
          )}
        </div>
      )}

      {msg && <p style={{ marginTop: 10 }}>{msg}</p>}

      {/* Última leitura */}
      {last && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.2)",
            background: "rgba(255,255,255,.04)",
          }}
        >
          <b>Última leitura:</b>
          <div>Quando: {last.when}</div>
          {last.email && <div>E-mail: <code>{last.email}</code></div>}
          {last.token && <div>Token: <code>{last.token}</code></div>}
          <div>Status: {last.error ? "Erro" : (last.saved ? "Registrado" : "Não salvo")}</div>
          {last.error && <div style={{ color: "#ffd4d4" }}>{last.error}</div>}
        </div>
      )}

      {/* Histórico da sessão */}
      {history.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <b>Leituras nesta Estrada em Forma ({history.length})</b>
          <div
            style={{
              marginTop: 8,
              background: "rgba(0,0,0,.22)",
              border: "1px solid rgba(255,255,255,.08)",
              borderRadius: 10,
              padding: 10,
              maxHeight: 220,
              overflow: "auto",
            }}
          >
            <table style={{ width: "100%", color: "#eaf7f0", borderCollapse: "collapse" }}>
              <thead style={{ opacity: 0.85 }}>
                <tr>
                  <th style={{ textAlign: "left", paddingBottom: 6 }}>Hora</th>
                  <th style={{ textAlign: "left", paddingBottom: 6 }}>E-mail</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r, i) => (
                  <tr key={i}>
                    <td>{new Date(r.iso).toLocaleTimeString("pt-BR")}</td>
                    <td>{r.email ?? "(sem e-mail)"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <button onClick={() => nav(-1)} className="btn">Voltar</button>
      </div>
    </main>
  );
}
