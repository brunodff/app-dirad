/* AuthCard.tsx — Login / Criar conta (React + TS)
   - Login e Signup via Supabase
   - BLOQUEIO de acesso se profiles.approved = false
   - ✅ Aceita QUALQUER e-mail (gmail/hotmail/outlook/etc.)
   - ✅ Signup agora exige selecionar UNIDADE: GAP-MN ou GAP-DF
   - ✅ Envia unidade via user_metadata e (se trigger existir) grava em profiles.unidade
   - ✅ Fallback: se trigger não gravar, tenta upsert em profiles (se policy permitir)
   - ✅ Rodapé: "desenvolvido por 2T Bruno - chefe SEO- GAP MN"
*/

import * as React from "react";
import { useNavigate } from "react-router";
import supabase from "../../utils/supabase";

/* =========================================================
   ÍCONES (inline, sem deps)
========================================================= */
const Eye = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOff = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
    <circle cx="12" cy="12" r="3" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

/* =========================================================
   CONSTANTES / VALIDADORES
========================================================= */
const MIN_LOGIN_LEN = 8;
const MIN_SIGNUP_LEN = 8;

/** ✅ valida e-mail genérico (não restringe domínio) */
const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email.trim());

const isStrongPassword = (pwd: string, minLen = MIN_SIGNUP_LEN) =>
  typeof pwd === "string" && pwd.length >= minLen && /[A-Z]/.test(pwd) && /\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd);

/* =========================================================
   UNIDADES
========================================================= */
const UNIDADES = ["GAP-MN", "GAP-DF"] as const;
type Unidade = (typeof UNIDADES)[number];

/* =========================================================
   TIPOS
========================================================= */
type Mode = "login" | "signup";

type LoginValues = { email: string; password: string };
type SignupValues = { email: string; password: string; confirm: string; unidade: Unidade };

type LoginErrors = Partial<Record<keyof LoginValues, string>>;
type SignupErrors = Partial<Record<keyof SignupValues, string>>;

type AuthValues = LoginValues | SignupValues;
type AuthErrors = LoginErrors | SignupErrors;

/* Helpers de mensagem amigável para erros do Supabase */
function mapSupabaseError(msg?: string): string {
  if (!msg) return "Ops, algo deu errado. Tente novamente.";
  const m = msg.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) return "Credenciais inválidas.";
  if (m.includes("email not confirmed")) return "E-mail não confirmado. Verifique sua caixa de entrada.";
  if (m.includes("rate limit")) return "Muitas tentativas. Aguarde um instante e tente de novo.";
  return msg;
}

/* =========================================================
   HOOK DE FORMULÁRIO (genérico)
========================================================= */
function useAuthForm<TValues extends AuthValues, TErrors extends AuthErrors>(initial: TValues) {
  const [values, setValues] = React.useState<TValues>(initial);
  const [errors, setErrors] = React.useState<TErrors>({} as TErrors);
  const [submitting, setSubmitting] = React.useState(false);

  function setField(name: keyof TValues, value: any) {
    setValues((v) => ({ ...v, [name]: value }));
  }
  function setFieldError(name: keyof TErrors, value: string) {
    setErrors((e) => ({ ...e, [name]: value }));
  }
  function clearErrors() {
    setErrors({} as TErrors);
  }

  return { values, setValues, errors, setErrors, setField, setFieldError, clearErrors, submitting, setSubmitting };
}

/* =========================================================
   INPUT DE SENHA COM TOGGLE (reutilizável)
========================================================= */
type PasswordInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
  label: string;
  hint?: React.ReactNode;
};

function PasswordInput({ error, label, hint, ...rest }: PasswordInputProps) {
  const [show, setShow] = React.useState(false);
  const id = React.useId();

  return (
    <>
      <label className="label" htmlFor={id}>
        {label}
      </label>

      <div className="input-group">
        <input id={id} className={`input has-toggle ${error ? "is-invalid" : ""}`} type={show ? "text" : "password"} {...rest} />
        <button
          type="button"
          className="toggle-btn"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          title={show ? "Ocultar senha" : "Mostrar senha"}
        >
          {show ? <EyeOff /> : <Eye />}
        </button>
      </div>

      {hint && <small className="hint">{hint}</small>}
      {error && <small className="error">{error}</small>}
    </>
  );
}

