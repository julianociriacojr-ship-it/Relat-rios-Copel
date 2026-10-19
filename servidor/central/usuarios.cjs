/* ======================================================================
   CENTRAL — usuários (arquivo dados/usuarios.json, senhas com scrypt)
   Papéis: tecnico (envia e vê só as dele), sat (vê tudo, revisa, muda
   status), admin (igual ao SAT).

   Uso na VPS (como o usuário do projeto, na pasta da central):
     node usuarios.cjs adicionar juliano admin "Juliano Ciriaco"
     node usuarios.cjs adicionar maria sat "Maria (SAT)"
     node usuarios.cjs adicionar joao tecnico "João"
     node usuarios.cjs senha joao          (gera senha nova)
     node usuarios.cjs desativar joao      (corta o acesso, mantém o histórico)
     node usuarios.cjs listar
   A senha gerada aparece uma vez na tela: anote e passe para a pessoa.
====================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PAPEIS = ['tecnico', 'sat', 'admin'];

const arquivo = dados => path.join(dados, 'usuarios.json');
function ler(dados){ try { return JSON.parse(fs.readFileSync(arquivo(dados), 'utf8')); } catch(e){ return []; } }
function gravar(dados, lista){
  fs.mkdirSync(dados, { recursive: true });
  fs.writeFileSync(arquivo(dados) + '.tmp', JSON.stringify(lista, null, 1), { mode: 0o600 });
  fs.renameSync(arquivo(dados) + '.tmp', arquivo(dados));
}
const hash = (senha, sal) => crypto.scryptSync(String(senha), sal, 64).toString('hex');
const normal = u => String(u || '').trim().toLowerCase();

function obter(dados, usuario){ return ler(dados).find(x => x.usuario === normal(usuario)) || null; }
function conferir(dados, usuario, senha){
  const u = obter(dados, usuario);
  if (!u || u.desativado || !senha) return null;
  const a = Buffer.from(hash(senha, u.sal), 'hex'), b = Buffer.from(u.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? u : null;
}
function senhaNova(){ return crypto.randomBytes(9).toString('base64url').replace(/[-_]/g, 'x').slice(0, 10); }
function definir(dados, usuario, papel, nome, senha){
  usuario = normal(usuario);
  if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) throw new Error('Usuário: 3 a 30 letras minúsculas, números, ponto ou traço.');
  if (!PAPEIS.includes(papel)) throw new Error('Papel deve ser: ' + PAPEIS.join(', '));
  const lista = ler(dados);
  const sal = crypto.randomBytes(16).toString('hex');
  const reg = { usuario, nome: nome || usuario, papel, sal, hash: hash(senha, sal), criadoEm: new Date().toISOString() };
  const i = lista.findIndex(x => x.usuario === usuario);
  if (i >= 0) lista[i] = { ...lista[i], ...reg, desativado: false }; else lista.push(reg);
  gravar(dados, lista);
}

module.exports = { obter, conferir, definir, PAPEIS };

if (require.main === module){
  const dados = path.resolve(process.env.DADOS || path.join(__dirname, 'dados'));
  const [cmd, usuario, papel, nome, senhaDada] = process.argv.slice(2);
  try{
    if (cmd === 'adicionar'){
      const senha = senhaDada || senhaNova();
      definir(dados, usuario, papel, nome, senha);
      console.log(`Usuário ${normal(usuario)} (${papel}) pronto. Senha: ${senha}`);
    } else if (cmd === 'senha'){
      const u = obter(dados, usuario); if (!u) throw new Error('Usuário não existe.');
      const senha = papel || senhaNova();
      definir(dados, u.usuario, u.papel, u.nome, senha);
      console.log(`Senha nova de ${u.usuario}: ${senha}`);
    } else if (cmd === 'desativar'){
      const lista = ler(dados); const u = lista.find(x => x.usuario === normal(usuario));
      if (!u) throw new Error('Usuário não existe.');
      u.desativado = true; gravar(dados, lista); console.log(`${u.usuario} desativado.`);
    } else if (cmd === 'listar'){
      ler(dados).forEach(u => console.log(`${u.usuario.padEnd(16)} ${u.papel.padEnd(8)} ${u.desativado ? 'DESATIVADO ' : ''}${u.nome}`));
    } else {
      console.log('Uso: node usuarios.cjs adicionar|senha|desativar|listar ...  (veja o cabeçalho do arquivo)');
    }
  }catch(e){ console.error('Erro: ' + e.message); process.exit(1); }
}
