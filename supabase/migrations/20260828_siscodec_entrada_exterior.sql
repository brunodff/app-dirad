-- Adiciona campo "Com Entrada de Bem do Exterior?" ao pedido SISCODEC
ALTER TABLE public.siscodec_pedidos
  ADD COLUMN IF NOT EXISTS entrada_exterior TEXT NOT NULL DEFAULT 'Não';
