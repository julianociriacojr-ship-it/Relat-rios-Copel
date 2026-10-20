/* ======================================================================
   CENTRAL DE RELATÓRIOS — Solar Minas
   Recebe as inspeções enviadas pelo app (docx, pdf e backup .zip),
   guarda no disco e oferece um painel para o SAT baixar, revisar e
   acompanhar o status. Sem dependências: só Node.js 20.

   Variáveis de ambiente:
     PORTA      (3020)        porta, só em 127.0.0.1 (o Caddy faz o HTTPS)
     DADOS      (./dados)     pasta dos dados
     ORIGENS    (github.io)   endereços do app autorizados (CORS), separados por vírgula
====================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const PORTA = Number(process.env.PORTA) || 3020;
const DADOS = path.resolve(process.env.DADOS || path.join(__dirname, 'dados'));
const ORIGENS = (process.env.ORIGENS || 'https://julianociriacojr-ship-it.github.io').split(',').map(s => s.trim()).filter(Boolean);
const LIMITE_ARQUIVO = 80 * 1024 * 1024;          // 80 MB por arquivo
const VALIDADE_TOKEN = 1000 * 60 * 60 * 24 * 60;   // 60 dias (técnico em campo sem sinal)
// Relatórios que chegam: a inspeção SAS e os 4 relatórios antigos do app
const TIPOS = ['inspecao_sas', 'rdo', 'visita', 'entrega', 'os'];
const ARQUIVOS = {                                  // tipos aceitos
  docx: { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  pdf: { ext: 'pdf', mime: 'application/pdf' },
  backup: { ext: 'zip', mime: 'application/zip' },
  revisado: { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  revisado_pdf: { ext: 'pdf', mime: 'application/pdf' }
};
const STATUS = ['recebido', 'em_revisao', 'revisado', 'enviado_cliente'];

const usuarios = require('./usuarios.cjs');

/* ---------------- segredo e tokens ---------------- */
function segredo(){
  const f = path.join(DADOS, 'segredo.key');
  if (!fs.existsSync(f)){
    fs.mkdirSync(DADOS, { recursive: true });
    fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  return fs.readFileSync(f, 'utf8').trim();
}
const SEGREDO = segredo();
const b64 = s => Buffer.from(s).toString('base64url');
function assinar(dados){
  const corpo = b64(JSON.stringify(dados));
  return corpo + '.' + crypto.createHmac('sha256', SEGREDO).update(corpo).digest('base64url');
}
function verificar(token){
  if (!token || !token.includes('.')) return null;
  const [corpo, ass] = token.split('.');
  const ok = crypto.createHmac('sha256', SEGREDO).update(corpo).digest('base64url');
  if (ass.length !== ok.length || !crypto.timingSafeEqual(Buffer.from(ass), Buffer.from(ok))) return null;
  let d; try { d = JSON.parse(Buffer.from(corpo, 'base64url').toString()); } catch(e){ return null; }
  if (!d.exp || d.exp < Date.now()) return null;
  const u = usuarios.obter(DADOS, d.u);
  if (!u || u.desativado) return null;               // usuário removido perde o acesso
  return { usuario: u.usuario, nome: u.nome, papel: u.papel };
}

/* ---------------- utilitários HTTP ---------------- */
function cors(req, res){
  const o = req.headers.origin;
  if (o && ORIGENS.includes(o)){
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}
function json(res, status, dados){
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(dados));
}
function lerCorpo(req, limite){
  return new Promise((resolve, reject) => {
    const partes = []; let total = 0;
    req.on('data', c => { total += c.length; if (total > limite){ reject(Object.assign(new Error('Arquivo grande demais'), { status: 413 })); req.destroy(); } else partes.push(c); });
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}
const lerJson = async req => { const b = await lerCorpo(req, 1024 * 1024); try { return JSON.parse(b.toString() || '{}'); } catch(e){ throw Object.assign(new Error('JSON inválido'), { status: 400 }); } };
const idValido = id => /^[A-Za-z0-9_-]{6,80}$/.test(id || '');
const pastaInsp = id => path.join(DADOS, 'inspecoes', id);
async function lerMeta(id){ try { return JSON.parse(await fsp.readFile(path.join(pastaInsp(id), 'meta.json'), 'utf8')); } catch(e){ return null; } }
async function gravarMeta(id, meta){
  await fsp.mkdir(pastaInsp(id), { recursive: true });
  const f = path.join(pastaInsp(id), 'meta.json');
  await fsp.writeFile(f + '.tmp', JSON.stringify(meta, null, 1));
  await fsp.rename(f + '.tmp', f);                    // escrita atômica
}
// Técnico vê só o que ele enviou. SAT vê o que foi mandado para ele: a cópia
// de segurança automática (paraSat === false) fica só para o administrador.
const podeVer = (u, meta) => u.papel === 'admin' || (u.papel === 'sat' ? meta.paraSat !== false : meta.enviadoPor === u.usuario);
// Uma alteração por vez em cada inspeção: ler meta.json, mudar e gravar sem
// que outro pedido simultâneo (ex.: envio do arquivo e mudança de status)
// grave por cima com uma cópia antiga.
const travas = new Map();
function comTrava(id, fn){
  const antes = travas.get(id) || Promise.resolve();
  const agora = antes.catch(() => {}).then(fn);
  const fim = agora.catch(() => {});
  travas.set(id, fim);
  fim.then(() => { if (travas.get(id) === fim) travas.delete(id); });
  return agora;
}
function registrar(meta, u, acao){ (meta.historico = meta.historico || []).push({ em: new Date().toISOString(), por: u.usuario, acao }); }

/* ---------------- rotas ---------------- */
async function rotas(req, res, u){
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  let m;

  if (p === '/api/saude') return json(res, 200, { ok: true });

  if (p === '/api/login' && req.method === 'POST'){
    const { usuario, senha } = await lerJson(req);
    const conta = usuarios.conferir(DADOS, usuario, senha);
    if (!conta) return json(res, 401, { erro: 'Usuário ou senha incorretos.' });
    return json(res, 200, { token: assinar({ u: conta.usuario, exp: Date.now() + VALIDADE_TOKEN }), usuario: conta.usuario, nome: conta.nome, papel: conta.papel });
  }

  if (!u) return json(res, 401, { erro: 'Faça login.' });
  if (p === '/api/eu') return json(res, 200, u);

  // Lista de inspeções (técnico vê só as dele)
  if (p === '/api/inspecoes' && req.method === 'GET'){
    let ids = [];
    try { ids = await fsp.readdir(path.join(DADOS, 'inspecoes')); } catch(e){}
    const lista = [];
    for (const id of ids){ const meta = await lerMeta(id); if (meta && podeVer(u, meta)) lista.push(meta); }
    lista.sort((a, b) => (b.recebidoEm || '').localeCompare(a.recebidoEm || ''));
    return json(res, 200, lista);
  }

  // Dados da inspeção (o app envia a cada envio)
  if ((m = p.match(/^\/api\/inspecoes\/([^/]+)\/meta$/)) && req.method === 'PUT'){
    const id = m[1]; if (!idValido(id)) return json(res, 400, { erro: 'id inválido' });
    const novo = await lerJson(req);
    return comTrava(id, async () => {
    const atual = await lerMeta(id);
    if (atual && !podeVer(u, atual)) return json(res, 403, { erro: 'Inspeção de outro técnico.' });
    const ident = {
      houseCode: String(novo.houseCode || ''), communityId: String(novo.communityId || ''), comunidade: String(novo.comunidade || ''),
      inspectionDate: String(novo.inspectionDate || ''), technician: String(novo.technician || ''),
      gps: novo.gps && typeof novo.gps.lat === 'number' ? { lat: novo.gps.lat, lon: novo.gps.lon, accuracy: novo.gps.accuracy ?? null } : null
    };
    // Cópia de segurança automática do app: guarda o backup sem mandar para o SAT
    // e sem mexer no status nem no histórico de quem já está com o SAT.
    if (novo.soCopia){
      const meta = atual
        ? { ...atual, ...ident, copiaEm: new Date().toISOString() }
        : { id, enviadoPor: u.usuario, enviadoPorNome: u.nome, status: 'recebido', arquivos: {}, tipo: 'inspecao_sas', titulo: '', nomeBase: '',
            ...ident, paraSat: false, atualizadoNoAppEm: '', recebidoEm: new Date().toISOString(), copiaEm: new Date().toISOString() };
      if (!atual) registrar(meta, u, 'cópia de segurança');
      await gravarMeta(id, meta);
      return json(res, 200, meta);
    }
    const meta = {
      ...(atual || { id, enviadoPor: u.usuario, enviadoPorNome: u.nome, status: 'recebido', arquivos: {} }),
      tipo: TIPOS.includes(novo.tipo) ? novo.tipo : 'inspecao_sas',
      titulo: String(novo.titulo || '').slice(0, 200), nomeBase: String(novo.nomeBase || '').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 120),
      ...ident, paraSat: true,
      atualizadoNoAppEm: String(novo.updatedAt || ''), recebidoEm: new Date().toISOString()
    };
    // Reenvio depois da revisão: avisa o SAT voltando para "recebido"
    if (atual && atual.status !== 'recebido' && atual.atualizadoNoAppEm !== meta.atualizadoNoAppEm){ meta.status = 'recebido'; registrar(meta, u, 'reenviado pelo técnico'); }
    if (!atual) registrar(meta, u, 'recebido');
    else if (atual.paraSat === false){ meta.status = 'recebido'; registrar(meta, u, 'enviado ao SAT'); }
    await gravarMeta(id, meta);
    return json(res, 200, meta);
    });
  }

  // Envio de arquivo (corpo binário)
  if ((m = p.match(/^\/api\/inspecoes\/([^/]+)\/arquivos\/([a-z_]+)$/))){
    const [, id, tipo] = m;
    if (!idValido(id) || !ARQUIVOS[tipo]) return json(res, 400, { erro: 'Arquivo inválido' });
    const meta = await lerMeta(id);
    if (!meta) return json(res, 404, { erro: 'Inspeção não encontrada' });
    if (!podeVer(u, meta)) return json(res, 403, { erro: 'Sem acesso' });
    const arq = path.join(pastaInsp(id), tipo + '.' + ARQUIVOS[tipo].ext);

    if (req.method === 'PUT'){
      if (tipo.startsWith('revisado') && u.papel === 'tecnico') return json(res, 403, { erro: 'Só o SAT envia a versão revisada.' });
      const corpo = await lerCorpo(req, LIMITE_ARQUIVO);
      if (!corpo.length) return json(res, 400, { erro: 'Arquivo vazio' });
      return comTrava(id, async () => {
        const atual = await lerMeta(id);                     // relê: pode ter mudado durante o upload
        if (!atual) return json(res, 404, { erro: 'Inspeção não encontrada' });
        const tmp = arq + '.' + process.pid + '.' + Date.now() + '.tmp';
        await fsp.writeFile(tmp, corpo); await fsp.rename(tmp, arq);
        atual.arquivos = atual.arquivos || {};
        atual.arquivos[tipo] = { tamanho: corpo.length, em: new Date().toISOString(), por: u.usuario };
        if (tipo.startsWith('revisado')){ atual.status = 'revisado'; registrar(atual, u, 'versão revisada enviada (' + ARQUIVOS[tipo].ext + ')'); }
        await gravarMeta(id, atual);
        return json(res, 200, atual.arquivos[tipo]);
      });
    }
    if (req.method === 'GET'){
      if (!fs.existsSync(arq)) return json(res, 404, { erro: 'Arquivo ainda não enviado' });
      const sufixo = tipo === 'revisado' || tipo === 'revisado_pdf' ? '_revisado' : tipo === 'backup' ? '_backup' : '';
      const base = meta.nomeBase || `Relatorio_Visita_${(meta.houseCode || id).replace(/[^A-Za-z0-9_-]/g, '')}`;
      const nome = `${base}${sufixo}.${ARQUIVOS[tipo].ext}`;
      res.writeHead(200, { 'Content-Type': ARQUIVOS[tipo].mime, 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'no-store' });
      return fs.createReadStream(arq).pipe(res);
    }
  }

  // Status (SAT / admin)
  if ((m = p.match(/^\/api\/inspecoes\/([^/]+)\/status$/)) && req.method === 'POST'){
    if (u.papel === 'tecnico') return json(res, 403, { erro: 'Só o SAT muda o status.' });
    if (!idValido(m[1])) return json(res, 400, { erro: 'id inválido' });
    const { status } = await lerJson(req);
    if (!STATUS.includes(status)) return json(res, 400, { erro: 'Status inválido' });
    return comTrava(m[1], async () => {
      const meta = await lerMeta(m[1]);
      if (!meta || !podeVer(u, meta)) return json(res, 404, { erro: 'Inspeção não encontrada' });
      meta.status = status; registrar(meta, u, 'status: ' + status);
      await gravarMeta(m[1], meta);
      return json(res, 200, meta);
    });
  }

  return json(res, 404, { erro: 'Não encontrado' });
}

/* ---------------- painel (página do SAT) ---------------- */
const PAINEL = path.join(__dirname, 'painel.html');

const servidor = http.createServer(async (req, res) => {
  try{
    cors(req, res);
    if (req.method === 'OPTIONS'){ res.writeHead(204); return res.end(); }
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/api/')){
      if (url.pathname === '/' || url.pathname === '/painel'){
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return fs.createReadStream(PAINEL).pipe(res);
      }
      return json(res, 404, { erro: 'Não encontrado' });
    }
    const auth = req.headers.authorization || '';
    const u = auth.startsWith('Bearer ') ? verificar(auth.slice(7)) : null;
    await rotas(req, res, u);
  }catch(err){
    if (!res.headersSent) json(res, err.status || 500, { erro: err.status ? err.message : 'Erro interno' });
    if (!err.status) console.error(new Date().toISOString(), err);
  }
});
if (require.main === module){
  servidor.listen(PORTA, '127.0.0.1', () => console.log(`Central de relatórios em http://127.0.0.1:${PORTA} · dados em ${DADOS}`));
}
module.exports = { servidor };
