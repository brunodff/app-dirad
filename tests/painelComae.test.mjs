// Testes do Painel COMAE (réplica do Power BI COMAE V2). Dados fictícios.
// Rodar na pasta do app:  npm test   (Node 22.18+ lê o .ts direto)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  descentralizacoesComae, fmtMoeda, fmtPct, opcoesComae, operacaoCurta, operacaoEfetiva, paginaComae, paginaUnidades,
  pedidosComae, prepararDadosComae, rotuloOperacao,
} from '../app/lib/painelComae.ts';

const COMAE = { ug_resp_cod: '120115', ug_resp_nome: 'COMANDO DE OPERACOES AEROESPACIAIS' };
const cred = (p) => ({
  operacao: 'OP TESTE', ug_exec_cod: '120001', ug_exec_nome: 'UG EXEC TESTE', data: '2026-03-10', nc: '2026NC000001',
  descricao: '', ug_resp_cod: '120200', ug_resp_nome: 'BASE AEREA FICTICIA', nd_cod: '339030', nd_nome: 'MATERIAL DE CONSUMO',
  origem_nome: '', valor: 0, pedido: '', ...p,
});
const emp = (p) => ({
  operacao: 'OP TESTE', ug_exec_nome: 'UG EXEC TESTE', ug_resp_cod: '120200', ug_resp_nome: 'BASE AEREA FICTICIA',
  nd_cod: '339030', nd_nome: 'MATERIAL DE CONSUMO', disponivel: 0, a_liquidar: 0, em_liquidacao: 0, liq_a_pagar: 0, pago: 0, ...p,
});
const F = { ano: '2026', operacao: null, om: null, visao: null };

// Cenário: o COMAE recebe 1000 do EMAER, manda 600 a uma unidade (mesma NC e operação dos dois lados),
// recebe 50 de volta (devolução) e empenha 100.
const base = () => prepararDadosComae([
  cred({ ...COMAE, nc: '2026NC000010', valor: 1000, descricao: 'ATENDER 123/EMAER-5SC2/2026', pedido: '123/EMAER-5SC2/2026' }),
  cred({ ...COMAE, nc: '2026NC000020', valor: -600, nd_cod: '339030' }),
  cred({ nc: '2026NC000020', valor: 600, nd_cod: '339039', nd_nome: 'OUTROS SERVICOS' }),
  cred({ ...COMAE, nc: '2026NC000030', valor: 50 }),
  cred({ nc: '2026NC000030', valor: -50 }),
], [
  emp({ ...COMAE, disponivel: 350, a_liquidar: 60, em_liquidacao: 10, pago: 30 }),
  emp({ disponivel: 500, a_liquidar: 40, liq_a_pagar: 20, pago: 10 }),
]);

test('recebido [A], descentralizado [B] = saída − devolução e disponível = A − B − E', () => {
  const p = paginaComae(base(), F);
  assert.equal(p.cabecalho.recebido, 1000);
  assert.equal(p.cabecalho.descentralizado, 550, 'saiu 600 e voltou 50');
  assert.deepEqual(p.controle.linhas.map((l) => [l.rotulo, l.a, l.b, l.e, l.d]), [['OP TESTE', 1000, 550, 100, 350]]);
  assert.deepEqual(p.controle.total, { a: 1000, b: 550, e: 100, d: 350 });
});

test('saída para unidade só conta com a contrapartida na MESMA operação; correção de UGR não é saída', () => {
  const d = prepararDadosComae([
    cred({ ...COMAE, nc: '2026NC000040', valor: -200, operacao: 'OP A' }),
    cred({ nc: '2026NC000040', valor: 200, operacao: 'OP B' }),
    cred({ ...COMAE, nc: '2026NC000050', valor: -70, operacao: 'OP A', descricao: 'CORREÇÃO DE UGR' }),
    cred({ nc: '2026NC000050', valor: 70, operacao: 'OP A' }),
  ], []);
  // as duas ficam no recebido [A] (e se somam no agrupamento); nenhuma vira saída
  assert.deepEqual(d.comae.map((m) => [m.k, m.valor]), [['A', -270]]);
});

test('linha sem nota de crédito válida (-9) não pareia', () => {
  const d = prepararDadosComae([
    cred({ ...COMAE, nc: '-9', valor: -300 }),
    cred({ nc: '-9', valor: 300 }),
  ], []);
  assert.equal(d.comae[0].k, 'A');
});

test('faixa de ND: % do total, e visão Descentralizado pela ND de saída', () => {
  const rec = paginaComae(base(), F).nds;
  assert.equal(rec.visao, 'Recebido');
  assert.deepEqual(rec.cards.map((c) => [c.nd, c.valor, fmtPct(c.pct)]), [['339030', 1000, '100,0%']]);
  const des = paginaComae(base(), { ...F, visao: 'Descentralizado' }).nds;
  assert.deepEqual(des.cards.map((c) => [c.nd, c.valor]), [['339030', 550]], 'a ND da linha do COMAE, não a de chegada (339039)');
});