/* =========================================================
   FORM DE LOGIN (com checagem de approved)
========================================================= */
function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const { values, setField, errors, setFieldError, submitting, setSubmitting, clearErrors } = useAuthForm<LoginValues, LoginErrors>({
    email: "",
    password: "",
  });

  const canSubmit = isValidEmail(values.email) && values.password.length >= MIN_LOGIN_LEN;

  function validateField(name: keyof LoginValues, value: string) {
    if (name === "email") {
      setFieldError("email", !value ? "Informe seu e-mail." : !isValidEmail(value) ? "Digite um e-mail válido." : "");
    }
    if (name === "password") {
      setFieldError("password", value.length < MIN_LOGIN_LEN ? `Mínimo de ${MIN_LOGIN_LEN} caracteres.` : "");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    clearErrors();
    setSubmitting(true);

    try {
      const email = values.email.trim().toLowerCase();

      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password: values.password,
      });

      if (signErr) {
        setFieldError("password", mapSupabaseError(signErr.message));
        return;
      }

      // >>> Checagem de aprovação no PERFIL <<<
      const {
        data: { user },
        error: uErr,
      } = await supabase.auth.getUser();

      if (uErr || !user) {
        await supabase.auth.signOut();
        alert("Não foi possível identificar o usuário logado.");
        return;
      }

      // pega approved (e também unidade só pra já ter disponível, se quiser usar depois)
      const { data: profile, error: pErr } = await supabase.from("profiles").select("approved, unidade").eq("id", user.id).maybeSingle();

      if (pErr) {
        console.error("Erro ao ler profiles:", pErr);
        await supabase.auth.signOut();
        alert("Não foi possível verificar sua aprovação. Tente novamente em instantes.");
        return;
      }

      if (!profile?.approved) {
        await supabase.auth.signOut();
        alert("Seu e-mail foi verificado, mas falta aprovação do administrador.");
        return;
      }

      onSuccess();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <label className="label" htmlFor="login-email">
        E-mail
      </label>
      <input
        id="login-email"
        className={`input ${errors.email ? "is-invalid" : ""}`}
        type="email"
        name="email"
        placeholder="seu@email.com"
        value={values.email}
        onChange={(e) => {
          setField("email", e.target.value);
          validateField("email", e.target.value);
        }}
        autoComplete="email"
      />
      {errors.email && <small className="error">{errors.email}</small>}

      <PasswordInput
        label="Senha"
        name="password"
        placeholder="Sua senha"
        value={values.password}
        onChange={(e) => {
          setField("password", e.currentTarget.value);
          validateField("password", e.currentTarget.value);
        }}
        autoComplete="current-password"
        error={errors.password}
      />

      <button className="btn" type="submit" disabled={!canSubmit || submitting}>
        {submitting ? "Entrando..." : "Entrar"}
      </button>

      <small className="hint center"></small>
    </form>
  );
}

