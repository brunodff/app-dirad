import * as React from "react";
import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // Adicionado para navegação
import { createClient } from "@supabase/supabase-js";
import { Link } from "react-router";

type Panel = { id: string; title: string; img: string };
type OpenState = { title: string; embedUrl: string } | null;

/* Supabase client (front) */
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);

/* rolagem suave com pausa no snap (mesma lógica da Home) */
const scrollToId = (id: string) => {
  const scroller = document.querySelector(".scroll");
  const el = document.getElementById(id);
  if (!el || !scroller) return;

  (scroller as HTMLElement).classList.add("no-snap");
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => (scroller as HTMLElement).classList.remove("no-snap"), 650);
};

/* detectar iOS (iPhone/iPad, inclusive iPadOS como “Mac” com touch) */
const isIOS = () => {
  const ua = navigator.userAgent || "";
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);
  return iOS;
};

export default function Dashboards() {
  const [open, setOpen] = useState<OpenState>(null);
  const [isFs, setIsFs] = useState(false); // verdadeiro em FS nativo OU fallback CSS
  const modalRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate(); // Hook para navegação

  // ====== OCULTAR HEADER GLOBAL APENAS NESTA PÁGINA ======
  useEffect(() => {
    const globalHeader = document.querySelector("header") as HTMLElement | null;
    const prevDisplay = globalHeader?.style.display;
    if (globalHeader) globalHeader.style.display = "none";
    document.body.classList.add("with-panel-topbar");
    return () => {
      if (globalHeader) globalHeader.style.display = prevDisplay ?? "";
      document.body.classList.remove("with-panel-topbar");
    };
  }, []);

  // ====== LINKS DO POWER BI ======
  const links: Record<string, string> = {
    indicadorsisub:
      "https://app.powerbi.com/view?r=eyJrIjoiMmQ5MDYwODMtODJjNy00NzVkLWFjYzgtYjljYzE4NmM0ZDgxIiwidCI6IjNhMzY0ZGI2LTg2NmEtNDRkOS1iMzY5LWM1ODk1OWQ0NDhmOCJ9",
    previsaosisub:
      "https://app.powerbi.com/view?r=eyJrIjoiYzBhNjNmYWItZmQ0OS00ODRlLThjMDEtOWY5NjVjNDg5ZDA2IiwidCI6IjNhMzY0ZGI2LTg2NmEtNDRkOS1iMzY5LWM1ODk1OWQ0NDhmOCJ9",
    painelsifare:
      "https://app.powerbi.com/view?r=eyJrIjoiOTdmODkwY2UtNTdkMS00ZjgyLTk0NzctZTNmYzc5MWY0M2ExIiwidCI6ImViMjk0Zjg5LTUwNWUtNDI4MC1iYjdiLTFlMzlhZjg5YTg4YyJ9",
  };

  const panels: Record<"SISUB" | "SIFARE", Panel[]> = {
    SISUB: [
      { id: "indicadorsisub", title: "Indicadores SISUB", img: "/indicadorsisub.jpg" },
      { id: "previsaosisub", title: "Previsão SISUB", img: "/previsaosisub.jpg" },
    ],
    SIFARE: [{ id: "painelsifare", title: "Indicadores SIFARE", img: "/painelsifare.jpg" }],
  };

  // ====== FULLSCREEN ======
  const hasNativeFs = () =>
    typeof document !== "undefined" &&
    // @ts-ignore
    (document.fullscreenEnabled || document.webkitFullscreenEnabled || false);

  const inNativeFs = () =>
    typeof document !== "undefined" && !!document.fullscreenElement;

  const tryEnterFs = async (): Promise<boolean> => {
    const el: any = modalRef.current;
    if (!el) return false;
    if (inNativeFs()) return true;

    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen({ /* @ts-ignore */ navigationUI: "hide" });
        return true;
      }
      // @ts-ignore - Safari antigo
      if (el.webkitRequestFullscreen) {
        // @ts-ignore
        el.webkitRequestFullscreen();
        return true;
      }
    } catch {
      // ignora
    }
    return false;
  };

  const exitFs = async () => {
    try {
      if (inNativeFs() && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // ignora
    } finally {
      setIsFs(false); // também sai do fallback CSS
    }
  };

  const toggleFs = async () => {
    if (inNativeFs()) {
      await exitFs();
      return;
    }
    if (isFs) {
      setIsFs(false);
      return;
    }
    const ok = await tryEnterFs();
    if (!ok) setIsFs(true); // fallback CSS
  };

  const shouldForceFs = () =>
    window.matchMedia("(max-width: 900px)").matches && window.innerWidth > window.innerHeight;

  const openPanel = (p: Panel) => {
    setOpen({ title: p.title, embedUrl: links[p.id] || "" });

    // iOS: vai direto pro fallback CSS (fullscreen nativo é limitado/bloqueado)
    if (isIOS()) {
      setIsFs(true);
      return;
    }

    // Demais plataformas: tenta nativo; se falhar e estiver em landscape pequeno, cai no fallback
    setTimeout(async () => {
      let ok = false;
      if (hasNativeFs()) ok = await tryEnterFs();
      if (!ok && shouldForceFs()) setIsFs(true);
    }, 0);
  };

  const closePanel = () => {
    exitFs();
    setOpen(null);
  };

  // espelha estado quando houver transição de FS nativo
  useEffect(() => {
    const onFsChange = () => setIsFs(inNativeFs());
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Ao girar, em telas pequenas, força fallback se não tiver FS nativo
  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      const landscape = window.innerWidth > window.innerHeight;
      if (landscape) {
        if (!inNativeFs()) setIsFs(true);
      } else {
        if (!inNativeFs()) setIsFs(false);
      }
    };
    window.addEventListener("resize", onResize);
    // @ts-ignore
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      // @ts-ignore
      window.removeEventListener("orientationchange", onResize);
    };
  }, [open]);

  // ====== LOGOUT ======
  const handleLogout = async () => {
    try { await supabase.auth.signOut(); } catch {}
    window.location.href = "/"; // volta para a Home
  };

  return (
    <main className="scroll">
      {/* Botão fixo no topo-direito (oculto em tela cheia) */}
      {!isFs && (
        <>
          <style>{`
            .dash-back{
              position: fixed; top: 10px; right: 12px; z-index: 1000;
              padding: 8px 12px; border-radius: 10px;
              background: rgba(255,255,255,.06); color: #eaf7f0; text-decoration: none; font-weight: 800;
              border: 1px solid rgba(127,197,255,.30);
              backdrop-filter: blur(6px);
            }
            .dash-back:hover{ background: rgba(255,255,255,.10); }
          `}</style>
          <Link to="/dirad" className="dash-back">Voltar para página inicial</Link>
        </>
      )}

      {/* Botão para ir para /scan */}
      <div style={{ width: "100%", textAlign: "center", margin: "24px 0" }}>
      </div>

      {/* ...existing code... */}
      {/* TOPBAR com avatar + saudação + sair (não aparece em fullscreen para liberar área) */}
      

      {/* TOPO */}
      <section className="section auto dash-header">
        <div className="dash-header-inner">
          <h1 className="hero-title">
            Painéis <span className="accent">SDAB</span>
          </h1>
        </div>
      </section>

      {/* Dica de rotação (retratos pequenos) */}
      <div className="rotate-hint" role="note" aria-live="polite">
        <img src="/rotate-icon.png?v=1" alt="" aria-hidden="true" />
        <span>Sugestão: rotacione o celular para melhor visualização.</span>
      </div>

      {/* AVISOS */}
      <section className="section auto notice-section" aria-label="Avisos">
        <div className="notice" role="note">
          <strong>Aviso:</strong> Novos painéis sendo elaborados. Para mais informações, contatar:&nbsp;
          <a href="mailto:freitasbruno668@gmail.com">freitasbruno668@gmail.com</a>
        </div>
      </section>

      {/* ESCOLHAS */}
      <section className="section auto choices-section" aria-label="Escolha a seção">
        <nav className="choice-buttons">
          <button className="choice-btn" aria-label="Ir para painéis SISUB" onClick={() => scrollToId("sisub")}>
            <span className="grad-green">SISUB</span>
          </button>
          <button className="choice-btn" aria-label="Ir para painéis SIFARE" onClick={() => scrollToId("sifare")}>
            <span className="grad-blue">SIFARE</span>
          </button>
        </nav>
      </section>

      {/* SISUB */}
      <section id="sisub" className="section gallery-section">
        <div className="gallery-wrap">
          <h2 className="section-title">SISUB</h2>
          <div className="gallery-grid">
            {panels.SISUB.map((p) => (
              <article key={p.id} className="panel-card">
                <button className="card-hit" onClick={() => openPanel(p)} aria-label={`Abrir ${p.title}`}>
                  <img src={p.img} alt={p.title} loading="lazy" />
                </button>
                <div className="panel-info">
                  <h4>{p.title}</h4>
                  <div className="panel-actions">
                    <button className="btn small" onClick={() => openPanel(p)}>
                      Ver aqui
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* SIFARE */}
      <section id="sifare" className="section gallery-section">
        <div className="gallery-wrap">
          <h2 className="section-title">SIFARE</h2>
          <div className="gallery-grid">
            {panels.SIFARE.map((p) => (
              <article key={p.id} className="panel-card">
                <button className="card-hit" onClick={() => openPanel(p)} aria-label={`Abrir ${p.title}`}>
                  <img src={p.img} alt={p.title} loading="lazy" />
                </button>
                <div className="panel-info">
                  <h4>{p.title}</h4>
                  <div className="panel-actions">
                    <button className="btn small" onClick={() => openPanel(p)}>
                      Ver aqui
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Modal */}
      {open && (
        <div className="modal-backdrop" onClick={closePanel} role="dialog" aria-modal="true">
          <div
            ref={modalRef}
            className={`modal ${isFs ? "fs-active" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-head">
              <h3>{open.title}</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn small outline" onClick={toggleFs} aria-label="Tela cheia">
                  {inNativeFs() || isFs ? "Sair" : "Tela cheia"}
                </button>
                <button className="close-x" onClick={closePanel} aria-label="Fechar">×</button>
              </div>
            </header>
            <div className="iframe-box">
              {open.embedUrl ? (
                <iframe
                  src={open.embedUrl}
                  title={open.title}
                  allow="fullscreen; clipboard-write; encrypted-media"
                  allowFullScreen
                  loading="eager"
                />
              ) : (
                <div className="no-embed">
                  <p>Defina o link público do Power BI para este painel.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
