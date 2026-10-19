/* ======================================================================
   INSPEÇÃO SAS (PEE COPEL) — TELAS
   Lista de inspeções + formulário em 5 passos. Tudo salvo no aparelho
   (IndexedDB) a cada alteração. Rotas: #/ (lista), #/i/<id>/<passo>.
====================================================================== */
(function(){
  const CFG = window.SAS_CONFIG, OBS = window.SAS_OBS, DB = window.SAS_DB, IMG = window.SAS_IMG, REP = window.SAS_REPORT, PDF = window.SAS_PDF;
  const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const PDF_MIME = 'application/pdf';
  const STEPS = ['Identificação', 'Checklist', 'Fotos', 'Observações', 'Revisão'];
  const STEPS_SHORT = ['Dados', 'Checklist', 'Fotos', 'Obs.', 'Revisão'];
  const STATUS_LABEL = { draft: 'Rascunho', ready: 'Pronto', exported: 'Exportado' };
  const FILTER_KEY = 'sas_filtro_comunidade'; // conveniência por aparelho, não é dado da inspeção

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
    lastExport: null   // { files: [{ blob, name, type, label, icon }] }
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
      status: 'draft', createdAt: now, updatedAt: now, exportedAt: null
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
    return out;
  }
  function stepDone(i, n){
    if (n === 1) return !!OBS.getCommunity(i.communityId) && !OBS.houseNumberError(i.communityId, i.houseNumber) && !!i.inspectionDate && !!String(i.technician || '').trim();
    if (n === 2) return !!i.photos.checklist;
    if (n === 3) return !!(i.photos.frente && i.photos.estaca && i.photos.estacaCodigo);
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
  async function renderList(){
    document.getElementById('title').textContent = 'Inspeção SAS (PEE Copel)';
    document.getElementById('subtitle').textContent = 'Comunidades isoladas · litoral do Paraná';
    const back = document.getElementById('back-btn'); back.href = 'index.html';
    setSaveState('', '');
    S.list = await DB.listInspections();
    let filter = ''; try { filter = localStorage.getItem(FILTER_KEY) || ''; } catch(e){}
    const items = S.list.filter(i => !filter || i.communityId === filter)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const counts = {}; S.list.forEach(i => { counts[i.communityId] = (counts[i.communityId] || 0) + 1; });
    view.innerHTML = `
      <div class="list-tools">
        <select id="filter" aria-label="Filtrar por comunidade">
          <option value="">Todas as comunidades (${S.list.length})</option>
          ${CFG.communities.map(c => `<option value="${c.id}" ${filter === c.id ? 'selected' : ''}>${esc(c.nome)} (${counts[c.id] || 0}/${c.moradias})</option>`).join('')}
        </select>
      </div>
      ${items.length ? items.map(i => {
        const c = OBS.getCommunity(i.communityId);
        return `<button type="button" class="insp-card" data-open="${i.id}">
          <div class="main">
            <div class="code">${esc(OBS.houseCodeComplete(i.houseCode) ? i.houseCode : (i.houseCode || 'Sem código'))}</div>
            <div class="sub">${esc(c ? c.nome : 'Comunidade não definida')} · ${esc(fmtDate(i.inspectionDate))}</div>
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
    const est = await DB.estimate();
    const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : false;
    const hint = document.getElementById('storage-hint');
    if (hint){
      const parts = [];
      if (est && est.usage != null) parts.push(`Dados neste aparelho: ${(est.usage / 1048576).toFixed(1)} MB`);
      if (!persisted) parts.push('Armazenamento ainda não marcado como permanente pelo navegador. Instale o app na tela inicial e exporte os relatórios assim que possível.');
      hint.textContent = parts.join('. ');
    }
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
        <button type="button" class="btn-primary" id="btn-docx" style="width:100%">Gerar e baixar .docx + PDF</button>
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
      S.lastExport = { files: [
        { blob: new Blob([docxBlob], { type: WORD_MIME }), name: REP.reportFileName(i.houseCode), type: WORD_MIME, label: '.docx', icon: '📝' },
        { blob: new Blob([pdfBuf], { type: PDF_MIME }), name: PDF.pdfFileName(i.houseCode), type: PDF_MIME, label: 'PDF', icon: '📄' }
      ] };
      i.exportedAt = new Date().toISOString();
      await flushSave();
      i.status = 'exported';
      await DB.putInspection(JSON.parse(JSON.stringify(i)));
      const k = S.list.findIndex(o => o.id === i.id); if (k >= 0) S.list[k] = JSON.parse(JSON.stringify(i));
      done();
      await renderStep();
      // Baixa os dois arquivos direto (o navegador pode pedir para permitir vários downloads).
      S.lastExport.files.forEach((f, n) => setTimeout(() => downloadViaLink(f), n * 600));
      toast('✓ .docx e PDF gerados. Baixando para a pasta Downloads…', false, 4000);
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
