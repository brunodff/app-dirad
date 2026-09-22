import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("/login",   "routes/login.tsx"),
  route("/logout",  "routes/logout.ts"),
  route("/painel",  "routes/painel.tsx"),
  route("/api/sync",      "routes/api.sync.ts"),
  route("/api/siscodec",  "routes/api.siscodec.ts"),
  route("/api/heartbeat", "routes/api.heartbeat.ts"),
  route("/aceite-convite", "routes/aceite-convite.tsx"),
  route("/api/pdf-solicitacao", "routes/api.pdf-solicitacao.ts"),
  route("/api/empenhos-op",    "routes/api.empenhos-op.ts"),
] satisfies RouteConfig;
