/* ======================================================================
   INSPEÇÃO SAS (PEE COPEL) — TELAS
   Lista de inspeções + formulário em 5 passos. Tudo salvo no aparelho
   (IndexedDB) a cada alteração. Rotas: #/ (lista), #/i/<id>/<passo>,
   #/memorial/<comunidade>.
====================================================================== */
(function(){
  const CFG = window.SAS_CONFIG, OBS = window.SAS_OBS, DB = window.SAS_DB, IMG = window.SAS_IMG, REP = window.SAS_REPORT, PDF = window.SAS_PDF;
  const GEO = window.SAS_GEO, BACKUP = window.SAS_BACKUP, MEMORIAL = window.SAS_MEMORIAL, MEMCFG = window.SAS_MEMORIAL_CONFIG;
  const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const PDF_MIME = 'application/pdf';
  const STEPS = ['Identificação', 'Checklist', 'Fotos', 'Observações', 'Revisão'];
  const STEPS_SHORT = ['Dados', 'Checklist', 'Fotos', 'Obs.', 'Revisão'];
  const STATUS_LABEL = { draft: 'Rascunho', ready: 'Pronto', exported: 'Exportado' };
  const FILTER_KEY = 'sas_filtro_comunidade'; // conveniência por aparelho, não é dado da inspeção
  const ENGINEER_KEY = 'sas_memorial_engenheiro';
  const ZIP_MIME = 'application/zip';

  const view = document.getElementById('view');
  const footer = document.getElementById('footer');
  const saveState = document.getElementById('save-state');

  const S = {
    list: [],          // todas as inspeções (para lista e checagem de código duplicado)
    insp: null,        // inspeção aberta
    step: 1,
    saveTimer: null,
    savePromise: Promise.resolve(),
    urls: {},          // photoId -> objectURL
    lastExport: null,  // { files: [{ blob, name, type, label, icon, share }] }
    gpsStop: null,     // encerra o GPS ao vivo
    gpsBest: null
  };

  /* ---------------- utilitários ---------------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const fmtDate = iso => iso ? REP.fmtDate(iso) : 'sem data';
  function toast(msg, isError, ms){
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast' + (isError ? ' error' : ''); t.style.display = 'block';
    clearTimeout(t._h); t._h = setTimeout(() => { t.style.display = 'none'; }, ms || 2400);
  }
  function overlay(text){
    const o = document.createElement('div'); o.className = 'overlay'; o.innerHTML = `<div>${esc(text)}</div>`;
    document.body.appendChild(o); return () => o.remove();
  }
  function getPath(obj, path){ return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
  function setPath(obj, path, val){
    const ks = path.split('.'); let o = obj;
    ks.slice(0, -1).forEach(k => { if (o[k] == null) o[k] = {}; o = o[k]; });
    o[ks[ks.length - 1]] = val;
  }
  async function blobBytes(blob){
    const buf = blob.arrayBuffer ? await blob.arrayBuffer() : await new Response(blob).arrayBuffer();
    return new Uint8Array(buf);
  }

  /* ---------------- modelo ---------------- */
  function newInspection(){
    const now = new Date().toISOString();
    return {
      id: uid(), communityId: '', houseNumber: '', houseCode: '',
      inspectionDate: todayISO(), technician: CFG.defaultTechnician,
      docCode: CFG.docCode, rev: CFG.rev,
      photos: { checklist: null, frente: null, estaca: null, estacaMarcada: null, estacaCodigo: null },
      estacaCircles: [],
      extraPhotos: [],
      observations: { chips: {}, freeText: '', finalText: '', finalEdited: false },
      recommendation: '',
      gps: null,       // { lat, lon, accuracy, at, source: 'gps' | 'foto' | 'manual' }
      status: 'draft', createdAt: now, updatedAt: now, exportedAt: null, backupAt: null
    };
  }

  // Pendências: 'hard' bloqueia o status Pronto; 'soft' é só aviso.
  function pendencias(i){
    const out = [];
    const add = (msg, soft) => out.push({ msg, soft: !!soft });
    const c = OBS.getCommunity(i.communityId);
    if (!c) add('Comunidade não selecionada.');
    const hnErr = OBS.houseNumberError(i.communityId, i.houseNumber);
    if (hnErr) add(hnErr);
    if (c && !c.prefix) add(`Prefixo do código de ${c.nome} ainda não confirmado. O código sai como ${OBS.buildHouseCode(i.communityId, i.houseNumber)}.`);
    if (OBS.houseCodeComplete(i.houseCode)){
      const dup = S.list.find(o => o.id !== i.id && o.houseCode === i.houseCode);
      if (dup) add(`Já existe outra inspeção com o código ${i.houseCode} neste aparelho.`);
    }
    if (!i.inspectionDate) add('Data da inspeção não informada.');
    if (!String(i.technician || '').trim()) add('Responsável técnico não informado.');
    if (!i.photos.checklist) add('Falta a foto do checklist manuscrito.');
    if (!i.photos.frente) add('Falta a Figura 1 (frente da residência).');
    if (!i.photos.estaca) add('Falta a Figura 2 (local da estaca).');
    else if (!(i.estacaCircles || []).length) add('Figura 2 sem o círculo vermelho marcando a estaca.', true);
    if (!i.photos.estacaCodigo) add('Falta a Figura 3 (estaca com o código).');
    (i.extraPhotos || []).forEach((e, k) => { if (!String(e.caption || '').trim()) add(`Figura ${k + 4} sem legenda.`); });
    const ch = (i.observations && i.observations.chips) || {};
    const semResposta = OBS.CHIPS.filter(g => !ch[g.key]).map(g => g.label);
    if (semResposta.length) add('Observações sem resposta: ' + semResposta.join(', ') + '.', true);
    if (!String(i.observations.finalText || '').trim()) add('Observações técnicas vazias.');
    if (!i.gps) add('Coordenadas GPS da estaca não registradas (necessárias para o memorial).', true);
    else { const w = GEO.regionWarning(i.gps.lat, i.gps.lon); if (w) add('Coordenadas: ' + w, true); }
    return out;
  }
  function stepDone(i, n){
    if (n === 1) return !!OBS.getCommunity(i.communityId) && !OBS.houseNumberError(i.communityId, i.houseNumber) && !!i.inspectionDate && !!String(i.technician || '').trim();
    if (n === 2) return !!i.photos.checklist;
    if (n === 3) return !!(i.photos.frente && i.photos.estaca && i.photos.estacaCodigo && i.gps);
    if (n === 4) return !!String(i.observations.finalText || '').trim();
    return false;
  }

  /* ---------------- salvamento automático ---------------- */
  function touch(){
    const i = S.insp; if (!i) return;
    i.houseNumber = OBS.normalizeHouseNumber(i.houseNumber) || i.houseNumber;
    i.houseCode = OBS.buildHouseCode(i.communityId, i.houseNumber);
    i.status = pendencias(i).some(p => !p.soft) ? 'draft' : 'ready';
    i.updatedAt = new Date().toISOString();
  }
  function setSaveState(cls, txt){ saveState.className = 'save-state ' + cls; saveState.textContent = txt; }
  function scheduleSave(){
    setSaveState('pending', 'Salvando…');
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(flushSave, 350);
  }
  function flushSave(){
    clearTimeout(S.saveTimer); S.saveTimer = null;
    const i = S.insp; if (!i) return S.savePromise;
    touch();
    const snapshot = JSON.parse(JSON.stringify(i));
    S.savePromise = S.savePromise.then(() => DB.putInspection(snapshot)).then(() => {
      const k = S.list.findIndex(o => o.id === snapshot.id);
      if (k >= 0) S.list[k] = snapshot; else S.list.push(snapshot);
      setSaveState('', '✓ Salvo');
    }).catch(err => {
      console.error(err);
      setSaveState('error', '⚠ Não salvou');
      toast('Falha ao salvar no aparelho. Verifique o espaço livre.', true, 5000);
    });
    return S.savePromise;
  }
  // Ao trocar de app, bloquear a tela ou fechar: grava imediatamente.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && S.saveTimer) flushSave(); });
  window.addEventListener('pagehide', () => { if (S.saveTimer) flushSave(); });

  /* ---------------- fotos ---------------- */
  async function photoURL(id){
    if (!id) return null;
    if (S.urls[id]) return S.urls[id];
    const p = await DB.getPhoto(id);
    if (!p) return null;
    return (S.urls[id] = URL.createObjectURL(p.blob));
  }
  function dropURL(id){ if (id && S.urls[id]){ URL.revokeObjectURL(S.urls[id]); delete S.urls[id]; } }
  async function storePhoto(slot, file){
    const big = slot === 'checklist';
    const r = await IMG.resizeToJpeg(file, big ? CFG.photos.checklistMaxSide : CFG.photos.maxSide, big ? CFG.photos.checklistQuality : CFG.photos.quality);
    const rec = { id: uid(), inspectionId: S.insp.id, slot, blob: r.blob, width: r.width, height: r.height, createdAt: new Date().toISOString() };
    await DB.putPhoto(rec);
    return rec;
  }
  async function replaceSlot(slot, newId){
    const old = S.insp.photos[slot];
    S.insp.photos[slot] = newId;
    if (old && old !== newId){ dropURL(old); await DB.deletePhoto(old); }
  }
  async function burnEstaca(){
    const i = S.insp;
    if (!i.photos.estaca || !(i.estacaCircles || []).length){ await replaceSlot('estacaMarcada', null); return; }
    const src = await DB.getPhoto(i.photos.estaca);
    const r = await IMG.burnCircles(src.blob, i.estacaCircles, CFG.photos.quality);
    const rec = { id: uid(), inspectionId: i.id, slot: 'estacaMarcada', blob: r.blob, width: r.width, height: r.height, createdAt: new Date().toISOString() };
    await DB.putPhoto(rec);
    await replaceSlot('estacaMarcada', rec.id);
  }
  async function editCircles(){
    const i = S.insp;
    const src = await DB.getPhoto(i.photos.estaca);
    if (!src) return;
    const res = await IMG.openCircleEditor(src.blob, i.estacaCircles);
    if (res === null) return;
    const done = overlay('Gravando círculo…');
    try{
      i.estacaCircles = res;
      await burnEstaca();
      await flushSave();
    } finally { done(); }
    renderStep();
  }
  async function onPhotoInput(input){
    const file = input.files && input.files[0];
    const slot = input.dataset.slotInput;
    input.value = '';
    if (!file) return;
    const done = overlay('Processando foto…');
    try{
      // Foto da galeria com GPS gravado: aproveita a coordenada se ainda não há.
      if (!S.insp.gps && (slot === 'estaca' || slot === 'estacaCodigo')){
        try{
          const g = GEO.readExifGps(await (file.arrayBuffer ? file.arrayBuffer() : new Response(file).arrayBuffer()));
          if (g){ S.insp.gps = { lat: g.lat, lon: g.lon, accuracy: null, at: new Date(file.lastModified || Date.now()).toISOString(), source: 'foto' }; toast('📍 Coordenadas lidas da foto', false, 2500); }
        }catch(e){ /* foto sem EXIF */ }
      }
      const rec = await storePhoto(slot === 'extra' ? 'extra' : slot, file);
      if (slot === 'extra'){
        S.insp.extraPhotos.push({ photoId: rec.id, caption: '' });
      } else {
        await replaceSlot(slot, rec.id);
        if (slot === 'estaca'){ S.insp.estacaCircles = []; await replaceSlot('estacaMarcada', null); }
      }
      await flushSave();
      toast('✓ Foto salva no aparelho', false, 1400);
    } catch(err){
      console.error(err);
      toast('Não foi possível ler a foto. Tente novamente.', true, 4000);
    } finally { done(); }
    await renderStep();
    if (slot === 'estaca') editCircles();
    if (slot === 'extra'){
      const inputs = view.querySelectorAll('[data-extra-caption]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    }
  }

  /* ---------------- rotas ---------------- */
  async function route(){
    if (S.saveTimer) await flushSave();
    stopGps();
    const mm = location.hash.match(/^#\/memorial\/([^/]+)/);
    if (mm && OBS.getCommunity(mm[1])){ S.insp = null; await renderMemorial(mm[1]); return; }
    const m = location.hash.match(/^#\/i\/([^/]+)(?:\/(\d))?/);
    if (m){
      if (!S.insp || S.insp.id !== m[1]){
        const rec = await DB.getInspection(m[1]);
        if (!rec){ location.hash = '#/'; return; }
        Object.values(S.urls).forEach(u => URL.revokeObjectURL(u)); S.urls = {};
        S.insp = rec; S.lastExport = null;
      }
      S.step = Math.min(5, Math.max(1, parseInt(m[2] || '1', 10)));
      await renderForm();
    } else {
      S.insp = null;
      await renderList();
    }
  }
  window.addEventListener('hashchange', route);
  const goStep = n => { location.hash = `#/i/${S.insp.id}/${n}`; };

  /* ---------------- lista ---------------- */
  const needsBackup = i => !i.backupAt || i.backupAt < (i.updatedAt || '');
  async function renderList(){
    document.getElementById('title').textContent = 'Inspeção SAS (PEE Copel)';
    document.getElementById('subtitle').textContent = 'Comunidades isoladas · litoral do Paraná';
    const back = document.getElementById('back-btn'); back.href = 'index.html';
    setSaveState('', '');
    S.list = await DB.listInspections();
    let filter = ''; try { filter = localStorage.getItem(FILTER_KEY) || ''; } catch(e){}
    if (filter && !OBS.getCommunity(filter)) filter = '';
    const items = S.list.filter(i => !filter || i.communityId === filter)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const counts = {}; S.list.forEach(i => { counts[i.communityId] = (counts[i.communityId] || 0) + 1; });
    const semBackup = items.filter(needsBackup).length;
    const fc = OBS.getCommunity(filter);
    view.innerHTML = `
      <div class="list-tools">
        <select id="filter" aria-label="Filtrar por comunidade">
          <option value="">Todas as comunidades (${S.list.length})</option>
          ${CFG.communities.map(c => `<option value="${c.id}" ${filter === c.id ? 'selected' : ''}>${esc(c.nome)} (${counts[c.id] || 0}/${c.moradias})</option>`).join('')}
        </select>
        ${semBackup ? `<div class="warn-box"><b>⚠ ${semBackup} ${semBackup === 1 ? 'inspeção alterada' : 'inspeções alteradas'} desde o último backup.</b><br>Os dados estão só neste aparelho. Faça o backup e guarde o arquivo fora do celular (WhatsApp, e-mail, Drive).</div>` : ''}
        <div class="photo-row">
          <button type="button" class="btn-ghost" id="btn-backup" style="flex:1" ${items.length ? '' : 'disabled'}>💾 Backup${fc ? ' da comunidade' : ' de tudo'}</button>
          <label class="btn-ghost" style="flex:1;display:flex;align-items:center;justify-content:center;cursor:pointer">📥 Restaurar backup<input type="file" id="restore-input" accept=".zip,application/zip" multiple style="display:none"></label>
        </div>
        ${fc ? `<a class="btn-teal" href="#/memorial/${fc.id}" style="text-decoration:none;display:flex;align-items:center;justify-content:center">📄 Memorial descritivo · ${esc(fc.nome)}</a>`
             : '<p class="hint" style="margin:0">Para gerar o memorial descritivo, escolha a comunidade no filtro acima.</p>'}
      </div>
      ${items.length ? items.map(i => {
        const c = OBS.getCommunity(i.communityId);
        return `<button type="button" class="insp-card" data-open="${i.id}">
          <div class="main">
            <div class="code">${esc(OBS.houseCodeComplete(i.houseCode) ? i.houseCode : (i.houseCode || 'Sem código'))}</div>
            <div class="sub">${esc(c ? c.nome : 'Comunidade não definida')} · ${esc(fmtDate(i.inspectionDate))}</div>
            <div class="sub">${i.gps ? '📍 com coordenadas' : '📍 sem coordenadas'}${needsBackup(i) ? ' · 💾 sem backup' : ' · 💾 backup ok'}</div>
          </div>
          <span class="status ${i.status}">${STATUS_LABEL[i.status] || i.status}</span>
        </button>`;
      }).join('') : `<div class="empty">Nenhuma inspeção${filter ? ' nesta comunidade' : ''} neste aparelho.<br>Toque em “Nova inspeção” para começar.</div>`}
      <p class="hint" id="storage-hint"></p>`;
    footer.style.display = 'flex';
    footer.innerHTML = `<button type="button" class="btn-primary" id="btn-new">+ Nova inspeção</button>`;
    document.getElementById('btn-new').onclick = async () => {
      const i = newInspection();
      if (filter) i.communityId = filter;
      S.insp = i; await flushSave();
      location.hash = `#/i/${i.id}/1`;
    };
    document.getElementById('filter').onchange = e => { try { localStorage.setItem(FILTER_KEY, e.target.value); } catch(err){} renderList(); };
    view.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { location.hash = `#/i/${b.dataset.open}/1`; });
    document.getElementById('btn-backup').onclick = () => backupInspections(items, fc ? fc.nome : 'todas');
    document.getElementById('restore-input').onchange = e => restoreBackups(e.target);
    const est = await DB.estimate();
    const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : false;
    const hint = document.getElementById('storage-hint');
    if (hint){
      const parts = [];
      if (est && est.usage != null) parts.push(`Dados neste aparelho: ${(est.usage / 1048576).toFixed(1)} MB`);
      if (!persisted) parts.push('Armazenamento ainda não marcado como permanente pelo navegador. Instale o app na tela inicial e faça backup ao fim de cada visita.');
      hint.textContent = parts.join('. ');
    }
  }

  /* ---------------- backup e restauração ---------------- */
  async function markBackedUp(list, at){
    for (const rec of list){
      const cur = await DB.getInspection(rec.id);
      if (!cur || (cur.updatedAt || '') > at) continue;   // mudou depois de começar o backup
      cur.backupAt = at;
      await DB.putInspection(cur);
    }
  }
  async function backupInspections(list, label){
    if (!list.length) return;
    const done = overlay(`Montando backup de ${list.length} ${list.length === 1 ? 'inspeção' : 'inspeções'}…`);
    try{
      const at = new Date().toISOString();
      const fresh = [];
      for (const i of list){ const r = await DB.getInspection(i.id); if (r) fresh.push(r); }
      const mapas = CFG.communities.map(c => 'mapa:' + c.id);
      const blob = await BACKUP.build(fresh.map(r => ({ ...r, backupAt: at })), mapas);
      const f = { blob, name: BACKUP.fileName(label), type: ZIP_MIME, label: 'backup', icon: '💾' };
      await markBackedUp(fresh, at);
      done();
      await shareOrDownload(f, 'Backup pronto');
      if (!S.insp) renderList();
    }catch(err){
      done(); console.error(err);
      toast('Erro ao montar o backup: ' + (err && err.message || err), true, 6000);
    }
  }
  // Oferece compartilhar (WhatsApp, e-mail, Drive) e também baixa o arquivo.
  async function shareOrDownload(f, title){
    downloadViaLink(f);
    const file = asFile(f);
    let canShare = false;
    try { canShare = !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch(e){}
    const box = document.createElement('div');
    box.className = 'overlay';
    box.innerHTML = `<div style="max-width:92vw;text-align:center">${esc(title)}<br><small style="font-weight:600;color:#3F4D52">${esc(f.name)} · ${sizeMB(f.blob)}<br>Baixado na pasta Downloads. Guarde também fora do celular.</small>
      <div class="photo-row" style="margin-top:14px">${canShare ? '<button type="button" class="btn-teal" data-a="share">📤 Enviar</button>' : ''}<button type="button" class="btn-ghost" data-a="ok" style="flex:1">OK</button></div></div>`;
    document.body.appendChild(box);
    box.addEventListener('click', async e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'share'){
        try { await navigator.share({ files: [file], title: f.name }); }
        catch(err){ if (!err || err.name !== 'AbortError') toast('Não abriu o compartilhamento.', true); }
      }
      box.remove();
    });
  }
  async function restoreBackups(input){
    const files = Array.from(input.files || []);
    input.value = '';
    if (!files.length) return;
    const done = overlay('Restaurando backup…');
    const tot = { novas: 0, atualizadas: 0, mantidas: 0, fotos: 0 };
    try{
      for (const f of files){
        const r = await BACKUP.restore(f);
        tot.novas += r.novas; tot.atualizadas += r.atualizadas; tot.mantidas += r.mantidas; tot.fotos += r.fotos;
      }
      done();
      toast(`✓ Backup restaurado: ${tot.novas} nova(s), ${tot.atualizadas} atualizada(s), ${tot.mantidas} já estava(m) em dia.`, false, 6000);
    }catch(err){
      done(); console.error(err);
      toast('Erro ao restaurar: ' + (err && err.message || err), true, 7000);
    }
    renderList();
  }

  /* ---------------- memorial descritivo ---------------- */
  const assetCache = {};
  async function loadAsset(path){
    if (assetCache[path] !== undefined) return assetCache[path];
    try{
      const r = await fetch('inspecao-sas/' + path);
      if (!r.ok) throw new Error(r.status);
      const blob = await r.blob();
      const im = await IMG.decode(blob);
      const width = im.naturalWidth || im.width, height = im.naturalHeight || im.height;
      if (im.close) im.close();
      assetCache[path] = { data: await blobBytes(blob), width, height, type: /\.png$/i.test(path) ? 'png' : 'jpg' };
    }catch(e){ console.warn('Imagem indisponível', path, e); assetCache[path] = null; }
    return assetCache[path];
  }
  // Coordenadas por código: a inspeção mais recente com GPS de cada casa.
  function coordsOf(communityId){
    const out = {};
    S.list.filter(i => i.communityId === communityId && i.gps && OBS.houseCodeComplete(i.houseCode))
      .sort((a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''))
      .forEach(i => { out[i.houseCode] = { lat: i.gps.lat, lon: i.gps.lon }; });
    return out;
  }
  async function renderMemorial(cid){
    const c = OBS.getCommunity(cid);
    const m = MEMCFG.comunidades[cid] || {};
    S.list = await DB.listInspections();
    document.getElementById('title').textContent = 'Memorial descritivo';
    document.getElementById('subtitle').textContent = c.nome;
    document.getElementById('back-btn').href = '#/';
    setSaveState('', '');
    const rows = MEMORIAL.coordinateRows(cid, coordsOf(cid));
    const ok = rows.filter(r => r.lat).length;
    const custom = await DB.getPhoto('mapa:' + cid);
    const mapUrl = custom ? URL.createObjectURL(custom.blob) : (m.mapa ? 'inspecao-sas/' + m.mapa : null);
    let eng = CFG.defaultTechnician; try { eng = localStorage.getItem(ENGINEER_KEY) || eng; } catch(e){}
    view.innerHTML = `
      <section class="card"><h2>${esc(m.nome || c.nome)}</h2>
        <p style="margin:0 0 8px">${esc(c.municipio)} · ${c.moradias} moradias</p>
        <div class="${ok === rows.length ? 'all-ok' : 'warn-box'}">📍 Coordenadas: <b>${ok} de ${rows.length}</b> residências.${ok < rows.length ? '<br>As que faltam saem como [PENDENTE] na Tabela 1.' : ''}</div>
        <details ${ok < rows.length ? 'open' : ''}><summary>Tabela 1 · coordenadas</summary>
          <table class="sum-table"><tr><td><b>Residência</b></td><td><b>Latitude · Longitude</b></td></tr>
          ${rows.map(r => `<tr><td>${esc(r.code)}</td><td>${r.lat ? esc(r.lat + ' · ' + r.lon) : '<b style="color:#A3271B">pendente</b>'}</td></tr>`).join('')}</table>
        </details>
        <p class="hint">Inspeções feitas em outro celular: peça ao colega o backup (.zip) e use “Restaurar backup” na lista. As coordenadas dele entram aqui.</p>
        <button type="button" class="btn-line" id="btn-kml" ${ok ? '' : 'disabled'}>🌍 Pontos para o Google Earth (.kml)</button>
        <p class="hint">Abra o .kml no Google Earth (computador ou celular): as estacas aparecem marcadas sobre a imagem de satélite. Salve a imagem e use em “Trocar mapa” abaixo.</p>
      </section>
      <section class="card"><h2>Mapa de localização (Figura 1)</h2>
        ${mapUrl ? `<img src="${mapUrl}" alt="Mapa" style="width:100%;border-radius:8px;border:1px solid var(--line)">
          <label style="display:flex;gap:10px;align-items:center;margin-top:10px;font-size:15px;min-height:44px"><input type="checkbox" id="map-skip" style="width:22px;height:22px"> Não incluir: deixar o espaço vazio para colar a imagem depois</label>`
          : '<div class="slot-empty">Sem imagem. O documento sai com um quadro reservado do tamanho da imagem, com a legenda “Figura 1”, para você colar a montagem no Word.</div>'}
        <div class="photo-row" style="margin-top:10px">
          <label class="photo-btn secondary">🖼️ ${mapUrl ? 'Trocar mapa' : 'Escolher mapa'}<input type="file" accept="image/*" id="map-input"></label>
          ${custom ? '<button type="button" class="btn-ghost" id="btn-map-reset">Voltar ao padrão</button>' : ''}
        </div>
      </section>
      <section class="card"><h2>Engenheiro responsável</h2>
        <input type="text" id="mem-eng" value="${esc(eng)}" autocomplete="name">
      </section>
      <section class="card"><h2>Gerar</h2>
        <button type="button" class="btn-primary" id="btn-memorial" style="width:100%">Gerar memorial (.docx)</button>
      </section>`;
    footer.style.display = 'flex';
    footer.innerHTML = '<a class="btn-ghost" href="#/" style="text-decoration:none;display:flex;align-items:center;justify-content:center;flex:1">← Lista</a>';
    document.getElementById('mem-eng').oninput = e => { try { localStorage.setItem(ENGINEER_KEY, e.target.value); } catch(err){} };
    document.getElementById('map-input').onchange = async e => {
      const file = e.target.files && e.target.files[0]; e.target.value = '';
      if (!file) return;
      const done = overlay('Processando mapa…');
      try{
        const r = await IMG.resizeToJpeg(file, 2400, 0.85);
        await DB.putPhoto({ id: 'mapa:' + cid, inspectionId: 'comunidade:' + cid, slot: 'mapa', blob: r.blob, width: r.width, height: r.height, createdAt: new Date().toISOString() });
      }catch(err){ toast('Não foi possível ler a imagem.', true); }
      done(); renderMemorial(cid);
    };
    document.getElementById('btn-kml').onclick = () => {
      const pts = rows.filter(r => r.lat).map(r => ({ name: r.code, lat: GEO.parse(r.lat), lon: GEO.parse(r.lon) }));
      const kml = GEO.toKml(m.nome || c.nome, pts);
      const name = MEMORIAL.memorialFileName(cid).replace(/^Memorial_Descritivo_/, 'Estacas_').replace(/\.docx$/, '.kml');
      shareOrDownload({ blob: new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }), name, type: 'application/vnd.google-earth.kml+xml', label: 'KML', icon: '🌍' }, 'Pontos exportados');
    };
    const reset = document.getElementById('btn-map-reset');
    if (reset) reset.onclick = async () => { await DB.deletePhoto('mapa:' + cid); renderMemorial(cid); };
    document.getElementById('btn-memorial').onclick = async () => {
      const done = overlay('Gerando memorial…');
      try{
        const cc = CFG.contactCard;
        const skipMap = !!(document.getElementById('map-skip') || {}).checked;
        const mapa = skipMap ? null : custom ? { data: await blobBytes(custom.blob), width: custom.width, height: custom.height, type: 'jpg' } : (m.mapa ? await loadAsset(m.mapa) : null);
        const images = {
          logo: await loadAsset('memorial/logo-vertical.png'),
          mapa,
          vistas: await Promise.all(MEMCFG.vistas.map(v => loadAsset(v.file))),
          card: cc ? await loadAsset(cc.file) : null
        };
        const blob = await MEMORIAL.buildMemorial({ communityId: cid, coords: coordsOf(cid), engineer: document.getElementById('mem-eng').value, images, outputType: 'blob' });
        done();
        await shareOrDownload({ blob: new Blob([blob], { type: WORD_MIME }), name: MEMORIAL.memorialFileName(cid), type: WORD_MIME, label: '.docx', icon: '📝' }, 'Memorial gerado');
      }catch(err){
        done(); console.error(err);
        toast('Erro ao gerar o memorial: ' + (err && err.message || err), true, 6000);
      }
    };
  }

  /* ---------------- formulário ---------------- */
  async function renderForm(){
    const i = S.insp;
    document.getElementById('title').textContent = OBS.houseCodeComplete(i.houseCode) ? i.houseCode : 'Nova inspeção';
    document.getElementById('subtitle').textContent = `Passo ${S.step} de 5 · ${STEPS[S.step - 1]}`;
    document.getElementById('back-btn').href = '#/';
    await renderStep();
    window.scrollTo({ top: 0 });
  }

  function stepsBar(){
    return `<nav class="steps">${STEPS.map((s, k) => `<button type="button" data-step="${k + 1}" aria-label="Passo ${k + 1}: ${s}" class="${S.step === k + 1 ? 'active' : ''} ${stepDone(S.insp, k + 1) ? 'done' : ''}"><b>${stepDone(S.insp, k + 1) && S.step !== k + 1 ? '✓' : k + 1}</b>${STEPS_SHORT[k]}</button>`).join('')}</nav>`;
  }

  async function slotHTML(slot, title, emptyText, opts = {}){
    const i = S.insp;
    const id = opts.showId || i.photos[slot];
    const url = await photoURL(id);
    const has = !!i.photos[slot];
    return `<div class="slot">
      <div class="slot-head"><strong>${esc(title)}</strong><span class="badge ${has ? 'ok' : 'missing'}">${has ? '✓ Foto salva' : 'Faltando'}</span></div>
      ${url ? `<img src="${url}" alt="${esc(title)}">` : `<div class="slot-empty">${esc(emptyText)}</div>`}
      <div class="slot-body">
        <div class="photo-row">
          <label class="photo-btn">📷 ${has ? 'Refazer' : 'Tirar foto'}<input type="file" accept="image/*" capture="environment" data-slot-input="${slot}"></label>
          <label class="photo-btn secondary">🖼️ Da galeria<input type="file" accept="image/*" data-slot-input="${slot}"></label>
        </div>
        ${opts.extra || ''}
      </div>
    </div>`;
  }

  async function renderStep(){
    const i = S.insp;
    const y = window.scrollY;
    stopGps();
    let html = stepsBar();

    if (S.step === 1){
      const hnErr = i.houseNumber ? OBS.houseNumberError(i.communityId, i.houseNumber) : null;
      const byMun = {};
      CFG.communities.forEach(c => { (byMun[c.municipio] = byMun[c.municipio] || []).push(c); });
      html += `<section class="card"><h2>1. Identificação</h2>
        <label class="f" for="f-com">Comunidade</label>
        <select id="f-com" data-f="communityId">
          <option value="">Selecione a comunidade…</option>
          ${Object.keys(byMun).map(m => `<optgroup label="${esc(m)}">${byMun[m].map(c => `<option value="${c.id}" ${i.communityId === c.id ? 'selected' : ''}>${esc(c.nome)} (${c.moradias} moradias)</option>`).join('')}</optgroup>`).join('')}
        </select>
        <label class="f" for="f-num">Número da residência</label>
        <input id="f-num" data-f="houseNumber" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" placeholder="01" value="${esc(i.houseNumber)}">
        <div class="err" id="hn-err">${esc(hnErr || '')}</div>
        <div class="code-box"><span>Código da residência (gerado)</span><strong id="code-view">${esc(OBS.buildHouseCode(i.communityId, i.houseNumber))}</strong></div>
        <div class="err" id="code-warn"></div>
        <label class="f" for="f-date">Data da inspeção</label>
        <input id="f-date" type="date" data-f="inspectionDate" value="${esc(i.inspectionDate)}">
        <label class="f" for="f-tec">Responsável técnico</label>
        <input id="f-tec" type="text" data-f="technician" autocomplete="name" value="${esc(i.technician)}">
        <details><summary>Dados do documento (cabeçalho)</summary>
          <label class="f" for="f-doc">Código do documento</label>
          <input id="f-doc" type="text" data-f="docCode" value="${esc(i.docCode)}">
          <label class="f" for="f-rev">Revisão</label>
          <input id="f-rev" type="text" data-f="rev" inputmode="numeric" value="${esc(i.rev)}">
        </details>
      </section>`;
    }

    if (S.step === 2){
      html += `<section class="card"><h2>2. Checklist manuscrito</h2>
        <div class="tip">📄 Pegue a folha <b>inteira</b>, <b>sem sombra</b>, com o celular na <b>horizontal</b>. As assinaturas continuam no papel.</div>
        ${await slotHTML('checklist', 'Foto do checklist preenchido e assinado', 'Nenhuma foto do checklist ainda (obrigatória).')}
      </section>`;
    }

    if (S.step === 3){
      const circles = (i.estacaCircles || []).length;
      const extras = [];
      for (let k = 0; k < i.extraPhotos.length; k++){
        const e = i.extraPhotos[k];
        const url = await photoURL(e.photoId);
        extras.push(`<div class="slot">
          <div class="slot-head"><strong>Figura ${k + 4}</strong><span class="badge ${String(e.caption || '').trim() ? 'ok' : 'missing'}">${String(e.caption || '').trim() ? '✓' : 'Sem legenda'}</span></div>
          ${url ? `<img src="${url}" alt="Figura ${k + 4}">` : ''}
          <div class="slot-body">
            <label class="f" for="ex-${k}">Legenda</label>
            <input id="ex-${k}" type="text" data-extra-caption="${k}" placeholder="Ex.: Chuveiro" value="${esc(e.caption)}">
            <button type="button" class="btn-line danger" data-extra-remove="${k}">Remover Figura ${k + 4}</button>
          </div>
        </div>`);
      }
      html += `<section class="card"><h2>3. Fotos</h2>
        ${await slotHTML('frente', 'Figura 1 · Frente da residência', 'Foto da frente da residência.')}
        ${await slotHTML('estaca', 'Figura 2 · Local da estaca', 'Foto do local da estaca. Depois, marque com o círculo vermelho.', {
          showId: i.photos.estacaMarcada || i.photos.estaca,
          extra: i.photos.estaca ? `<button type="button" class="btn-line circle" id="btn-circle">⭕ ${circles ? `Editar círculo (${circles})` : 'Marcar círculo vermelho'}</button>` : ''
        })}
        ${gpsHTML()}
        ${await slotHTML('estacaCodigo', 'Figura 3 · Estaca com o código escrito', 'Foto da estaca mostrando o código da residência.')}
        ${CFG.allowExtraPhotos ? `<h2 style="margin-top:18px">Fotos adicionais (opcional)</h2>
        ${extras.join('')}
        <div class="photo-row">
          <label class="add-btn">📷 + Foto extra<input type="file" accept="image/*" capture="environment" data-slot-input="extra"></label>
          <label class="add-btn">🖼️ + Da galeria<input type="file" accept="image/*" data-slot-input="extra"></label>
        </div>` : ''}
      </section>`;
    }

    if (S.step === 4){
      const ch = i.observations.chips || {};
      html += `<section class="card"><h2>4. Observações técnicas</h2>
        ${OBS.CHIPS.map(g => {
          const sel = g.options.find(o => o.v === ch[g.key]);
          return `<div class="chip-block"><div class="lbl">${esc(g.label)}</div>
            <div class="chip-group">${g.options.map(o => `<button type="button" class="chip ${ch[g.key] === o.v ? 'active' : ''}" data-chip="${g.key}" data-val="${o.v}">${esc(o.t)}</button>`).join('')}</div>
            ${sel && sel.free ? `<input type="text" data-f="observations.chips.${g.key}_txt" placeholder="Descreva (opcional)" value="${esc(ch[g.key + '_txt'] || '')}">` : ''}
          </div>`;
        }).join('')}
        <label class="f" for="f-free">Observações adicionais (texto livre)</label>
        <textarea id="f-free" data-f="observations.freeText" placeholder="Registre exatamente o que foi visto. Item ilegível ou não verificado: escreva isso.">${esc(i.observations.freeText)}</textarea>
      </section>
      <section class="card"><h2>Prévia do texto no documento</h2>
        <div class="p-fixed">${esc(CFG.texts.observacoesP1)}</div>
        <label class="f" for="f-final">Texto gerado (editável)</label>
        <textarea id="f-final" data-f="observations.finalText" style="min-height:160px">${esc(i.observations.finalText)}</textarea>
        <div id="edited-box">${i.observations.finalEdited ? editedBox() : ''}</div>
        <label class="f" for="f-rec">Recomendação específica para a Conclusão (opcional)</label>
        <textarea id="f-rec" data-f="recommendation" placeholder="Preencha só se houver restrição relevante.">${esc(i.recommendation)}</textarea>
      </section>`;
    }

    if (S.step === 5){
      const c = OBS.getCommunity(i.communityId);
      const pend = pendencias(i);
      const hard = pend.filter(p => !p.soft), soft = pend.filter(p => p.soft);
      const nFig = 3 + i.extraPhotos.length;
      html += `<section class="card"><h2>5. Revisão</h2>
        <table class="sum-table">
          <tr><td>Código</td><td><b>${esc(i.houseCode)}</b></td></tr>
          <tr><td>Local</td><td>${esc(c ? c.nome : '-')}</td></tr>
          <tr><td>Data da inspeção</td><td>${esc(fmtDate(i.inspectionDate))}</td></tr>
          <tr><td>Responsável técnico</td><td>${esc(i.technician)}</td></tr>
          <tr><td>Checklist</td><td>${i.photos.checklist ? '✓ foto salva' : 'faltando'}</td></tr>
          <tr><td>Coordenadas</td><td>${i.gps ? esc(GEO.fmt(i.gps.lat) + ' · ' + GEO.fmt(i.gps.lon)) : 'não registradas'}</td></tr>
          <tr><td>Figuras</td><td>${[i.photos.frente, i.photos.estaca, i.photos.estacaCodigo].filter(Boolean).length + i.extraPhotos.length} de ${nFig}</td></tr>
          <tr><td>Status</td><td><span class="status ${i.status}">${STATUS_LABEL[i.status]}</span></td></tr>
        </table>
      </section>
      <section class="card"><h2>Pendências</h2>
        ${pend.length ? `<ul class="pend">${hard.map(p => `<li>${esc(p.msg)}</li>`).join('')}${soft.map(p => `<li class="soft">${esc(p.msg)}</li>`).join('')}</ul>
          ${hard.length ? '<p class="hint">Dá para exportar assim mesmo: o que faltar sai no documento como marcador visível, por exemplo [INSERIR FOTO: frente da residência].</p>' : ''}`
          : '<div class="all-ok">✓ Tudo preenchido.</div>'}
      </section>
      <section class="card"><h2>Exportar</h2>
        <button type="button" class="btn-primary" id="btn-docx" style="width:100%">Gerar e baixar .docx + PDF + backup</button>
        <p class="hint">O backup (.zip) guarda tudo desta inspeção, inclusive fotos e coordenadas. Mande para o WhatsApp, e-mail ou Drive assim que tiver sinal.</p>
        <div class="export-result" id="export-result">${S.lastExport ? exportResultHTML() : ''}</div>
      </section>
      <button type="button" class="btn-line danger" id="btn-delete">Excluir esta inspeção do aparelho</button>`;
    }

    view.innerHTML = html;
    bindStep();
    footer.style.display = 'flex';
    footer.innerHTML = `
      ${S.step > 1 ? '<button type="button" class="btn-ghost" id="btn-prev">← Anterior</button>' : '<a class="btn-ghost" href="#/" style="text-decoration:none;display:flex;align-items:center">Lista</a>'}
      ${S.step < 5 ? '<button type="button" class="btn-teal" id="btn-next">Próximo →</button>' : '<a class="btn-teal" href="#/" style="text-decoration:none;display:flex;align-items:center;justify-content:center">Concluir</a>'}`;
    const prev = document.getElementById('btn-prev'); if (prev) prev.onclick = () => goStep(S.step - 1);
    const next = document.getElementById('btn-next'); if (next) next.onclick = () => goStep(S.step + 1);
    window.scrollTo({ top: y });
  }

  function editedBox(){
    return `<div class="warn-box">O texto foi editado à mão e não acompanha mais os chips.<br>
      <button type="button" class="btn-line" id="btn-regen">Refazer texto a partir dos chips</button></div>`;
  }
  function regenerate(force){
    const o = S.insp.observations;
    if (o.finalEdited && !force) return;
    o.finalText = OBS.buildObservationText(o.chips, o.freeText);
    o.finalEdited = false;
    const ta = document.getElementById('f-final'); if (ta) ta.value = o.finalText;
    const box = document.getElementById('edited-box'); if (box) box.innerHTML = '';
  }

  function bindStep(){
    view.querySelectorAll('[data-step]').forEach(b => b.onclick = () => goStep(+b.dataset.step));
    view.querySelectorAll('[data-slot-input]').forEach(inp => inp.addEventListener('change', () => onPhotoInput(inp)));

    view.querySelectorAll('[data-f]').forEach(el => {
      const ev = el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        const path = el.dataset.f;
        let val = el.value;
        if (path === 'houseNumber'){ val = val.replace(/\D/g, '').slice(0, 2); if (el.value !== val) el.value = val; }
        setPath(S.insp, path, val);
        const o = S.insp.observations;
        if (path === 'observations.finalText'){
          o.finalEdited = val !== OBS.buildObservationText(o.chips, o.freeText);
          const box = document.getElementById('edited-box'); if (box) box.innerHTML = o.finalEdited ? editedBox() : '';
          bindRegen();
        } else if (path.startsWith('observations.')){
          regenerate(false);
        }
        if (path === 'communityId' || path === 'houseNumber') updateCodeView();
        scheduleSave();
      });
      if (el.dataset.f === 'houseNumber') el.addEventListener('blur', () => {
        const n = OBS.normalizeHouseNumber(el.value);
        if (n && n !== el.value){ el.value = n; S.insp.houseNumber = n; updateCodeView(); scheduleSave(); }
      });
    });
    if (S.step === 1) updateCodeView();

    view.querySelectorAll('[data-chip]').forEach(b => b.onclick = () => {
      const ch = S.insp.observations.chips;
      const key = b.dataset.chip, v = b.dataset.val;
      ch[key] = ch[key] === v ? '' : v;   // tocar de novo desmarca
      regenerate(false);
      scheduleSave();
      renderStep();
    });
    bindRegen();

    const circleBtn = document.getElementById('btn-circle'); if (circleBtn) circleBtn.onclick = editCircles;
    const gpsBtn = document.getElementById('btn-gps'); if (gpsBtn) gpsBtn.onclick = startGps;
    const gpsMan = document.getElementById('btn-gps-manual'); if (gpsMan) gpsMan.onclick = saveManualGps;
    view.querySelectorAll('[data-extra-caption]').forEach(inp => inp.addEventListener('input', () => {
      S.insp.extraPhotos[+inp.dataset.extraCaption].caption = inp.value; scheduleSave();
    }));
    view.querySelectorAll('[data-extra-remove]').forEach(b => b.onclick = async () => {
      const k = +b.dataset.extraRemove;
      if (!confirm(`Remover a Figura ${k + 4}? As figuras seguintes serão renumeradas.`)) return;
      const [e] = S.insp.extraPhotos.splice(k, 1);
      dropURL(e.photoId); await DB.deletePhoto(e.photoId); await flushSave(); renderStep();
    });

    const btnDocx = document.getElementById('btn-docx'); if (btnDocx) btnDocx.onclick = exportFiles;
    bindExportButtons();
    const del = document.getElementById('btn-delete'); if (del) del.onclick = async () => {
      if (!confirm(`Excluir a inspeção ${S.insp.houseCode} e todas as fotos dela deste aparelho? Não dá para desfazer.`)) return;
      clearTimeout(S.saveTimer); S.saveTimer = null;
      await S.savePromise;
      await DB.deleteInspection(S.insp.id);
      S.insp = null; location.hash = '#/';
      toast('Inspeção excluída.');
    };
  }
  function bindRegen(){
    const r = document.getElementById('btn-regen');
    if (r) r.onclick = () => { if (confirm('Substituir o texto editado pelo texto gerado a partir dos chips?')){ regenerate(true); scheduleSave(); } };
  }
  function updateCodeView(){
    const i = S.insp;
    const code = OBS.buildHouseCode(i.communityId, i.houseNumber);
    const cv = document.getElementById('code-view'); if (cv) cv.textContent = code;
    const he = document.getElementById('hn-err'); if (he) he.textContent = i.houseNumber ? (OBS.houseNumberError(i.communityId, i.houseNumber) || '') : '';
    const w = document.getElementById('code-warn');
    if (w){
      const c = OBS.getCommunity(i.communityId);
      const dup = OBS.houseCodeComplete(code) && S.list.find(o => o.id !== i.id && o.houseCode === code);
      w.textContent = c && !c.prefix ? 'Prefixo desta comunidade ainda não confirmado. Ajustar em inspecao-sas/config.js.'
        : dup ? `Atenção: já existe uma inspeção ${code} neste aparelho.` : '';
    }
    document.getElementById('title').textContent = OBS.houseCodeComplete(code) ? code : 'Nova inspeção';
  }

  /* ---------------- GPS da estaca ---------------- */
  const GPS_SOURCE = { gps: 'GPS do celular', foto: 'GPS gravado na foto', manual: 'digitadas' };
  function gpsHTML(){
    const g = S.insp.gps;
    const warn = g ? GEO.regionWarning(g.lat, g.lon) : null;
    return `<div class="slot" id="gps-box">
      <div class="slot-head"><strong>📍 Coordenadas da estaca</strong><span class="badge ${g ? 'ok' : 'missing'}">${g ? '✓ Registradas' : 'Faltando'}</span></div>
      <div class="slot-body">
        ${g ? `<div class="gps-val">Latitude <b>${GEO.fmt(g.lat)}</b><br>Longitude <b>${GEO.fmt(g.lon)}</b></div>
          <div class="hint">${g.accuracy != null ? `Precisão ±${g.accuracy} m · ` : ''}${GPS_SOURCE[g.source] || ''} · ${esc(new Date(g.at).toLocaleString('pt-BR'))}</div>`
          : '<div class="hint">Fique ao lado da estaca, em lugar aberto. O GPS funciona sem internet, mas pode levar alguns minutos para fixar.</div>'}
        ${warn ? `<div class="err">${esc(warn)}</div>` : ''}
        <div id="gps-live" style="display:none">
          <div class="gps-live" id="gps-status">Buscando sinal de GPS…</div>
          <div class="photo-row" style="margin-top:8px">
            <button type="button" class="btn-teal" id="btn-gps-use" disabled>✓ Usar esta posição</button>
            <button type="button" class="btn-ghost" id="btn-gps-cancel">Cancelar</button>
          </div>
        </div>
        <button type="button" class="photo-btn" id="btn-gps" style="width:100%;margin-top:10px">📍 ${g ? 'Capturar de novo aqui' : 'Capturar GPS aqui'}</button>
        <details><summary>Digitar coordenadas</summary>
          <label class="f" for="gps-lat">Latitude (ex.: -25,506488)</label>
          <input type="text" id="gps-lat" autocomplete="off" value="${g ? GEO.fmt(g.lat) : ''}">
          <label class="f" for="gps-lon">Longitude (ex.: -48,380576)</label>
          <input type="text" id="gps-lon" autocomplete="off" value="${g ? GEO.fmt(g.lon) : ''}">
          <button type="button" class="btn-line" id="btn-gps-manual">Salvar coordenadas digitadas</button>
        </details>
      </div>
    </div>`;
  }
  function stopGps(){ if (S.gpsStop){ S.gpsStop(); S.gpsStop = null; } }
  function startGps(){
    stopGps();
    S.gpsBest = null;
    const live = document.getElementById('gps-live'), status = document.getElementById('gps-status');
    const use = document.getElementById('btn-gps-use'), cancel = document.getElementById('btn-gps-cancel');
    document.getElementById('btn-gps').style.display = 'none';
    live.style.display = 'block';
    status.className = 'gps-live'; status.textContent = 'Buscando sinal de GPS…';
    cancel.onclick = () => { stopGps(); renderStep(); };
    use.onclick = async () => {
      const b = S.gpsBest; if (!b) return;
      stopGps();
      S.insp.gps = { lat: b.lat, lon: b.lon, accuracy: b.accuracy, at: b.at, source: 'gps' };
      await flushSave();
      toast('📍 Coordenadas salvas');
      renderStep();
    };
    S.gpsStop = GEO.watch((best, cur) => {
      S.gpsBest = best;
      use.disabled = false;
      status.className = 'gps-live ' + (best.accuracy <= 10 ? 'ok' : best.accuracy <= 30 ? 'mid' : 'bad');
      status.innerHTML = `Precisão agora: ±${cur.accuracy} m · melhor: <b>±${best.accuracy} m</b><br>${GEO.fmt(best.lat)} · ${GEO.fmt(best.lon)}`
        + (best.accuracy > 10 ? '<br><small>Aguarde a precisão ficar abaixo de 10 m, se possível.</small>' : '<br><small>Boa precisão. Pode usar.</small>');
    }, err => {
      status.className = 'gps-live bad'; status.textContent = GEO.errorMessage(err);
      if (!S.gpsBest){ stopGps(); setTimeout(() => { const btn = document.getElementById('btn-gps'); if (btn) btn.style.display = ''; }, 0); }
    });
  }
  async function saveManualGps(){
    const lat = GEO.parse(document.getElementById('gps-lat').value), lon = GEO.parse(document.getElementById('gps-lon').value);
    if (lat == null || lon == null){ toast('Digite latitude e longitude em graus decimais, ex.: -25,506488', true, 4000); return; }
    const w = GEO.regionWarning(lat, lon);
    if (w && !confirm(w + ' Salvar assim mesmo?')) return;
    S.insp.gps = { lat, lon, accuracy: null, at: new Date().toISOString(), source: 'manual' };
    await flushSave();
    toast('📍 Coordenadas salvas');
    renderStep();
  }

  /* ---------------- exportação ---------------- */
  async function loadImg(id){
    if (!id) return null;
    const p = await DB.getPhoto(id);
    if (!p) return null;
    return { data: await blobBytes(p.blob), width: p.width, height: p.height, type: 'jpg' };
  }
  const logoCache = {};
  async function loadLogo(file, type, width = 772, height = 235){
    if (logoCache[file] !== undefined) return logoCache[file];
    try{
      const r = await fetch('inspecao-sas/' + file);
      if (!r.ok) throw new Error(r.status);
      logoCache[file] = { data: new Uint8Array(await r.arrayBuffer()), width, height, type };
    }catch(e){ console.warn('Logo indisponível', e); logoCache[file] = null; }
    return logoCache[file];
  }
  const sizeMB = b => (b.size / 1048576).toFixed(2) + ' MB';

  // Gera o .docx e o PDF juntos e já baixa os dois.
  async function exportFiles(){
    const btn = document.getElementById('btn-docx');
    btn.disabled = true;
    const done = overlay('Gerando .docx e PDF…');
    try{
      await flushSave();
      const i = S.insp;
      const images = {
        checklist: await loadImg(i.photos.checklist),
        frente: await loadImg(i.photos.frente),
        estaca: await loadImg(i.photos.estacaMarcada || i.photos.estaca),
        estacaCodigo: await loadImg(i.photos.estacaCodigo),
        extras: []
      };
      for (const e of i.extraPhotos){
        const img = await loadImg(e.photoId);
        images.extras.push(img ? { ...img, caption: e.caption } : { caption: e.caption });
      }
      const cc = CFG.contactCard;
      const card = cc ? await loadLogo(cc.file, 'png', cc.width, cc.height) : null;
      const docxBlob = await REP.buildReport({ inspection: i, images, logo: await loadLogo('logo-solarminas.png', 'png'), card, outputType: 'blob' });
      const pdfBuf = PDF.buildPdf({ inspection: i, images, logo: await loadLogo('logo-solarminas.jpg', 'jpg'), card });
      i.exportedAt = new Date().toISOString();
      await flushSave();
      // Marca como exportado e com backup antes de montar o .zip, para a cópia
      // restaurada voltar igual.
      i.backupAt = new Date().toISOString();
      i.status = 'exported';
      const zip = await BACKUP.build([JSON.parse(JSON.stringify(i))]);
      S.lastExport = { files: [
        { blob: new Blob([docxBlob], { type: WORD_MIME }), name: REP.reportFileName(i.houseCode), type: WORD_MIME, label: '.docx', icon: '📝', share: true },
        { blob: new Blob([pdfBuf], { type: PDF_MIME }), name: PDF.pdfFileName(i.houseCode), type: PDF_MIME, label: 'PDF', icon: '📄', share: true },
        { blob: zip, name: BACKUP.fileName(i.houseCode), type: ZIP_MIME, label: 'backup', icon: '💾', share: true }
      ] };
      await DB.putInspection(JSON.parse(JSON.stringify(i)));
      const k = S.list.findIndex(o => o.id === i.id); if (k >= 0) S.list[k] = JSON.parse(JSON.stringify(i));
      done();
      await renderStep();
      // Baixa os três arquivos direto (o navegador pode pedir para permitir vários downloads).
      S.lastExport.files.forEach((f, n) => setTimeout(() => downloadViaLink(f), n * 600));
      toast('✓ .docx, PDF e backup gerados. Baixando para a pasta Downloads…', false, 4000);
    }catch(err){
      done();
      console.error(err);
      toast('Erro ao gerar os arquivos: ' + (err && err.message || err), true, 6000);
    }finally{
      const b = document.getElementById('btn-docx'); if (b) b.disabled = false;
    }
  }
  const asFile = f => new File([f.blob], f.name, { type: f.type });
  function shareableFiles(){
    if (!S.lastExport || !navigator.canShare) return null;
    const all = S.lastExport.files.map(asFile);
    try{
      if (navigator.canShare({ files: all })) return all;
      const docs = all.slice(0, 2);                       // sem o .zip, se o celular não aceitar
      if (navigator.canShare({ files: docs })) return docs;
      if (navigator.canShare({ files: [all[0]] })) return [all[0]];
    }catch(e){}
    return null;
  }
  function exportResultHTML(){
    const files = S.lastExport.files;
    return `${files.map(f => `<div class="file">${f.icon} ${esc(f.name)} · ${sizeMB(f.blob)}</div>`).join('')}
      ${shareableFiles() ? '<button type="button" class="btn-teal" id="btn-share" style="width:100%;margin-bottom:10px">📤 Compartilhar (WhatsApp, e-mail…)</button>' : ''}
      <div class="photo-row">
        ${files.map((f, n) => `<button type="button" class="btn-ghost" data-download="${n}" style="flex:1">⬇️ Baixar ${f.label}</button>`).join('')}
      </div>`;
  }
  function downloadViaLink(f){
    const url = URL.createObjectURL(f.blob);
    const a = document.createElement('a');
    a.href = url; a.download = f.name; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 60000);
  }
  // No computador (Chrome/Edge) abre a janela "Salvar como"; nos demais, download direto.
  async function downloadFile(f){
    if (window.showSaveFilePicker){
      try{
        const ext = f.name.slice(f.name.lastIndexOf('.'));
        const handle = await window.showSaveFilePicker({ suggestedName: f.name, types: [{ description: f.label, accept: { [f.type]: [ext] } }] });
        const w = await handle.createWritable();
        await w.write(f.blob); await w.close();
        toast('✓ ' + f.name + ' salvo');
        return;
      }catch(err){
        if (err && err.name === 'AbortError') return; // usuário cancelou
        console.warn('Salvar como indisponível, usando download direto', err);
      }
    }
    downloadViaLink(f);
    toast('⬇️ ' + f.name + ': confira a pasta Downloads', false, 3500);
  }
  function bindExportButtons(){
    const sh = document.getElementById('btn-share');
    if (sh) sh.onclick = async () => {
      const files = shareableFiles();
      if (!files) return;
      try { await navigator.share({ files, title: files[0].name }); }
      catch(err){ if (!err || err.name !== 'AbortError'){ console.error(err); toast('Não abriu o compartilhamento. Use os botões Baixar.', true, 4000); } }
    };
    view.querySelectorAll('[data-download]').forEach(b => b.onclick = () => downloadFile(S.lastExport.files[+b.dataset.download]));
  }

  /* ---------------- início ---------------- */
  (async function init(){
    try{
      await DB.open();
      DB.requestPersist();
      S.list = await DB.listInspections();
    }catch(err){
      console.error(err);
      view.innerHTML = `<div class="card"><h2>Armazenamento indisponível</h2><p>Este navegador não liberou o banco de dados local (IndexedDB). Em modo anônimo/privado ele pode ser bloqueado. Abra o app normalmente ou pela tela inicial.</p></div>`;
      return;
    }
    route();
  })();
})();