test('filtro de OM numa unidade: cabeçalho e faixa de ND mostram o que o COMAE descentralizou para ela', () => {
  const p = paginaComae(base(), { ...F, om: 'BASE AEREA FICTICIA' });
  assert.deepEqual(p.cabecalho.om, { nome: 'BASE AEREA FICTICIA', descentralizado: 550, recebidoDireto: 0 });
  assert.equal(p.cabecalho.descentralizado, 550, 'saiu 600 para ela e ela devolveu 50');
  assert.equal(p.nds.visao, 'Descentralizado');
  assert.equal(p.nds.om, 'BASE AEREA FICTICIA');
  assert.deepEqual(p.nds.cards.map((c) => [c.nd, c.valor]), [['339030', 550]]);
  // controle geral e disponível não mudam com o filtro de OM
  assert.equal(p.controle.linhas.length, 1);
  assert.equal(p.disponivel.length, 1);
  // a unidade aparece na lista de OMs; o próprio COMAE continua com o recebido [A]
  assert.ok(opcoesComae(base(), { ano: '2026', operacao: null }).oms.includes('BASE AEREA FICTICIA'));
  const c = paginaComae(base(), { ...F, om: COMAE.ug_resp_nome });
  assert.equal(c.cabecalho.recebido, 1000);
  assert.equal(c.cabecalho.om, null);
});

test('descentralização com duas unidades na mesma NC é repartida pelo valor de cada uma', () => {
  const linhas = [
    cred({ ...COMAE, nc: '2026NC000060', valor: -900 }),
    cred({ nc: '2026NC000060', valor: 600, ug_resp_cod: '120071', ug_resp_nome: 'CENTRO LOGISTICO DA AERONAUTICA' }),
    cred({ nc: '2026NC000060', valor: 300, ug_resp_cod: '120038', ug_resp_nome: 'DIRETORIA DE MATERIAL AERONAUTICO E BELICO' }),
  ];
  const itens = descentralizacoesComae(linhas);
  assert.deepEqual(itens.map((x) => [x.omCod, x.valor]).sort(), [['120038', 300], ['120071', 600]]);
  const d = prepararDadosComae(linhas, []);
  assert.equal(paginaComae(d, { ...F, om: 'CENTRO LOGISTICO DA AERONAUTICA' }).cabecalho.descentralizado, 600);
});

test('página Unidades com OM: descentralizado pelo COMAE e execução lado a lado, por ND', () => {
  const u = paginaUnidades(base(), { operacao: null, om: 'BASE AEREA FICTICIA' });
  assert.deepEqual(u.omPorNd, [{ nd: '339030', ndNome: 'MATERIAL DE CONSUMO', descentralizado: 550, disp: 500, aLiq: 40, liqPagar: 20, pago: 10 }]);
  assert.equal(paginaUnidades(base(), { operacao: null, om: null }).omPorNd, null);
});

test('crédito disponível: vem dos empenhos; sem PI próprio, do crédito; zero sai da lista; posição densa', () => {
  const d = prepararDadosComae([
    cred({ ...COMAE, nc: '2026NC000001', operacao: 'OP COM PI', valor: 900, descricao: '1/EMAER-5SC2/2026' }),
    cred({ ...COMAE, nc: '2026NC000002', operacao: 'DESTAQUES', valor: 300, descricao: 'APOIO A SEMANA DA PATRIA' }),
    cred({ ...COMAE, nc: '2026NC000003', operacao: 'OP ZERADA', valor: 0 }),
    cred({ ...COMAE, nc: '2026NC000004', operacao: 'OP EMPATADA', valor: 1 }),
  ], [
    emp({ ...COMAE, operacao: 'OP COM PI', disponivel: 300 }),
    emp({ ...COMAE, operacao: 'OP EMPATADA', disponivel: 300 }),
  ]);
  const p = paginaComae(d, F);
  assert.deepEqual(p.disponivel.map((x) => [x.rank, x.rotulo, x.valor, x.detalhe.fonte]), [
    [1, 'OP COM PI', 300, 'empenhos'], [1, 'OP EMPATADA', 300, 'empenhos'], [1, 'SEMANA DA PATRIA', 300, 'credito'],
  ]);
  assert.deepEqual(p.disponivel[2].detalhe.linhas.map((l) => [l.ugResp, l.nd, l.valor]), [[COMAE.ug_resp_nome, '339030', 300]]);
});

