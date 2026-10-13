// Copia e minifica as bibliotecas usadas no navegador para vendor/.
// Nada é carregado de CDN em tempo de execução (uso offline em campo).
// Uso: npm install && npm run vendor
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const out = path.join(__dirname, '..', 'vendor');
fs.mkdirSync(out, { recursive: true });
const docxDir = path.join(__dirname, '..', 'node_modules', 'docx');
const ver = JSON.parse(fs.readFileSync(path.join(docxDir, 'package.json'), 'utf8')).version;
const jobs = [
  ['dist/index.iife.js', 'docx.min.js'],
  ['dist/layout.iife.js', 'docx-layout.min.js']
];
for (const [src, dst] of jobs){
  const code = fs.readFileSync(path.join(docxDir, src), 'utf8');
  const res = esbuild.transformSync(code, { minify: true, target: 'es2019', legalComments: 'none' });
  fs.writeFileSync(path.join(out, dst), `/* docx ${ver} (MIT) - https://github.com/dolanmiu/docx */\n` + res.code);
  console.log(dst, (res.code.length / 1024).toFixed(0) + ' KB');
}
