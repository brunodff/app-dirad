// Reads env vars from Cloudflare context (set on each request) with process.env fallback for local dev.
export function getEnv(key: string): string {
  const v = (globalThis as any).__cfEnv__?.[key] ?? process.env[key];
  if (!v) throw new Error(`Env var ausente: ${key}`);
  return v;
}

export function optEnv(key: string, fallback = ''): string {
  return (globalThis as any).__cfEnv__?.[key] ?? process.env[key] ?? fallback;
}
