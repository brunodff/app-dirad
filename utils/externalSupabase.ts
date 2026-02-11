// app/utils/externalSupabase.ts
import { createClient } from "@supabase/supabase-js";

function pickEnv(...keys: string[]) {
  for (const k of keys) {
    const v = import.meta.env[k] as string | undefined;
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

const extUrl  = pickEnv("VITE_EXT_SUPABASE_URL", "VITE_EXTERNAL_SUPABASE_URL");
const extAnon = pickEnv("VITE_EXT_SUPABASE_ANON_KEY", "VITE_EXTERNAL_SUPABASE_ANON_KEY");

export const hasExternalSupabase = !!(extUrl && extAnon);
export const external = hasExternalSupabase
  ? createClient(extUrl!, extAnon!, { auth: { persistSession: false } })
  : null;

export async function lookupExternalByToken(token: string): Promise<{
  user_id: string;
  email: string;
} | null> {
  if (!external) return null;

  // Na base externa seu amigo criou "user_email" com colunas "id" e "email"
  const { data, error } = await external
    .from("user_email")
    .select("id, email")
    .eq("id", token)
    .maybeSingle();

  if (error || !data) return null;

  return {
    user_id: String(data.id),
    email: String(data.email).toLowerCase(),
  };
}
