-- Tabela de frases do Silas, o Despachante
-- Identificadas por nome de guerra (user_key), sincronizadas via anon key

create table if not exists public.silas_frases (
  user_key   text primary key,
  frases     jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

alter table public.silas_frases enable row level security;

create policy "leitura publica silas"
  on public.silas_frases for select using (true);

create policy "upsert por user_key silas"
  on public.silas_frases for insert with check (true);

create policy "update por user_key silas"
  on public.silas_frases for update using (true);
