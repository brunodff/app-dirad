import type { ActionFunctionArgs } from 'react-router';
import { requireUser } from '~/lib/session.server';
import { supabaseAdmin } from '~/lib/supabase.server';

export async function action({ request }: ActionFunctionArgs) {
  try {
    const user = await requireUser(request);
    void supabaseAdmin()
      .from('usuarios')
      .update({ ultimo_acesso: new Date().toISOString() })
      .eq('id', user.user_id);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 401 });
  }
}