/* =========================================================
   FORM DE SIGNUP (agora com UNIDADE)
========================================================= */
function SignupForm({ onSuccess }: { onSuccess: (pendingEmail?: string) => void }) {
  const { values, setField, errors, setFieldError, submitting, setSubmitting, clearErrors } = useAuthForm<SignupValues, SignupErrors>({
    email: "",
    password: "",
    confirm: "",
    unidade: "GAP-MN",
  });

  const canSubmit =
    isValidEmail(values.email) &&
    isStrongPassword(values.password, MIN_SIGNUP_LEN) &&
    values.password === values.confirm &&
    !!values.unidade;

  function validateAll(v = values) {
    setFieldError("email", !v.email ? "Informe seu e-mail." : !isValidEmail(v.email) ? "Digite um e-mail válido." : "");

    setFieldError(
      "password",
      !isStrongPassword(v.password, MIN_SIGNUP_LEN) ? `Senha forte: ${MIN_SIGNUP_LEN}+ chars, 1 maiúscula, 1 número e 1 caractere especial.` : ""
    );

    setFieldError("confirm", v.confirm !== v.password ? "As senhas não coincidem." : "");

    setFieldError("unidade", !v.unidade ? "Selecione a unidade." : "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    validateAll();
    if (!canSubmit) return;

    clearErrors();
    setSubmitting(true);

    try {
      const email = values.email.trim().toLowerCase();

      const emailRedirectTo = typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";

      // ✅ 1) cria usuário e envia unidade no user_metadata
      const { data, error } = await supabase.auth.signUp({
        email,
        password: values.password,
        options: {
          emailRedirectTo,
          data: {
            unidade: values.unidade, // <- auth.users.raw_user_meta_data
          },
        },
      });

      if (error) {
        const msg = mapSupabaseError(error.message);
        if (msg.toLowerCase().includes("password")) setFieldError("password", msg);
        else setFieldError("email", msg);
        return;
      }

      // ✅ 2) fallback: se tiver sessão/logado (dependendo de config do Supabase), tenta gravar em profiles
      // (se o trigger handle_new_user já existir, isso nem é necessário, mas não atrapalha)
      try {
        const uid = data?.user?.id;
        if (uid) {
          await supabase.from("profiles").upsert({ id: uid, unidade: values.unidade }, { onConflict: "id" });
        }
      } catch {
        // ignora (RLS pode bloquear; trigger deve resolver)
      }

      onSuccess(email);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <label className="label" htmlFor="signup-email">
        E-mail
      </label>
      <input
        id="signup-email"
        className={`input ${errors.email ? "is-invalid" : ""}`}
        type="email"
        name="email"
        placeholder="seu@email.com"
        value={values.email}
        onChange={(e) => {
          const val = e.target.value;
          setField("email", val);
          setFieldError("email", !isValidEmail(val) ? "Digite um e-mail válido." : "");
        }}
        autoComplete="email"
      />
      {errors.email && <small className="error">{errors.email}</small>}

      {/* ✅ NOVO: unidade */}
      <label className="label" htmlFor="signup-unidade">
        Unidade
      </label>
      <select
        id="signup-unidade"
        className={`input ${errors.unidade ? "is-invalid" : ""}`}
        value={values.unidade}
        onChange={(e) => {
          const u = e.target.value as Unidade;
          setField("unidade", u);
          setFieldError("unidade", !u ? "Selecione a unidade." : "");
        }}
      >
        {UNIDADES.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
      {errors.unidade && <small className="error">{errors.unidade}</small>}

      <PasswordInput
        label="Senha"
        name="password"
        placeholder="Crie uma senha forte"
        value={values.password}
        onChange={(e) => {
          const val = e.currentTarget.value;
          setField("password", val);
          setFieldError(
            "password",
            !isStrongPassword(val, MIN_SIGNUP_LEN) ? `Senha forte: ${MIN_SIGNUP_LEN}+ chars, 1 maiúscula, 1 número e 1 caractere especial.` : ""
          );
          if (values.confirm) {
            setFieldError("confirm", values.confirm !== val ? "As senhas não coincidem." : "");
          }
        }}
        autoComplete="new-password"
        hint={
          <>
            Mínimo de <b>{MIN_SIGNUP_LEN}</b> caracteres, com <b>1 maiúscula</b>, <b>1 número</b> e <b>1 caractere especial</b>.
          </>
        }
        error={errors.password}
      />

      <PasswordInput
        label="Repita a senha"
        name="confirm"
        placeholder="Repita a senha"
        value={values.confirm}
        onChange={(e) => {
          const val = e.currentTarget.value;
          setField("confirm", val);
          setFieldError("confirm", val !== values.password ? "As senhas não coincidem." : "");
        }}
        autoComplete="new-password"
        error={errors.confirm}
      />

      <button className="btn" type="submit" disabled={!canSubmit || submitting}>
        {submitting ? "Criando..." : "Criar conta"}
      </button>

      <small className="hint center">Você pode usar gmail, hotmail, outlook, etc.</small>
    </form>
  );
}

/* =========================================================
   CARTÃO PRINCIPAL (tabs + navegação pós-auth)
========================================================= */
export default function AuthCard() {
  const [mode, setMode] = React.useState<Mode>("login");
  const [signupInfo, setSignupInfo] = React.useState<string>("");
  const navigate = useNavigate();

  // >>> Redirecionamento condicional pós-login <<<
  const goToApp = React.useCallback(async () => {
    try {
      const { data: s } = await supabase.auth.getSession();
      const uid = s?.session?.user?.id ?? null;

      if (!uid) {
        navigate("/user", { replace: true });
        return;
      }

      // agora também carrega unidade, caso você queira usar depois no app
      const { data, error } = await supabase.from("profiles").select("role, unidade").eq("id", uid).maybeSingle();

      if (error) throw error;

      const roleRaw = (data?.role as string | undefined) || "USER";
      const role = roleRaw.toUpperCase();

      switch (role) {
        case "CHEFE":
          navigate("/chefe", { replace: true });
          break;
        case "SECRETARIA":
          navigate("/secretaria", { replace: true });
          break;
        case "SDAB":
          navigate("/sdab", { replace: true });
          break;
        case "SDPP":
          navigate("/sdpp", { replace: true });
          break;
        case "SDAP":
          navigate("/sdap", { replace: true });
          break;
        case "DIRAD":
          navigate("/dirad", { replace: true });
          break;
        default:
          navigate("/user", { replace: true });
          break;
      }
    } catch {
      navigate("/user", { replace: true });
    }
  }, [navigate]);

  // Após criar a conta, muda para "Acessar" e mostra aviso no próprio card
  const onSignupSuccess = React.useCallback((pendingEmail?: string) => {
    setMode("login");
    setSignupInfo("Conta criada! Se a confirmação por e-mail estiver ativada, verifique sua caixa de entrada/spam.");
  }, []);

  return (
    <div className="card form-grid auth-card">
      {/* Banner de sucesso (no próprio card) */}
      {signupInfo && (
        <div
          className="hint"
          role="status"
          style={{
            marginBottom: 8,
            border: "1px solid rgba(127,197,255,.35)",
            padding: "8px 10px",
            borderRadius: 10,
            background: "rgba(10,122,65,.15)",
            fontWeight: 800,
          }}
        >
          {signupInfo}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs" role="tablist" aria-label="Alternar autenticação">
        <button
          className={`tab ${mode === "login" ? "active" : ""}`}
          onClick={() => setMode("login")}
          role="tab"
          aria-selected={mode === "login"}
          type="button"
        >
          Acessar
        </button>
        <button
          className={`tab ${mode === "signup" ? "active" : ""}`}
          onClick={() => setMode("signup")}
          role="tab"
          aria-selected={mode === "signup"}
          type="button"
        >
          Criar conta
        </button>
      </div>

      <h2 className="title">{mode === "login" ? "Acessar" : "Criar conta"}</h2>

      {mode === "login" ? <LoginForm onSuccess={goToApp} /> : <SignupForm onSuccess={onSignupSuccess} />}

      {/* ✅ Rodapé */}
      <div
        style={{
          marginTop: 14,
          paddingTop: 10,
          borderTop: "1px solid rgba(255,255,255,.12)",
          textAlign: "center",
          fontSize: 12,
          opacity: 0.85,
          fontWeight: 700,
          letterSpacing: 0.2,
        }}
      >
        Desenvolvido por 2T Bruno - Chefe da SEO - GAP MN
      </div>
    </div>
  );
}
