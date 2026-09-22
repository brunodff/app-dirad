import { createRequestHandler } from "@react-router/cloudflare";
import * as build from "virtual:react-router/server-build";

const requestHandler = createRequestHandler(build, import.meta.env.MODE);

export default {
  async fetch(request: Request): Promise<Response> {
    return requestHandler(request, {});
  },
};
