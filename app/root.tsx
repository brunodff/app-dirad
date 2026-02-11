// app/root.tsx
import * as React from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import stylesheetHref from "./style.css?url";
import { AuthProvider } from "./auth/AuthProvider";

export const links = () => [{ rel: "stylesheet", href: stylesheetHref }];

function GlobalErrorBoundary({ children }: { children: React.ReactNode }) {
  const [err, setErr] = React.useState<Error | null>(null);

  React.useEffect(() => {
    const onError = (e: ErrorEvent) => { setErr(e.error ?? new Error(String(e.message))); };
    const onRejection = (e: PromiseRejectionEvent) => { setErr(e.reason instanceof Error ? e.reason : new Error(String(e.reason))); };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  if (err) {
    return (
      <div style={{minHeight:"100dvh",padding:"16px",color:"#eaf7f0"}}>
        <h2>Erro na aplicação</h2>
        <pre style={{whiteSpace:"pre-wrap",background:"rgba(0,0,0,.35)",padding:12,borderRadius:8}}>
{String(err?.message || err)}
        </pre>
        <button onClick={() => window.location.reload()} className="btn" style={{marginTop:10}}>
          Recarregar
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

export function Layout() {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="scroll">
        <GlobalErrorBoundary>
          {/* <<< ENVOLVE TODA A APP COM O PROVIDER >>> */}
          <AuthProvider>
            <Outlet />
          </AuthProvider>
        </GlobalErrorBoundary>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  return <Outlet />;
}
