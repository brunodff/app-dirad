import { createPagesFunctionHandler } from "@react-router/cloudflare";
import * as build from "../build/server/index.js";

// @ts-ignore - build manifest types
const handler = createPagesFunctionHandler({ build });

export const onRequest: PagesFunction = async (context) => {
  try {
    return await handler(context);
  } catch (error) {
    const msg = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error("[onRequest]", msg);
    return new Response(`SSR Error:\n${msg}`, { status: 500, headers: { "Content-Type": "text/plain" } });
  }
};