test('nomes das operações: efetiva, rótulo e nome curto do filtro', () => {
  assert.equal(operacaoEfetiva('APOIO ADMINISTRATIVO A SEMANA DA PATRIA'), 'SEMANA DA PATRIA');
  assert.equal(operacaoEfetiva('DESTAQUES', 'CREDITO P/ SEMANA DA PATRIA'), 'SEMANA DA PATRIA');
  assert.equal(rotuloOperacao('GARANTIA DE VOTACAO E APURACAO - AERONAUTICA'), 'GVA - Terrestre');
  assert.equal(rotuloOperacao('OPERACAO GOTA'), 'TED.GOTA');
  assert.equal(operacaoCurta('OP CATRIMANI II'), 'CATRIMANI II / ZIDA 41');
  assert.equal(operacaoCurta('EXERCICIO CONJUNTO PERSEU'), 'Ex. CONJUNTO PERSEU');
  assert.equal(operacaoCurta('OPERACAO ACOLHIDA'), 'Op. ACOLHIDA');
});

test('filtros listam só operações e OMs com crédito recebido do EMAER (EH_RECEBIDO)', () => {
  const d = prepararDadosComae([
    cred({ ...COMAE, operacao: 'OP RECEBEU', nc: '2026NC000001', valor: 10, descricao: '7/EMAER-5SC2/2026' }),
    cred({ ...COMAE, operacao: 'OP PEDIDO COMAE', nc: '2026NC000002', valor: 10, descricao: '7/COMAE/2026 E 7/EMAER-5SC2/2026' }),
    cred({ operacao: 'OP DIRETORIA', nc: '2026NC000003', valor: 10, descricao: 'SOLICITACAO DO EMAER', ug_exec_cod: '120002' }),
    cred({ operacao: 'OP UNIDADE', nc: '2026NC000004', valor: 10, descricao: 'SOLICITAÇÃO DO EMAER' }),
  ], []);
  const o = opcoesComae(d, { ano: '2026', operacao: null });
  assert.deepEqual(o.operacoes, ['OP RECEBEU', 'OP UNIDADE']);
  assert.deepEqual(o.oms, ['BASE AEREA FICTICIA', COMAE.ug_resp_nome]);
});

test('pedidos: agrupa pelo número, ND principal "+N", mais recente primeiro; visão filtra', () => {
  const d = prepararDadosComae([
    cred({ ...COMAE, nc: '2026NC000001', valor: 100, nd_cod: '339030', data: '2026-02-01', descricao: '5/EMAER-5SC2/2026 MATERIAL', pedido: '5/EMAER-5SC2/2026' }),
    cred({ ...COMAE, nc: '2026NC000002', valor: 300, nd_cod: '339039', data: '2026-02-03', descricao: '5/EMAER-5SC2/2026 SERVICO', pedido: '5/EMAER-5SC2/2026' }),
    cred({ ...COMAE, nc: '2026NC000003', valor: 50, data: '2026-04-01', descricao: '9/EMAER-5SC2/2026', pedido: '9/EMAER-5SC2/2026' }),
    cred({ ...COMAE, nc: '2026NC000009', valor: -40 }),
    cred({ nc: '2026NC000009', valor: 40, pedido: '' }),
  ], []);
  const todos = pedidosComae(d, F);
  assert.equal(todos.rotulo, 'classificados');
  assert.deepEqual(todos.linhas.map((l) => [l.pedido, l.valor, l.nd, l.data]), [
    ['9/EMAER-5SC2/2026', 50, '339030', '2026-04-01'],
    ['Sem pedido', 40, '339030', '2026-03-10'],
    ['5/EMAER-5SC2/2026', 400, '339039 +1', '2026-02-03'],
  ]);
  assert.equal(todos.linhas[2].desc, '5/EMAER-5SC2/2026 SERVICO');
  assert.equal(pedidosComae(d, { ...F, visao: 'Descentralizado' }).linhas.length, 1);
  assert.equal(pedidosComae(d, { ...F, visao: 'Recebido' }).total, 450);
});

test('unidades: indicadores com o COMAE; tabela sem ele; a liquidar soma em liquidação', () => {
  const u = paginaUnidades(base(), { operacao: null, om: null });
  assert.deepEqual(u.indicadores, { total: 1020, disp: 850, aLiq: 110, liqPagar: 20, pago: 40 });
  assert.deepEqual(u.unidades.map((x) => [x.ugResp, x.aLiq, x.liqPagar, x.pago]), [['BASE AEREA FICTICIA', 40, 20, 10]]);
  assert.equal(u.dispDetalhe.total, 500);
  assert.deepEqual(u.dispPorOperacao.map((x) => [x.rank, x.rotulo, x.valor]), [[1, 'OP TESTE', 500]]);
});

