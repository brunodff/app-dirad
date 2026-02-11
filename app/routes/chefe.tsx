// app/routes/chefe.tsx
import * as React from "react";
import { Link } from "react-router";
import supabase from "../../utils/supabase";
import { Topbar } from "../components/Topbar";

const handleLogout = async () => {
  try { await supabase.auth.signOut(); } finally { window.location.href = "/"; }
};

export default function ChefeHome() {
  return (
    <>
      <Topbar role="CHEFE" onLogout={handleLogout} />

      <main className="section">
        <div className="card" style={{ maxWidth: 820, margin: "0 auto", padding: 18 }}>
          <h1>Painel de Faltas</h1>
          <h2>É NECESSÁRIO QUE O MILITAR ESTEJA COM O QR CODE DO APLICATIVO DE PREVISÕES</h2>
          <p>Você tem acesso exclusivo à leitura de QR Code para retirada de faltas.</p>
          <div className="actions" style={{ marginTop: 12 }}>
            <Link className="btn pill" to="/scan">Ir para retirada de faltas</Link>
          </div>
        </div>
      </main>
    </>
  );
}
