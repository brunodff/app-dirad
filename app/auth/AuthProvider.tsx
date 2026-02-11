// app/auth/AuthProvider.tsx
import * as React from "react";
import type { ReactNode } from "react";
import supabase from "../../utils/supabase";

type AuthCtx = {
  user: import("@supabase/supabase-js").User | null;
  authReady: boolean;
};

const Ctx = React.createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = React.useState<import("@supabase/supabase-js").User | null>(null);
  const [authReady, setAuthReady] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  return <Ctx.Provider value={{ user, authReady }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
