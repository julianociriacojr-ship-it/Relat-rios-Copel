const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const GEO = require('../inspecao-sas/geo.js');

test('lê GPS gravado na foto', () => {
  const b = fs.readFileSync(path.join(__dirname, 'fixtures', 'estaca-gps.jpg'));
  const g = GEO.readExifGps(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  assert.ok(g);
  assert.strictEqual(GEO.fmt(g.lat), '-25,506547');
  assert.strictEqual(GEO.fmt(g.lon), '-48,380481');
});

test('foto sem GPS', () => {
  const b = fs.readFileSync(path.join(__dirname, 'fixtures', 'estaca.jpg'));
  assert.strictEqual(GEO.readExifGps(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), null);
});

test('confere região e formato', () => {
  assert.strictEqual(GEO.regionWarning(-25.506488, -48.380576), null);
  assert.match(GEO.regionWarning(25.506488, 48.380576), /negativas/);
  assert.match(GEO.regionWarning(-48.380576, -25.506488), /trocadas/);
  assert.strictEqual(GEO.parse('-25,506488'), -25.506488);
  assert.strictEqual(GEO.parse('abc'), null);
});

test('kml com os pontos', () => {
  const k = GEO.toKml('Comunidade Ponta Oeste', [{ name: '86204POE01', lat: -25.506488, lon: -48.380576 }, { name: '86204POE02', lat: null, lon: null }]);
  assert.match(k, /<coordinates>-48\.380576,-25\.506488,0<\/coordinates>/);
  assert.strictEqual((k.match(/<Placemark>/g) || []).length, 1);
});
