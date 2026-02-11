// app/routes/secretaria.tsx
import * as React from "react";
import supabase from "../../utils/supabase";
import { Topbar } from "../components/Topbar";
import { Link } from "react-router";

const BI_FALTAS_URL = "#"; // coloque aqui o link do seu BI (ou deixe # por enquanto)

const handleLogout = async () => {
  try { await supabase.auth.signOut(); } finally { window.location.href = "/"; }
};

export default function SecretariaHome() {
  const [email, setEmail] = React.useState("");
  const [newRole, setNewRole] = React.useState<"CHEFE"|"USER">("CHEFE");
  const [msg, setMsg] = React.useState<string>("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const clean = email.trim().toLowerCase();
    if (!clean || !/@fab\.mil\.br$/i.test(clean)) { setMsg("Informe e-mail @fab.mil.br"); return; }
    try {
      const { error } = await supabase.rpc("assign_role", {
        target_email: clean, new_role: newRole
      });
      if (error) throw error;
      setMsg(`✅ ${clean} agora é ${newRole}.`);
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
      <Topbar role="SECRETARIA" onLogout={handleLogout} />

      <main className="section">
        <div className="card" style={{ maxWidth: 900, margin: "0 auto", padding: 18 }}>
          <h1>Secretaria</h1>
          <p>Altere as funções dos usuários para <b>CHEFE</b> ou <b>USER</b>.</p>

          <form onSubmit={submit} className="grid-form" style={{ marginTop: 12 }}>
            <div>
              <label className="label">E-mail @fab.mil.br</label>
              <input className="input" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="nome@fab.mil.br" />
            </div>
            <div>
              <label className="label">Nova Função</label>
              <select className="select" value={newRole} onChange={(e)=>setNewRole(e.target.value as any)}>
                <option value="CHEFE">CHEFE</option>
                <option value="USER">USER</option>
              </select>
            </div>
            <div><button className="btn pill" type="submit" style={{ marginTop: 6 }}>Salvar</button></div>
          </form>

          {msg && <div className={/✅/.test(msg) ? "hint" : "error"} style={{ marginTop: 8 }}>{msg}</div>}

          <hr style={{ margin: "18px 0", opacity: .25 }} />
          <h2>BI de faltas</h2>
          <p>Visualizar o painel gerencial de faltas.</p>
          <Link className="btn pill" to="/bi-faltas">Abrir BI de faltas</Link>
        </div>
      </main>
    </>
  );
}
