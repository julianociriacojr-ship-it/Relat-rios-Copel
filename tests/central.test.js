// Central de relatórios: sobe o servidor numa pasta temporária e testa o fluxo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'central-'));
process.env.DADOS = DADOS;
process.env.ORIGENS = 'https://julianociriacojr-ship-it.github.io';
const usuarios = require('../servidor/central/usuarios.cjs');
const { servidor } = require('../servidor/central/server.cjs');
usuarios.definir(DADOS, 'joao', 'tecnico', 'João', 'senha-joao');
usuarios.definir(DADOS, 'ana', 'tecnico', 'Ana', 'senha-ana');
usuarios.definir(DADOS, 'maria', 'sat', 'Maria SAT', 'senha-maria');

let base;
test.before(() => new Promise(r => servidor.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${servidor.address().port}`; r(); })));
test.after(() => { servidor.close(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const req = (p, o = {}, tok) => fetch(base + p, { ...o, headers: { ...(o.headers || {}), ...(tok ? { Authorization: 'Bearer ' + tok } : {}) } });
const login = async (u, s) => (await (await req('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: u, senha: s }) })).json()).token;
const ID = 'insp-0001-abcdef';

test('login, envio do técnico e permissões', async () => {
  assert.strictEqual((await req('/api/login', { method: 'POST', body: JSON.stringify({ usuario: 'joao', senha: 'errada' }) })).status, 401);
  const joao = await login('joao', 'senha-joao'), ana = await login('ana', 'senha-ana'), maria = await login('maria', 'senha-maria');
  assert.ok(joao && ana && maria);
  assert.strictEqual((await req('/api/inspecoes')).status, 401);           // sem login

  const meta = { houseCode: 'POE01', communityId: 'poe', comunidade: 'Ilha do Mel, Ponta Oeste', inspectionDate: '2026-10-19', technician: 'João', gps: { lat: -25.5, lon: -48.38, accuracy: 6 }, updatedAt: '2026-10-19T10:00:00Z' };
  let r = await req(`/api/inspecoes/${ID}/meta`, { method: 'PUT', body: JSON.stringify(meta) }, joao);
  assert.strictEqual(r.status, 200);
  r = await req(`/api/inspecoes/${ID}/arquivos/docx`, { method: 'PUT', body: Buffer.from('DOCX-DO-TECNICO') }, joao);
  assert.strictEqual(r.status, 200);

  // outro técnico não vê nem altera
  assert.strictEqual((await (await req('/api/inspecoes', {}, ana)).json()).length, 0);
  assert.strictEqual((await req(`/api/inspecoes/${ID}/arquivos/docx`, {}, ana)).status, 403);
  // técnico não envia revisado
  assert.strictEqual((await req(`/api/inspecoes/${ID}/arquivos/revisado`, { method: 'PUT', body: 'x' }, joao)).status, 403);

  // SAT vê, baixa, revisa e muda status
  const lista = await (await req('/api/inspecoes', {}, maria)).json();
  assert.strictEqual(lista.length, 1);
  assert.strictEqual(lista[0].status, 'recebido');
  r = await req(`/api/inspecoes/${ID}/arquivos/docx`, {}, maria);
  assert.strictEqual(await r.text(), 'DOCX-DO-TECNICO');
  assert.match(r.headers.get('content-disposition'), /Relatorio_Visita_POE01\.docx/);
  assert.strictEqual((await req(`/api/inspecoes/${ID}/arquivos/revisado`, { method: 'PUT', body: Buffer.from('REVISADO') }, maria)).status, 200);
  r = await req(`/api/inspecoes/${ID}/status`, { method: 'POST', body: JSON.stringify({ status: 'enviado_cliente' }) }, maria);
  assert.strictEqual((await r.json()).status, 'enviado_cliente');
  assert.strictEqual((await req(`/api/inspecoes/${ID}/status`, { method: 'POST', body: JSON.stringify({ status: 'revisado' }) }, joao)).status, 403);

  // técnico reenviou depois de alterar no app: volta para "recebido"
  await req(`/api/inspecoes/${ID}/meta`, { method: 'PUT', body: JSON.stringify({ ...meta, updatedAt: '2026-10-19T11:00:00Z' }) }, joao);
  assert.strictEqual((await (await req('/api/inspecoes', {}, maria)).json())[0].status, 'recebido');
});

test('relatórios antigos (RDO, Visita, Entrega, OS) com tipo e nome do arquivo', async () => {
  const joao = await login('joao', 'senha-joao');
  const id = 'RDO_Obra_Centro_2026-10-19-joao';
  let r = await req(`/api/inspecoes/${id}/meta`, { method: 'PUT', body: JSON.stringify({ tipo: 'rdo', titulo: 'RDO · Obra Centro', nomeBase: 'RDO_Obra_Centro_2026-10-19', updatedAt: '2026-10-19T12:00:00Z' }) }, joao);
  assert.strictEqual(r.status, 200);
  await req(`/api/inspecoes/${id}/arquivos/pdf`, { method: 'PUT', body: Buffer.from('%PDF-RDO') }, joao);
  const item = (await (await req('/api/inspecoes', {}, joao)).json()).find(i => i.id === id);
  assert.strictEqual(item.tipo, 'rdo');
  assert.strictEqual(item.titulo, 'RDO · Obra Centro');
  r = await req(`/api/inspecoes/${id}/arquivos/pdf`, {}, joao);
  assert.match(r.headers.get('content-disposition'), /filename="RDO_Obra_Centro_2026-10-19\.pdf"/);
  // tipo desconhecido ou ausente vira inspeção SAS
  r = await req(`/api/inspecoes/${ID}/meta`, { method: 'PUT', body: JSON.stringify({ tipo: 'xyz', houseCode: 'POE01' }) }, joao);
  assert.strictEqual((await r.json()).tipo, 'inspecao_sas');
});

test('envios simultâneos na mesma inspeção não se apagam', async () => {
  const joao = await login('joao', 'senha-joao'), maria = await login('maria', 'senha-maria');
  const id = 'insp-simultaneo-01';
  await req(`/api/inspecoes/${id}/meta`, { method: 'PUT', body: JSON.stringify({ houseCode: 'POE09', updatedAt: '1' }) }, joao);
  await Promise.all([
    req(`/api/inspecoes/${id}/arquivos/docx`, { method: 'PUT', body: Buffer.alloc(300000, 1) }, joao),
    req(`/api/inspecoes/${id}/arquivos/backup`, { method: 'PUT', body: Buffer.alloc(300000, 2) }, joao),
    req(`/api/inspecoes/${id}/status`, { method: 'POST', body: JSON.stringify({ status: 'em_revisao' }) }, maria)
  ]);
  const item = (await (await req('/api/inspecoes', {}, maria)).json()).find(i => i.id === id);
  assert.deepStrictEqual(Object.keys(item.arquivos).sort(), ['backup', 'docx']);
  assert.strictEqual(item.status, 'em_revisao');
});

test('CORS só para o app autorizado', async () => {
  let r = await req('/api/saude', { method: 'OPTIONS', headers: { Origin: 'https://julianociriacojr-ship-it.github.io' } });
  assert.strictEqual(r.headers.get('access-control-allow-origin'), 'https://julianociriacojr-ship-it.github.io');
  r = await req('/api/saude', { method: 'OPTIONS', headers: { Origin: 'https://site-estranho.com' } });
  assert.strictEqual(r.headers.get('access-control-allow-origin'), null);
});

test('token inválido ou usuário desativado', async () => {
  assert.strictEqual((await req('/api/eu', {}, 'lixo.lixo')).status, 401);
  const ana = await login('ana', 'senha-ana');
  const lista = JSON.parse(fs.readFileSync(path.join(DADOS, 'usuarios.json'), 'utf8'));
  lista.find(u => u.usuario === 'ana').desativado = true;
  fs.writeFileSync(path.join(DADOS, 'usuarios.json'), JSON.stringify(lista));
  assert.strictEqual((await req('/api/eu', {}, ana)).status, 401);
});

test('painel é servido', async () => {
  const r = await req('/');
  assert.strictEqual(r.status, 200);
  assert.match(await r.text(), /Central de Relatórios/);
});
