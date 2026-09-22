import { createClient } from '@supabase/supabase-js';

export function criarClienteSupabase(url: string, anonKey: string) {
  return createClient(url, anonKey, {
    realtime: { params: { eventsPerSecond: 10 } },
  });
}
