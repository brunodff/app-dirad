// app/routes/empenhos.tsx
import * as React from "react";
import { useNavigate } from "react-router";
import supabase from "../../utils/supabase";
import * as XLSX from "xlsx";
import RequireAuth from "../auth/RequireAuth";

const POSTOS = ["CEL", "TCEL", "MJ", "CP", "1T", "2T", "AP", "SO", "1S", "2S", "3S", "CB", "S1", "S2"] as const;
type Posto = (typeof POSTOS)[number];

type Identidade = { posto: Posto; nomeGuerra: string; userId: string };

type EmpenhoRow = {
  id: string;
  created_at: string | null;
  created_by: string | null;

  subprocesso: string;
  solicitacao: string;
  responsavel: string;

  data_solicitacao: string | null; // YYYY-MM-DD
  criado_por: string | null;

  ugcred: string | null;

  siafi: string | null;
  siloms: string | null;

  situacao: "ACI" | "GL" | null;

  valor: number | null;
  renomeado: boolean | null;
  incluido: boolean | null;

  om: "GAP MN" | "PAMN" | "SEREP" | "HAMN" | "CINDACTA" | "OUTROS" | null;

  status: "pendente" | "empenhado" | "concluido" | null;

  obs: string | null;
};

type Draft = {
  rid: string;
  data_solicitacao: string; // YYYY-MM-DD
  subprocesso: string;
  solicitacao: string;
  ugcred: string;
  modo: "auto" | "manual";
  responsavel_manual: string;
};

type DbResponsavel = { nome: string; ativo: boolean; ordem: number; unidade?: string | null };

const KEY_IDENT = "empenhos_identidade";
const KEY_DRAFTS = "empenhos_drafts";
const KEY_POOL_AUTO_OFF = "empenhos_pool_auto_off";
const KEY_RR_PTR = "empenhos_rr_ptr";
const KEY_REPORT_EMAIL = "empenhos_report_email";
const KEY_REPORT_FROM = "empenhos_report_from";
const KEY_REPORT_TO = "empenhos_report_to";

type DailyMessage = {
  id: string;
  enabled: boolean;
  title: string;
  body: string;
  signature?: string;
};
const KEY_DAILY_MSG_DISMISSED = "empenhos_daily_msg_dismissed_id";

const DAILY_MESSAGE_FALLBACK: DailyMessage = {
  id: "2026-02-02",
  enabled: false,
  title: "Aviso do dia",
  body: "Mensagem do dia (fallback do código).",
  signature: "2T Bruno",
};

