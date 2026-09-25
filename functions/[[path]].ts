import { createRequestHandler } from "@react-router/cloudflare";
import * as build from "../build/server/index.js";

// _routes.json already routes static assets (/assets/*, /, etc.) to CDN.
// This function only handles dynamic SSR routes.
// @ts-ignore - build manifest types
const handleRequest = createRequestHandler({ build });

export const onRequest: PagesFunction = async (context) => {
  // Cloudflare secrets are not enumerable via Object.entries — access by name explicitly.
  const cfEnv = context.env as any;
  const knownKeys = [
    "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
    "SYNC_SECRET_TOKEN", "SESSION_SECRET", "NODE_ENV",
    "API_CORS_ORIGIN", "API_SECRET",
  ];
  for (const k of knownKeys) {
    if (typeof cfEnv[k] === "string") process.env[k] = cfEnv[k];
  }

  try {
    // Pass Pages Function context directly — it has .request, .env, .waitUntil
    // @ts-ignore - context satisfies the cloudflare shape expected by createRequestHandler
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
