import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { criarClienteSupabase } from './supabase.client';

export type PresencaUsuario = {
  userId: string;
  nome: string;
  perfil: string;
  pagina: string;
  desde: string;
};

export function usePresenca(
  userId: string,
  nome: string,
  perfil: string,
  supabaseUrl: string,
  anonKey: string,
) {
  const location   = useLocation();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const metaRef    = useRef({ userId, nome, perfil });
  metaRef.current  = { userId, nome, perfil };

  useEffect(() => {
    if (!supabaseUrl || !anonKey) return;
    const sb      = criarClienteSupabase(supabaseUrl, anonKey);
    const channel = sb.channel('presenca-comae', {
      config: { presence: { key: userId } },
    });

    channelRef.current = channel;

    channel.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          ...metaRef.current,
          pagina: location.pathname + location.search,
          desde: new Date().toISOString(),
        });
      }
    });

    return () => {
      sb.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId, supabaseUrl, anonKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Atualiza a página corrente sempre que o usuário navega
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.track({
      ...metaRef.current,
      pagina: location.pathname + location.search,
      desde: new Date().toISOString(),
    });
  }, [location.pathname, location.search]);
}
