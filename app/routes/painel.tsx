import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { redirect, useLoaderData } from 'react-router';
import { useEffect } from 'react';
import { usePresenca } from '~/lib/usePresenca';
import { requireUser, getSession, commitSession } from '~/lib/session.server';
import type { SessionData } from '~/lib/session.server';
import { supabaseAdmin } from '~/lib/supabase.server';
import { Sidebar } from '~/components/Sidebar';
import { FeedView, type MovimentoRow } from '~/components/FeedView';
import { OperacoesView, type ResumoRow } from '~/components/OperacoesView';
import { PowerBIView } from '~/components/PowerBIView';
import { DevView, type UsuarioAnalytics, type SyncLogRow, type NavegacaoRow } from '~/components/DevView';
import { DesativadosView, type ConfigOperacao, type MovimentoDescartado } from '~/components/DesativadosView';
import { ExecucaoView, type EmpenhoDbRow } from '~/components/ExecucaoView';
import { RascunhoView, type Quadro, type RascunhoItem } from '~/components/RascunhoView';
import { SiscodecView, type SiscodecPedido, type SolicitacaoDesc, type SiscodecModelo } from '~/components/SiscodecView';
import { ConfiguracoesView, type UsuarioGerencial } from '~/components/ConfiguracoesView';
import { FerramentasView } from '~/components/FerramentasView';
import type { FiltrosAtivos, OpcoesFiltro } from '~/components/FilterBar';
import { Tutorial } from '~/components/Tutorial';
import { CONFIG_PADRAO as SISCODEC_CONFIG_PADRAO } from '~/lib/siscodec-doc-config';
import { gerarSiscodecPDF } from '~/lib/gerar-siscodec-pdf.server';
import { classificar } from '~/lib/engine/classificar';
import type { MovimentoCredito, ConfigEngine } from '~/lib/engine/types';

function buildConviteHtml({ email, actionLink, perfil, convidadoPor }: {
  email: string; actionLink: string; perfil: string; convidadoPor: string;
}): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0C1526;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080F1F;padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#0C1526;border-radius:12px;overflow:hidden;max-width:560px;border:1px solid #1E3050;">
  <tr>
    <td style="background:#080F1F;padding:20px 28px;border-bottom:1px solid #1E3050;">
      <p style="margin:0;color:#5FA8E0;font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">COMANDO DE OPERAÇÕES AEROESPACIAIS</p>
      <h1 style="margin:6px 0 0;color:#EAF1FB;font-size:18px;font-weight:700;">COMAE GERENCIAL</h1>
      <p style="margin:2px 0 0;color:#8A97AC;font-size:11px;">Painel Orçamentário</p>
    </td>
  </tr>
  <tr>
    <td style="padding:28px 28px 8px;">
      <p style="margin:0 0 16px;font-size:14px;color:#EAF1FB;line-height:1.6;">
        Você foi convidado(a) por <strong style="color:#5FA8E0;">${convidadoPor}</strong> para acessar o <strong>COMAE GERENCIAL</strong> com o perfil <strong style="color:#5FA8E0;">${perfil}</strong>.
      </p>
      <p style="margin:0 0 20px;font-size:13px;color:#8A97AC;line-height:1.6;">
        Clique no botão abaixo para aceitar o convite e criar sua senha de acesso.
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${actionLink}" target="_blank"
           style="display:inline-block;background:#1E3A6E;color:#5FA8E0;padding:12px 32px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;border:1px solid #5FA8E033;">
          Aceitar convite →
        </a>
      </div>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 28px 24px;border-top:1px solid #1E3050;">
      <p style="margin:0;font-size:11px;color:#4A5B73;line-height:1.6;">
        Este link é válido por 24 horas e de uso único. Se você não esperava este convite, ignore este e-mail.<br>
        E-mail de destino: ${email}
      </p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const ABAS_VALIDAS = [
  'feed', 'operacoes', 'execucao', 'unidades', 'naturezas', 'conferencia',
  'desativados', 'configuracoes', 'power-bi', 'dev', 'rascunho', 'siscodec', 'ferramentas',
] as const;
type AbaId = (typeof ABAS_VALIDAS)[number];

