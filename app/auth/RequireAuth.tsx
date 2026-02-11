// app/auth/RequireAuth.tsx
import * as React from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "./AuthProvider";
import supabase from "../../utils/supabase";
import { resolveHomePath } from "../../utils/roles";

function FullscreenLoader() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh", fontSize: 18, opacity: 0.9 }}>
      Verificando credenciais…
    </div>
  );
}

export default function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, authReady } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // 🔧 HOOKS sempre no topo (antes de qualquer return)
  const [checking, setChecking] = React.useState(true);
  const [approved, setApproved] = React.useState<boolean | null>(null);
  const [role, setRole] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;

    // Se ainda não sabemos o estado do auth, não faz nada (evita navegar cedo)
    if (!authReady) return;

    // Sem usuário -> marcamos como "checado", approved=false (render decide navegação)
    if (!user) {
      setApproved(false);
      setChecking(false);
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("approved, role")
          .eq("id", user.id)
          .maybeSingle();
        if (!active) return;
        if (error) throw error;

        setApproved(!!data?.approved);
        setRole((data?.role ?? null) as string | null);
      } catch {
        setApproved(false);
        setRole(null);
      } finally {
        if (active) setChecking(false);
      }
    })();

    return () => { active = false; };
  }, [authReady, user?.id]);

  // Redireciono pós-aprovação se caiu em "/" / "/home" ou em "/user" por fallback
  React.useEffect(() => {
    if (!authReady || checking || !user || !approved) return;

    const desired = resolveHomePath(role);
    const path = location.pathname.toLowerCase();
    const isLanding = path === "/" || path === "/home";
    const wrongUser = path === "/user" && desired !== "/user";

    if (isLanding || wrongUser) {
      navigate(desired, { replace: true });
    }
  }, [authReady, checking, approved, role, user, location.pathname, navigate]);

  // 🔚 A PARTIR DAQUI: decide o que renderizar (sem criar novos hooks)
  if (!authReady || checking) return <FullscreenLoader />;

  if (!user) {
    return <Navigate to="/" replace state={{ from: location, why: "no_session" }} />;
  }

  if (!approved) {
    return <Navigate to="/" replace state={{ from: location, why: "not_approved" }} />;
  }

  return children;
}
