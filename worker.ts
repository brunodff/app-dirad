import { createRequestHandler } from "@react-router/cloudflare";
import * as build from "./build/server/index.js";

// @ts-ignore
const handler = createRequestHandler(build);

interface Env {
  ASSETS: { fetch: (r: Request) => Promise<Response> };
  [key: string]: unknown;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Serve static assets (JS, CSS, images) via Cloudflare Pages assets storage
    if (
      url.pathname.startsWith("/assets/") ||
      url.pathname === "/favicon.ico" ||
      url.pathname === "/favicon.png"
    ) {
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404) return assetResponse;
      } catch {}
    }

    return handler(request, { cloudflare: { env } });
  },
};