test('unidades: lista por operação não segue os filtros; o detalhe segue', () => {
  const d = prepararDadosComae([], [
    emp({ operacao: 'OP A', disponivel: 10 }),
    emp({ operacao: 'OP B', disponivel: 20, ug_resp_nome: 'OUTRA BASE' }),
  ]);
  const u = paginaUnidades(d, { operacao: 'OP A', om: null });
  assert.equal(u.dispDetalhe.total, 10);
  assert.deepEqual(u.dispPorOperacao.map((x) => x.rotulo), ['OP B', 'OP A']);
});

test('formatos do BI', () => {
  assert.equal(fmtMoeda(133022443.46), 'R$ 133.022.443,46');
  assert.equal(fmtMoeda(-29450), '-R$ 29.450,00');
  assert.equal(fmtMoeda(-0.001), 'R$ 0,00');
  assert.equal(fmtPct(0.5643), '56,4%');
});

test('descrição da lista de pedidos sem os caracteres de controle que a planilha traz', () => {
  const sujo = '1/EMAER-5SC2/2026 GVA' + String.fromCharCode(1) + 'REF   X';
  const d = prepararDadosComae([cred({ ...COMAE, nc: '2026NC000001', valor: 10, descricao: sujo })], []);
  assert.equal(d.pedidos[0].desc, '1/EMAER-5SC2/2026 GVA REF X');
});

test('operação desativada sai de todos os visuais e as outras não mudam', () => {
  const creditos = [
    cred({ ...COMAE, operacao: 'OP A', nc: '2026NC000010', valor: 1000, descricao: '1/EMAER-5SC2/2026' }),
    cred({ ...COMAE, operacao: 'OP A', nc: '2026NC000020', valor: -600 }),
    cred({ operacao: 'OP A', nc: '2026NC000020', valor: 600 }),
    cred({ ...COMAE, operacao: 'OP B', nc: '2026NC000030', valor: 500, descricao: '2/EMAER-5SC2/2026' }),
    // nota cruzada: a saída é da OP B no COMAE e a chegada é na OP A (o descentralizado da unidade pareia só pela NC)
    cred({ ...COMAE, operacao: 'OP B', nc: '2026NC000040', valor: -70 }),
    cred({ operacao: 'OP A', nc: '2026NC000040', valor: 70, pedido: '9/COMAE/2026' }),
  ];
  const empenhos = [emp({ ...COMAE, operacao: 'OP A', disponivel: 400 }), emp({ ...COMAE, operacao: 'OP B', disponivel: 430 }), emp({ operacao: 'OP B', disponivel: 9 })];
  const todas = prepararDadosComae(creditos, empenhos);
  const semB = prepararDadosComae(creditos, empenhos, ['OP B', 'OP QUE NAO EXISTE']);

  const linhaA = (d) => paginaComae(d, F).controle.linhas.find((l) => l.opEf === 'OP A');
  assert.deepEqual(linhaA(semB), linhaA(todas), 'a OP A continua igual');
  assert.deepEqual(paginaComae(semB, F).controle.linhas.map((l) => l.opEf), ['OP A']);
  assert.deepEqual(paginaComae(semB, F).disponivel.map((x) => x.opEf), ['OP A']);
  assert.equal(paginaComae(semB, F).cabecalho.recebido, 1000);
  assert.ok(semB.empenhos.every((e) => e.op !== 'OP B'));
  assert.deepEqual(paginaUnidades(semB, { operacao: null, om: null }).dispPorOperacao.map((x) => x.op), []);
  assert.deepEqual(opcoesComae(semB, { ano: '2026', operacao: null }).operacoes, ['OP A']);
  assert.ok(pedidosComae(semB, F).linhas.some((l) => l.pedido === '9/COMAE/2026'), 'a chegada na OP A pareou com a linha da OP B desativada');
  assert.deepEqual(semB.desativadas, ['OP B'], 'só lista as desativadas que existem na base');
  assert.equal(semB.opsPorCurta['OP A'], 'OP A');
});

test('desativar a operação efetiva (SEMANA DA PATRIA) tira só as linhas dela de dentro de DESTAQUES', () => {
  const d = prepararDadosComae([
    cred({ ...COMAE, operacao: 'DESTAQUES', nc: '2026NC000001', valor: 300, descricao: 'APOIO A SEMANA DA PATRIA' }),
    cred({ ...COMAE, operacao: 'DESTAQUES', nc: '2026NC000002', valor: 200, descricao: 'OUTRO DESTAQUE' }),
  ], [], ['SEMANA DA PATRIA']);
  assert.deepEqual(paginaComae(d, F).controle.linhas.map((l) => [l.opEf, l.a]), [['DESTAQUES', 200]]);
});
