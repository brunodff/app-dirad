import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("/api/sync", "routes/api.sync.ts"),
] satisfies RouteConfig;
