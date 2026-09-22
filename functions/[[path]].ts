import { createPagesFunctionHandler } from "@react-router/cloudflare";
import * as build from "../build/server/index.js";

// @ts-ignore - build manifest types
export const onRequest = createPagesFunctionHandler({ build });
