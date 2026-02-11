// app/routes/api/scan.ts
import type { LoaderFunctionArgs } from "react-router";
import { createClient } from "@supabase/supabase-js";

const ORIGIN = process.env.API_CORS_ORIGIN || "*";
const API_KEY = (process.env.API_SECRET || "").trim();
const SUPA_URL = (process.env.SUPABASE_URL || "").trim();
const SUPA_SVC = (process.env.SUPABASE_SERVICE_ROLE || "").trim();

function respond(data: any, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Access-Control-Allow-Origin", ORIGIN);
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  return new Response(JSON.stringify(data), { ...init, headers });
}
const bad = (status: number, message: string) => respond({ error: message }, { status });

function getAuthKey(req: Request) {
  const url = new URL(req.url);
  const fromQuery = (url.searchParams.get("key") || "").trim();
  const h = req.headers.get("authorization") || "";
  const fromHeader = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
  return fromQuery || fromHeader;
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") return respond({}, { status: 204 });
  if (request.method !== "GET") return bad(405, "Method Not Allowed");

  // Config sanity
  if (!SUPA_URL || !SUPA_SVC) {
    return bad(500, "Server not configured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  }

  // Auth
  const provided = getAuthKey(request);
  if (API_KEY && provided !== API_KEY) return bad(401, "Unauthorized (invalid key)");

  const supabase = createClient(SUPA_URL, SUPA_SVC, { auth: { persistSession: false } });

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const perPage = Math.min(1000, Math.max(1, Number(url.searchParams.get("per_page") || 200)));
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const table = url.searchParams.get("table") || "external_scans";
  const day = url.searchParams.get("day");            // "YYYY-MM-DD"
  const fromDate = url.searchParams.get("from");      // ISO
  const toDate = url.searchParams.get("to");          // ISO
  const scannerEmail = url.searchParams.get("scanner_email");
  const hasError = url.searchParams.get("has_error"); // "true" | "false"

  // Para evitar erro por colunas diferentes entre ambientes, vamos retornar tudo:
  let q = supabase.from(table).select("*", { count: "exact" });

  if (day) q = q.eq("day_local", day);
  if (fromDate) q = q.gte("scanned_at", fromDate);
  if (toDate) q = q.lte("scanned_at", toDate);
  if (scannerEmail) q = q.eq("scanner_email", scannerEmail);
  if (hasError === "true") q = q.not("error", "is", null);
  if (hasError === "false") q = q.is("error", null);

  q = q.order("scanned_at", { ascending: false }).range(from, to);

  const { data, error, count } = await q;
  if (error) return bad(500, `Supabase error: ${error.message}`);

  return respond({
    meta: { page, per_page: perPage, total: count ?? 0, has_more: count ? to + 1 < count : false },
    data: data ?? [],
  });
}
