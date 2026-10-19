// Gera o memorial da Ponta Oeste com as coordenadas do modelo rev00
// (lá estavam com latitude e longitude trocadas e sem sinal).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const JSZip = require('jszip');
for (const f of ['docx.min.js', 'docx-layout.min.js'])
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'vendor', f), 'utf8'));
require('../inspecao-sas/config.js');
require('../inspecao-sas/observations.js');
require('../inspecao-sas/memorial-config.js');
const { buildMemorial, memorialFileName, coordinateRows } = require('../inspecao-sas/report-memorial.js');

const asset = (f, w, h, type) => ({ data: fs.readFileSync(path.join(__dirname, '..', 'inspecao-sas', f)), width: w, height: h, type });
const images = {
  logo: asset('memorial/logo-vertical.png', 558, 308, 'png'),
  mapa: asset('memorial/mapa-poe.jpg', 1187, 1428, 'jpg'),
  vistas: [asset('memorial/vista-isometrica.jpg', 1096, 679, 'jpg'), asset('memorial/vista-frontal.jpg', 1096, 557, 'jpg'), asset('memorial/vista-lateral.jpg', 1095, 278, 'jpg')],
  card: asset('cartao-contato.png', 1050, 600, 'png')
};
// [código, longitude (W), latitude (S)] como na Tabela 1 do modelo
const MODELO = [['03',48.381919,25.5045],['24',48.381752,25.503529],['06',48.381742,25.504824],['08',48.381399,25.505114],['10',48.381315,25.505248],
  ['15',48.38127,25.505401],['23',48.381255,25.503945],['14',48.381214,25.504378],['18',48.381149,25.50578],['02',48.381125,25.505501],['21',48.38112,25.506049],
  ['20',48.380914,25.505643],['07',48.38089,25.506087],['13',48.380783,25.505754],['16',48.380776,25.506428],['17',48.38073,25.506272],['04',48.380629,25.506373],
  ['01',48.380576,25.506488],['12',48.380572,25.505829],['05',48.380511,25.506734],['19',48.380474,25.50594]];
const coords = {};
MODELO.forEach(([n, w, s]) => { coords['86204POE' + n] = { lat: -s, lon: -w }; });

test('memorial Ponta Oeste', async () => {
  const buf = await buildMemorial({ communityId: 'poe', coords, engineer: 'Juliano Ciriaco da Silva Junior', images, outputType: 'nodebuffer' });
  const name = memorialFileName('poe');
  assert.strictEqual(name, 'Memorial_Descritivo_Comunidade_Ponta_Oeste.docx');
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', name), buf);
  const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string');
  const visible = (xml.match(/<w:t[ >][^<]*/g) || []).join(' ');
  assert.match(visible, /-25,506488/);       // POE01 com sinal
  assert.match(visible, /-48,380576/);
  assert.match(visible, /\[PENDENTE\]/);     // 09, 11 e 22 não estão no modelo
  assert.doesNotMatch(visible, /Figure/);
  assert.doesNotMatch(xml, /NaN/);
  assert.doesNotMatch(visible, /Os Os/);
  assert.match(visible, /24 Sistemas de Aquecimento Solar/);
});

test('tabela lista todas as moradias e marca pendentes', () => {
  const rows = coordinateRows('poe', coords);
  assert.strictEqual(rows.length, 24);
  assert.deepStrictEqual(rows.filter(r => !r.lat).map(r => r.code), ['86204POE09', '86204POE11', '86204POE22']);
});

test('outras comunidades usam os textos padrão com o próprio nome', async () => {
  const buf = await buildMemorial({ communityId: 'sibui', coords: {}, engineer: '', images: {}, outputType: 'nodebuffer' });
  const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string');
  const visible = (xml.match(/<w:t[ >][^<]*/g) || []).join(' ');
  assert.doesNotMatch(visible, /DESCREVER/);
  // fora da tabela de distribuição (que lista as 12), nada da Ponta Oeste
  assert.doesNotMatch(visible.split('2. OBJETIVO')[2] || visible.split('2. OBJETIVO')[1], /Ponta Oeste|Ilha do Mel/);
  assert.match(visible, /Comunidade Sibuí, localizada no município de Guaraqueçaba - PR/);
  assert.match(visible, /Devido às características geográficas da Comunidade Sibuí, o transporte/);
  assert.match(visible, /acessíveis predominantemente por embarcações e trilhas locais/);
  assert.match(visible, /\[INSERIR IMAGEM: imagem aérea com a localização da Comunidade Sibuí\]/);
});