async function fetchDailyMessage(): Promise<DailyMessage | null> {
  try {
    const res = await fetch(`/daily-message.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as Partial<DailyMessage>;
    if (!j || typeof j.id !== "string") return null;

    return {
      id: String(j.id),
      enabled: j.enabled !== false,
      title: String(j.title ?? "Mensagem"),
      body: String(j.body ?? ""),
      signature: j.signature ? String(j.signature) : "",
    };
  } catch {
    return null;
  }
}

const FALLBACK_RESPONSAVEIS = ["SO Melo", "3S Sara", "3S Anne", "2T Goes"] as const;

const UG_OPTIONS = [
  "BAMN - 120082",
  "GAP MN - 120630",
  "COMAR 7 - 120083",
  "CINDACTA 4 - 120094",
  "HAMN - 120154",
  "SEREP - 120254",
] as const;

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((s) => (s ?? "").toString().trim()).filter(Boolean)));
}
function norm(v: any) {
  return (v ?? "").toString().trim();
}
function lower(v: any) {
  return norm(v).toLowerCase();
}
function keyNorm(v: any) {
  // normaliza pra comparação de duplicidade: trim + lower + remove espaços internos
  return lower(v).replace(/\s+/g, "");
}
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function dateKey(e: EmpenhoRow) {
  const ds = (e.data_solicitacao ?? "").slice(0, 10);
  if (ds) return ds;
  const ca = (e.created_at ?? "").slice(0, 10);
  return ca || "";
}
function colorForName(name: string) {
  const colors = ["#22c55e", "#06b6d4", "#a855f7", "#f97316", "#eab308", "#3b82f6", "#ef4444", "#14b8a6"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}
function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function formatNumberBR(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseNumberBR(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;

  const s = norm(v);
  if (!s) return null;

  let x = s.replace(/\s+/g, "");
  if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
  x = x.replace(/[^0-9.\-]/g, "");

  const num = Number(x);
  return Number.isFinite(num) ? num : null;
}
function toISODateFromAny(v: any): string | "" {
  if (!v && v !== 0) return "";
  if (v instanceof Date && !isNaN(v.getTime())) {
    const yyyy = v.getFullYear();
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    const dd = String(v.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const s = norm(v);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  if (typeof v === "number" && Number.isFinite(v)) {
    try {
      const dc = XLSX.SSF.parse_date_code(v);
      if (dc && dc.y && dc.m && dc.d) {
        const yyyy = String(dc.y).padStart(4, "0");
        const mm = String(dc.m).padStart(2, "0");
        const dd = String(dc.d).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      }
    } catch {}
  }

  return "";
}

function buildXlsx(rows: EmpenhoRow[]) {
  const data = rows.map((r) => ({
    Data: (r.data_solicitacao ?? dateKey(r) ?? "").slice(0, 10),
    Subprocesso: r.subprocesso ?? "",
    Solicitacao: r.solicitacao ?? "",
    UGCred: r.ugcred ?? "",
    Responsavel: r.responsavel ?? "",
    SIAFI: r.siafi ?? "",
    SILOMS: r.siloms ?? "",
    Valor: r.valor ?? "",
    Renomeado: r.renomeado === true ? "SIM" : "NAO",
    Incluido: r.incluido === true ? "SIM" : "NAO",
    Obs: r.obs ?? "",
    Solicitante: r.criado_por ?? "",
    CriadoEm: (r.created_at ?? "").slice(0, 19).replace("T", " "),
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Empenhos");
  const array = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([array], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function makePeriodLabel(df: string, dt: string) {
  const from = norm(df) || "inicio";
  const to = norm(dt) || "fim";
  return `${from}_a_${to}`;
}

function filterByRange(rows: EmpenhoRow[], df: string, dt: string) {
  const from = norm(df);
  const to = norm(dt);

  return rows.filter((r) => {
    const d = dateKey(r) || "";
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

// ✅ BI FIXO POR UNIDADE
const BI_LINK_GAP_DF =
  "https://app.powerbi.com/view?r=eyJrIjoiN2M5ZTVmNDMtYTZlOC00NjkxLTk2MzYtZDVjZTliYTFhOTY5IiwidCI6IjNhMzY0ZGI2LTg2NmEtNDRkOS1iMzY5LWM1ODk1OWQ0NDhmOCJ9";
const BI_LINK_GAP_MN =
  "https://app.powerbi.com/view?r=eyJrIjoiYjJiZWE0NWItZTJkNS00ZjMzLThhYTQtOTNkODhhOGQ3MzM1IiwidCI6IjNhMzY0ZGI2LTg2NmEtNDRkOS1iMzY5LWM1ODk1OWQ0NDhmOCJ9";

/** ===========================
 * ✅ DUPLICIDADE ROBUSTA
 * - checa:
 *   1) duplicidade dentro do próprio lote (drafts/import)
 *   2) duplicidade contra a lista local
 *   3) duplicidade contra o banco (evita corrida / lista desatualizada)
 * =========================== */
function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type DupeKeys = { solicitacoes: string[]; subprocessos: string[] };

function buildDupeKeysFromDrafts(drafts: Draft[]): DupeKeys {
  const solicitacoes = drafts.map((d) => norm(d.solicitacao)).filter(Boolean);
  const subprocessos = drafts.map((d) => norm(d.subprocesso)).filter(Boolean);
  return { solicitacoes, subprocessos };
}

function buildDupeKeysFromPayload(payload: Array<{ solicitacao?: string; subprocesso?: string }>): DupeKeys {
  const solicitacoes = payload.map((p) => norm(p.solicitacao)).filter(Boolean);
  const subprocessos = payload.map((p) => norm(p.subprocesso)).filter(Boolean);
  return { solicitacoes, subprocessos };
}

function findDupesInsideBatch(keys: DupeKeys) {
  const dupSols: string[] = [];
  const dupSubs: string[] = [];

  const seenSol = new Set<string>();
  const seenSub = new Set<string>();

  for (const s of keys.solicitacoes) {
    const k = keyNorm(s);
    if (!k) continue;
    if (seenSol.has(k)) dupSols.push(s);
    else seenSol.add(k);
  }

  for (const s of keys.subprocessos) {
    const k = keyNorm(s);
    if (!k) continue;
    if (seenSub.has(k)) dupSubs.push(s);
    else seenSub.add(k);
  }

  return { dupSols: uniq(dupSols), dupSubs: uniq(dupSubs) };
}

function buildLocalIndex(lista: EmpenhoRow[]) {
  const sol = new Set<string>();
  const sub = new Set<string>();
  for (const e of lista) {
    const ks = keyNorm(e.solicitacao);
    const kb = keyNorm(e.subprocesso);
    if (ks) sol.add(ks);
    if (kb) sub.add(kb);
  }
  return { sol, sub };
}

async function fetchExistingFromDB(table: string, keys: DupeKeys) {
  // PostgREST tem limite de URL; então: dedupe + chunk
  const sols = uniq(keys.solicitacoes.map((s) => norm(s))).filter(Boolean);
  const subs = uniq(keys.subprocessos.map((s) => norm(s))).filter(Boolean);

  const found = {
    solicitacoes: new Set<string>(),
    subprocessos: new Set<string>(),
    samples: [] as Array<{ id: string; solicitacao: string; subprocesso: string }>,
  };

  // Busca por solicitação
  for (const part of chunk(sols, 120)) {
    if (!part.length) continue;
    const { data, error } = await supabase
      .from(table)
      .select("id, solicitacao, subprocesso")
      .in("solicitacao", part)
      .limit(5000);

    if (error) throw error;

    for (const r of (data as any[]) || []) {
      const ks = keyNorm(r?.solicitacao);
      const kb = keyNorm(r?.subprocesso);
      if (ks) found.solicitacoes.add(ks);
      if (kb) found.subprocessos.add(kb);
      if (found.samples.length < 12) {
        found.samples.push({ id: String(r?.id || ""), solicitacao: String(r?.solicitacao || ""), subprocesso: String(r?.subprocesso || "") });
      }
    }
  }

  // Busca por subprocesso (se tiver)
  for (const part of chunk(subs, 120)) {
    if (!part.length) continue;
    const { data, error } = await supabase
      .from(table)
      .select("id, solicitacao, subprocesso")
      .in("subprocesso", part)
      .limit(5000);

    if (error) throw error;

    for (const r of (data as any[]) || []) {
      const ks = keyNorm(r?.solicitacao);
      const kb = keyNorm(r?.subprocesso);
      if (ks) found.solicitacoes.add(ks);
      if (kb) found.subprocessos.add(kb);
      if (found.samples.length < 12) {
        found.samples.push({ id: String(r?.id || ""), solicitacao: String(r?.solicitacao || ""), subprocesso: String(r?.subprocesso || "") });
      }
    }
  }

  return found;
}

function EmpenhosPageInner() {
  const nav = useNavigate();

  const [sessionUserId, setSessionUserId] = React.useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = React.useState<string>("");

  // ✅ unidade do usuário (profiles.unidade)
  const [unidade, setUnidade] = React.useState<"GAP-MN" | "GAP-DF">("GAP-MN");

  // ✅ tabela dinâmica: MN usa "empenhos", DF usa "empenhos_df"
  const EMPENHOS_TABLE = unidade === "GAP-DF" ? "empenhos_df" : "empenhos";

  // ✅ BI por unidade
  const biLink = unidade === "GAP-DF" ? BI_LINK_GAP_DF : BI_LINK_GAP_MN;

  const [ident, setIdent] = React.useState<Identidade | null>(null);
  const nomeIdent = ident ? `${ident.posto} ${ident.nomeGuerra}` : "";

  const [aba, setAba] = React.useState<"cadastrar" | "acompanhar">("cadastrar");

  const [lista, setLista] = React.useState<EmpenhoRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [listaLoaded, setListaLoaded] = React.useState(false); // ✅ garante que já carregou da tabela certa

  // ✅ AVALIAR APP
  const [showAvaliar, setShowAvaliar] = React.useState(false);
  const [notaAvaliar, setNotaAvaliar] = React.useState<number>(0); // 1..5
  const [textoAvaliar, setTextoAvaliar] = React.useState<string>("");
  const [sendingAvaliar, setSendingAvaliar] = React.useState(false);

  function openAvaliar() {
    setMsg(null);
    setShowAvaliar(true);
  }
  function closeAvaliar() {
    setShowAvaliar(false);
  }
  async function enviarAvaliacao() {
    if (!sessionUserId) {
      setMsg("Sessão inválida.");
      return;
    }
    if (notaAvaliar < 1 || notaAvaliar > 5) {
      setMsg("Selecione uma nota de 1 a 5.");
      return;
    }

    setSendingAvaliar(true);
    setMsg(null);

    try {
      const payload = {
        created_by: sessionUserId,
        email: sessionEmail || null,
        nome: nomeIdent || null,
        unidade: unidade || null,
        nota: notaAvaliar,
        texto: norm(textoAvaliar) ? norm(textoAvaliar) : null,
        pagina: "empenhos",
      };

      const { error } = await supabase.from("opiniao").insert(payload);
      if (error) {
        setMsg(`Erro ao enviar avaliação: ${error.message}`);
        return;
      }

      setMsg("Avaliação enviada. Obrigado! ✅");
      setShowAvaliar(false);
      setNotaAvaliar(0);
      setTextoAvaliar("");
    } catch (e: any) {
      setMsg(`Erro ao enviar avaliação: ${e?.message || e}`);
    } finally {
      setSendingAvaliar(false);
    }
  }

  // ✅ MENSAGEM DO DIA
  const [dailyMsg, setDailyMsg] = React.useState<DailyMessage | null>(null);
  const [showDailyMsg, setShowDailyMsg] = React.useState(false);

  function dismissedDailyId(): string {
    return localStorage.getItem(KEY_DAILY_MSG_DISMISSED) || "";
  }
  function shouldShowDaily(m: DailyMessage | null) {
    if (!m) return false;
    if (!m.enabled) return false;
    if (!m.id) return false;
    return dismissedDailyId() !== m.id;
  }
  function closeDailyMsg() {
    if (dailyMsg?.id) localStorage.setItem(KEY_DAILY_MSG_DISMISSED, dailyMsg.id);
    setShowDailyMsg(false);
  }

  // drafts
  const [drafts, setDrafts] = React.useState<Draft[]>([]);

  // responsáveis
  const [dbRespAtivos, setDbRespAtivos] = React.useState<string[]>([]);
  const [dbRespInativos, setDbRespInativos] = React.useState<string[]>([]);
  const [autoOff, setAutoOff] = React.useState<string[]>([]);
  const [novoResp, setNovoResp] = React.useState("");

  // filtros acompanhar
  const [q, setQ] = React.useState("");
  const [solicitante, setSolicitante] = React.useState("");
  const [responsavelFilter, setResponsavelFilter] = React.useState<string>("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  const [verPendentes, setVerPendentes] = React.useState(false);

  // edição
  const [edits, setEdits] = React.useState<Record<string, Partial<EmpenhoRow>>>({});

  // relatório
  const [reportEmail, setReportEmail] = React.useState<string>(() => localStorage.getItem(KEY_REPORT_EMAIL) || "");
  const [reportFrom, setReportFrom] = React.useState<string>(() => localStorage.getItem(KEY_REPORT_FROM) || todayISO());
  const [reportTo, setReportTo] = React.useState<string>(() => localStorage.getItem(KEY_REPORT_TO) || todayISO());
  const [sendingEmail, setSendingEmail] = React.useState(false);

  // presence
  const [online, setOnline] = React.useState<Array<{ key: string; nome: string; clientId?: string }>>([]);
  const clientId = React.useMemo(() => {
    const key = "empenhos_client_id";
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  }, []);

  // IMPORT
  const [importSkipFirstRow, setImportSkipFirstRow] = React.useState(true);
  const [importHeaders, setImportHeaders] = React.useState<string[]>([]);
  const [importRaw, setImportRaw] = React.useState<Record<string, any>[]>([]);
  const [importCols, setImportCols] = React.useState<{ sol?: string; ug?: string; valor?: string; obs?: string; data?: string }>({});
  const [importPreview, setImportPreview] = React.useState<
    Array<{ solicitacao: string; ugcred: string; valor: number | null; obs: string; data_solicitacao: string }>
  >([]);
  const [importManualResp, setImportManualResp] = React.useState<string>("");
  const [importLastFile, setImportLastFile] = React.useState<File | null>(null);

  // ===== init =====
  React.useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id ?? null;
      const email = data.session?.user?.email ?? "";
      if (!mounted) return;

      setSessionUserId(uid);
      setSessionEmail(email);

      if (!uid) {
        nav("/", { replace: true });
        return;
      }

      // ✅ pega unidade do profiles
      try {
        const { data: prof } = await supabase.from("profiles").select("unidade").eq("id", uid).maybeSingle();
        const u = (prof?.unidade || "GAP-MN").toString().toUpperCase();
        setUnidade(u === "GAP-DF" ? "GAP-DF" : "GAP-MN");
      } catch {
        setUnidade("GAP-MN");
      }

      // identidade
      const saved = localStorage.getItem(KEY_IDENT);
      if (saved) {
        try {
          const parsed: Identidade = JSON.parse(saved);
          if (parsed.userId === uid) setIdent(parsed);
        } catch {}
      }

      // drafts
      const savedDrafts = localStorage.getItem(KEY_DRAFTS);
      if (savedDrafts) {
        try {
          const parsed = JSON.parse(savedDrafts) as any[];
          if (Array.isArray(parsed)) {
            const fixed: Draft[] = parsed.map((d) => ({
              rid: d.rid || crypto.randomUUID(),
              data_solicitacao: d.data_solicitacao || todayISO(),
              subprocesso: d.subprocesso || "",
              solicitacao: d.solicitacao || "",
              ugcred: d.ugcred || "",
              modo: d.modo || "auto",
              responsavel_manual: d.responsavel_manual || "",
            }));
            setDrafts(fixed);
          }
        } catch {}
      }

      // auto off
      try {
        const v = JSON.parse(localStorage.getItem(KEY_POOL_AUTO_OFF) || "[]");
        if (Array.isArray(v)) setAutoOff(uniq(v.map(String)));
      } catch {}
    })();

    return () => {
      mounted = false;
    };
  }, [nav]);

  React.useEffect(() => localStorage.setItem(KEY_DRAFTS, JSON.stringify(drafts)), [drafts]);
  React.useEffect(() => localStorage.setItem(KEY_POOL_AUTO_OFF, JSON.stringify(autoOff)), [autoOff]);
  React.useEffect(() => localStorage.setItem(KEY_REPORT_EMAIL, reportEmail || ""), [reportEmail]);
  React.useEffect(() => localStorage.setItem(KEY_REPORT_FROM, reportFrom || ""), [reportFrom]);
  React.useEffect(() => localStorage.setItem(KEY_REPORT_TO, reportTo || ""), [reportTo]);

  const carregarLista = React.useCallback(async () => {
    setLoading(true);
    setMsg(null);

    const { data, error } = await supabase.from(EMPENHOS_TABLE).select("*").order("created_at", { ascending: false });

    if (error) {
      setMsg(`Erro ao carregar: ${error.message}`);
      setLista([]);
      setListaLoaded(false);
    } else {
      setLista((data as EmpenhoRow[]) ?? []);
      setListaLoaded(true);
    }
    setLoading(false);
  }, [EMPENHOS_TABLE]);

  async function carregarResponsaveisDB() {
    try {
      const { data, error } = await supabase
        .from("responsaveis")
        .select("nome, ativo, ordem, unidade")
        .eq("unidade", unidade)
        .order("ordem", { ascending: true });

      if (!error && data) {
        const all = (data as DbResponsavel[])
          .map((r) => ({
            nome: String((r as any).nome ?? "").trim(),
            ativo: (r as any).ativo !== false,
            ordem: Number((r as any).ordem ?? 100),
          }))
          .filter((r) => r.nome);

        const ativos = all.filter((r) => r.ativo).map((r) => r.nome);
        const inativos = all.filter((r) => !r.ativo).map((r) => r.nome);

        setDbRespAtivos(uniq(ativos));
        setDbRespInativos(uniq(inativos));
        return;
      }
    } catch {}

    setDbRespAtivos(uniq([...FALLBACK_RESPONSAVEIS]));
    setDbRespInativos([]);
  }

  // ✅ sempre que a unidade muda (ou no início), carrega tabelas corretas
  React.useEffect(() => {
    if (!sessionUserId) return;
    setListaLoaded(false);
    carregarResponsaveisDB();
    carregarLista();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserId, unidade]);

  // realtime (tabela certa)
  React.useEffect(() => {
    const ch = supabase
      .channel(`empenhos_changes_${unidade}`)
      .on("postgres_changes", { event: "*", schema: "public", table: EMPENHOS_TABLE }, () => carregarLista())
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [carregarLista, EMPENHOS_TABLE, unidade]);

  // Mensagem do dia
  React.useEffect(() => {
    let alive = true;

    async function tick() {
      const remote = await fetchDailyMessage();
      const finalMsg = remote ?? DAILY_MESSAGE_FALLBACK;

      if (!alive) return;

      setDailyMsg((prev) => {
        if (!prev) return finalMsg;
        if (prev.id !== finalMsg.id || prev.body !== finalMsg.body || prev.title !== finalMsg.title || prev.enabled !== finalMsg.enabled) return finalMsg;
        return prev;
      });

      if (shouldShowDaily(finalMsg)) setShowDailyMsg(true);
      else setShowDailyMsg(false);
    }

    tick();
    const it = window.setInterval(tick, 25_000);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);

    return () => {
      alive = false;
      window.clearInterval(it);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // ✅ PRESENCE separado por unidade (canal diferente)
  React.useEffect(() => {
    if (!sessionUserId) return;
    if (!ident) return;

    const presenceKey = sessionUserId;
    const channelName = `empenhos_presence_${unidade}`;

    const channel = supabase.channel(channelName, {
      config: { presence: { key: presenceKey } },
    });

    const rebuild = () => {
      const state = channel.presenceState() as any;
      const users: Array<{ key: string; nome: string; clientId?: string }> = [];

      Object.entries(state).forEach(([key, arr]: any) => {
        const last = Array.isArray(arr) ? arr[arr.length - 1] : null;
        const nome = last?.nome || "—";
        const cid = last?.clientId;
        users.push({ key, nome, clientId: cid });
      });

      users.sort((a, b) => (a.nome < b.nome ? -1 : 1));
      setOnline(users);
    };

    channel.on("presence", { event: "sync" }, rebuild);
    channel.on("presence", { event: "join" }, rebuild);
    channel.on("presence", { event: "leave" }, rebuild);

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ nome: nomeIdent, clientId, unidade, at: new Date().toISOString() });
        rebuild();
      }
    });

    const keepAlive = window.setInterval(() => {
      channel.track({ nome: nomeIdent, clientId, unidade, at: new Date().toISOString() }).catch(() => {});
    }, 45_000);

    return () => {
      window.clearInterval(keepAlive);
      supabase.removeChannel(channel);
    };
  }, [sessionUserId, ident, nomeIdent, clientId, unidade]);

  // ===== responsáveis (por unidade) =====
  async function salvarResponsavelDB(nome: string, patch: { ativo?: boolean; ordem?: number }) {
    const n = norm(nome);
    if (!n) return;

    // checa se existe (nome + unidade)
    const { data: exists, error: selErr } = await supabase
      .from("responsaveis")
      .select("nome")
      .eq("nome", n)
      .eq("unidade", unidade)
      .limit(1);

    if (selErr) throw selErr;

    if (exists && exists.length > 0) {
      const { error: upErr } = await supabase.from("responsaveis").update(patch).eq("nome", n).eq("unidade", unidade);
      if (upErr) throw upErr;
      return;
    }

    const { error: insErr } = await supabase
      .from("responsaveis")
      .insert({ nome: n, ativo: patch.ativo ?? true, ordem: patch.ordem ?? 9999, unidade });

    if (insErr) throw insErr;
  }

  async function setResponsavelAtivoDB(nome: string, ativo: boolean) {
    try {
      setMsg(null);
      await salvarResponsavelDB(nome, { ativo });
      await carregarResponsaveisDB();
      setMsg(ativo ? "Responsável reativado." : "Responsável removido (inativado).");
    } catch (e: any) {
      setMsg(`Erro ao atualizar responsável: ${e?.message || e}`);
    }
  }

  async function excluirResponsavelDefinitivo(nome: string) {
    const n = norm(nome);
    if (!n) return;
    if (!confirm(`Excluir permanentemente "${n}"?`)) return;

    try {
      setMsg(null);

      const { error } = await supabase.from("responsaveis").delete().eq("nome", n).eq("unidade", unidade);
      if (error) throw error;

      setAutoOff((prev) => prev.filter((x) => norm(x) !== n));
      await carregarResponsaveisDB();
      setMsg("Responsável excluído.");
    } catch (e: any) {
      setMsg(`Erro ao excluir: ${e?.message || e}`);
    }
  }

  const poolManual = React.useMemo(() => {
    const base = uniq([...(dbRespAtivos || []), ...(nomeIdent ? [nomeIdent] : [])]);
    return base;
  }, [dbRespAtivos, nomeIdent]);

  const poolAuto = React.useMemo(() => {
    const off = new Set(autoOff.map((s) => norm(s)));
    return poolManual.filter((n) => !off.has(norm(n)));
  }, [poolManual, autoOff]);

  React.useEffect(() => {
    setImportManualResp((prev) => prev || poolManual[0] || nomeIdent || "");
  }, [poolManual, nomeIdent]);

  function onSalvarIdent(posto: Posto, nomeGuerra: string) {
    if (!sessionUserId) return;
    const identidade: Identidade = { posto, nomeGuerra: nomeGuerra.trim(), userId: sessionUserId };
    setIdent(identidade);
    localStorage.setItem(KEY_IDENT, JSON.stringify(identidade));
  }

  async function sair() {
    try {
      await supabase.auth.signOut();
    } finally {
      nav("/", { replace: true });
    }
  }

  // ===== drafts =====
  function addDraft() {
    const rid = crypto.randomUUID();
    setDrafts((prev) => [
      ...prev,
      {
        rid,
        data_solicitacao: todayISO(),
        subprocesso: "",
        solicitacao: "",
        ugcred: "",
        modo: "auto",
        responsavel_manual: poolManual[0] || nomeIdent || "",
      },
    ]);
  }
  function updDraft(rid: string, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.rid === rid ? { ...d, ...patch } : d)));
  }
  function rmDraft(rid: string) {
    setDrafts((prev) => prev.filter((d) => d.rid !== rid));
  }

  function checarDuplicidadeLocal(subprocesso: string, solicitacao: string) {
    const sub = norm(subprocesso);
    const sol = norm(solicitacao);
    if (!sub && !sol) return null;

    return lista.find((e) => (sub && keyNorm(e.subprocesso) === keyNorm(sub)) || (sol && keyNorm(e.solicitacao) === keyNorm(sol))) ?? null;
  }

  async function salvarDrafts() {
    if (!ident || !sessionUserId || drafts.length === 0) {
      setMsg("Preencha ao menos um registro.");
      return;
    }

    if (!listaLoaded) {
      setMsg("Aguarde carregar a lista antes de salvar (evita duplicidade).");
      return;
    }

    // 1) validações básicas + manual
    for (const d of drafts) {
      if (d.modo === "manual" && !norm(d.responsavel_manual)) {
        setMsg("Em modo manual, selecione o responsável.");
        return;
      }
      // se ambos vazios, deixa o seu comportamento original (você pode exigir aqui se quiser)
      if (!norm(d.subprocesso) && !norm(d.solicitacao)) {
        setMsg("Informe ao menos Subprocesso ou Solicitação.");
        return;
      }
    }

    // 2) duplicidade dentro do próprio lote
    const batchKeys = buildDupeKeysFromDrafts(drafts);
    const inBatch = findDupesInsideBatch(batchKeys);
    if (inBatch.dupSols.length || inBatch.dupSubs.length) {
      const parts: string[] = [];
      if (inBatch.dupSols.length) parts.push(`Solicitação repetida no lote: ${inBatch.dupSols.slice(0, 5).join(", ")}${inBatch.dupSols.length > 5 ? "..." : ""}`);
      if (inBatch.dupSubs.length) parts.push(`Subprocesso repetido no lote: ${inBatch.dupSubs.slice(0, 5).join(", ")}${inBatch.dupSubs.length > 5 ? "..." : ""}`);
      setMsg(`Duplicidade no que você digitou:\n- ${parts.join("\n- ")}`);
      return;
    }

    // 3) duplicidade contra lista local (rápida)
    const idx = buildLocalIndex(lista);
    const localDupeSol = batchKeys.solicitacoes.find((s) => idx.sol.has(keyNorm(s)));
    const localDupeSub = batchKeys.subprocessos.find((s) => idx.sub.has(keyNorm(s)));
    if (localDupeSol || localDupeSub) {
      const hit = localDupeSol ? `Solicitação já existe: ${localDupeSol}` : `Subprocesso já existe: ${localDupeSub}`;
      const dupeRow = checarDuplicidadeLocal(localDupeSub || "", localDupeSol || "");
      setMsg(`Duplicidade: ${hit}${dupeRow?.id ? ` (ID ${dupeRow.id})` : ""}`);
      return;
    }

    // 4) duplicidade contra o banco (evita "parou de funcionar" por corrida / lista desatualizada)
    try {
      const found = await fetchExistingFromDB(EMPENHOS_TABLE, batchKeys);
      const hitSol = batchKeys.solicitacoes.find((s) => found.solicitacoes.has(keyNorm(s)));
      const hitSub = batchKeys.subprocessos.find((s) => found.subprocessos.has(keyNorm(s)));

      if (hitSol || hitSub) {
        const parts: string[] = [];
        if (hitSol) parts.push(`Solicitação já existe no banco: ${hitSol}`);
        if (hitSub) parts.push(`Subprocesso já existe no banco: ${hitSub}`);

        const sample = found.samples[0];
        setMsg(
          `Duplicidade detectada no banco (não vou registrar):\n- ${parts.join("\n- ")}${
            sample?.id ? `\nExemplo encontrado: ID ${sample.id} (Sol: ${sample.solicitacao || "—"} / Sub: ${sample.subprocesso || "—"})` : ""
          }`
        );
        return;
      }
    } catch (e: any) {
      setMsg(`Erro ao checar duplicidade no banco: ${e?.message || e}`);
      return;
    }

    // ===== distribuição RR =====
    let ptr = Number(localStorage.getItem(KEY_RR_PTR) || "0");
    if (!Number.isFinite(ptr) || ptr < 0) ptr = 0;

    const counts = new Map<string, number>();
    for (const p of poolAuto) counts.set(p, 0);
    for (const e of lista) {
      const r = norm(e.responsavel);
      if (counts.has(r)) counts.set(r, (counts.get(r) || 0) + 1);
    }

    const pickNext = () => {
      if (!poolAuto.length) return nomeIdent || poolManual[0] || "—";
      let min = Infinity;
      for (const p of poolAuto) min = Math.min(min, counts.get(p) ?? 0);
      const tied = poolAuto.filter((p) => (counts.get(p) ?? 0) === min);
      const chosen = tied[ptr % tied.length] || tied[0] || poolAuto[0];
      ptr = (ptr + 1) % Math.max(tied.length, 1);
      counts.set(chosen, (counts.get(chosen) || 0) + 1);
      return chosen;
    };

    const payload = drafts.map((d) => {
      const resp = d.modo === "manual" ? norm(d.responsavel_manual) : pickNext();
      return {
        subprocesso: norm(d.subprocesso),
        solicitacao: norm(d.solicitacao),
        ugcred: norm(d.ugcred) || null,
        responsavel: resp,
        created_by: sessionUserId,
        data_solicitacao: d.data_solicitacao || null,
        criado_por: nomeIdent,
        status: "pendente",
        obs: null,
        valor: null,
        renomeado: false,
        incluido: false,
      };
    });

    const { error } = await supabase.from(EMPENHOS_TABLE).insert(payload);
    if (error) {
      setMsg(`Erro ao salvar: ${error.message}`);
      return;
    }

    localStorage.setItem(KEY_RR_PTR, String(ptr));
    setDrafts([]);
    setAba("acompanhar");

    const t = todayISO();
    setDateFrom(t);
    setDateTo(t);
    setReportFrom(t);
    setReportTo(t);

    await carregarLista();
    setMsg("Salvo com sucesso.");
  }

  async function addNomeDB() {
    const n = norm(novoResp);
    if (!n) return;

    try {
      setMsg(null);
      await salvarResponsavelDB(n, { ativo: true, ordem: 9999 });
      setNovoResp("");
      await carregarResponsaveisDB();
      setMsg("Responsável adicionado.");
    } catch (e: any) {
      setMsg(`Erro ao adicionar responsável: ${e?.message || e}`);
    }
  }

  function toggleAutoOff(nome: string) {
    const n = norm(nome);
    setAutoOff((prev) => (prev.some((x) => norm(x) === n) ? prev.filter((x) => norm(x) !== n) : uniq([...prev, n])));
  }

  // ===== acompanhar helpers =====
  function getValue(id: string, field: keyof EmpenhoRow) {
    const patch = edits[id];
    if (patch && field in patch) return (patch as any)[field];
    const base = lista.find((x) => x.id === id) as any;
    return base ? base[field] : "";
  }
  function setValue(id: string, patch: Partial<EmpenhoRow>) {
    setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
  }
  function getForFilter(e: EmpenhoRow, field: keyof EmpenhoRow) {
    const patch = edits[e.id];
    if (patch && field in patch) return (patch as any)[field];
    return (e as any)[field];
  }
  function isPendente(e: EmpenhoRow) {
    const subprocesso = norm(getForFilter(e, "subprocesso"));
    const solicitacao = norm(getForFilter(e, "solicitacao"));
    const siloms = norm(getForFilter(e, "siloms"));
    const siafi = norm(getForFilter(e, "siafi"));
    const renomeado = getForFilter(e, "renomeado") === true;
    const incluido = getForFilter(e, "incluido") === true;

    return !subprocesso || !solicitacao || !siloms || !siafi || !renomeado || !incluido;
  }

  const listaFiltrada = React.useMemo(() => {
    let arr = [...lista];

    const term = lower(q);
    if (term) {
      arr = arr.filter((e) => {
        const hay = `${e.subprocesso ?? ""} ${e.solicitacao ?? ""} ${e.ugcred ?? ""} ${e.responsavel ?? ""} ${e.siafi ?? ""} ${e.siloms ?? ""} ${
          e.criado_por ?? ""
        } ${e.obs ?? ""} ${e.valor ?? ""} ${e.renomeado === true ? "renomeado" : ""} ${e.incluido === true ? "incluido" : ""}`.toLowerCase();
        return hay.includes(term);
      });
    }

    const sol = lower(solicitante);
    if (sol) arr = arr.filter((e) => lower(e.criado_por).includes(sol));

    const rf = lower(responsavelFilter);
    if (rf) arr = arr.filter((e) => lower(e.responsavel).includes(rf));

    const df = norm(dateFrom);
    const dt = norm(dateTo);
    if (df) arr = arr.filter((e) => dateKey(e) && dateKey(e) >= df);
    if (dt) arr = arr.filter((e) => dateKey(e) && dateKey(e) <= dt);

    if (verPendentes) arr = arr.filter((e) => isPendente(e));

    return arr;
  }, [lista, q, solicitante, responsavelFilter, dateFrom, dateTo, verPendentes, edits]);

  async function salvarLinha(id: string) {
    const patch = edits[id];
    if (!patch) return;

    const { id: _id, created_at, created_by, ...toSend0 } = patch as any;

    const toSend: any = { ...toSend0 };
    if ("valor" in toSend) toSend.valor = parseNumberBR(toSend.valor);
    if ("renomeado" in toSend) toSend.renomeado = toSend.renomeado === true;
    if ("incluido" in toSend) toSend.incluido = toSend.incluido === true;

    const { error } = await supabase.from(EMPENHOS_TABLE).update(toSend).eq("id", id);
    if (error) {
      setMsg(`Erro ao salvar linha: ${error.message}`);
      return;
    }

    setLista((prev) => prev.map((r) => (r.id === id ? ({ ...r, ...(toSend as any) } as EmpenhoRow) : r)));

    setEdits((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    await carregarLista();
    setMsg("Linha salva.");
  }

  async function excluirEmpenho(id: string) {
    if (!confirm("Confirma excluir este empenho?")) return;

    const { data, error } = await supabase.from(EMPENHOS_TABLE).delete().eq("id", id).select("id");

    if (error) {
      setMsg(`Erro ao excluir: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) {
      setMsg("Não foi possível excluir (sem permissão / policy RLS).");
      return;
    }

    setLista((prev) => prev.filter((x) => x.id !== id));
    setEdits((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    await carregarLista();
    setMsg("Empenho excluído.");
  }

  function gerarExcelPorPeriodo(df: string, dt: string) {
    const rows = filterByRange(lista, df, dt);
    if (!rows.length) {
      setMsg("Não há registros nesse período.");
      return;
    }
    const label = makePeriodLabel(df, dt);
    const blob = buildXlsx(rows);
    downloadBlob(`empenhos_${unidade}_${label}.xlsx`, blob);
  }

  async function enviarExcelPorEmailPeriodo(df: string, dt: string, to: string) {
    const email = norm(to);
    if (!email || !email.includes("@")) {
      setMsg("Informe um email válido.");
      return;
    }

    const rows = filterByRange(lista, df, dt);
    if (!rows.length) {
      setMsg("Não há registros nesse período.");
      return;
    }

    const label = makePeriodLabel(df, dt);

    setSendingEmail(true);
    setMsg(null);

    try {
      const { data, error } = await supabase.functions.invoke("send-empenhos-report", {
        body: {
          to: email,
          date: label,
          subject: `Relatório de Empenhos (${unidade}) - ${label}`,
          unidade,
          rows: rows.map((r) => ({
            data: (r.data_solicitacao ?? dateKey(r) ?? "").slice(0, 10),
            subprocesso: r.subprocesso ?? "",
            solicitacao: r.solicitacao ?? "",
            ugcred: r.ugcred ?? "",
            responsavel: r.responsavel ?? "",
            siafi: r.siafi ?? "",
            siloms: r.siloms ?? "",
            valor: r.valor ?? null,
            renomeado: r.renomeado === true,
            incluido: r.incluido === true,
            obs: r.obs ?? "",
            criado_por: r.criado_por ?? "",
            created_at: (r.created_at ?? "").slice(0, 19).replace("T", " "),
          })),
        },
      });

      if (error) {
        setMsg(`Erro ao enviar email: ${error.message}`);
        return;
      }
      if (!data?.ok) {
        setMsg(`Erro ao enviar email: ${data?.error || "Resposta inválida da função"}`);
        return;
      }

      setMsg(data?.message || "Email enviado.");
    } catch (e: any) {
      setMsg(`Erro ao enviar email: ${e?.message || e}`);
    } finally {
      setSendingEmail(false);
    }
  }

  // ===== IMPORT =====
  function guessColumns(headers: string[]) {
    const raw = headers.map((h) => h.trim());
    const H = raw.map((h) => h.toLowerCase());

    const findExactOrContains = (exact: string[], contains: string[]) => {
      const normNoSpace = (s: string) => s.toLowerCase().replace(/\s+/g, "");
      const idxExact = H.findIndex((h) => exact.some((e) => normNoSpace(h) === normNoSpace(e)));
      if (idxExact >= 0) return raw[idxExact];

      const idx = H.findIndex((h) => contains.some((c) => h.includes(c)));
      return idx >= 0 ? raw[idx] : undefined;
    };

    const sol = findExactOrContains(["solicitação", "solicitacao", "solicitacao "], ["solicita", "solic"]);
    const ug = findExactOrContains(["ugcred"], ["ugcred", "ug cred", "ug_credit", "ug credit", "ug"]);
    const valor = findExactOrContains(["valor", "vlr"], ["valor", "val"]);
    const obs = findExactOrContains(["obs", "observação", "observacao"], ["obs", "observ"]);
    const data = findExactOrContains(["dt solicitação", "dt solicitacao", "data", "dt"], ["dt", "data"]);

    return { sol, ug, valor, obs, data };
  }

  function rebuildImportPreview(raw: Record<string, any>[], cols: { sol?: string; ug?: string; valor?: string; obs?: string; data?: string }) {
    const today = todayISO();

    const prev = (raw || [])
      .map((r) => {
        const solicitacao = norm(cols.sol ? r[cols.sol] : "");
        const ugcred = norm(cols.ug ? r[cols.ug] : "");
        const valor = parseNumberBR(cols.valor ? r[cols.valor] : null);
        const obs = norm(cols.obs ? r[cols.obs] : "");
        const data_solicitacao = toISODateFromAny(cols.data ? r[cols.data] : "") || today;

        return { solicitacao, ugcred, valor, obs, data_solicitacao };
      })
      .filter((r) => r.solicitacao);

    setImportPreview(prev);
  }

  async function parseWorkbook(file: File) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];

    const range = importSkipFirstRow ? 1 : 0;
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", range });

    if (!json.length) {
      setMsg("Arquivo sem linhas após o cabeçalho.");
      setImportPreview([]);
      setImportRaw([]);
      setImportHeaders([]);
      return;
    }

    const headers = Object.keys(json[0] ?? {});
    const guess = guessColumns(headers);

    setImportHeaders(headers);
    setImportCols(guess);
    setImportRaw(json);

    rebuildImportPreview(json, guess);
    setMsg(`Carregado: ${json.length} linha(s). Revise as solicitações e salve.`);
  }

  // ✅ se mudar "Pular 1ª linha" depois de escolher arquivo, reprocessa o mesmo arquivo
  React.useEffect(() => {
    if (!importLastFile) return;
    parseWorkbook(importLastFile).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importSkipFirstRow]);

  // ✅ se o usuário mudar o mapeamento de colunas, reconstrói a prévia na hora
  React.useEffect(() => {
    if (!importRaw.length) return;
    rebuildImportPreview(importRaw, importCols);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importCols, importRaw]);

  async function importSalvarDireto(mode: "auto" | "manual") {
    if (!ident || !sessionUserId) {
      setMsg("Você precisa se identificar antes.");
      return;
    }
    if (!importPreview.length) {
      setMsg("Sem linhas para importar.");
      return;
    }
    if (!listaLoaded) {
      setMsg("Aguarde carregar a lista antes de importar (evita duplicidade).");
      return;
    }

    const manualName = norm(importManualResp);
    if (mode === "manual" && !manualName) {
      setMsg("Escolha um responsável (manual).");
      return;
    }

    // 1) normaliza e remove vazios
    const base = importPreview
      .map((r) => ({
        solicitacao: norm(r.solicitacao),
        ugcred: norm(r.ugcred),
        valor: r.valor,
        obs: norm(r.obs),
        data_solicitacao: norm(r.data_solicitacao) || todayISO(),
      }))
      .filter((r) => r.solicitacao);

    // 2) remove duplicidade dentro do próprio arquivo (mesma solicitação repetida)
    const seen = new Set<string>();
    const repetidasNoArquivo: string[] = [];
    const semRepeticao = base.filter((r) => {
      const k = keyNorm(r.solicitacao);
      if (!k) return false;
      if (seen.has(k)) {
        repetidasNoArquivo.push(r.solicitacao);
        return false;
      }
      seen.add(k);
      return true;
    });

    // 3) remove duplicidade local (lista já carregada) — checa solicitacao E subprocesso
    const idx = buildLocalIndex(lista);
    const dupLocalList: string[] = [];
    const semLocalDupe = semRepeticao.filter((r) => {
      const k = keyNorm(r.solicitacao);
      const isDup = idx.sol.has(k) || idx.sub.has(k);
      if (isDup) dupLocalList.push(r.solicitacao);
      return !isDup;
    });

    if (!semLocalDupe.length) {
      const skippedFile = uniq(repetidasNoArquivo);
      const skippedLocal = uniq(dupLocalList);
      const parts: string[] = ["Nada para importar: todas as solicitações já existem (duplicidade)."];
      if (skippedLocal.length) parts.push(`Já existiam no sistema: ${skippedLocal.slice(0, 5).join(", ")}${skippedLocal.length > 5 ? "..." : ""}`);
      if (skippedFile.length) parts.push(`Repetidas no arquivo: ${skippedFile.slice(0, 5).join(", ")}${skippedFile.length > 5 ? "..." : ""}`);
      setMsg(parts.join("\n"));
      return;
    }

    // 4) checa duplicidade no banco (evita corrida / lista desatualizada)
    // — passa a solicitacao importada como subprocesso também, para detectar se já existe como subprocesso no banco
    try {
      const found = await fetchExistingFromDB(
        EMPENHOS_TABLE,
        buildDupeKeysFromPayload(semLocalDupe.map((x) => ({ solicitacao: x.solicitacao, subprocesso: x.solicitacao })))
      );
      const finais = semLocalDupe.filter((r) => {
        const k = keyNorm(r.solicitacao);
        return !found.solicitacoes.has(k) && !found.subprocessos.has(k);
      });

      if (!finais.length) {
        setMsg("Nada para importar: as solicitações já existem no banco (duplicidade).");
        return;
      }

      // ===== distribuição RR =====
      let ptr = Number(localStorage.getItem(KEY_RR_PTR) || "0");
      if (!Number.isFinite(ptr) || ptr < 0) ptr = 0;

      const counts = new Map<string, number>();
      for (const p of poolAuto) counts.set(p, 0);
      for (const e of lista) {
        const r = norm(e.responsavel);
        if (counts.has(r)) counts.set(r, (counts.get(r) || 0) + 1);
      }

      const pickNext = () => {
        if (!poolAuto.length) return nomeIdent || poolManual[0] || "—";
        let min = Infinity;
        for (const p of poolAuto) min = Math.min(min, counts.get(p) ?? 0);
        const tied = poolAuto.filter((p) => (counts.get(p) ?? 0) === min);
        const chosen = tied[ptr % tied.length] || tied[0] || poolAuto[0];
        ptr = (ptr + 1) % Math.max(tied.length, 1);
        counts.set(chosen, (counts.get(chosen) || 0) + 1);
        return chosen;
      };

      const payload = finais.map((r) => ({
        subprocesso: "",
        solicitacao: r.solicitacao,
        ugcred: r.ugcred || null,
        responsavel: mode === "manual" ? manualName : pickNext(),
        created_by: sessionUserId,
        data_solicitacao: r.data_solicitacao || todayISO(),
        criado_por: nomeIdent,
        status: "pendente",
        valor: r.valor ?? null,
        obs: r.obs || null,
        renomeado: false,
        incluido: false,
      }));

      setLoading(true);
      setMsg(null);

      const { error } = await supabase.from(EMPENHOS_TABLE).insert(payload);

      setLoading(false);

      if (error) {
        setMsg(`Erro ao importar/salvar: ${error.message}`);
        return;
      }

      localStorage.setItem(KEY_RR_PTR, String(ptr));

      setImportPreview([]);
      setImportRaw([]);
      setImportHeaders([]);
      setImportCols({});
      setImportLastFile(null);
      setAba("acompanhar");

      const dates = payload.map((p) => norm(p.data_solicitacao)).filter(Boolean).sort();
      const df = dates[0] || todayISO();
      const dt = dates[dates.length - 1] || todayISO();
      setDateFrom(df);
      setDateTo(dt);

      setReportFrom(df);
      setReportTo(dt);

      setQ("");
      setSolicitante("");
      setResponsavelFilter("");
      setVerPendentes(false);

      const skippedFileDup = uniq(repetidasNoArquivo).length;
      const skippedLocalDup = uniq(dupLocalList).length;
      const skippedBancoDup = semLocalDupe.length - finais.length;
      const totalSkipped = skippedFileDup + skippedLocalDup + skippedBancoDup;

      await carregarLista();

      const msgExtra = totalSkipped > 0 ? ` (${totalSkipped} ignorada(s) por duplicidade)` : "";
      setMsg(`Importado e salvo: ${payload.length} linha(s).${msgExtra}`);
    } catch (e: any) {
      setMsg(`Erro ao checar duplicidade no banco: ${e?.message || e}`);
      return;
    }
  }

  const canUse = !!ident;

  const displayUserName = React.useMemo(() => {
    if (nomeIdent) return nomeIdent;
    if (sessionEmail) return sessionEmail;
    return "Usuário";
  }, [nomeIdent, sessionEmail]);

  const importPreviewTop = React.useMemo(() => importPreview.slice(0, 25), [importPreview]);

  return (
    <div className="page">
      <style>{`
        :root{
          --bg:#0b0f17;
          --panel:#0f1625;
          --panel2:#111b2e;
          --line:rgba(255,255,255,.10);
          --muted:rgba(255,255,255,.72);
          --text:#e7eefc;
          --good:#22c55e;
          --bad:#ef4444;
          --btn:#1a2740;
          --btn2:#20304f;
          --shadow:0 8px 26px rgba(0,0,0,.35);
        }

        select{ color: var(--text); }
        select option{ color:#111827 !important; background:#ffffff !important; }
        select option[value=""]{ color:#6b7280 !important; background:#ffffff !important; }
        select optgroup{ color:#111827 !important; background:#ffffff !important; }

        *{box-sizing:border-box}
        .page{
          min-height:100vh;
          background:var(--bg);
          color:var(--text);
          overflow-x:hidden;
          width:100vw;
          margin-left:calc(50% - 50vw);
        }

        .wrap{
          width:100%;
          max-width:none;
          margin:0 auto;
          padding:18px 22px;
          min-height:100vh;
          display:flex;
          flex-direction:column;
          gap:14px;
        }
        .content{
          flex:1;
          display:flex;
          flex-direction:column;
          gap:14px;
        }

        .card{
          width:100%;
          background:linear-gradient(180deg, var(--panel), var(--panel2));
          border:1px solid var(--line);
          border-radius:14px;
          padding:14px;
          box-shadow:var(--shadow);
        }

        .welcomeBar{
          width:100%;
          background:rgba(255,255,255,.03);
          border:1px solid var(--line);
          border-radius:14px;
          padding:12px 14px;
          display:flex;
          align-items:center;
          justify-content:center;
          text-align:center;
          font-weight:900;
          box-shadow:var(--shadow);
        }
        .welcomeBar span{ color: var(--muted); font-weight:800; }
        .welcomeBar b{ color: var(--text); }

        .topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .title{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
        .title h2{margin:0;font-size:24px}
        .muted{color:var(--muted)}
        .actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}
        .btn{
          padding:10px 14px;border-radius:12px;border:1px solid var(--line);
          background:var(--btn); color:var(--text); cursor:pointer; font-weight:800;
        }
        .btn:hover{background:var(--btn2)}
        .btn.good{background:rgba(34,197,94,.16);border-color:rgba(34,197,94,.35)}
        .btn.bad{background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.35)}
        .btn:disabled{opacity:.55;cursor:not-allowed}

        .field{display:flex;flex-direction:column;gap:6px;min-width:0}
        .label{font-size:.88rem;color:var(--muted)}
        input,select,textarea{
          border-radius:12px;border:1px solid var(--line);
          background:rgba(255,255,255,.04); color:var(--text);
          outline:none; min-width:0;
        }
        input,select{ height:40px; padding:0 12px; }
        textarea{
          padding:10px 12px;
          min-height:40px;
          resize:vertical;
        }
        input[type="file"]{width:100%}
        input:focus,select:focus,textarea:focus{border-color:rgba(34,197,94,.45);box-shadow:0 0 0 3px rgba(34,197,94,.14)}
        .divider{height:1px;background:var(--line);margin:12px 0}
        .tabs{display:flex;gap:8px;margin:10px 0 14px}
        .tab{
          padding:10px 14px;border-radius:12px;border:1px solid var(--line);
          background:rgba(255,255,255,.04); color:var(--text); cursor:pointer;
          font-weight:900;
        }
        .tab.active{background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.35)}
        .row{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:10px}
        .pill{
          display:inline-flex;align-items:center;gap:10px;
          padding:8px 10px;border-radius:999px;border:1px solid var(--line);
          background:rgba(255,255,255,.04);
        }
        .dot{width:10px;height:10px;border-radius:999px;background:var(--good);box-shadow:0 0 0 3px rgba(34,197,94,.15)}
        .notice{margin-top:10px;color:rgba(34,197,94,.9);font-weight:900; white-space:pre-wrap}
        .error{margin-top:10px;color:rgba(239,68,68,.9);font-weight:900; white-space:pre-wrap}

        .draftHead,.draftRow{
          display:grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          gap:10px;
          align-items:end;
        }
        .hdrCell{color:var(--muted);font-weight:900;font-size:.9rem;padding:0 2px}
        .cell{min-width:0}
        .draftWrap{display:flex;flex-direction:column;gap:10px;margin-top:12px}
        .draftRow{padding:10px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.03)}
        .headWrap{margin-top:12px}
        .stack{display:grid;grid-template-columns:1fr;gap:14px}

        .rows{display:flex;flex-direction:column;gap:10px;margin-top:12px}
        .rowCard{
          border:1px solid var(--line);
          border-radius:14px;
          padding:12px;
          background:rgba(255,255,255,.03);
        }
        .rowTop{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between}
        .badges{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
        .badge{
          padding:6px 10px;border-radius:999px;border:1px solid var(--line);
          background:rgba(255,255,255,.03);font-weight:900;
        }
        .badge.good{border-color:rgba(34,197,94,.35); background:rgba(34,197,94,.10)}
        .badge.bad{border-color:rgba(239,68,68,.35); background:rgba(239,68,68,.08)}

        .gridLine{
          margin-top:10px;
          display:grid;
          grid-template-columns: repeat(10, minmax(0,1fr));
          gap:10px;
        }
        @media (max-width: 980px){ .gridLine{grid-template-columns: repeat(2, minmax(0,1fr));} }

        .rowActions{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}

        .checkBoxRow{
          height:40px;
          display:flex;
          align-items:center;
          gap:10px;
          padding:0 12px;
          border-radius:12px;
          border:1px solid var(--line);
          background:rgba(255,255,255,.04);
          user-select:none;
        }
        .checkBoxRow input{
          width:18px;
          height:18px;
        }

        .footer{
          padding:12px 14px;
          text-align:center;
          border-radius:12px;
          border:1px solid var(--line);
          background:rgba(255,255,255,.03);
          color:var(--muted);
          font-weight:800;
          margin-top:14px;
        }
        .footer b{ color: var(--text); }

        .modalOverlay{
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 18px;
        }
        .modalCard{
          width: 100%;
          max-width: 560px;
          background: linear-gradient(180deg, var(--panel), var(--panel2));
          border: 1px solid var(--line);
          border-radius: 16px;
          box-shadow: var(--shadow);
          padding: 16px;
        }
        .modalTitle{
          margin: 0 0 8px 0;
          font-size: 18px;
          font-weight: 1000;
        }
        .modalText{
          margin: 0;
          color: var(--muted);
          font-weight: 800;
          line-height: 1.4;
          white-space: pre-wrap;
        }
        .modalActions{
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 14px;
        }

        .dailyBar{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:12px;
          padding:12px 14px;
          border-radius:14px;
          border:1px solid rgba(34,197,94,.25);
          background:rgba(34,197,94,.08);
          box-shadow: var(--shadow);
        }
        .dailyBar h4{margin:0 0 4px 0; font-size:14px; font-weight:1000}
        .dailyBar p{margin:0; color:rgba(255,255,255,.85); font-weight:800; white-space: pre-wrap; line-height:1.35}

        .rateRow{
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          margin-top:10px;
        }
        .rateBtn{
          width:44px;
          height:44px;
          border-radius:12px;
          border:1px solid var(--line);
          background:rgba(255,255,255,.04);
          color:var(--text);
          cursor:pointer;
          font-weight:1000;
        }
        .rateBtn:hover{ background:rgba(255,255,255,.07); }
        .rateBtn.active{
          border-color:rgba(34,197,94,.55);
          background:rgba(34,197,94,.16);
        }

        /* ✅ PREVIEW TABLE */
        .previewWrap{
          margin-top:12px;
          border:1px solid var(--line);
          border-radius:14px;
          background:rgba(255,255,255,.03);
          overflow:hidden;
        }
        .previewHeader{
          padding:10px 12px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          border-bottom:1px solid var(--line);
          background:rgba(255,255,255,.02);
          font-weight:900;
        }
        .previewTable{
          width:100%;
          border-collapse:collapse;
          font-size:13px;
        }
        .previewTable th, .previewTable td{
          padding:10px 12px;
          border-bottom:1px solid rgba(255,255,255,.06);
          vertical-align:top;
          text-align:left;
          word-break:break-word;
        }
        .previewTable th{
          color:var(--muted);
          font-weight:1000;
          background:rgba(255,255,255,.02);
        }
        .previewBody{
          max-height:320px;
          overflow:auto;
        }
      `}</style>

      {showAvaliar && (
        <div
          className="modalOverlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAvaliar();
          }}
        >
          <div className="modalCard">
            <h3 className="modalTitle">Avalie o App</h3>
            <p className="modalText">Dê uma nota de 1 a 5 e, se quiser, deixe uma sugestão/crítica.</p>

            <div className="rateRow">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={`rateBtn ${notaAvaliar === n ? "active" : ""}`}
                  onClick={() => setNotaAvaliar(n)}
                  type="button"
                  title={`${n}`}
                >
                  {n}
                </button>
              ))}
            </div>

            <div className="divider" />

            <div className="field">
              <span className="label">Sugestão / Crítica (opcional)</span>
              <textarea value={textoAvaliar} onChange={(e) => setTextoAvaliar(e.target.value)} placeholder="Escreva aqui..." />
            </div>

            <div className="modalActions">
              <button className="btn" onClick={closeAvaliar} disabled={sendingAvaliar}>
                Cancelar
              </button>
              <button className="btn good" onClick={enviarAvaliacao} disabled={sendingAvaliar}>
                {sendingAvaliar ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="wrap">
        {dailyMsg && showDailyMsg && (
          <div className="dailyBar">
            <div>
              <h4>
                {dailyMsg.title} <span className="muted" style={{ fontWeight: 900 }}>({dailyMsg.id})</span>
              </h4>
              <p>
                {dailyMsg.body}
                {dailyMsg.signature ? `\n— ${dailyMsg.signature}` : ""}
              </p>
            </div>

            <button className="btn" onClick={closeDailyMsg} title="Fechar (não aparece de novo até mudar a mensagem)">
              Fechar
            </button>
          </div>
        )}

        <div className="welcomeBar">
          <span>
            <b>{displayUserName}</b>, seja bem vindo(a) ao Aplicativo da Seção de Execução Orçamentária do <b>{unidade}</b>
          </span>
        </div>

        <div className="content">
          <div className="topbar">
            <div className="title">
              <h2>Logado como</h2>
              {ident ? (
                <span className="muted">
                  <b>{nomeIdent}</b>
                </span>
              ) : sessionEmail ? (
                <span className="muted">
                  Conta: <b>{sessionEmail}</b>
                </span>
              ) : null}
              <span className="muted">
                | Unidade: <b>{unidade}</b>
              </span>
            </div>

            <div className="actions">
              <button className="btn" onClick={openAvaliar} title="Enviar uma nota e sugestão">
                Avalie o App
              </button>

              <button className="btn bad" onClick={sair} title="Sair e voltar para o login">
                Sair
              </button>

              <button className="btn" onClick={() => window.open(biLink, "_blank")} title={`Abrir BI (${unidade}) em nova aba`}>
                Abrir BI
              </button>

              <button className="btn" onClick={carregarLista} disabled={loading}>
                {loading ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
          </div>

          {!ident && (
            <div className="card">
              <h3 style={{ margin: 0, marginBottom: 10 }}>Identificação do Militar</h3>
              <div className="row">
                <div style={{ gridColumn: "span 3" }}>
                  <div className="field">
                    <span className="label">Posto</span>
                    <select id="posto">
                      {POSTOS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ gridColumn: "span 6" }}>
                  <div className="field">
                    <span className="label">Nome de Guerra</span>
                    <input id="nome" placeholder="Ex.: Bruno" />
                  </div>
                </div>

                <div style={{ gridColumn: "span 3", display: "flex", alignItems: "end" }}>
                  <button
                    className="btn good"
                    onClick={() => {
                      const p = (document.getElementById("posto") as HTMLSelectElement).value as Posto;
                      const n = (document.getElementById("nome") as HTMLInputElement).value.trim();
                      if (!n) {
                        setMsg("Informe o nome de guerra.");
                        return;
                      }
                      onSalvarIdent(p, n);
                    }}
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </div>
          )}

          {ident && (
            <>
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0 }}>Quem está online ({unidade})</h3>
                  <span className="muted" style={{ fontWeight: 900 }}>
                    {online.length ? `${online.length} online` : ""}
                  </span>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                  {online.length === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    online.map((u) => (
                      <span key={u.key} className="pill">
                        <span className="dot" />
                        <b>{u.nome}</b>
                      </span>
                    ))
                  )}
                </div>

                <div className="tabs">
                  <button className={`tab ${aba === "cadastrar" ? "active" : ""}`} onClick={() => setAba("cadastrar")}>
                    Cadastrar
                  </button>
                  <button className={`tab ${aba === "acompanhar" ? "active" : ""}`} onClick={() => setAba("acompanhar")}>
                    Acompanhar
                  </button>
                </div>
              </div>

              {/* ===== CADASTRAR ===== */}
              {aba === "cadastrar" && (
                <div className="stack">
                  <div className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <h3 style={{ margin: 0 }}>Novo(s) Empenho(s) — {unidade}</h3>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button className="btn" onClick={addDraft}>
                          + Linha
                        </button>
                        <button className="btn good" onClick={salvarDrafts} disabled={!drafts.length || loading}>
                          Salvar
                        </button>
                      </div>
                    </div>

                    {!drafts.length ? (
                      <p className="muted" style={{ marginTop: 12 }}>
                        Nenhuma linha. Clique em "<b>+ Linha</b>" para adicionar um empenho manualmente.
                      </p>
                    ) : (
                      <>
                        <div className="divider" />

                        <div className="draftHead headWrap">
                          <div className="hdrCell" style={{ gridColumn: "span 2" }}>
                            Data (site)
                          </div>
                          <div className="hdrCell" style={{ gridColumn: "span 3" }}>
                            Subprocesso
                          </div>
                          <div className="hdrCell" style={{ gridColumn: "span 3" }}>
                            Solicitação
                          </div>
                          <div className="hdrCell" style={{ gridColumn: "span 2" }}>
                            Distribuição
                          </div>
                          <div className="hdrCell" style={{ gridColumn: "span 2" }}>
                            Manual / Ação
                          </div>
                        </div>

                        <div className="draftWrap">
                          {drafts.map((d) => {
                            const dupe = checarDuplicidadeLocal(d.subprocesso, d.solicitacao);
                            return (
                              <div key={d.rid} className="draftRow">
                                <div className="cell" style={{ gridColumn: "span 2" }}>
                                  <input type="date" value={d.data_solicitacao} onChange={(e) => updDraft(d.rid, { data_solicitacao: e.target.value })} />
                                </div>

                                <div className="cell" style={{ gridColumn: "span 3" }}>
                                  <input
                                    value={d.subprocesso}
                                    onChange={(e) => updDraft(d.rid, { subprocesso: e.target.value })}
                                    placeholder="Ex.: 2025.000123/00"
                                    style={dupe ? { borderColor: "rgba(239,68,68,.6)" } : undefined}
                                  />
                                </div>

                                <div className="cell" style={{ gridColumn: "span 3" }}>
                                  <input
                                    value={d.solicitacao}
                                    onChange={(e) => updDraft(d.rid, { solicitacao: e.target.value })}
                                    placeholder="Ex.: 25S2012"
                                    style={dupe ? { borderColor: "rgba(239,68,68,.6)" } : undefined}
                                  />
                                </div>

                                <div className="cell" style={{ gridColumn: "span 2" }}>
                                  <select
                                    value={d.modo}
                                    onChange={(e) => {
                                      const mode = e.target.value as "auto" | "manual";
                                      updDraft(d.rid, {
                                        modo: mode,
                                        responsavel_manual: mode === "manual" ? d.responsavel_manual || poolManual[0] || nomeIdent || "" : d.responsavel_manual,
                                      });
                                    }}
                                  >
                                    <option value="auto">Auto</option>
                                    <option value="manual">Manual</option>
                                  </select>
                                </div>

                                <div className="cell" style={{ gridColumn: "span 2", display: "flex", gap: 10, alignItems: "end" }}>
                                  {d.modo === "manual" ? (
                                    <select value={d.responsavel_manual} onChange={(e) => updDraft(d.rid, { responsavel_manual: e.target.value })} style={{ flex: 1, minWidth: 0 }}>
                                      <option value="">—</option>
                                      {poolManual.map((n) => (
                                        <option key={n} value={n}>
                                          {n}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <div className="muted" style={{ flex: 1 }}>
                                      —
                                    </div>
                                  )}

                                  <button className="btn bad" onClick={() => rmDraft(d.rid)}>
                                    Remover
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {msg && <div className={msg.toLowerCase().includes("erro") ? "error" : "notice"}>{msg}</div>}
                  </div>

                  {/* ===== IMPORT ===== */}
                  <div className="card">
                    <h3 style={{ margin: 0 }}>Importar do SILOMS (.xls) — {unidade}</h3>

                    <div className="row" style={{ alignItems: "end" }}>
                      <div style={{ gridColumn: "span 6" }}>
                        <div className="field">
                          <span className="label">Arquivo (.xlsx, .xls, .csv)</span>
                          <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                setImportLastFile(f);
                                parseWorkbook(f);
                              }
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ gridColumn: "span 3" }}>
                        <div className="field">
                          <span className="label">Pular 1ª linha</span>
                          <select value={importSkipFirstRow ? "sim" : "nao"} onChange={(e) => setImportSkipFirstRow(e.target.value === "sim")}>
                            <option value="sim">Sim</option>
                            <option value="nao">Não</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ gridColumn: "span 3" }}>
                        <div className="field">
                          <span className="label">Manual: responsável</span>
                          <select value={importManualResp} onChange={(e) => setImportManualResp(e.target.value)}>
                            <option value="">—</option>
                            {poolManual.map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {importHeaders.length > 0 && (
                      <>
                        <div className="divider" />

                        <div className="row" style={{ alignItems: "end" }}>
                          <div style={{ gridColumn: "span 4" }}>
                            <div className="field">
                              <span className="label">Coluna SOLICITAÇÃO</span>
                              <select value={importCols.sol ?? ""} onChange={(e) => setImportCols((c) => ({ ...c, sol: e.target.value || undefined }))}>
                                <option value="">(vazia)</option>
                                {importHeaders.map((h) => (
                                  <option key={h} value={h}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div style={{ gridColumn: "span 4" }}>
                            <div className="field">
                              <span className="label">Coluna UGCRED</span>
                              <select value={importCols.ug ?? ""} onChange={(e) => setImportCols((c) => ({ ...c, ug: e.target.value || undefined }))}>
                                <option value="">(vazia)</option>
                                {importHeaders.map((h) => (
                                  <option key={h} value={h}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div style={{ gridColumn: "span 2" }}>
                            <div className="field">
                              <span className="label">Coluna VALOR</span>
                              <select value={importCols.valor ?? ""} onChange={(e) => setImportCols((c) => ({ ...c, valor: e.target.value || undefined }))}>
                                <option value="">(vazia)</option>
                                {importHeaders.map((h) => (
                                  <option key={h} value={h}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div style={{ gridColumn: "span 2" }}>
                            <div className="field">
                              <span className="label">Coluna OBS</span>
                              <select value={importCols.obs ?? ""} onChange={(e) => setImportCols((c) => ({ ...c, obs: e.target.value || undefined }))}>
                                <option value="">(vazia)</option>
                                {importHeaders.map((h) => (
                                  <option key={h} value={h}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>

                        <div className="row" style={{ alignItems: "end", marginTop: 10 }}>
                          <div style={{ gridColumn: "span 4" }}>
                            <div className="field">
                              <span className="label">Coluna DATA (opcional)</span>
                              <select value={importCols.data ?? ""} onChange={(e) => setImportCols((c) => ({ ...c, data: e.target.value || undefined }))}>
                                <option value="">(vazia)</option>
                                {importHeaders.map((h) => (
                                  <option key={h} value={h}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>

                        <div className="divider" />

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button className="btn" onClick={() => importSalvarDireto("auto")} disabled={loading || !importPreview.length}>
                            Importar e salvar (Auto)
                          </button>

                          <button className="btn good" onClick={() => importSalvarDireto("manual")} disabled={loading || !importPreview.length}>
                            Importar e salvar (Manual)
                          </button>

                          <span className="muted" style={{ alignSelf: "center" }}>
                            Prévia: <b>{importPreview.length}</b> linha(s)
                          </span>
                        </div>

                        {/* ✅ AGORA MOSTRA A PRÉVIA DAS LINHAS (TOP 25) */}
                        <div className="previewWrap">
                          <div className="previewHeader">
                            <span>
                              Prévia das linhas carregadas <span className="muted">(mostrando {Math.min(importPreview.length, 25)} de {importPreview.length})</span>
                            </span>
                            <span className="muted" style={{ fontWeight: 900 }}>
                              
                            </span>
                          </div>

                          <div className="previewBody">
                            {importPreview.length === 0 ? (
                              <div style={{ padding: 12 }} className="muted">
                                — Sem linhas na prévia (verifique o mapeamento da coluna SOLICITAÇÃO).
                              </div>
                            ) : (
                              <table className="previewTable">
                                <thead>
                                  <tr>
                                    <th style={{ width: "14%" }}>Data</th>
                                    <th style={{ width: "18%" }}>Solicitação</th>
                                    <th style={{ width: "20%" }}>UGCred</th>
                                    <th style={{ width: "14%" }}>Valor</th>
                                    <th>Obs</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {importPreviewTop.map((r, i) => (
                                    <tr key={`${r.solicitacao}-${i}`}>
                                      <td>{(r.data_solicitacao || "").slice(0, 10)}</td>
                                      <td>
                                        <b>{r.solicitacao || "—"}</b>
                                      </td>
                                      <td>{r.ugcred || "—"}</td>
                                      <td>{r.valor === null ? "—" : formatNumberBR(r.valor)}</td>
                                      <td>{r.obs || "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* ===== Responsáveis ===== */}
                  <div className="card">
                    <h3 style={{ margin: 0 }}>Militares Responsáveis — {unidade}</h3>

                    <div className="divider" />

                    <div className="row" style={{ alignItems: "end" }}>
                      <div style={{ gridColumn: "span 8" }}>
                        <div className="field">
                          <span className="label">Adicionar nome</span>
                          <input value={novoResp} onChange={(e) => setNovoResp(e.target.value)} placeholder="Ex.: 3S ELAINE" />
                        </div>
                      </div>

                      <div style={{ gridColumn: "span 4", display: "flex", gap: 10, alignItems: "end" }}>
                        <button className="btn good" onClick={addNomeDB}>
                          Adicionar
                        </button>
                        <button className="btn" onClick={() => setNovoResp("")}>
                          Limpar
                        </button>
                      </div>
                    </div>

                    <div className="divider" />

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {poolManual.length === 0 ? (
                        <span className="muted">Nenhum nome disponível.</span>
                      ) : (
                        poolManual.map((n) => {
                          const isAutoOff = autoOff.some((x) => norm(x) === norm(n));
                          const col = colorForName(n);

                          return (
                            <span key={n} className="pill">
                              <span style={{ width: 10, height: 10, borderRadius: 999, background: col, boxShadow: `0 0 0 3px ${col}22` }} />
                              <b>{n}</b>

                              <button className="btn" style={{ height: 32, padding: "0 10px" }} onClick={() => toggleAutoOff(n)}>
                                {isAutoOff ? "Auto ON" : "Auto OFF"}
                              </button>

                              <button className="btn bad" style={{ height: 32, padding: "0 10px" }} onClick={() => setResponsavelAtivoDB(n, false)}>
                                Remover
                              </button>
                            </span>
                          );
                        })
                      )}
                    </div>

                    {dbRespInativos.length > 0 && (
                      <>
                        <div className="divider" />
                        <p className="muted" style={{ margin: 0, marginBottom: 8 }}>
                          <b>Removidos (inativos):</b>
                        </p>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {dbRespInativos.map((n) => (
                            <span key={n} className="pill">
                              <b>{n}</b>
                              <button className="btn good" style={{ height: 32, padding: "0 10px" }} onClick={() => setResponsavelAtivoDB(n, true)}>
                                Reativar
                              </button>
                              <button className="btn bad" style={{ height: 32, padding: "0 10px" }} onClick={() => excluirResponsavelDefinitivo(n)}>
                                Excluir
                              </button>
                            </span>
                          ))}
                        </div>
                      </>
                    )}

                    <div className="divider" />
                    <p className="muted" style={{ margin: 0 }}>
                      <b>Militares Ativos:</b> {poolAuto.length ? poolAuto.join(", ") : "—"}
                    </p>
                  </div>
                </div>
              )}

              {/* ===== ACOMPANHAR ===== */}
              {aba === "acompanhar" && (
                <div className="card" style={{ marginTop: 14 }}>
                  <h3 style={{ margin: 0 }}>Acompanhar — {unidade}</h3>

                  <div className="divider" />

                  <div className="row">
                    <div style={{ gridColumn: "span 4" }}>
                      <div className="field">
                        <span className="label">Pesquisar</span>
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="subprocesso, solicitação, ugcred, valor, obs, responsável..." />
                      </div>
                    </div>

                    <div style={{ gridColumn: "span 3" }}>
                      <div className="field">
                        <span className="label">Solicitante (nome)</span>
                        <input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} placeholder="Ex.: 2T Bruno" />
                      </div>
                    </div>

                    <div style={{ gridColumn: "span 3" }}>
                      <div className="field">
                        <span className="label">Responsável</span>
                        <select value={responsavelFilter} onChange={(e) => setResponsavelFilter(e.target.value)}>
                          <option value="">—</option>
                          {poolManual.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div style={{ gridColumn: "span 1" }}>
                      <div className="field">
                        <span className="label">Data (de)</span>
                        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                      </div>
                    </div>

                    <div style={{ gridColumn: "span 1" }}>
                      <div className="field">
                        <span className="label">Data (até)</span>
                        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div className="row" style={{ marginTop: 10 }}>
                    <div style={{ gridColumn: "span 3" }}>
                      <div className="field">
                        <span className="label">Ver pendentes</span>
                        <label className="checkBoxRow">
                          <input type="checkbox" checked={verPendentes} onChange={(e) => setVerPendentes(e.target.checked)} />
                          <span style={{ fontWeight: 900 }}>{verPendentes ? "Mostrando só pendentes" : "Mostrar apenas pendentes"}</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="divider" />

                  <div className="row">
                    <div style={{ gridColumn: "span 2" }}>
                      <div className="field">
                        <span className="label">Relatório (de)</span>
                        <input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} />
                      </div>
                    </div>

                    <div style={{ gridColumn: "span 2" }}>
                      <div className="field">
                        <span className="label">Relatório (até)</span>
                        <input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} />
                      </div>
                    </div>

                    <div style={{ gridColumn: "span 3" }}>
                      <div className="field">
                        <span className="label">Email para envio</span>
                        <input value={reportEmail} onChange={(e) => setReportEmail(e.target.value)} placeholder="ex.: seu@email.com" />
                      </div>
                    </div>

                    <div style={{ gridColumn: "span 5", display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
                      <button className="btn" onClick={() => gerarExcelPorPeriodo(reportFrom, reportTo)}>
                        Gerar Excel (download)
                      </button>

                      <button className="btn good" onClick={() => enviarExcelPorEmailPeriodo(reportFrom, reportTo, reportEmail)} disabled={sendingEmail}>
                        {sendingEmail ? "Enviando..." : "Enviar Excel por email"}
                      </button>

                      <button
                        className="btn"
                        onClick={() => {
                          setQ("");
                          setSolicitante("");
                          setResponsavelFilter("");
                          setDateFrom("");
                          setDateTo("");
                          setVerPendentes(false);
                          setMsg(null);
                        }}
                      >
                        Limpar filtros
                      </button>

                      <span className="muted">
                        Mostrando <b>{listaFiltrada.length}</b> registro(s)
                      </span>
                    </div>
                  </div>

                  {listaFiltrada.length === 0 ? (
                    <p className="muted" style={{ marginTop: 12 }}>
                      Nenhum registro com os filtros atuais.
                    </p>
                  ) : (
                    <div className="rows">
                      {listaFiltrada.map((e) => {
                        const id = e.id;
                        const hasEdit = !!edits[id];
                        const resp = (getValue(id, "responsavel") as any) || e.responsavel || "";
                        const respColor = colorForName(resp);

                        const ugVal = norm((getValue(id, "ugcred") as any) ?? e.ugcred ?? "");
                        const isPredef = (UG_OPTIONS as readonly string[]).includes(ugVal);
                        const ugSelectVal = ugVal ? (isPredef ? ugVal : "__OUTRO__") : "";

                        const renomeado = (getValue(id, "renomeado") as any) ?? e.renomeado ?? false;
                        const incluido = (getValue(id, "incluido") as any) ?? e.incluido ?? false;

                        const pendente = isPendente(e);
                        const valorRaw = (getValue(id, "valor") as any) ?? e.valor ?? null;

                        return (
                          <div className="rowCard" key={id}>
                            <div className="rowTop">
                              <div className="badges">
                                <span className="badge" style={{ borderColor: `${respColor}55` }}>
                                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 999, background: respColor, marginRight: 8 }} />
                                  {resp}
                                </span>

                                <span className={`badge ${pendente ? "bad" : "good"}`}>{pendente ? "PENDENTE" : "OK"}</span>

                                <span className="badge">
                                  Sub: <b>{e.subprocesso || "—"}</b>
                                </span>

                                <span className="badge">
                                  Sol: <b>{e.solicitacao || "—"}</b>
                                </span>

                                {e.ugcred ? (
                                  <span className="badge">
                                    UGCred: <b>{e.ugcred}</b>
                                  </span>
                                ) : null}

                                {e.valor !== null && e.valor !== undefined ? (
                                  <span className="badge">
                                    Valor: <b>{formatNumberBR(e.valor)}</b>
                                  </span>
                                ) : null}

                                <span className={`badge ${e.renomeado === true ? "good" : "bad"}`}>
                                  Renomeado: <b>{e.renomeado === true ? "SIM" : "NÃO"}</b>
                                </span>

                                <span className={`badge ${e.incluido === true ? "good" : "bad"}`}>
                                  Incluído: <b>{e.incluido === true ? "SIM" : "NÃO"}</b>
                                </span>

                                {e.criado_por ? (
                                  <span className="badge">
                                    Solicitante: <b>{e.criado_por}</b>
                                  </span>
                                ) : null}
                              </div>

                              <div className="rowActions">
                                <button className="btn good" onClick={() => salvarLinha(id)} disabled={!hasEdit}>
                                  Salvar
                                </button>
                                <button className="btn bad" onClick={() => excluirEmpenho(id)}>
                                  Excluir
                                </button>
                              </div>
                            </div>

                            <div className="gridLine">
                              <div className="field">
                                <span className="label">Data (site)</span>
                                <input
                                  type="date"
                                  value={(getValue(id, "data_solicitacao") as any) ?? (e.data_solicitacao ?? dateKey(e) ?? "")}
                                  onChange={(ev) => setValue(id, { data_solicitacao: ev.target.value })}
                                />
                              </div>

                              <div className="field">
                                <span className="label">Subprocesso</span>
                                <input value={(getValue(id, "subprocesso") as any) ?? (e.subprocesso ?? "")} onChange={(ev) => setValue(id, { subprocesso: ev.target.value })} />
                              </div>

                              <div className="field">
                                <span className="label">Solicitação</span>
                                <input value={(getValue(id, "solicitacao") as any) ?? (e.solicitacao ?? "")} onChange={(ev) => setValue(id, { solicitacao: ev.target.value })} />
                              </div>

                              <div className="field">
                                <span className="label">UG Cred</span>
                                <select
                                  value={ugSelectVal}
                                  onChange={(ev) => {
                                    const v = ev.target.value;
                                    if (!v) {
                                      setValue(id, { ugcred: null });
                                      return;
                                    }
                                    if (v === "__OUTRO__") {
                                      const current = ugVal && !isPredef ? ugVal : "";
                                      setValue(id, { ugcred: current });
                                      return;
                                    }
                                    setValue(id, { ugcred: v });
                                  }}
                                >
                                  <option value="">—</option>
                                  {UG_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                  <option value="__OUTRO__">OUTRO (digitar)</option>
                                </select>

                                {ugSelectVal === "__OUTRO__" && (
                                  <input style={{ marginTop: 8 }} value={ugVal} onChange={(ev) => setValue(id, { ugcred: ev.target.value })} placeholder="Digite (ex.: OM X - 120999)" />
                                )}
                              </div>

                              <div className="field">
                                <span className="label">SIAFI</span>
                                <input value={(getValue(id, "siafi") as any) ?? (e.siafi ?? "")} onChange={(ev) => setValue(id, { siafi: ev.target.value })} />
                              </div>

                              <div className="field">
                                <span className="label">SILOMS</span>
                                <input value={(getValue(id, "siloms") as any) ?? (e.siloms ?? "")} onChange={(ev) => setValue(id, { siloms: ev.target.value })} />
                              </div>

                              <div className="field">
                                <span className="label">Valor</span>
                                <input value={typeof valorRaw === "number" ? formatNumberBR(valorRaw) : norm(valorRaw)} onChange={(ev) => setValue(id, { valor: ev.target.value as any })} placeholder="Ex.: 7.366,35" />
                              </div>

                              <div className="field">
                                <span className="label">Renomeado</span>
                                <label className="checkBoxRow" style={{ justifyContent: "space-between" }}>
                                  <span style={{ fontWeight: 900 }}>{renomeado ? "SIM" : "NÃO"}</span>
                                  <input type="checkbox" checked={renomeado === true} onChange={(ev) => setValue(id, { renomeado: ev.target.checked })} />
                                </label>
                              </div>

                              <div className="field">
                                <span className="label">Incluído</span>
                                <label className="checkBoxRow" style={{ justifyContent: "space-between" }}>
                                  <span style={{ fontWeight: 900 }}>{incluido ? "SIM" : "NÃO"}</span>
                                  <input type="checkbox" checked={incluido === true} onChange={(ev) => setValue(id, { incluido: ev.target.checked })} />
                                </label>
                              </div>

                              <div className="field">
                                <span className="label">Responsável</span>
                                <select value={(getValue(id, "responsavel") as any) ?? (e.responsavel ?? "")} onChange={(ev) => setValue(id, { responsavel: ev.target.value })}>
                                  <option value="">—</option>
                                  {poolManual.map((n) => (
                                    <option key={n} value={n}>
                                      {n}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="field">
                                <span className="label">Obs</span>
                                <textarea value={(getValue(id, "obs") as any) ?? (e.obs ?? "")} onChange={(ev) => setValue(id, { obs: ev.target.value })} placeholder="Observações sobre o empenho..." />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {msg && <div className={msg.toLowerCase().includes("erro") ? "error" : "notice"}>{msg}</div>}
                </div>
              )}
            </>
          )}

          {!canUse && sessionUserId && (
            <div className="card" style={{ marginTop: 14 }}>
              <b>⚠️ Você precisa se identificar para usar a página.</b>
            </div>
          )}
        </div>

        <footer className="footer">
          Desenvolvido por <b>2T Bruno</b> — Chefe da SEO — <b>GAP-MN</b>
        </footer>
      </main>
    </div>
  );
}

/** ✅ export protegido */
export default function EmpenhosPage() {
  return (
    <RequireAuth>
      <EmpenhosPageInner />
    </RequireAuth>
  );
}
