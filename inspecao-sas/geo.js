/* ======================================================================
   INSPEÇÃO SAS — COORDENADAS GEOGRÁFICAS
   - leitura do GPS gravado na foto (EXIF), quando o celular manteve
   - formatação com sinal e vírgula decimal (ex.: -25,506488)
   - conferência da região do projeto (litoral do Paraná)
   O GPS do celular funciona sem internet: só demora mais para fixar.
====================================================================== */
(function(root){
  // Faixa aproximada do litoral do Paraná. Fora dela, provavelmente houve
  // erro (ponto em outro lugar, latitude e longitude trocadas, sem sinal).
  const REGIAO = { latMin: -26.3, latMax: -24.9, lonMin: -49.2, lonMax: -47.9 };

  function fmt(v){ return (typeof v === 'number' && isFinite(v)) ? v.toFixed(6).replace('.', ',') : ''; }
  function parse(s){
    if (typeof s === 'number') return s;
    const n = parseFloat(String(s || '').trim().replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
  }
  // Aviso para coordenada fora da região (ou null se está ok).
  function regionWarning(lat, lon){
    if (lat == null || lon == null) return null;
    if (lat > 0 || lon > 0) return 'Latitude e longitude devem ser negativas (sul e oeste).';
    if (Math.abs(lat) > 40 && Math.abs(lon) < 40) return 'Parece que latitude e longitude estão trocadas.';
    if (lat < REGIAO.latMin || lat > REGIAO.latMax || lon < REGIAO.lonMin || lon > REGIAO.lonMax)
      return 'Coordenada fora do litoral do Paraná. Confira.';
    return null;
  }

  /* ---------------- EXIF: GPS da foto (JPEG) ---------------- */
  function readExifGps(buffer){
    try{
      const v = new DataView(buffer);
      if (v.getUint16(0) !== 0xFFD8) return null;
      let off = 2;
      while (off + 4 < v.byteLength){
        const marker = v.getUint16(off);
        const len = v.getUint16(off + 2);
        if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
        if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) break;
        off += 2 + len;
      }
    }catch(e){}
    return null;
  }
  function parseTiff(v, tiff){
    const le = v.getUint16(tiff) === 0x4949;
    const u16 = o => v.getUint16(o, le), u32 = o => v.getUint32(o, le);
    const ifd0 = tiff + u32(tiff + 4);
    let gpsIfd = null;
    for (let i = 0, n = u16(ifd0); i < n; i++){
      const e = ifd0 + 2 + i * 12;
      if (u16(e) === 0x8825) gpsIfd = tiff + u32(e + 8);
    }
    if (!gpsIfd) return null;
    const tags = {};
    for (let i = 0, n = u16(gpsIfd); i < n; i++){
      const e = gpsIfd + 2 + i * 12, tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      if (type === 2) tags[tag] = String.fromCharCode(v.getUint8(count <= 4 ? e + 8 : tiff + u32(e + 8)));
      else if (type === 5){
        const p = tiff + u32(e + 8), vals = [];
        for (let k = 0; k < count; k++){ const den = u32(p + k * 8 + 4); vals.push(den ? u32(p + k * 8) / den : 0); }
        tags[tag] = vals;
      }
    }
    const dms = a => a && a.length === 3 ? a[0] + a[1] / 60 + a[2] / 3600 : null;
    let lat = dms(tags[2]), lon = dms(tags[4]);
    if (lat == null || lon == null || (lat === 0 && lon === 0)) return null;
    if (tags[1] === 'S') lat = -lat;
    if (tags[3] === 'W') lon = -lon;
    return { lat, lon };
  }

  /* ---------------- GPS ao vivo ---------------- */
  // Média ponderada das leituras boas: usa só as que estão perto da melhor
  // precisão (até 1,5x a melhor e no máximo 20 m), com peso 1/precisão².
  // Parado ao lado da estaca, isso reduz o "vai e vem" do GPS do celular.
  function combine(readings){
    if (!readings.length) return null;
    const min = Math.min(...readings.map(r => r.accuracy));
    const use = readings.filter(r => r.accuracy <= Math.max(min * 1.5, min + 2) && r.accuracy <= 20);
    if (!use.length){
      const b = readings.reduce((a, r) => (r.accuracy < a.accuracy ? r : a));
      return { ...b, samples: 1 };
    }
    let sw = 0, la = 0, lo = 0;
    use.forEach(r => { const w = 1 / Math.max(r.accuracy, 1) ** 2; sw += w; la += r.lat * w; lo += r.lon * w; });
    return { lat: la / sw, lon: lo / sw, accuracy: min, samples: use.length, at: use[use.length - 1].at };
  }
  // Acompanha a posição e devolve a média das melhores leituras. onUpdate(best, last).
  function watch(onUpdate, onError){
    if (!navigator.geolocation){ onError(new Error('Este aparelho não oferece GPS ao navegador.')); return () => {}; }
    const readings = [];
    const id = navigator.geolocation.watchPosition(p => {
      const cur = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: Math.round(p.coords.accuracy), at: new Date(p.timestamp || Date.now()).toISOString() };
      readings.push(cur);
      if (readings.length > 120) readings.shift();
      onUpdate(combine(readings), cur);
    }, err => onError(err), { enableHighAccuracy: true, maximumAge: 0, timeout: 120000 });
    return () => navigator.geolocation.clearWatch(id);
  }
  function errorMessage(err){
    if (!err) return 'Falha no GPS.';
    if (err.code === 1) return 'Permissão de localização negada. Libere a localização para este site nas configurações do navegador.';
    if (err.code === 2) return 'GPS sem sinal. Vá para um lugar aberto, longe de telhado e árvores.';
    if (err.code === 3) return 'O GPS demorou para responder. Tente de novo em lugar aberto.';
    return err.message || 'Falha no GPS.';
  }

  /* ---------------- KML (Google Earth) ---------------- */
  // Pontos das estacas para abrir no Google Earth e salvar a imagem aérea
  // da comunidade com as residências marcadas.
  function toKml(title, points){
    const x = s => String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
    const marks = points.filter(p => typeof p.lat === 'number' && typeof p.lon === 'number').map(p => `
    <Placemark><name>${x(p.name)}</name><styleUrl>#estaca</styleUrl>
      <Point><coordinates>${p.lon.toFixed(6)},${p.lat.toFixed(6)},0</coordinates></Point></Placemark>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <name>${x(title)}</name>
  <Style id="estaca"><IconStyle><color>ff0000ff</color><scale>1.1</scale>
    <Icon><href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href></Icon></IconStyle>
    <LabelStyle><scale>1.0</scale></LabelStyle></Style>${marks}
</Document></kml>
`;
  }

  const api = { fmt, parse, regionWarning, readExifGps, watch, combine, errorMessage, toKml, REGIAO };
  root.SAS_GEO = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
