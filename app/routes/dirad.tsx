// app/routes/dirad.tsx
import * as React from "react";
import supabase from "../../utils/supabase";
import { Topbar } from "../components/Topbar";
import { Link } from "react-router";


const handleLogout = async () => {
  try { await supabase.auth.signOut(); } finally { window.location.href = "/"; }
};

export default function DiradHome() {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"SDAB"|"SDPP"|"SDAP">("SDAB");
  const [msg, setMsg] = React.useState<string>("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const clean = email.trim().toLowerCase();
    if (!clean || !/@fab\.mil\.br$/i.test(clean)) { setMsg("Informe e-mail @fab.mil.br"); return; }
    try {
      const { error } = await supabase.rpc("assign_role", {
        target_email: clean, new_role: role
      });
      if (error) throw error;
      setMsg(`✅ ${clean} agora é ${role}.`);
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
      <Topbar role="DIRAD" onLogout={handleLogout} />

      <main className="section">
        <div className="card" style={{ maxWidth: 960, margin: "0 auto", padding: 18 }}>
          <h1>DIRAD</h1>
          <p>Visualize todos os painéis e cadastre usuários SDAB, SDPP e SDAP.</p>

          <form onSubmit={submit} className="grid-form" style={{ marginTop: 12 }}>
            <div>
              <label className="label">E-mail @fab.mil.br</label>
              <input className="input" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="nome@fab.mil.br" />
            </div>
            <div>
              <label className="label">Papel</label>
              <select className="select" value={role} onChange={(e)=>setRole(e.target.value as any)}>
                <option value="SDAB">SDAB</option>
                <option value="SDPP">SDPP</option>
                <option value="SDAP">SDAP</option>
              </select>
            </div>
            <div><button className="btn pill" type="submit" style={{ marginTop: 6 }}>Salvar</button></div>
          </form>

          {msg && <div className={/✅/.test(msg) ? "hint" : "error"} style={{ marginTop: 8 }}>{msg}</div>}

          <hr style={{ margin: "18px 0", opacity: .25 }} />
          <h2>Painéis</h2>
          <div className="actions" style={{ marginTop: 10 }}>
            <Link className="btn pill" to="/painel">Abrir Painéis da SDAB</Link>
            <a className="btn pill" href="#" target="_blank" rel="noreferrer">Painéis do SDPP</a>
            <a className="btn pill" href="#" target="_blank" rel="noreferrer">Painéis do SDAP</a>
          </div>
        </div>
      </main>
    </>
  );
}
