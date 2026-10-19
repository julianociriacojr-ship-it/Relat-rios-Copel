/* ======================================================================
   INSPEÇÃO SAS — BACKUP E RESTAURAÇÃO (.zip)
   O .zip fica fora do navegador (Downloads / Arquivos / WhatsApp / e-mail)
   e devolve tudo ao app: dados, coordenadas, círculo e fotos originais.
   Também serve para juntar inspeções de colegas num só aparelho.

   backup.zip
     backup.json   { formato, versao, geradoEm, inspecoes: [...], fotos: [{ id, inspectionId, slot, width, height, createdAt, arquivo }] }
     fotos/<id>.jpg
====================================================================== */
(function(root){
  const FORMATO = 'solarminas-inspecao-sas-backup';
  const VERSAO = 1;

  function photoIdsOf(i){
    const ids = Object.values(i.photos || {}).filter(Boolean);
    (i.extraPhotos || []).forEach(e => e.photoId && ids.push(e.photoId));
    return ids;
  }

  // inspections: registros; extraPhotoIds: fotos avulsas (ex.: mapa da comunidade)
  async function build(inspections, extraPhotoIds){
    const DB = root.SAS_DB;
    const zip = new root.JSZip();
    const fotos = [];
    const ids = new Set();
    inspections.forEach(i => photoIdsOf(i).forEach(id => ids.add(id)));
    (extraPhotoIds || []).forEach(id => ids.add(id));
    for (const id of ids){
      const p = await DB.getPhoto(id);
      if (!p) continue;
      const arquivo = 'fotos/' + p.id.replace(/[^A-Za-z0-9_-]/g, '_') + '.jpg';
      zip.file(arquivo, p.blob);
      fotos.push({ id: p.id, inspectionId: p.inspectionId, slot: p.slot, width: p.width, height: p.height, createdAt: p.createdAt, arquivo, tipo: p.blob.type || 'image/jpeg' });
    }
    zip.file('backup.json', JSON.stringify({ formato: FORMATO, versao: VERSAO, geradoEm: new Date().toISOString(), inspecoes: inspections, fotos }, null, 1));
    // Fotos já são JPEG: guardar sem recomprimir (mais rápido no celular).
    return zip.generateAsync({ type: 'blob', compression: 'STORE', mimeType: 'application/zip' });
  }

  // Restaura sem apagar nada: inspeção nova entra; a que já existe só é
  // substituída se a do backup for mais recente. Retorna um resumo.
  async function restore(file){
    const DB = root.SAS_DB;
    const zip = await root.JSZip.loadAsync(file);
    const meta = zip.file('backup.json');
    if (!meta) throw new Error('Arquivo não é um backup da Inspeção SAS (falta backup.json).');
    const data = JSON.parse(await meta.async('string'));
    if (data.formato !== FORMATO) throw new Error('Arquivo não é um backup da Inspeção SAS.');
    const res = { novas: 0, atualizadas: 0, mantidas: 0, fotos: 0, codigos: [] };
    const fotosPorInspecao = {};
    (data.fotos || []).forEach(f => { (fotosPorInspecao[f.inspectionId] = fotosPorInspecao[f.inspectionId] || []).push(f); });
    const putPhotos = async list => {
      for (const f of list || []){
        const entry = zip.file(f.arquivo);
        if (!entry) continue;
        const blob = new Blob([await entry.async('uint8array')], { type: f.tipo || 'image/jpeg' });
        await DB.putPhoto({ id: f.id, inspectionId: f.inspectionId, slot: f.slot, width: f.width, height: f.height, createdAt: f.createdAt, blob });
        res.fotos++;
      }
    };
    for (const rec of data.inspecoes || []){
      const cur = await DB.getInspection(rec.id);
      if (cur && (cur.updatedAt || '') >= (rec.updatedAt || '')){ res.mantidas++; continue; }
      await putPhotos(fotosPorInspecao[rec.id]);      // fotos antes do registro
      await DB.putInspection(rec);
      res[cur ? 'atualizadas' : 'novas']++;
      res.codigos.push(rec.houseCode);
    }
    // Fotos avulsas (mapas das comunidades)
    const avulsas = Object.keys(fotosPorInspecao).filter(k => k.startsWith('comunidade:'));
    for (const k of avulsas){
      for (const f of fotosPorInspecao[k]){
        const cur = await DB.getPhoto(f.id);
        if (!cur) await putPhotos([f]);
      }
    }
    return res;
  }

  function fileName(label){
    const d = new Date(); const pad = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    return `Backup_InspecaoSAS_${String(label || 'todas').replace(/[^A-Za-z0-9_-]+/g, '_')}_${stamp}.zip`;
  }

  root.SAS_BACKUP = { build, restore, fileName, photoIdsOf };
})(window);
