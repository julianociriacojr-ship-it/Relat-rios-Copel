// Gera PDFs de exemplo com o jsPDF de vendor/ e confere o básico.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
// Carrega o mesmo arquivo do navegador, como global (sem exports/module).
new Function('exports', 'module', 'define', fs.readFileSync(path.join(__dirname, '..', 'vendor', 'jspdf.umd.min.js'), 'utf8'))();
require('../inspecao-sas/config.js');
require('../inspecao-sas/observations.js');
const { buildPdf, pdfFileName } = require('../inspecao-sas/report-pdf.js');

const fx = f => new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', f)));
const jpg = (f, w, h) => ({ data: fx(f), width: w, height: h, type: 'jpg' });
const logo = { data: new Uint8Array(fs.readFileSync(path.join(__dirname, '..', 'inspecao-sas', 'logo-solarminas.jpg'))), width: 772, height: 235, type: 'jpg' };
const card = { data: new Uint8Array(fs.readFileSync(path.join(__dirname, '..', 'inspecao-sas', 'cartao-contato.png'))), width: 1050, height: 600, type: 'png' };
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const base = {
  communityId: 'poe', houseNumber: '01', houseCode: '86204POE01', inspectionDate: '2026-10-13',
  technician: 'Juliano Ciriaco da Silva Junior', docCode: 'SAC-RELAT.SM 22/07/26', rev: '00',
  observations: { chips: { agua: 'poco', bomba: 'sim' }, freeText: '' }
};
const pages = buf => (Buffer.from(buf).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

test('pdf completo', () => {
  const buf = buildPdf({ inspection: base, logo, card, images: {
    checklist: jpg('checklist.jpg', 2200, 1556), frente: jpg('frente.jpg', 1600, 1200),
    estaca: jpg('estaca.jpg', 1200, 1600), estacaCodigo: jpg('estaca.jpg', 1200, 1600),
    extras: [{ ...jpg('frente.jpg', 1600, 1200), caption: 'Chuveiro' }]
  } });
  fs.writeFileSync(path.join(OUT, pdfFileName(base.houseCode)), Buffer.from(buf));
  assert.strictEqual(pdfFileName(base.houseCode), 'Relatorio_Visita_86204POE01.pdf');
  assert.ok(pages(buf) >= 7);
  assert.ok(buf.byteLength < 8 * 1024 * 1024);
});

test('pdf com fotos faltando e observações longas', () => {
  const long = Array.from({ length: 25 }, (_, i) => `Parágrafo de observação adicional número ${i + 1}, registrado em campo para teste de paginação do documento gerado.`).join('\n');
  const buf = buildPdf({ inspection: { ...base, houseCode: '86204POE03', inspectionDate: '', observations: { chips: base.observations.chips, freeText: long } }, logo, card, images: { extras: [] } });
  fs.writeFileSync(path.join(OUT, 'Relatorio_Visita_86204POE03.pdf'), Buffer.from(buf));
  assert.ok(pages(buf) >= 8);
});
