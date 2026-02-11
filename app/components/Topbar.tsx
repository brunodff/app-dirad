import * as React from "react";

export type Role =
  | "USER" | "CHEFE" | "SECRETARIA" | "DIRAD"
  | "SDAB" | "SDPP" | "SDAP";

export function Topbar({
  meEmail,
  role,
  approved,
  onLogout,
}: {
  meEmail?: string;
  role: Role;
  approved?: boolean;
  onLogout?: () => void;
}) {
  const badgeClass = getRoleBadgeClass(role);

  return (
    <>
      <style>{`
        .panel-topbar{
          position: sticky; top: 0; z-index: 1000;
          padding: calc(6px + env(safe-area-inset-top)) 12px 8px;
          display:flex; align-items:center; justify-content:space-between; gap:12px;
          background: linear-gradient(180deg, rgba(4,12,24,.92), rgba(4,12,24,.78));
          border-bottom:1px solid rgba(255,255,255,.12);
          backdrop-filter: blur(8px);
        }
        .panel-topbar .user-greeting{
          display:flex; align-items:center; gap:12px; min-width:0; flex:1; overflow:hidden;
        }
        .panel-topbar .hello{
          font-size:clamp(12px, 2.6vw, 16px);
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .avatar{ width:36px; height:36px; border-radius:50%; border:1px solid rgba(255,255,255,.2); }
        .chip{
          display:inline-flex; gap:10px; align-items:center; border:1px solid rgba(255,255,255,.2);
          border-radius:999px; padding:6px 10px; font-size:13px; color:#eaf7f0; background:rgba(255,255,255,.06);
        }
        .role-badge{ padding:2px 8px; border-radius:999px; font-weight:800; border:1px solid rgba(255,255,255,.35); }

        /* cores dos badges */
        .role-dirad{ background:#1e7bd6; }       /* azul */
        .role-secretaria{ background:#d5a419; }  /* amarelo */
        .role-chefe{ background:#1e8a86; }       /* teal */
        .role-sdab{ background:#0f9b0f; }        /* verde */
        .role-sdpp{ background:#e67e22; }        /* laranja */
        .role-sdap{ background:#c0392b; }        /* vermelho */
        .role-user{ background:#6c7a86; }        /* cinza */

        .btn.small.topbar-exit{
          padding: 8px 12px; border-radius:10px; border:1px solid rgba(255,255,255,.24);
          background: rgba(255,255,255,.06); color:#fff; font-weight:800; cursor:pointer;
        }
        .btn.small.topbar-exit:hover{ background: rgba(255,255,255,.12); }
      `}</style>

      {/* Topbar */}
      <div className="panel-topbar">
        <div className="user-greeting">
          <img src="/avatar-acanto.png" alt="Avatar DIRAD" className="avatar" />
          <span className="hello">
            Gestor, seja bem-vindo ao <b>APP DIRAD</b>
          </span>

          {/* 🔹 Badge da role AO LADO do texto de boas-vindas */}
          <span className={`role-badge ${badgeClass}`} title="Papel atual">
            {role}
          </span>

          {/* Chip com e-mail (sem o badge da role para evitar duplicidade) */}
          {meEmail && (
            <span className="chip" title="Sessão atual">
              <span>{meEmail}</span>
              {approved === false && (
                <span
                  className="role-user"
                  style={{ padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,.35)" }}
                >
                  pendente
                </span>
              )}
            </span>
          )}
        </div>

        <button className="btn small topbar-exit" onClick={onLogout}>Sair da conta</button>
      </div>
    </>
  );
}

function getRoleBadgeClass(role: Role): string {
  switch (role) {
    case "DIRAD": return "role-dirad";
    case "SECRETARIA": return "role-secretaria";
    case "CHEFE": return "role-chefe";
    case "SDAB": return "role-sdab";
    case "SDPP": return "role-sdpp";
    case "SDAP": return "role-sdap";
    default: return "role-user";
  }
}
