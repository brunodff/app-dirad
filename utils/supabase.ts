// app/utils/supabase.ts
import { createClient } from "@supabase/supabase-js";

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const rawAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function assertEnv(name: string, v: unknown) {
  if (!v || String(v).trim() === "") {
    throw new Error(
      `[Supabase] Falta ${name}. Crie .env na raiz (Vite) ou configure no Vercel e reinicie o server.`
    );
  }
}
assertEnv("VITE_SUPABASE_URL", rawUrl);
assertEnv("VITE_SUPABASE_ANON_KEY", rawAnon);

// ✅ sanitiza URL (remove espaços, remove barras finais, garante https)
function sanitizeSupabaseUrl(u: string) {
  let x = String(u).trim();

  // remove aspas acidentais
  x = x.replace(/^['"]|['"]$/g, "");

  // remove barras finais
  x = x.replace(/\/+$/, "");

  // força https se vier sem protocolo
  if (!/^https?:\/\//i.test(x)) x = `https://${x}`;

  // se vier http por engano, força https (evita mixed-content no deploy)
  x = x.replace(/^http:\/\//i, "https://");

  return x;
}

const url = sanitizeSupabaseUrl(rawUrl!);
const anon = String(rawAnon!).trim();

// ✅ fetch wrapper pra trocar "Failed to fetch" por erro explicativo
const wrappedFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init);
  } catch (err: any) {
    const msg = String(err?.message || err);

    // esse é o teu caso: browser não conseguiu nem chamar a URL
    if (/failed to fetch/i.test(msg) || /networkerror/i.test(msg)) {
      const target =
        typeof input === "string"
          ? input
          : (input as Request)?.url || "(request)";

      throw new Error(
        [
          `Falha de rede ao conectar no Supabase.`,
          `Request: ${target}`,
          ``,
          `Causas comuns:`,
          `- VITE_SUPABASE_URL errado (sem https / com espaço / projeto errado)`,
          `- ENV não configurada no Vercel ou dev server não reiniciado`,
          `- bloqueio de rede/DNS (supabase.co)`,
          `- CORS/Site URL/Redirect URLs no Supabase (Auth -> URL Configuration)`,
        ].join("\n")
      );
    }

    throw err;
  }
};

const supabase = createClient(url, anon, {
  global: { fetch: wrappedFetch },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export default supabase;