const PODE_EDITAR = ['ADEZ', 'CMT', 'DEV'];

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const fd = await request.formData();
  const intent = String(fd.get('intent') ?? '');
  const db = supabaseAdmin();
  const agora = new Date().toISOString();

  // ── Rascunho (qualquer usuário autenticado) ────────────────────────────

  if (intent === 'criar_quadro') {
    const nome = String(fd.get('nome') ?? 'Novo Quadro').trim() || 'Novo Quadro';
    const { data, error } = await db
      .from('rascunhos')
      .insert({ usuario_id: user.user_id, nome })
      .select('id')
      .single();
    if (error || !data) return Response.json({ erro: 'Erro ao criar quadro' }, { status: 500 });
    return redirect(`/painel?aba=rascunho&quadro=${data.id}`);
  }

  if (intent === 'renomear_quadro') {
    const quadroId = String(fd.get('quadro_id') ?? '');
    const nome = String(fd.get('nome') ?? '').trim();
    if (!quadroId || !nome) return Response.json({ erro: 'Dados inválidos' }, { status: 400 });
    await db.from('rascunhos').update({ nome, atualizado_em: agora })
      .eq('id', quadroId).eq('usuario_id', user.user_id);
    return Response.json({ ok: true });
  }

  if (intent === 'arquivar_quadro') {
    const quadroId = String(fd.get('quadro_id') ?? '');
    if (!quadroId) return Response.json({ erro: 'Quadro inválido' }, { status: 400 });
    await db.from('rascunhos').update({ arquivado: true, atualizado_em: agora })
      .eq('id', quadroId).eq('usuario_id', user.user_id);
    return redirect('/painel?aba=rascunho');
  }

  if (intent === 'atualizar_nota') {
    const quadroId = String(fd.get('quadro_id') ?? '');
    const nota = String(fd.get('nota') ?? '');
    if (!quadroId) return Response.json({ erro: 'Quadro inválido' }, { status: 400 });
    await db.from('rascunhos').update({ nota, atualizado_em: agora })
      .eq('id', quadroId).eq('usuario_id', user.user_id);
    return Response.json({ ok: true });
  }

  if (intent === 'adicionar_ncs') {
    const quadroId = String(fd.get('quadro_id') ?? '');
    const ncsRaw  = String(fd.get('ncs') ?? '');
    if (!quadroId) return Response.json({ erro: 'Quadro inválido' }, { status: 400 });

    // Verify ownership
    const { data: quadro } = await db.from('rascunhos').select('id')
      .eq('id', quadroId).eq('usuario_id', user.user_id).single();
    if (!quadro) return Response.json({ erro: 'Quadro não encontrado' }, { status: 404 });

    const ncs = ncsRaw.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    if (ncs.length === 0) return Response.json({ erro: 'Nenhuma NC informada' }, { status: 400 });

    const { data: existing } = await db.from('rascunho_itens')
      .select('referencia, ordem').eq('rascunho_id', quadroId).eq('tipo', 'nc');
    const existingRefs = new Set((existing ?? []).map(i => i.referencia as string));
    const maxOrdem = Math.max(0, ...(existing ?? []).map(i => i.ordem as number));

    const novas = ncs.filter(nc => !existingRefs.has(nc));
    if (novas.length > 0) {
      await db.from('rascunho_itens').insert(
        novas.map((nc, idx) => ({ rascunho_id: quadroId, tipo: 'nc', referencia: nc, ordem: maxOrdem + idx + 1 })),
      );
      await db.from('rascunhos').update({ atualizado_em: agora }).eq('id', quadroId);
    }
    return Response.json({ ok: true, adicionados: novas.length, duplicatas: ncs.length - novas.length });
  }

  if (intent === 'adicionar_operacao') {
    const quadroId = String(fd.get('quadro_id') ?? '');
    const operacao = String(fd.get('operacao') ?? '').trim();
    if (!quadroId || !operacao) return Response.json({ erro: 'Dados inválidos' }, { status: 400 });

    const { data: quadro } = await db.from('rascunhos').select('id')
      .eq('id', quadroId).eq('usuario_id', user.user_id).single();
    if (!quadro) return Response.json({ erro: 'Quadro não encontrado' }, { status: 404 });

    const { data: dup } = await db.from('rascunho_itens').select('id')
      .eq('rascunho_id', quadroId).eq('tipo', 'operacao').eq('referencia', operacao).maybeSingle();
    if (dup) return Response.json({ ok: true, duplicata: true });

    const { data: last } = await db.from('rascunho_itens').select('ordem')
      .eq('rascunho_id', quadroId).order('ordem', { ascending: false }).limit(1).maybeSingle();
    await db.from('rascunho_itens').insert({
      rascunho_id: quadroId, tipo: 'operacao', referencia: operacao,
      ordem: (last?.ordem ?? 0) + 1,
    });
    await db.from('rascunhos').update({ atualizado_em: agora }).eq('id', quadroId);
    return Response.json({ ok: true });
  }

  if (intent === 'remover_item') {
    const quadroId = String(fd.get('quadro_id') ?? '');
    const itemId   = Number(fd.get('item_id') ?? 0);
    if (!quadroId || !itemId) return Response.json({ erro: 'Dados inválidos' }, { status: 400 });

    const { data: quadro } = await db.from('rascunhos').select('id')
      .eq('id', quadroId).eq('usuario_id', user.user_id).single();
    if (!quadro) return Response.json({ erro: 'Acesso negado' }, { status: 403 });

    await db.from('rascunho_itens').delete().eq('id', itemId).eq('rascunho_id', quadroId);
    await db.from('rascunhos').update({ atualizado_em: agora }).eq('id', quadroId);
    return Response.json({ ok: true });
  }

  // ── SISCODEC (qualquer usuário autenticado) ───────────────────────────

  if (intent === 'criar_pedido') {
    const obs              = String(fd.get('obs')              ?? '').trim();
    const descricao        = String(fd.get('descricao')        ?? '').trim() || obs;
    const operacao         = String(fd.get('operacao')         ?? '').trim();
    const destaque         = String(fd.get('destaque')         ?? '').trim();
    const entrada_exterior = String(fd.get('entrada_exterior') ?? 'Não').trim();
    const celulaRaw = String(fd.get('celulas')   ?? '[]');

    let celulas: { tipo: string; ptres: string; nd: string; valor: number; ug_exec?: string | null; esfera?: string | null; fonte?: string | null; plano_interno?: string | null; ug_cred?: string | null; obs_linha1?: string | null; obs_linha2?: string | null }[] = [];
    try { celulas = JSON.parse(celulaRaw); } catch { /* falls through */ }
    if (!descricao || !destaque || celulas.length === 0) {
      return Response.json({ erro: 'Obs/Descr, destaque e ao menos uma célula são obrigatórios.' }, { status: 400 });
    }

    const solIdBase  = Number(fd.get('sol_id_base') ?? 0) || null;
    const numDescRaw = Number(fd.get('num_desc') ?? 0);
    const numDesc    = numDescRaw > 0 ? numDescRaw : null;

    const { data: pedido, error } = await db
      .from('siscodec_pedidos')
      .insert({ criado_por: user.user_id, descricao, operacao, destaque, entrada_exterior, obs, status: 'PENDENTE', num_desc: numDesc })
      .select('id').single();

    if (error || !pedido) return Response.json({ erro: 'Erro ao criar pedido' }, { status: 500 });

    await db.from('siscodec_celulas').insert(
      celulas.map((c, i) => ({
        pedido_id: pedido.id, ordem: i + 1,
        tipo: c.tipo, ptres: c.ptres, nd: c.nd, valor: c.valor,
        ug_exec:       c.ug_exec       ?? null,
        esfera:        c.esfera        ?? null,
        fonte:         c.fonte         ?? null,
        plano_interno: c.plano_interno ?? null,
        ug_cred:       c.ug_cred       ?? null,
        obs_linha1:    c.obs_linha1    ?? null,
        obs_linha2:    c.obs_linha2    ?? null,
      })),
    );

    let solicitacao = null;
    if (solIdBase) {
      const { data: sol } = await db.from('solicitacoes_desc')
        .update({ status: 'SOLICITADA' })
        .eq('id', solIdBase)
        .select('*')
        .single();
      solicitacao = sol;
    }

    return Response.json({ ok: true, solicitacao, pedidoId: pedido.id, operacao, destaque, numDesc });
  }

  // ── MODELOS SISCODEC ─────────────────────────────────────────────────────
  if (intent === 'criar_modelo' || intent === 'editar_modelo') {
    if (!['ADEZ', 'CMT', 'DEV'].includes(user.perfil)) {
      return Response.json({ erro: 'Sem permissão.' }, { status: 403 });
    }
    const operacao         = String(fd.get('operacao')         ?? '').trim();
    const obs              = String(fd.get('obs')              ?? '').trim() || null;
    const destaque         = String(fd.get('destaque')         ?? 'Não').trim();
    const entrada_exterior = String(fd.get('entrada_exterior') ?? 'Não').trim();
    const celulaRaw = String(fd.get('celulas_modelo') ?? '[]');
    let celulas: unknown[] = [];
    try { celulas = JSON.parse(celulaRaw); } catch { /* falls through */ }
    if (!operacao) return Response.json({ erro: 'Operação obrigatória.' }, { status: 400 });

    if (intent === 'criar_modelo') {
      await db.from('siscodec_modelos').insert({
        operacao, obs, destaque, entrada_exterior, celulas,
        criado_por: user.user_id,
        criado_por_nome: user.nome ?? null,
      });
    } else {
      const modeloId = Number(fd.get('modelo_id') ?? 0);
      await db.from('siscodec_modelos').update({
        operacao, obs, destaque, entrada_exterior, celulas,
        atualizado_em: new Date().toISOString(),
      }).eq('id', modeloId);
    }
    return Response.json({ ok: true });
  }

  if (intent === 'excluir_modelo') {
    if (!['ADEZ', 'CMT', 'DEV'].includes(user.perfil)) {
      return Response.json({ erro: 'Sem permissão.' }, { status: 403 });
    }
    const modeloId = Number(fd.get('modelo_id') ?? 0);
    if (!modeloId) return Response.json({ erro: 'ID inválido.' }, { status: 400 });
    await db.from('siscodec_modelos').delete().eq('id', modeloId);
    return Response.json({ ok: true });
  }

  if (intent === 'cancelar_pedido') {
    const pedidoId = Number(fd.get('pedido_id') ?? 0);
    if (!pedidoId) return Response.json({ erro: 'ID inválido' }, { status: 400 });
    await db.from('siscodec_pedidos')
      .update({ status: 'CANCELADO' })
      .eq('id', pedidoId)
      .eq('criado_por', user.user_id);
    return Response.json({ ok: true });
  }

  if (intent === 'excluir_pedido') {
    if (!['ADEZ', 'CMT', 'DEV'].includes(user.perfil)) {
      return Response.json({ erro: 'Sem permissão.' }, { status: 403 });
    }
    const pedidoId = Number(fd.get('pedido_id') ?? 0);
    if (!pedidoId) return Response.json({ erro: 'ID inválido' }, { status: 400 });
    await db.from('siscodec_celulas').delete().eq('pedido_id', pedidoId);
    await db.from('siscodec_pedidos').delete().eq('id', pedidoId);
    return Response.json({ ok: true });
  }

  if (intent === 'criar_solicitacao') {
    const dataOficio = String(fd.get('data_oficio') ?? '').trim();
    const ugrSigla   = String(fd.get('ugr_sigla')   ?? '').trim();
    const ndCod      = String(fd.get('nd_cod')       ?? '').trim();
    const valor      = parseFloat(String(fd.get('valor') ?? '0')) || 0;
    const descricao  = String(fd.get('descricao')    ?? '').trim();
    const operacao   = String(fd.get('operacao')     ?? '').trim();

    if (!dataOficio || !ugrSigla || !ndCod || !descricao || valor <= 0) {
      return Response.json({ erro: 'Preencha todos os campos obrigatórios.' }, { status: 400 });
    }

    // Duplicate detection: check same ugr_sigla + data_oficio (excluding CANCELADA)
    const { data: existente } = await db.from('solicitacoes_desc')
      .select('id')
      .eq('ugr_sigla', ugrSigla)
      .eq('data_oficio', dataOficio)
      .neq('status', 'CANCELADA')
      .maybeSingle();

    const aviso = existente
      ? `Atenção: já existe uma solicitação de ${ugrSigla} nesta data.`
      : undefined;

    const { data: sol } = await db.from('solicitacoes_desc').insert({
      status: 'AGUARDANDO',
      data_oficio: dataOficio,
      ugr_sigla: ugrSigla,
      nd_cod: ndCod,
      nd_nome: '',
      valor,
      descricao,
      operacao,
      criado_por: user.user_id,
    }).select('*').single();
    return Response.json({ ok: true, solicitacao: sol, aviso });
  }

  if (intent === 'cancelar_solicitacao') {
    const solId = Number(fd.get('sol_id') ?? 0);
    if (!solId) return Response.json({ erro: 'ID inválido' }, { status: 400 });
    await db.from('solicitacoes_desc')
      .update({ status: 'CANCELADA' })
      .eq('id', solId)
      .eq('criado_por', user.user_id)
      .eq('status', 'AGUARDANDO');
    return Response.json({ ok: true });
  }

  if (intent === 'regenerar_token') {
    const { randomUUID } = await import('crypto');
    const novoToken = randomUUID();
    await db.from('usuarios').update({ api_token: novoToken }).eq('id', user.user_id);
    return Response.json({ ok: true });
  }

  if (intent === 'atualizar_meu_perfil') {
    const posto      = String(fd.get('posto')       ?? '').trim();
    const nomeGuerra = String(fd.get('nome_guerra') ?? '').trim();
    const unidade    = String(fd.get('unidade')     ?? '').trim();
    const novaSenha  = String(fd.get('nova_senha')  ?? '');

    if (novaSenha && novaSenha.length < 8) {
      return Response.json({ erro: 'A senha deve ter ao menos 8 caracteres.' }, { status: 400 });
    }

    const nomeCompleto = posto && nomeGuerra ? `${posto} ${nomeGuerra}`.trim() : undefined;

    const updates: Record<string, unknown> = {};
    if (posto)         updates.posto       = posto;
    if (nomeGuerra)    updates.nome_guerra = nomeGuerra;
    if (unidade)       updates.unidade     = unidade;
    if (nomeCompleto)  updates.nome        = nomeCompleto;

    if (Object.keys(updates).length > 0) {
      await db.from('usuarios').update(updates).eq('id', user.user_id);
    }

    if (novaSenha) {
      await db.auth.admin.updateUserById(user.user_id, { password: novaSenha });
    }

    // Atualiza o nome na sessão para refletir imediatamente na sidebar
    if (nomeCompleto) {
      const session = await getSession(request);
      const atual = session.get('user') as SessionData;
      session.set('user', { ...atual, nome: nomeCompleto });
      const cookie = await commitSession(session);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie },
      });
    }

    return Response.json({ ok: true });
  }

  // ── Intents que exigem permissão editorial ────────────────────────────

  if (!PODE_EDITAR.includes(user.perfil)) {
    return Response.json({ erro: 'Acesso negado' }, { status: 403 });
  }

  if (intent === 'descartar_movimento') {
    const movId = Number(fd.get('movimento_id') ?? 0);
    const motivo = String(fd.get('motivo') ?? '').trim();
    if (!movId || motivo.length < 10) {
      return Response.json({ erro: 'Dados inválidos' }, { status: 400 });
    }
    await db.from('movimentos_descartados').upsert({
      movimento_id: movId, ativo: false, motivo,
      descartado_por: user.user_id, descartado_em: agora,
      reativado_por: null, reativado_em: null,
    }, { onConflict: 'movimento_id' });
    await db.from('eventos_auditoria').insert({
      usuario_id: user.user_id, tipo: 'EXCLUIR', entidade: 'movimentos_descartados',
      entidade_id: String(movId), dados_depois: { movimento_id: movId, motivo, ativo: false },
    });
    return Response.json({ ok: true });
  }

  if (intent === 'reativar_movimento') {
    const movId = Number(fd.get('movimento_id') ?? 0);
    if (!movId) return Response.json({ erro: 'ID inválido' }, { status: 400 });
    await db.from('movimentos_descartados').update({
      ativo: true, reativado_por: user.user_id, reativado_em: agora,
    }).eq('movimento_id', movId);
    await db.from('eventos_auditoria').insert({
      usuario_id: user.user_id, tipo: 'REINCLUIR', entidade: 'movimentos_descartados',
      entidade_id: String(movId), dados_depois: { movimento_id: movId, ativo: true },
    });
    return Response.json({ ok: true });
  }

  if (intent === 'atender_solicitacao') {
    const solId = Number(fd.get('sol_id') ?? 0);
    if (!solId) return Response.json({ erro: 'ID inválido' }, { status: 400 });
    await db.from('solicitacoes_desc')
      .update({ status: 'ATENDIDA', atendido_por: user.user_id, atendido_em: agora })
      .eq('id', solId);
    return Response.json({ ok: true });
  }

  if (intent === 'excluir_solicitacao') {
    if (!PODE_EDITAR.includes(user.perfil)) return Response.json({ erro: 'Sem permissão' }, { status: 403 });
    const solId = Number(fd.get('sol_id') ?? 0);
    if (!solId) return Response.json({ erro: 'ID inválido' }, { status: 400 });
    await db.from('solicitacoes_desc').delete().eq('id', solId).in('status', ['AGUARDANDO', 'ATENDIDA']);
    return Response.json({ ok: true });
  }

  if (intent === 'enviar_solicitacao_email') {
    const solId = Number(fd.get('sol_id') ?? 0);
    if (!solId) return Response.json({ erro: 'ID inválido' }, { status: 400 });
    const { data: sol } = await db.from('solicitacoes_desc').select('*').eq('id', solId).single();
    if (!sol) return Response.json({ erro: 'Solicitação não encontrada' }, { status: 404 });

    const destinatario = String(fd.get('destinatario') ?? '').trim().toLowerCase();
    if (!destinatario || !destinatario.includes('@')) {
      return Response.json({ erro: 'Informe um email de destinatário válido.' }, { status: 400 });
    }
    const resendKey  = process.env['RESEND_API_KEY'] ?? '';
    const resendFrom = process.env['RESEND_FROM'] ?? 'COMAE GERENCIAL <noreply@comaegerencial.app>';
    if (!resendKey) return Response.json({ erro: 'Email não configurado no servidor' }, { status: 500 });

    const dataFmt  = new Date(`${sol.data_oficio}T00:00:00`).toLocaleDateString('pt-BR');
    const valorFmt = Number(sol.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0C1526;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080F1F;padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#0C1526;border-radius:12px;overflow:hidden;max-width:560px;border:1px solid #1E3050;">
  <tr>
    <td style="background:#080F1F;padding:20px 28px;border-bottom:1px solid #1E3050;">
      <p style="margin:0;color:#5FA8E0;font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">COMANDO DE OPERAÇÕES AEROESPACIAIS</p>
      <h1 style="margin:6px 0 0;color:#EAF1FB;font-size:18px;font-weight:700;">Solicitação de Descentralização</h1>
    </td>
  </tr>
  <tr>
    <td style="padding:24px 28px 8px;">
      <p style="margin:0 0 20px;font-size:13px;color:#EAF1FB;line-height:1.6;">
        Uma nova solicitação de descentralização foi registrada no COMAE GERENCIAL e aguarda aprovação.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #1E3050;">
            <p style="margin:0;font-size:10px;color:#8A97AC;text-transform:uppercase;letter-spacing:1px;">Unidade Solicitante</p>
            <p style="margin:4px 0 0;font-size:15px;font-weight:700;color:#EAF1FB;">${sol.ugr_sigla}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #1E3050;">
            <p style="margin:0;font-size:10px;color:#8A97AC;text-transform:uppercase;letter-spacing:1px;">Data do Ofício</p>
            <p style="margin:4px 0 0;font-size:13px;color:#EAF1FB;">${dataFmt}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #1E3050;">
            <p style="margin:0;font-size:10px;color:#8A97AC;text-transform:uppercase;letter-spacing:1px;">Natureza da Despesa</p>
            <p style="margin:4px 0 0;font-size:13px;color:#EAF1FB;">${sol.nd_cod} — ${sol.nd_nome}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #1E3050;">
            <p style="margin:0;font-size:10px;color:#8A97AC;text-transform:uppercase;letter-spacing:1px;">Valor Solicitado</p>
            <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#5FA8E0;">${valorFmt}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;">
            <p style="margin:0;font-size:10px;color:#8A97AC;text-transform:uppercase;letter-spacing:1px;">Descrição</p>
            <p style="margin:4px 0 0;font-size:13px;color:#EAF1FB;line-height:1.6;">${sol.descricao}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 28px 24px;border-top:1px solid #1E3050;">
      <p style="margin:0;font-size:11px;color:#4A5B73;line-height:1.6;">
        Registrado em COMAE GERENCIAL por ${user.nome} em ${new Date().toLocaleString('pt-BR')}.
      </p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: resendFrom,
        to: [destinatario],
        subject: `Solicitação de Descentralização — ${sol.ugr_sigla} (${dataFmt}) — ${valorFmt}`,
        html,
      }),
    });
    if (!res.ok) return Response.json({ erro: 'Falha ao enviar email' }, { status: 500 });
    return Response.json({ ok: true });
  }

  if (intent === 'enviar_doc_pdf') {
    if (!PODE_EDITAR.includes(user.perfil)) return Response.json({ erro: 'Sem permissão' }, { status: 403 });
    const pedidoId = Number(fd.get('pedido_id') ?? 0);
    if (!pedidoId) return Response.json({ erro: 'ID inválido' }, { status: 400 });

    const { data: pedido } = await db
      .from('siscodec_pedidos')
      .select('*, siscodec_celulas(*)')
      .eq('id', pedidoId)
      .single();
    if (!pedido) return Response.json({ erro: 'Pedido não encontrado' }, { status: 404 });

    const resendKey  = process.env['RESEND_API_KEY'] ?? '';
    const resendFrom = process.env['RESEND_FROM'] ?? 'COMAE GERENCIAL <noreply@comaegerencial.app>';
    if (!resendKey) return Response.json({ erro: 'Email não configurado no servidor' }, { status: 500 });

    let cfg: Record<string, string> = {};
    try { cfg = JSON.parse(String(fd.get('config') ?? '{}')); } catch { /* uses defaults */ }
    const mergedCfg = { ...SISCODEC_CONFIG_PADRAO, ...cfg };

    const celulas = (pedido.siscodec_celulas as Array<{
      ordem: number; tipo: string; ptres: string; nd: string; valor: number;
      obs_linha1?: string | null; obs_linha2?: string | null;
    }>)
      .sort((a, b) => a.ordem - b.ordem)
      .map(c => ({
        tipo:  c.tipo as 'ANULACAO' | 'SUPLEMENTACAO',
        ptres: c.ptres,
        nd:    c.nd,
        valor: c.valor,
        obs:   [c.obs_linha1, c.obs_linha2].filter(Boolean).join(' / '),
      }));

    const pdfBytes = await gerarSiscodecPDF({
      operacao:          String(fd.get('operacao') ?? pedido.operacao ?? 'N/A'),
      num_desc:          String(fd.get('num_desc') ?? 'XXX'),
      num_dor:           String(fd.get('num_dor')  ?? 'XX'),
      destaque:          pedido.destaque ?? 'Nao',
      signatario:        mergedCfg.signatario,
      pag:               mergedCfg.pag,
      ug_exec_an_cod:    mergedCfg.ug_exec_an_cod,
      ug_exec_an_sigla:  mergedCfg.ug_exec_an_sigla,
      ug_exec_sup_cod:   mergedCfg.ug_exec_sup_cod,
      ug_exec_sup_sigla: mergedCfg.ug_exec_sup_sigla,
      ug_cred_an_cod:    mergedCfg.ug_cred_an_cod,
      ug_cred_an_sigla:  mergedCfg.ug_cred_an_sigla,
      ug_cred_sup_cod:   mergedCfg.ug_cred_sup_cod,
      ug_cred_sup_sigla: mergedCfg.ug_cred_sup_sigla,
      fonte:             mergedCfg.fonte,
      esfera:            mergedCfg.esfera,
      plano_interno:     mergedCfg.plano_interno,
      celulas,
    });

    const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
    const destinatario = mergedCfg.email_destinatario?.trim().toLowerCase();
    if (!destinatario?.includes('@')) return Response.json({ erro: 'Email destinatário inválido' }, { status: 400 });

    const opNome = String(fd.get('operacao') ?? pedido.operacao ?? 'COMAE');
    const numDesc = String(fd.get('num_desc') ?? 'XXX');
    const htmlEmail = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;max-width:560px;border:1px solid #ddd;">
  <tr><td style="background:#0C1526;padding:20px 28px;">
    <p style="margin:0;color:#5FA8E0;font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">COMANDO DE OPERACOES AEROESPACIAIS</p>
    <h1 style="margin:6px 0 0;color:#fff;font-size:18px;font-weight:700;">Solicitacao de Descentralizacao</h1>
    <p style="margin:4px 0 0;color:#8A97AC;font-size:11px;">${numDesc}/D10 — ${opNome}</p>
  </td></tr>
  <tr><td style="padding:24px 28px;">
    <p style="margin:0 0 16px;font-size:14px;color:#333;line-height:1.6;">
      O documento de Solicitacao de Descentralizacao referente a operacao <strong>${opNome}</strong> esta disponivel em anexo para aprovacao e assinatura.
    </p>
    <p style="margin:0;font-size:11px;color:#999;">Gerado por ${user.nome} em ${new Date().toLocaleString('pt-BR')}.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: resendFrom,
        to: [destinatario],
        subject: `Solicitacao de Descentralizacao — ${opNome} — ${numDesc}/D10`,
        html: htmlEmail,
        attachments: [{ filename: `solicitacao-desc-${opNome.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`, content: pdfBase64 }],
      }),
    });
    if (!emailRes.ok) return Response.json({ erro: 'Falha ao enviar email' }, { status: 500 });
    return Response.json({ ok: true, destinatario });
  }

  if (intent === 'desativar') {
    const operacao = String(fd.get('operacao') ?? '');
    const motivo   = String(fd.get('motivo') ?? '').trim();
    if (!operacao || motivo.length < 10) {
      return Response.json({ erro: 'Motivo obrigatório (mín. 10 caracteres)' }, { status: 400 });
    }
    await db.from('config_operacoes').upsert({
      operacao, ativo: false, desativado_por: user.user_id, desativado_em: agora, motivo,
    });
    await db.from('eventos_auditoria').insert({
      usuario_id: user.user_id, tipo: 'EXCLUIR', entidade: 'config_operacoes',
      entidade_id: operacao, dados_depois: { operacao, motivo, ativo: false },
    });
    return Response.json({ ok: true });
  }

  if (intent === 'reativar') {
    const operacao = String(fd.get('operacao') ?? '');
    if (!operacao) return Response.json({ erro: 'Operação inválida' }, { status: 400 });
    await db.from('config_operacoes').update({
      ativo: true, reativado_por: user.user_id, reativado_em: agora,
    }).eq('operacao', operacao);
    await db.from('eventos_auditoria').insert({
      usuario_id: user.user_id, tipo: 'REINCLUIR', entidade: 'config_operacoes',
      entidade_id: operacao, dados_depois: { operacao, ativo: true },
    });
    return Response.json({ ok: true });
  }

  // ── Configurações / Gerenciamento de usuários ─────────────────────────

  if (intent === 'convidar_usuario') {
    const email      = String(fd.get('email')  ?? '').trim().toLowerCase();
    const novoPerfil = String(fd.get('perfil') ?? 'USER');

    if (!email) return Response.json({ erro: 'E-mail obrigatório.' }, { status: 400 });

    // Valida permissão do usuário atual
    const permitidos: Record<string, string[]> = {
      DEV: ['USER', 'ADEZ', 'CMT', 'DEV', 'AUXILIAR'],
      CMT: ['USER', 'ADEZ', 'CMT'],
      ADEZ: ['USER', 'ADEZ'],
    };
    const podeAtribuir = permitidos[user.perfil] ?? [];
    if (!podeAtribuir.includes(novoPerfil)) {
      return Response.json({ erro: 'Você não tem permissão para atribuir esse perfil.' }, { status: 403 });
    }

    // Limite de ADEZ
    if (novoPerfil === 'ADEZ') {
      const { count } = await db.from('usuarios').select('*', { count: 'exact', head: true })
        .eq('perfil', 'ADEZ').eq('ativo', true);
      if ((count ?? 0) >= 4) {
        return Response.json({ erro: 'Limite de 4 usuários ADEZ já atingido.' }, { status: 400 });
      }
    }

    // Limite de AUXILIAR
    if (novoPerfil === 'AUXILIAR') {
      const { count } = await db.from('usuarios').select('*', { count: 'exact', head: true })
        .eq('perfil', 'AUXILIAR').eq('ativo', true);
      if ((count ?? 0) >= 2) {
        return Response.json({ erro: 'Limite de 2 usuários AUXILIAR já atingido.' }, { status: 400 });
      }
    }

    // Verifica e-mail já cadastrado
    const { data: existe } = await db.from('usuarios').select('id').eq('email', email).maybeSingle();
    if (existe) return Response.json({ erro: 'Este e-mail já está cadastrado.' }, { status: 400 });

    // Gera o link de convite sem enviar e-mail pelo Supabase
    const appUrl = process.env['APP_URL'] ?? 'https://comaegerencial.app';
    const { data: linkData, error: linkErr } = await db.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${appUrl}/aceite-convite` },
    });
    if (linkErr || !linkData?.user) {
      return Response.json({ erro: linkErr?.message ?? 'Erro ao gerar convite.' }, { status: 500 });
    }

    // Cria registro em usuarios (ativo=false até o usuário completar o perfil)
    await db.from('usuarios').upsert({
      id: linkData.user.id,
      email,
      perfil: novoPerfil,
      nome: email,
      ativo: false,
    }, { onConflict: 'id' });

    // Envia e-mail de convite via Resend
    const actionLink = linkData.properties?.action_link ?? '';
    const resendKey  = process.env['RESEND_API_KEY'] ?? '';
    const resendFrom = process.env['RESEND_FROM'] ?? 'COMAE GERENCIAL <noreply@comaegerencial.app>';

    if (resendKey && actionLink) {
      const html = buildConviteHtml({ email, actionLink, perfil: novoPerfil, convidadoPor: user.nome });
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: resendFrom,
          to: [email],
          subject: 'Convite para COMAE GERENCIAL',
          html,
        }),
      });
    }

    return Response.json({ ok: true });
  }

  if (intent === 'alterar_perfil') {
    const usuarioId  = String(fd.get('usuario_id')  ?? '');
    const novoPerfil = String(fd.get('novo_perfil') ?? '');
    if (!usuarioId || !novoPerfil) return Response.json({ erro: 'Dados inválidos.' }, { status: 400 });

    const permitidos: Record<string, string[]> = {
      DEV: ['USER', 'ADEZ', 'CMT', 'DEV', 'AUXILIAR'],
      CMT: ['USER', 'ADEZ', 'CMT'],
      ADEZ: ['USER', 'ADEZ'],
    };
    if (!(permitidos[user.perfil] ?? []).includes(novoPerfil)) {
      return Response.json({ erro: 'Permissão insuficiente.' }, { status: 403 });
    }

    if (novoPerfil === 'ADEZ') {
      const { count } = await db.from('usuarios').select('*', { count: 'exact', head: true })
        .eq('perfil', 'ADEZ').eq('ativo', true).neq('id', usuarioId);
      if ((count ?? 0) >= 4) {
        return Response.json({ erro: 'Limite de 4 ADEZ já atingido.' }, { status: 400 });
      }
    }

    if (novoPerfil === 'AUXILIAR') {
      const { count } = await db.from('usuarios').select('*', { count: 'exact', head: true })
        .eq('perfil', 'AUXILIAR').eq('ativo', true).neq('id', usuarioId);
      if ((count ?? 0) >= 2) {
        return Response.json({ erro: 'Limite de 2 AUXILIAR já atingido.' }, { status: 400 });
      }
    }

    await db.from('usuarios').update({ perfil: novoPerfil }).eq('id', usuarioId);
    return Response.json({ ok: true });
  }

  if (intent === 'desativar_usuario') {
    const usuarioId = String(fd.get('usuario_id') ?? '');
    if (!usuarioId) return Response.json({ erro: 'Dados inválidos.' }, { status: 400 });
    if (usuarioId === user.user_id) return Response.json({ erro: 'Você não pode desativar sua própria conta.' }, { status: 400 });
    if (user.perfil !== 'DEV') {
      const { data: alvo } = await db.from('usuarios').select('perfil').eq('id', usuarioId).single();
      if (alvo?.perfil === 'DEV') return Response.json({ erro: 'Apenas DEV pode desativar outra conta DEV.' }, { status: 403 });
    }
    await db.from('usuarios').update({ ativo: false }).eq('id', usuarioId);
    return Response.json({ ok: true });
  }

  if (intent === 'ativar_usuario') {
    const usuarioId = String(fd.get('usuario_id') ?? '');
    if (!usuarioId) return Response.json({ erro: 'Dados inválidos.' }, { status: 400 });
    await db.from('usuarios').update({ ativo: true }).eq('id', usuarioId);
    return Response.json({ ok: true });
  }

  if (intent === 'excluir_usuario') {
    const usuarioId = String(fd.get('usuario_id') ?? '');
    if (!usuarioId) return Response.json({ erro: 'Dados inválidos.' }, { status: 400 });
    if (usuarioId === user.user_id) return Response.json({ erro: 'Você não pode excluir sua própria conta.' }, { status: 400 });
    const { data: alvo } = await db.from('usuarios').select('perfil, ativo').eq('id', usuarioId).single();
    if (alvo?.ativo) return Response.json({ erro: 'Desative o usuário antes de excluir.' }, { status: 400 });
    if (alvo?.perfil === 'DEV' && user.perfil !== 'DEV') return Response.json({ erro: 'Apenas DEV pode excluir outra conta DEV.' }, { status: 403 });

    // Limpa FKs antes de excluir do auth (que cascateia para usuarios)
    const errosLimpeza: string[] = [];
    const ck = (label: string, error: unknown) => { if (error) errosLimpeza.push(`${label}: ${(error as Record<string,unknown>)?.message ?? JSON.stringify(error)}`); };

    ck('sessoes',              (await db.from('sessoes').delete().eq('usuario_id', usuarioId)).error);
    ck('eventos_auditoria',    (await db.from('eventos_auditoria').update({ usuario_id: null }).eq('usuario_id', usuarioId)).error);
    ck('notificacoes',         (await db.from('notificacoes').delete().eq('usuario_id', usuarioId)).error);
    const { data: quadros } = await db.from('rascunhos').select('id').eq('usuario_id', usuarioId);
    if (quadros?.length) {
      ck('rascunho_itens',     (await db.from('rascunho_itens').delete().in('rascunho_id', quadros.map(q => q.id))).error);
    }
    ck('rascunhos',            (await db.from('rascunhos').delete().eq('usuario_id', usuarioId)).error);
    ck('overrides',            (await db.from('overrides').update({ usuario_id: user.user_id }).eq('usuario_id', usuarioId)).error);
    ck('excecoes_nc',          (await db.from('excecoes_nc').update({ criado_por: null }).eq('criado_por', usuarioId)).error);
    ck('mov_desc.descartado',  (await db.from('movimentos_descartados').update({ descartado_por: null }).eq('descartado_por', usuarioId)).error);
    ck('mov_desc.reativado',   (await db.from('movimentos_descartados').update({ reativado_por: null }).eq('reativado_por', usuarioId)).error);
    ck('config_op.desativado', (await db.from('config_operacoes').update({ desativado_por: null }).eq('desativado_por', usuarioId)).error);
    ck('config_op.reativado',  (await db.from('config_operacoes').update({ reativado_por: null }).eq('reativado_por', usuarioId)).error);
    ck('siscodec.criado',      (await db.from('siscodec_pedidos').update({ criado_por: user.user_id }).eq('criado_por', usuarioId)).error);
    ck('siscodec.concluido',   (await db.from('siscodec_pedidos').update({ concluido_por: null }).eq('concluido_por', usuarioId)).error);
    ck('solicitacoes.criado',  (await db.from('solicitacoes_desc').update({ criado_por: null }).eq('criado_por', usuarioId)).error);
    ck('solicitacoes.atendido',(await db.from('solicitacoes_desc').update({ atendido_por: null }).eq('atendido_por', usuarioId)).error);

    if (errosLimpeza.length) {
      return Response.json({ erro: 'Erro na limpeza FK: ' + errosLimpeza.join(' | ') }, { status: 500 });
    }

    const { error: authErr } = await db.auth.admin.deleteUser(usuarioId);
    if (authErr) return Response.json({ erro: 'Falha ao excluir: ' + authErr.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  // ── RECLASSIFICAR (DEV only) ─────────────────────────────────────────────
  if (intent === 'reclassificar') {
    if (user.perfil !== 'DEV') return Response.json({ erro: 'Negado' }, { status: 403 });

    // 1. Busca todos os movimentos do banco (campos brutos + hash)
    const { data: movsDb, error: fetchErr } = await db
      .from('movimentos_credito')
      .select('operacao,ug_exec_cod,ug_exec_nome,data,nc,descricao,ug_resp_cod,ug_resp_nome,nd_cod,nd_nome,favorecido_cod,favorecido_nome,origem_cod,origem_nome,valor,pedido,exercicio,hash_linha,sync_id')
      .limit(100000);

    if (fetchErr) return Response.json({ erro: fetchErr.message }, { status: 500 });
    const movsArr = (movsDb ?? []) as Record<string, unknown>[];

    // 2. Mapeia para MovimentoCredito
    const registros: MovimentoCredito[] = movsArr.map(r => ({
      operacao:      String(r.operacao ?? ''),
      ugExecCod:     String(r.ug_exec_cod ?? ''),
      ugExecNome:    String(r.ug_exec_nome ?? ''),
      data:          String(r.data ?? ''),
      nc:            String(r.nc ?? ''),
      descricao:     String(r.descricao ?? ''),
      ugRespCod:     String(r.ug_resp_cod ?? ''),
      ugRespNome:    String(r.ug_resp_nome ?? ''),
      ndCod:         String(r.nd_cod ?? ''),
      ndNome:        String(r.nd_nome ?? ''),
      favorecidoCod: String(r.favorecido_cod ?? ''),
      favorecidoNome:String(r.favorecido_nome ?? ''),
      origemCod:     String(r.origem_cod ?? ''),
      origemNome:    String(r.origem_nome ?? ''),
      valor:         Number(r.valor ?? 0),
      pedido:        String(r.pedido ?? ''),
    }));

    // 3. Carrega exceções NC e reclassifica
    const { data: excecoesNcDb } = await db.from('excecoes_nc').select('nc, operacao').eq('ativo', true);
    const configFinal: ConfigEngine = { excecoesNC: excecoesNcDb ?? [] };
    const classificados = classificar(registros, configFinal);

    // 4. Aplica overrides
    const { data: overrides } = await db.from('overrides').select('nc, nd_cod, tipo, valor_novo').eq('ativo', true);
    if (overrides?.length) {
      const ovMap = new Map<string, typeof overrides[0]>();
      for (const ov of overrides) ovMap.set(ov.nc + '|' + (ov.nd_cod ?? ''), ov);
      for (const m of classificados) {
        const ov = ovMap.get(m.nc + '|' + m.ndCod) ?? ovMap.get(m.nc + '|');
        if (!ov) continue;
        if (ov.tipo === 'EXCLUIR') m.tipoCalculado = 'IGNORADO';
        else if (ov.tipo === 'RECLASSIFICAR' && ov.valor_novo?.tipo) m.tipoCalculado = ov.valor_novo.tipo;
        else if (ov.tipo === 'SUBOP' && ov.valor_novo?.subop !== undefined) m.subop = ov.valor_novo.subop;
      }
    }

    // 5. Upsert de volta com tipo_calculado atualizado
    const agora2 = new Date().toISOString();
    const rows = classificados.map((m, i) => ({
      operacao:        movsArr[i].operacao,
      ug_exec_cod:     movsArr[i].ug_exec_cod,
      ug_exec_nome:    movsArr[i].ug_exec_nome,
      data:            movsArr[i].data,
      nc:              movsArr[i].nc,
      descricao:       movsArr[i].descricao,
      ug_resp_cod:     movsArr[i].ug_resp_cod,
      ug_resp_nome:    movsArr[i].ug_resp_nome,
      nd_cod:          movsArr[i].nd_cod,
      nd_nome:         movsArr[i].nd_nome,
      favorecido_cod:  movsArr[i].favorecido_cod,
      favorecido_nome: movsArr[i].favorecido_nome,
      origem_cod:      movsArr[i].origem_cod,
      origem_nome:     movsArr[i].origem_nome,
      valor:           movsArr[i].valor,
      pedido:          movsArr[i].pedido,
      exercicio:       movsArr[i].exercicio,
      hash_linha:      movsArr[i].hash_linha,
      sync_id:         movsArr[i].sync_id,
      tipo_calculado:  m.tipoCalculado,
      subop:           m.subop,
      ug_destino_cod:  m.ugDestinoCod,
      ug_destino_nome: m.ugDestinoNome,
      atualizado_em:   agora2,
    }));

    const BATCH = 500;
    const erros: string[] = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await db.from('movimentos_credito')
        .upsert(rows.slice(i, i + BATCH), { onConflict: 'hash_linha', ignoreDuplicates: false });
      if (error) erros.push(error.message);
    }

    return Response.json({ ok: erros.length === 0, total: rows.length, erros });
  }

  return Response.json({ erro: 'Intent inválido' }, { status: 400 });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const url  = new URL(request.url);
  const aba  = (url.searchParams.get('aba') ?? 'feed') as AbaId;

  if (!ABAS_VALIDAS.includes(aba)) throw redirect('/painel');

  const db = supabaseAdmin();

  // Só busca operações desativadas nas abas que realmente precisam
  const abasComDesativadas = new Set(['feed', 'operacoes', 'execucao', 'rascunho', 'siscodec', 'desativados']);
  const abasComDescartados = new Set(['feed', 'desativados']);

  // Atualiza último acesso + registra navegação em paralelo com as queries iniciais (awaited para garantir que as queries seguintes vejam dados frescos)
  const [desativadasResult, descMovResult] = await Promise.all([
    abasComDesativadas.has(aba)
      ? db.from('config_operacoes').select('operacao').eq('ativo', false)
      : Promise.resolve({ data: [] as { operacao: string }[] }),
    abasComDescartados.has(aba)
      ? db.from('movimentos_descartados').select('movimento_id').eq('ativo', false)
      : Promise.resolve({ data: [] as { movimento_id: number }[] }),
    db.from('usuarios').update({ ultimo_acesso: new Date().toISOString() }).eq('id', user.user_id),
    db.from('eventos_auditoria').insert({
      usuario_id: user.user_id,
      tipo: 'NAVEGAR',
      entidade: 'aba',
      entidade_id: aba,
      dados_depois: { aba },
    }),
  ]);

  const opsDesativadas = (desativadasResult.data ?? []).map(d => (d as { operacao: string }).operacao);
  const movDescartadosSet = new Set((descMovResult.data ?? []).map(d => (d as { movimento_id: number }).movimento_id));

  // Lê filtros da URL
  const acoes = url.searchParams.getAll('acoes');
  const filtrosAtivos: FiltrosAtivos = {
    ops:        url.searchParams.getAll('ops'),
    nds:        url.searchParams.getAll('nds'),
    tipos:      url.searchParams.getAll('tipos'),
    dataDe:     url.searchParams.get('data_de') ?? '',
    dataAte:    url.searchParams.get('data_ate') ?? '',
    ugExecs:    url.searchParams.getAll('ug_execs'),
    ugResps:    url.searchParams.getAll('ug_resps'),
    ugDestinos: url.searchParams.getAll('ug_destinos'),
    acoes,
  };

  // Dados padrão vazios
  let movimentos:    MovimentoRow[]     = [];
  let totaisGlobais: { recebido: number; descentralizado: number } | null = null;
  let resumo:        ResumoRow[]        = [];
  let opcoesFiltro:  OpcoesFiltro       = { operacoes: [], nds: [], ugExecs: [], ugResps: [], ugDestinos: [] };
  let usuarios:      UsuarioAnalytics[] = [];
  let syncLogs:      SyncLogRow[]       = [];
  let navegacoes:    NavegacaoRow[]     = [];
  let atividadeHoje: NavegacaoRow[]     = [];
  let desativadas:   ConfigOperacao[]   = [];
  let empenhoRows:            EmpenhoDbRow[]         = [];
  let quadros:                Quadro[]               = [];
  let quadroAtivo:            Quadro | null          = null;
  let rascunhoItens:          RascunhoItem[]         = [];
  let rascunhoMovimentos:     MovimentoRow[]         = [];
  let movimentosDescartados:  MovimentoDescartado[]  = [];
  let siscodecPedidos:        SiscodecPedido[]       = [];
  let solicitacoes:           SolicitacaoDesc[]      = [];
  let apiToken:               string                 = '';
  let usuariosGerencial:      UsuarioGerencial[]     = [];
  let ultimaSync:             string | null          = null;
  let proximoNumDesc:         number | null          = null;
  let modelos:                SiscodecModelo[]       = [];

  /* ── FEED ── */
  if (aba === 'feed') {
    const temFiltro =
      filtrosAtivos.ops.length > 0 || filtrosAtivos.nds.length > 0 ||
      filtrosAtivos.tipos.length > 0 || !!filtrosAtivos.dataDe || !!filtrosAtivos.dataAte ||
      filtrosAtivos.ugExecs.length > 0 || filtrosAtivos.ugResps.length > 0 || filtrosAtivos.ugDestinos.length > 0;

    let query = db
      .from('movimentos_credito')
      .select('id, operacao, tipo_calculado, nd_cod, nd_nome, nc, data, valor, descricao, ug_exec_cod, ug_exec_nome, ug_resp_nome, ug_destino_nome, subop, pedido, favorecido_nome, acao_cod, acao_nome')
      .eq('exercicio', 2026)
      .neq('tipo_calculado', 'IGNORADO')
      .order('data', { ascending: false })
      .limit(temFiltro ? 10000 : 400);

    if (filtrosAtivos.ops.length > 0)   query = query.in('operacao', filtrosAtivos.ops);
    if (filtrosAtivos.dataDe)           query = query.gte('data', filtrosAtivos.dataDe);
    if (filtrosAtivos.dataAte)          query = query.lte('data', filtrosAtivos.dataAte);
    if (filtrosAtivos.nds.length > 0)   query = query.in('nd_cod', filtrosAtivos.nds);
    if (filtrosAtivos.tipos.length > 0) query = query.in('tipo_calculado', filtrosAtivos.tipos);
    if (filtrosAtivos.ugExecs    && filtrosAtivos.ugExecs.length    > 0) query = query.in('ug_exec_nome',    filtrosAtivos.ugExecs);
    if (filtrosAtivos.ugDestinos && filtrosAtivos.ugDestinos.length > 0) query = query.in('ug_destino_nome', filtrosAtivos.ugDestinos);
    if (filtrosAtivos.acoes      && filtrosAtivos.acoes.length      > 0) query = query.in('acao_cod',        filtrosAtivos.acoes);

    const [{ data: movsRaw }, { data: opsDisp }, { data: ndsDisp }, { data: ugExecsDisp }, { data: ugDestinosDisp }, { data: acoesDisp }, { data: resumoGlobal }] = await Promise.all([
      query,
      db.from('movimentos_credito').select('operacao').eq('exercicio', 2026).neq('tipo_calculado', 'IGNORADO').order('operacao').limit(10000),
      db.from('movimentos_credito').select('nd_cod, nd_nome').eq('exercicio', 2026).neq('tipo_calculado', 'IGNORADO').order('nd_cod').limit(10000),
      db.from('movimentos_credito').select('ug_exec_nome').eq('exercicio', 2026).neq('tipo_calculado', 'IGNORADO').order('ug_exec_nome').limit(10000),
      db.from('movimentos_credito').select('ug_destino_nome').eq('exercicio', 2026).eq('tipo_calculado', 'DESCENTRALIZADO').not('ug_destino_nome', 'is', null).order('ug_destino_nome').limit(10000),
      db.from('movimentos_credito').select('acao_cod, acao_nome').eq('exercicio', 2026).neq('tipo_calculado', 'IGNORADO').not('acao_cod', 'is', null).order('acao_cod').limit(1000),
      db.from('resumo_por_operacao').select('operacao, recebido, descentralizado'),
    ]);

    // Filtra operações desativadas e movimentos descartados em JS
    movimentos = ((movsRaw ?? []) as unknown as MovimentoRow[])
      .filter(m => !opsDesativadas.includes(m.operacao))
      .filter(m => !movDescartadosSet.has(m.id));

    // Opções para o FilterBar (excluindo desativadas)
    const todasOps = [...new Set((opsDisp ?? []).map((r: { operacao: string }) => r.operacao))]
      .filter(op => !opsDesativadas.includes(op));
    const ndsMap = new Map<string, string>();
    for (const r of (ndsDisp ?? []) as { nd_cod: string; nd_nome: string }[]) {
      if (!ndsMap.has(r.nd_cod)) ndsMap.set(r.nd_cod, r.nd_nome);
    }
    const ugExecsOpcoes    = [...new Set((ugExecsDisp    ?? []).map((r: { ug_exec_nome: string })    => r.ug_exec_nome))].filter(Boolean).sort();
    const ugDestinosOpcoes = [...new Set((ugDestinosDisp ?? []).map((r: { ug_destino_nome: string }) => r.ug_destino_nome))].filter(Boolean).sort();
    const acoesOpcoesMap   = new Map<string, string>();
    for (const r of (acoesDisp ?? []) as { acao_cod: string; acao_nome: string | null }[]) {
      if (r.acao_cod && !acoesOpcoesMap.has(r.acao_cod)) acoesOpcoesMap.set(r.acao_cod, r.acao_nome ?? '');
    }

    opcoesFiltro = {
      operacoes:  todasOps,
      nds:        [...ndsMap.entries()].map(([cod, nome]) => ({ cod, nome })),
      ugExecs:    ugExecsOpcoes,
      ugDestinos: ugDestinosOpcoes,
      acoes:      [...acoesOpcoesMap.entries()].map(([cod, nome]) => ({ cod, nome })),
    };

    // Totais globais (todas as operações, sem limite) — usados no sumário quando não há filtro
    if (!temFiltro && resumoGlobal) {
      const recs = resumoGlobal as { operacao: string; recebido: number; descentralizado: number }[];
      totaisGlobais = recs
        .filter(r => !opsDesativadas.includes(r.operacao))
        .reduce(
          (acc, r) => ({ recebido: acc.recebido + (r.recebido ?? 0), descentralizado: acc.descentralizado + (r.descentralizado ?? 0) }),
          { recebido: 0, descentralizado: 0 },
        );
    }
  }

  /* ── OPERAÇÕES ── */
  if (aba === 'operacoes') {
    const { data } = await db
      .from('resumo_por_operacao')
      .select('operacao, recebido, descentralizado, empenhado, disponivel')
      .order('operacao');

    const { data: acoesOpRaw } = await db
      .from('movimentos_credito')
      .select('operacao, acao_cod, acao_nome')
      .eq('exercicio', 2026)
      .neq('tipo_calculado', 'IGNORADO')
      .not('acao_cod', 'is', null)
      .limit(500);

    const acoesOpMap = new Map<string, { cod: string; nome: string }>();
    for (const r of (acoesOpRaw ?? [])) {
      if (r.acao_cod && !acoesOpMap.has(r.operacao)) {
        acoesOpMap.set(r.operacao, { cod: r.acao_cod as string, nome: (r.acao_nome ?? '') as string });
      }
    }

    // Filtra desativadas e aplica filtro de ops se existir
    resumo = ((data ?? []) as unknown as ResumoRow[])
      .filter(r => !opsDesativadas.includes(r.operacao))
      .filter(r => filtrosAtivos.ops.length === 0 || filtrosAtivos.ops.includes(r.operacao))
      .map(r => {
        const acao = acoesOpMap.get(r.operacao);
        return { ...r, acao_cod: acao?.cod ?? null, acao_nome: acao?.nome ?? null };
      });

    opcoesFiltro = {
      operacoes: ((data ?? []) as unknown as ResumoRow[])
        .filter(r => !opsDesativadas.includes(r.operacao))
        .map(r => r.operacao),
      nds: [],
    };
  }

  /* ── EXECUÇÃO ORÇAMENTÁRIA ── */
  if (aba === 'execucao') {
    const [{ data: empRaw }, { data: syncRaw }] = await Promise.all([
      db.from('empenhos')
        .select('operacao, ug_exec_cod, ug_exec_nome, ug_resp_cod, ug_resp_nome, nd_cod, nd_nome, subop, disponivel, a_liquidar, em_liquidacao, liq_a_pagar, pago, total, acao_cod, acao_nome'),
      db.from('sync_log')
        .select('concluido_em')
        .in('status', ['SUCESSO', 'PARCIAL'])
        .order('concluido_em', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // allRowsBase: todas as linhas antes dos filtros de ops/ugs/acoes (para popular dropdowns)
    const allRowsBase = ((empRaw ?? []) as unknown as EmpenhoDbRow[])
      .filter(e => !opsDesativadas.includes(e.operacao))
      .filter(e => Math.abs(e.total) > 0.005);

    let allRows = allRowsBase;

    if (filtrosAtivos.ops.length > 0) {
      allRows = allRows.filter(e => filtrosAtivos.ops.includes(e.operacao));
    }
    if (filtrosAtivos.nds.length > 0) {
      allRows = allRows.filter(e => filtrosAtivos.nds.includes(e.nd_cod));
    }
    if (filtrosAtivos.ugExecs.length > 0) {
      allRows = allRows.filter(e => filtrosAtivos.ugExecs.includes(e.ug_exec_nome));
    }
    if (filtrosAtivos.ugResps.length > 0) {
      allRows = allRows.filter(e => filtrosAtivos.ugResps.includes(e.ug_resp_nome));
    }
    if (filtrosAtivos.acoes.length > 0) {
      allRows = allRows.filter(e => filtrosAtivos.acoes.includes(e.acao_cod ?? ''));
    }

    const opsDispExec  = [...new Set(allRowsBase.map(e => e.operacao))].sort();
    const ndsMapExec   = new Map<string, string>();
    for (const e of allRowsBase) { if (!ndsMapExec.has(e.nd_cod)) ndsMapExec.set(e.nd_cod, e.nd_nome); }
    const ndsDispExec  = [...ndsMapExec.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cod, nome]) => ({ cod, nome }));
    const ugExecsDisp  = [...new Set(allRowsBase.map(e => e.ug_exec_nome).filter(Boolean))].sort();
    const ugRespsDisp  = [...new Set(allRowsBase.map(e => e.ug_resp_nome).filter(Boolean))].sort();
    const acoesDisp = [...new Map(
      allRowsBase.filter(e => e.acao_cod).map(e => [e.acao_cod, { cod: e.acao_cod!, nome: e.acao_nome ?? '' }])
    ).values()];

    opcoesFiltro = { operacoes: opsDispExec, nds: ndsDispExec, ugExecs: ugExecsDisp, ugResps: ugRespsDisp, acoes: acoesDisp };

    empenhoRows = allRows;

    ultimaSync = String((syncRaw as { concluido_em?: unknown } | null)?.concluido_em ?? '') || null;
  }

  /* ── DESATIVADOS ── */
  if (aba === 'desativados') {
    const [{ data: confData }, { data: descData }, { data: u }] = await Promise.all([
      db.from('config_operacoes')
        .select('operacao, ativo, desativado_por, desativado_em, motivo')
        .eq('ativo', false)
        .order('desativado_em', { ascending: false }),
      db.from('movimentos_descartados')
        .select('movimento_id, motivo, descartado_por, descartado_em')
        .eq('ativo', false)
        .order('descartado_em', { ascending: false }),
      db.from('usuarios')
        .select('id, nome, email, perfil, ativo, criado_em, ultimo_acesso'),
    ]);

    desativadas = (confData ?? []) as unknown as ConfigOperacao[];
    usuarios    = (u        ?? []) as unknown as UsuarioAnalytics[];

    const descList = (descData ?? []) as {
      movimento_id: number; motivo: string;
      descartado_por: string | null; descartado_em: string | null;
    }[];

    if (descList.length > 0) {
      const ids = descList.map(d => d.movimento_id);
      const { data: movsDetRaw } = await db
        .from('movimentos_credito')
        .select('id, operacao, nc, nd_cod, valor, tipo_calculado, data')
        .in('id', ids);

      const movsMap = new Map((movsDetRaw ?? []).map(m => [m.id as number, m]));

      movimentosDescartados = descList.map(d => {
        const mov = movsMap.get(d.movimento_id);
        return {
          movimento_id: d.movimento_id,
          motivo:        d.motivo,
          descartado_por: d.descartado_por,
          descartado_em:  d.descartado_em,
          operacao:      String((mov as { operacao?: unknown })?.operacao ?? ''),
          nc:            String((mov as { nc?: unknown })?.nc ?? ''),
          nd_cod:        String((mov as { nd_cod?: unknown })?.nd_cod ?? ''),
          valor:         Number((mov as { valor?: unknown })?.valor ?? 0),
          tipo_calculado: String((mov as { tipo_calculado?: unknown })?.tipo_calculado ?? ''),
          data:          String((mov as { data?: unknown })?.data ?? ''),
        };
      });
    }
  }

  /* ── RASCUNHO ── */
  if (aba === 'rascunho') {
    const quadroId = url.searchParams.get('quadro') ?? '';

    const { data: quadrosRaw } = await db
      .from('rascunhos')
      .select('id, nome, nota, atualizado_em')
      .eq('usuario_id', user.user_id)
      .eq('arquivado', false)
      .order('atualizado_em', { ascending: false });

    quadros = (quadrosRaw ?? []) as unknown as Quadro[];

    if (quadroId) {
      quadroAtivo = quadros.find(q => q.id === quadroId) ?? null;

      if (quadroAtivo) {
        const { data: itensRaw } = await db
          .from('rascunho_itens')
          .select('id, tipo, referencia, nota, ordem')
          .eq('rascunho_id', quadroId)
          .order('ordem');

        rascunhoItens = (itensRaw ?? []) as unknown as RascunhoItem[];

        const ncs = rascunhoItens.filter(i => i.tipo === 'nc').map(i => i.referencia);
        const ops = rascunhoItens.filter(i => i.tipo === 'operacao').map(i => i.referencia);
        const COLS = 'id, operacao, tipo_calculado, nd_cod, nd_nome, nc, data, valor, descricao, ug_exec_nome, ug_resp_nome, ug_destino_nome, subop, pedido' as const;

        let allMovs: MovimentoRow[] = [];
        if (ncs.length > 0) {
          const { data: byNc } = await db.from('movimentos_credito').select(COLS)
            .eq('exercicio', 2026).neq('tipo_calculado', 'IGNORADO').in('nc', ncs);
          allMovs.push(...((byNc ?? []) as unknown as MovimentoRow[]));
        }
        if (ops.length > 0) {
          const { data: byOp } = await db.from('movimentos_credito').select(COLS)
            .eq('exercicio', 2026).neq('tipo_calculado', 'IGNORADO').in('operacao', ops);
          allMovs.push(...((byOp ?? []) as unknown as MovimentoRow[]));
        }

        const seen = new Set<number>();
        rascunhoMovimentos = allMovs
          .filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; })
          .sort((a, b) => b.data.localeCompare(a.data));
      }
    }

    // Opções de operações para o dropdown
    const { data: opsRaw } = await db.from('movimentos_credito').select('operacao').eq('exercicio', 2026);
    const opsDisp = [...new Set((opsRaw ?? []).map(r => r.operacao as string))]
      .filter(op => !opsDesativadas.includes(op)).sort();
    opcoesFiltro = { operacoes: opsDisp, nds: [] };
  }

  /* ── SISCODEC ── */
  if (aba === 'siscodec') {
    const solQuery = user.perfil === 'AUXILIAR'
      ? db.from('solicitacoes_desc').select('*').eq('criado_por', user.user_id).order('criado_em', { ascending: false })
      : db.from('solicitacoes_desc').select('*').neq('status', 'CANCELADA').order('criado_em', { ascending: false });

    const [{ data: pedidosRaw }, { data: userRow }, { data: solsRaw }, { data: maxNumDescRow }] = await Promise.all([
      db.from('siscodec_pedidos')
        .select('id, status, descricao, operacao, destaque, entrada_exterior, obs, num_desc, criado_em, concluido_em, concluido_email, erro_msg, siscodec_celulas(id, ordem, tipo, ptres, nd, valor)')
        .order('criado_em', { ascending: false })
        .limit(100),
      db.from('usuarios').select('api_token').eq('id', user.user_id).single(),
      solQuery,
      db.from('siscodec_pedidos')
        .select('num_desc')
        .not('num_desc', 'is', null)
        .order('num_desc', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    siscodecPedidos = (pedidosRaw ?? []) as unknown as SiscodecPedido[];
    apiToken = String((userRow as { api_token?: unknown } | null)?.api_token ?? '');
    solicitacoes = (solsRaw ?? []) as unknown as SolicitacaoDesc[];
    const maxNumDesc = (maxNumDescRow as { num_desc?: number | null } | null)?.num_desc ?? null;
    proximoNumDesc = maxNumDesc !== null ? maxNumDesc + 1 : null;

    const { data: opsRaw } = await db.from('movimentos_credito').select('operacao').eq('exercicio', 2026);
    const opsDisp = [...new Set((opsRaw ?? []).map(r => r.operacao as string))]
      .filter(op => !opsDesativadas.includes(op)).sort();
    opcoesFiltro = { operacoes: opsDisp, nds: [] };

    const { data: modelosRaw } = await db.from('siscodec_modelos').select('*').order('operacao');
    modelos = (modelosRaw ?? []) as unknown as SiscodecModelo[];
  }

  /* ── CONFIGURAÇÕES ── */
  if (aba === 'configuracoes') {
    const { data: u } = await db
      .from('usuarios')
      .select('id, email, nome, perfil, unidade, ativo, criado_em, ultimo_acesso, posto, nome_guerra')
      .order('criado_em', { ascending: false });

    usuariosGerencial = (u ?? []) as unknown as UsuarioGerencial[];
  }

  /* ── DEV ANALYTICS ── */
  if (aba === 'dev') {
    if (user.perfil !== 'DEV') throw redirect('/painel?aba=feed');

    const hoje = new Date().toISOString().slice(0, 10);
    const [{ data: u }, { data: s }, { data: n }, { data: ah }] = await Promise.all([
      db.from('usuarios').select('id, email, nome, perfil, ativo, criado_em, ultimo_acesso')
        .order('ultimo_acesso', { ascending: false, nullsFirst: false }),
      db.from('sync_log').select('id, iniciado_em, concluido_em, status, registros_credito, registros_empenhos, erros')
        .order('iniciado_em', { ascending: false }).limit(20),
      db.from('eventos_auditoria').select('id, usuario_id, tipo, entidade, entidade_id, criado_em')
        .eq('tipo', 'NAVEGAR').order('criado_em', { ascending: false }).limit(200),
      db.from('eventos_auditoria').select('id, usuario_id, tipo, entidade, entidade_id, criado_em')
        .eq('tipo', 'NAVEGAR')
        .gte('criado_em', `${hoje}T00:00:00Z`)
        .order('criado_em', { ascending: false }),
    ]);

    usuarios      = (u  ?? []) as unknown as UsuarioAnalytics[];
    syncLogs      = (s  ?? []) as unknown as SyncLogRow[];
    navegacoes    = (n  ?? []) as unknown as NavegacaoRow[];
    atividadeHoje = (ah ?? []) as unknown as NavegacaoRow[];
  }

  return {
    user, aba, filtrosAtivos, opcoesFiltro,
    movimentos, totaisGlobais, resumo, desativadas,
    usuarios, syncLogs, navegacoes, atividadeHoje,
    podeEditar: PODE_EDITAR.includes(user.perfil),
    empenhoRows, ultimaSync, quadros, quadroAtivo, rascunhoItens, rascunhoMovimentos,
    movimentosDescartados, siscodecPedidos, apiToken, usuariosGerencial, solicitacoes, proximoNumDesc, modelos,
    supabaseUrl: process.env['SUPABASE_URL']      ?? '',
    anonKey:     process.env['SUPABASE_ANON_KEY'] ?? '',
  };
}

export function meta() {
  return [{ title: 'COMAE GERENCIAL — Painel' }];
}

function PlaceholderView({ aba }: { aba: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <p className="text-3xl opacity-20">🚧</p>
      <p className="text-slate-500 text-sm">
        Aba <strong className="text-slate-400">{aba}</strong> — em desenvolvimento.
      </p>
    </div>
  );
}

export default function Painel() {
  useEffect(() => {
    const ping = () => fetch('/api/heartbeat', { method: 'POST' }).catch(() => {});
    ping();
    const id = setInterval(ping, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const {
    user, aba, filtrosAtivos, opcoesFiltro,
    movimentos, totaisGlobais, resumo, desativadas,
    usuarios, syncLogs, navegacoes, atividadeHoje,
    podeEditar, empenhoRows, ultimaSync,
    quadros, quadroAtivo, rascunhoItens, rascunhoMovimentos,
    movimentosDescartados, siscodecPedidos, apiToken, usuariosGerencial, solicitacoes, proximoNumDesc, modelos,
    supabaseUrl, anonKey,
  } = useLoaderData<typeof loader>();

  usePresenca(user.user_id, user.nome, user.perfil, supabaseUrl, anonKey);

  function renderConteudo() {
    switch (aba) {
      case 'feed':
        return <FeedView movimentos={movimentos} totaisGlobais={totaisGlobais} filtrosAtivos={filtrosAtivos} opcoes={opcoesFiltro} podeEditar={podeEditar} />;
      case 'operacoes':
        return <OperacoesView resumo={resumo} filtrosAtivos={filtrosAtivos} opcoes={opcoesFiltro} podeEditar={podeEditar} />;
      case 'desativados':
        return (
          <DesativadosView
            desativadas={desativadas}
            usuarios={usuarios.map(u => ({ id: u.id, nome: u.nome }))}
            podeEditar={podeEditar}
            movimentosDescartados={movimentosDescartados}
          />
        );
      case 'execucao':
        return <ExecucaoView rows={empenhoRows} filtrosAtivos={filtrosAtivos} opcoes={opcoesFiltro} ultimaSync={ultimaSync} />;
      case 'rascunho':
        return (
          <RascunhoView
            quadros={quadros}
            quadroAtivo={quadroAtivo}
            rascunhoItens={rascunhoItens}
            rascunhoMovimentos={rascunhoMovimentos}
            opcoes={opcoesFiltro}
          />
        );
      case 'siscodec':
        return (
          <SiscodecView
            pedidos={siscodecPedidos}
            apiToken={apiToken}
            opcoes={opcoesFiltro}
            podeEditar={podeEditar}
            solicitacoes={solicitacoes}
            perfil={user.perfil}
            proximoNumDesc={proximoNumDesc}
            modelos={modelos}
          />
        );
      case 'configuracoes':
        return <ConfiguracoesView usuarios={usuariosGerencial} userAtual={user} />;
      case 'power-bi':
        return <PowerBIView />;
      case 'ferramentas':
        return <FerramentasView />;
      case 'dev':
        return (
          <DevView
            usuarios={usuarios}
            syncLogs={syncLogs}
            navegacoes={navegacoes}
            atividadeHoje={atividadeHoje}
            supabaseUrl={supabaseUrl}
            anonKey={anonKey}
          />
        );
      default:
        return <PlaceholderView aba={aba} />;
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0C1526' }}>
      <Sidebar user={user} abaAtiva={aba} />
      <main className="flex-1 overflow-y-auto min-w-0" style={{ color: '#EAF1FB' }}>
        {renderConteudo()}
      </main>
      <Tutorial userId={user.user_id} abaAtiva={aba} />
    </div>
  );
}
