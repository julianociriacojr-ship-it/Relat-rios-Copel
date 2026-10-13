// Gera relatórios de exemplo e confere estrutura do .docx (cabeçalho,
// rodapé, legendas "Figura", sumário/índice com páginas preenchidas).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
// Usa os mesmos arquivos que o navegador carrega (vendor/).
const vm = require('vm');
for (const f of ['docx.min.js', 'docx-layout.min.js'])
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'vendor', f), 'utf8'));
require('../inspecao-sas/config.js');
require('../inspecao-sas/observations.js');
const { buildReport, reportFileName } = require('../inspecao-sas/report-docx.js');

const fx = f => fs.readFileSync(path.join(__dirname, 'fixtures', f));
const jpg = (f, w, h) => ({ data: fx(f), width: w, height: h, type: 'jpg' });
const logo = { data: fs.readFileSync(path.join(__dirname, '..', 'inspecao-sas', 'logo-solarminas.png')), width: 772, height: 235, type: 'png' };
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const base = {
  communityId: 'poe', houseNumber: '01', houseCode: '86204POE01', inspectionDate: '2026-10-13',
  technician: 'Matheus Henrique Dias', docCode: 'SAC-RELAT.SM 22/07/26', rev: '00',
  observations: { chips: { agua: 'poco', bomba: 'sim' }, freeText: '' }
};

async function build(insp, images){
  const buf = await buildReport({ inspection: insp, images, logo, outputType: 'nodebuffer' });
  const name = reportFileName(insp.houseCode);
  fs.writeFileSync(path.join(OUT, name), buf);
  const zip = await JSZip.loadAsync(buf);
  return { buf, xml: await zip.file('word/document.xml').async('string'), zip };
}

test('relatório completo', async () => {
  const { buf, xml, zip } = await build(base, {
    checklist: jpg('checklist.jpg', 2200, 1556), frente: jpg('frente.jpg', 1600, 1200),
    estaca: jpg('estaca.jpg', 1200, 1600), estacaCodigo: jpg('estaca.jpg', 1200, 1600),
    extras: [{ ...jpg('frente.jpg', 1600, 1200), caption: 'Chuveiro' }]
  });
  assert.ok(buf.length < 8 * 1024 * 1024);
  assert.match(xml, /SEQ Figura/);
  const visible = (xml.match(/<w:t[ >][^<]*/g) || []).join(' ');
  assert.doesNotMatch(visible, /Figure/);
  assert.match(xml, /TOC .*\\c &quot;Figura&quot;|TOC .*\\c "Figura"/);
  assert.match(xml, /proveniente de poço, sendo necessária a utilização de sistema de bombeamento/);
  assert.doesNotMatch(xml, /—/);
  const headers = Object.keys(zip.files).filter(f => /word\/header\d*\.xml/.test(f));
  assert.ok(headers.length >= 1);
  const h = await zip.file(headers[0]).async('string');
  assert.match(h, /RELATÓRIO DE VISITA/); assert.match(h, /Rev\.: 00/);
  const footers = Object.keys(zip.files).filter(f => /word\/footer\d*\.xml/.test(f));
  const f = await zip.file(footers[0]).async('string');
  assert.match(f, /PAGE/); assert.match(f, /NUMPAGES/);
  // Paginação estimada: sumário e índice já saem com número de página.
  const visibleToc = visible.split('ÍNDICE DE ILUSTRAÇÕES')[0];
  assert.match(visibleToc, /SUMÁRIO/);
  assert.match(xml, /PAGEREF Figura_1[\s\S]*?<w:t[^>]*>6</);
});

test('fotos faltando viram placeholder', async () => {
  const { xml } = await build({ ...base, houseCode: '86204POE02', houseNumber: '02', inspectionDate: '' }, { extras: [] });
  assert.match(xml, /\[INSERIR FOTO: frente da residência\]/);
  assert.match(xml, /\[INSERIR FOTO: checklist manuscrito/);
  assert.match(xml, /\[DATA DA INSPEÇÃO\]/);
});

test('observações longas', async () => {
  const long = Array.from({ length: 25 }, (_, i) => `Parágrafo de observação adicional número ${i + 1}, registrado em campo para teste de paginação do documento gerado.`).join('\n');
  await build({ ...base, houseCode: '86204POE03', observations: { chips: base.observations.chips, freeText: long } }, {
    checklist: jpg('checklist.jpg', 2200, 1556), frente: jpg('frente.jpg', 1600, 1200), extras: []
  });
});
