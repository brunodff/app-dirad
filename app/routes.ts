// app/routes.ts
import type { RouteConfig } from "@react-router/dev/routes";
import { index, layout, route } from "@react-router/dev/routes";

export default [
  // Landing / Home (público)
  route("/", "routes/home.tsx"),

  // Layout protegido (tudo aqui dentro exige login + approved via RequireAuth)
  layout("routes/_protected.tsx", [
    // ✅ protegidão: não dá pra acessar só jogando /empenhos sem passar pelo guard
    route("empenhos", "routes/empenhos.tsx"),

    // ... mantenha aqui suas outras rotas protegidas
    route("sdpp", "routes/sdpp.tsx"),
    route("sdab", "routes/sdab.tsx"),
    route("sdap", "routes/sdap.tsx"),
    route("dirad", "routes/dirad.tsx"),
    route("secretaria", "routes/secretaria.tsx"),
    route("user", "routes/user.tsx"),
    route("scan", "routes/scan.tsx"),
    route("painel", "routes/painel.tsx"),
    route("painelsdab", "routes/painelsdab.tsx"),
    route("bi-faltas", "routes/bi-faltas.tsx"),

    // se você tiver index dentro do protegido:
    // index("routes/index.tsx"),
  ]),
] satisfies RouteConfig;
