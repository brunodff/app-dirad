// app/routes/api.send-report.tsx
import type { ActionFunctionArgs } from "react-router";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

/** Resposta JSON curtinha */
function json(data: any, init: number | ResponseInit = 200) {
  const status = typeof init === "number" ? init : (init as ResponseInit).status ?? 200;
  const headers = new Headers(
    typeof init === "number" ? {} : (init as ResponseInit).headers ?? {}
  );
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers });
}

/** Converte base64 para bytes em Edge/Node */
function base64ToBytes(b64: string): Uint8Array | Buffer {
  // Node
  // @ts-ignore
  if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64");
  // Edge
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function loader() {
  return json({ ok: false, error: "Method not allowed" }, 405);
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  // Envs (server) com fallback para VITE_* (dev)
  const SUPABASE_URL =
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const SUPABASE_ANON_KEY =
    process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";
  const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
  const MAIL_FROM =
    process.env.MAIL_FROM ?? "Relatórios DIRAD <onboarding@resend.dev>";

  if (!RESEND_API_KEY) return json({ ok: false, error: "RESEND_API_KEY ausente" }, 500);
  if (!SUPABASE_URL) return json({ ok: false, error: "SUPABASE_URL ausente" }, 500);
  if (!SUPABASE_ANON_KEY) return json({ ok: false, error: "SUPABASE_ANON_KEY ausente" }, 500);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Body inválido (JSON esperado)" }, 400);
  }

  const { filename, pdfBase64 } = body ?? {};
  if (!filename || !pdfBase64) {
    return json({ ok: false, error: "Envie { filename, pdfBase64 }" }, 400);
  }

  // JWT do Supabase (enviado pelo cliente)
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return json({ ok: false, error: "Sem token de autenticação" }, 401);

  // Valida usuário e obtém e-mail com segurança no servidor
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user?.email) {
    return json({ ok: false, error: "Sessão inválida ou e-mail não encontrado" }, 401);
  }

  const toEmail = userData.user.email;
  // Garante que o conteúdo do anexo seja Buffer ou string base64
  let attachmentContent: string | Buffer;
  // @ts-ignore
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(base64ToBytes(pdfBase64))) {
    // Já é Buffer
    attachmentContent = base64ToBytes(pdfBase64) as Buffer;
  } else {
    // Usa string base64
    attachmentContent = pdfBase64;
  }

  // Envia pelo Resend
  const resend = new Resend(RESEND_API_KEY);
  const { error: resendError } = await resend.emails.send({
    from: MAIL_FROM,
    to: [toEmail],
    subject: "Relatório de retirada de faltas",
    text: "Segue em anexo o PDF do relatório de retirada de faltas.",
    attachments: [
      {
        filename,
        content: attachmentContent,             // Buffer ou string base64
        contentType: "application/pdf",
      },
    ],
  });

  if (resendError) {
    return json({ ok: false, error: `Falha Resend: ${resendError.message || "Erro"}` }, 502);
  }

  return json({ ok: true }, 200);
}
