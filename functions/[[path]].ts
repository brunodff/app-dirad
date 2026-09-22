import { createRequestHandler } from "@react-router/cloudflare";
import * as build from "../build/server/index.js";

// _routes.json already routes static assets (/assets/*, /, etc.) to CDN.
// This function only handles dynamic SSR routes.
// @ts-ignore - build manifest types
const handleRequest = createRequestHandler({ build });

export const onRequest: PagesFunction = async (context) => {
  // Cloudflare env bindings are not on process.env by default — copy them over.
  const cfEnv = context.env as Record<string, unknown>;
  for (const [k, v] of Object.entries(cfEnv)) {
    if (typeof v === "string" && !process.env[k]) process.env[k] = v;
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
