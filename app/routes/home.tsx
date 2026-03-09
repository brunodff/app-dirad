import { useEffect } from "react";
import AuthCard from "../components/authCard";

/* Utils de rolagem: desliga o snap por ~650ms e rola suave até o id */
const scrollToId = (id: string) => {
  const scroller = document.querySelector(".scroll"); // <main class="scroll">
  const el = document.getElementById(id);
  if (!el || !scroller) return;

  scroller.classList.add("no-snap");
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => scroller.classList.remove("no-snap"), 650);
};

export default function Home() {
  // Esconde o header global (que exibe "Home / Painel") só nesta página
  useEffect(() => {
    const globalHeader = document.querySelector("header") as HTMLElement | null;
    const prev = globalHeader?.style.display;
    if (globalHeader) globalHeader.style.display = "none";
    return () => {
      if (globalHeader) globalHeader.style.display = prev ?? "";
    };
  }, []);

  // Revela elementos ao rolar (animação suave)
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (!els.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -10% 0px" }
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="page">
      {/* CSS para centralizar o hero (logos + título) e o CTA */}
      <style>{`
        .hero-wrap{
          max-width: 1120px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          min-height: min(74svh, 740px);
          text-align: center;
        }

        /* 🔥 Logos lado a lado (responsivo) */
        .hero-logos{
          display:flex;
          align-items:center;
          justify-content:center;
          gap: clamp(10px, 2.2vw, 22px);
          flex-wrap: wrap;
        }

        .hero-logo{
          width: clamp(110px, 14vw, 200px);
          height: auto;
          display: block;
          filter: drop-shadow(0 8px 18px rgba(0,0,0,.25));
          user-select: none;
          pointer-events: none;
        }

        .hero-logo.dirad{
          width: clamp(105px, 13vw, 190px);
        }

        .hero-title{
          margin: 8px 0 0;
          font-size: clamp(34px, 5.6vw, 54px);
          line-height: 1.05;
          letter-spacing: .5px;
        }
        .accent{ color: #63A3FF; }

        .cta{
          display: inline-flex;
          margin-top: 18px;
        }
      `}</style>

      <main className="scroll">
        {/* DOBRA 1: capa minimalista */}
        <section className="section hero-fold banded" aria-label="Apresentação">
          <div className="hero-wrap">
            <div className="hero-logos reveal">
              {/* ✅ GARANTA que esses arquivos estão em /public */}
              <img src="/GAP MN.png" alt="GAP-MN" className="hero-logo" />
              <img src="/gap-df.png" alt="GAP-DF" className="hero-logo" />
              <img src="/dirad.png" alt="DIRAD" className="hero-logo dirad" />
            </div>

            <h1 className="hero-title reveal d1">
              teste <span className="accent"></span>
            </h1>

            <button className="cta reveal d2" type="button" onClick={() => scrollToId("login")}>
              Acessar ou criar conta
            </button>
          </div>
        </section>

        {/* DOBRA 2: autenticação */}
        <section className="section login" id="login" aria-label="Autenticação">
          <AuthCard />
        </section>
      </main>
    </div>
  );
}
