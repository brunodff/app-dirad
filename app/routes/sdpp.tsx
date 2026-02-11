// app/routes/sdpp.tsx
import * as React from "react";
import supabase from "../../utils/supabase";
import { Topbar } from "../components/Topbar";

const handleLogout = async () => {
  try { await supabase.auth.signOut(); } finally { window.location.href = "/"; }
};

export default function SDPPHome() {
  const [email, setEmail] = React.useState("");
  const [msg, setMsg] = React.useState<string>("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const clean = email.trim().toLowerCase();
    if (!clean || !/@fab\.mil\.br$/i.test(clean)) { setMsg("Informe e-mail @fab.mil.br"); return; }
    try {
      const { error } = await supabase.rpc("assign_role", {
        target_email: clean, new_role: "SDPP"
      });
      if (error) throw error;
      setMsg(`✅ ${clean} agora é SDPP.`);
      setEmail("");
    } catch (err: any) {
      const t = String(err?.message || err);
      if (t.includes("user not found")) setMsg("Usuário não encontrado (ele precisa se cadastrar).");
      else if (t.includes("forbidden")) setMsg("Você não tem permissão para esse papel.");
      else setMsg("Falha ao atribuir papel.");
    }
  }

  return (
    <>
      <Topbar role="SDPP" onLogout={handleLogout} />

      <main className="section">
        <div className="card" style={{ maxWidth: 900, margin: "0 auto", padding: 18 }}>
          <h1>SDPP</h1>
          <p>Adicionar novos usuários SDPP e acessar os painéis do setor.</p>

          <form onSubmit={submit} className="grid-form" style={{ marginTop: 12 }}>
            <div>
              <label className="label">E-mail @fab.mil.br</label>
              <input className="input" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="nome@fab.mil.br" />
            </div>
            <div />
            <div><button className="btn pill" type="submit" style={{ marginTop: 6 }}>Adicionar SDPP</button></div>
          </form>

          {msg && <div className={/✅/.test(msg) ? "hint" : "error"} style={{ marginTop: 8 }}>{msg}</div>}

          <hr style={{ margin: "18px 0", opacity: .25 }} />
          <a className="btn pill" href="#" target="_blank" rel="noreferrer">Em breve, novos painéis</a>
        </div>
      </main>
    </>
  );
}
