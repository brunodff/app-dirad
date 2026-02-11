// app/routes/user.tsx
import * as React from "react";
import supabase from "../../utils/supabase";
import { Topbar } from "../components/Topbar";

const handleLogout = async () => {
  try { await supabase.auth.signOut(); } finally { window.location.href = "/"; }
};

export default function UserLanding() {
  return (
    <>
      <Topbar role="USER" onLogout={handleLogout} />

      <main className="section" style={{ display: "grid", placeItems: "center" }}>
        <div className="card" style={{ maxWidth: 760, padding: 18 }}>
          <h1>Bem-vindo</h1>
          <p style={{ fontSize: 18 }}>
            <b>O Sr.(a) ainda não possui função.</b><br />
            Solicite ao responsável a atribuição de um papel.
          </p>
        </div>
      </main>
    </>
  );
}
