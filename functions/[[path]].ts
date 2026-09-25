import { createRequestHandler } from "@react-router/cloudflare";
import * as build from "../build/server/index.js";

const ENV_KEYS = [
  "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "SYNC_SECRET_TOKEN", "SESSION_SECRET", "NODE_ENV",
  "API_CORS_ORIGIN", "API_SECRET", "RESEND_API_KEY", "RESEND_FROM", "APP_URL",
];

// @ts-ignore
const handleRequest = createRequestHandler({
  build,
  // getLoadContext receives { request, context } where context.cloudflare is the Pages EventContext.
  getLoadContext: ({ context }: any) => {
    const cfEnv = context?.cloudflare?.env ?? {};
    const env: Record<string, string> = {};
    for (const k of ENV_KEYS) {
      const v = cfEnv[k];
      if (typeof v === "string") env[k] = v;
    }
    // Store on globalThis so non-context-aware helpers (supabase.server, etc.) can read it.
    (globalThis as any).__cfEnv__ = env;
    return { cloudflare: { env } };
  },
});

export const onRequest: PagesFunction = async (context) => {
  // Temporary: log what keys are in context.env so we can confirm secrets are present.
  const cfKeys = Object.keys(context.env as any);
  const hasSyncToken = !!(context.env as any)["SYNC_SECRET_TOKEN"];
  console.log("[onRequest] context.env keys:", cfKeys, "| hasSyncToken:", hasSyncToken);

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
