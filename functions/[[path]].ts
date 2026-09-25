import { createRequestHandler } from "@react-router/cloudflare";
import * as build from "../build/server/index.js";

const ENV_KEYS = [
  "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "SYNC_SECRET_TOKEN", "SESSION_SECRET", "NODE_ENV",
  "API_CORS_ORIGIN", "API_SECRET", "RESEND_API_KEY", "RESEND_FROM", "APP_URL",
];

// @ts-ignore
const handleRequest = createRequestHandler({ build });

export const onRequest: PagesFunction = async (context) => {
  // context.env has the secrets — copy to a plain object on globalThis
  // so optEnv/getEnv helpers (supabase.server, session.server, etc.) can read them.
  const cfEnv = context.env as any;
  const env: Record<string, string> = {};
  for (const k of ENV_KEYS) {
    const v = cfEnv[k];
    if (typeof v === "string") env[k] = v;
  }
  (globalThis as any).__cfEnv__ = env;

  try {
    // @ts-ignore
    return await handleRequest(context);
  } catch (error) {
    const msg = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error("[onRequest]", msg);
    return new Response(`SSR Error:\n${msg}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
};
