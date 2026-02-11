// app/routes/_protected.tsx
import * as React from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import supabase from "../../utils/supabase";
import { resolveHomePath } from "../../utils/roles";
import RequireAuth from "../auth/RequireAuth";

export default function ProtectedLayout() {
  return (
    <RequireAuth>
      <InnerProtected />
    </RequireAuth>
  );
}

function InnerProtected() {
  const loc = useLocation();
  const navigate = useNavigate();
  const [role, setRole] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) { setReady(true); return; }

      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle();

      if (!active) return;
      if (!error) setRole((data?.role ?? null) as string | null);
      setReady(true);
    })();
    return () => { active = false; };
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    const path = loc.pathname.toLowerCase();
    const desired = resolveHomePath(role);

    // Se caiu em "/" (não deve) OU em "/user" mas a role aponta p/ outra rota, corrige
    const isLanding = path === "/" || path === "/home";
    const wrongUser = path === "/user" && desired !== "/user";

    if (isLanding || wrongUser) {
      navigate(desired, { replace: true });
    }
  }, [ready, role, loc.pathname, navigate]);

  return <Outlet />;
}
