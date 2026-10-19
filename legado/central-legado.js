/* ======================================================================
   RDO, VISITA, ENTREGA E OS — ENVIO PARA A CENTRAL DE RELATÓRIOS
   O PDF continua só no celular, para compartilhar no WhatsApp.
   O botão ☁️ (no lugar do antigo 📝 Word) gera o Word e manda para a central,
   onde o SAT baixa, ajusta e envia ao cliente. Sem sinal, o Word fica numa
   fila no aparelho (IndexedDB) e sobe sozinho quando a internet voltar.
   Usa o mesmo login da Inspeção SAS (inspecao-sas/central.js).
====================================================================== */
(function(){
  const C = window.SAS_CENTRAL;
  if (!C || !C.ativo()) return;

  const TITULOS = { rdo: 'RDO', visita: 'Visita Técnica', entrega: 'Entrega de Serviço', os: 'OS Residencial' };
  const NOME = 'solarminas-envios', LOJA = 'fila';
  let aberto = null;
  function banco(){
    if (aberto) return aberto;
    aberto = new Promise((resolve, reject) => {
      const r = indexedDB.open(NOME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(LOJA, { keyPath: 'chave' });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => { aberto = null; reject(r.error); };
    });
    return aberto;
  }
  function operar(modo, fn){
    return banco().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(LOJA, modo);
      const req = fn(t.objectStore(LOJA));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Gravação cancelada'));
    }));
  }
  const fila = () => operar('readonly', s => s.getAll()).then(l => (l || []).sort((a, b) => a.em.localeCompare(b.em)));

  // "RDO_Obra_Centro_2026-10-19.pdf" -> base "RDO_Obra_Centro_2026-10-19"
  function base(filename){
    return String(filename || 'relatorio').replace(/\.(pdf|docx)$/i, '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60) || 'relatorio';
  }

  async function guardar(tela, blob, filename, arq){
    if (!TITULOS[tela] || !blob) return;
    const nb = base(filename);
    const item = { chave: nb + '.' + arq, tela, arq, nomeBase: nb, titulo: nb.replace(/_/g, ' ').replace(/(\d{4})-(\d{2})-(\d{2})/, '$3/$2/$1'), blob, em: new Date().toISOString() };
    try { await operar('readwrite', s => s.put(item)); } catch(e){ console.warn('Fila da central:', e); return; }
    enviarFila();
  }

  let enviando = false;
  async function enviarFila(){
    if (enviando) return;
    enviando = true;
    let enviados = 0, erro = null;
    try{
      if (!C.sessao()) return;
      for (const it of await fila()){
        // versões anteriores também guardavam o PDF; agora só o Word vai para a central
        if (it.arq !== 'docx'){ await operar('readwrite', s => s.delete(it.chave)); continue; }
        // um registro por relatório e por técnico; regerar o mesmo arquivo atualiza o registro
        const id = (it.nomeBase + '-' + C.sessao().usuario).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
        await C.req(`/api/inspecoes/${encodeURIComponent(id)}/meta`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo: it.tela, titulo: it.titulo, nomeBase: it.nomeBase, updatedAt: it.em })
        });
        await C.req(`/api/inspecoes/${encodeURIComponent(id)}/arquivos/${it.arq}`, { method: 'PUT', body: it.blob });
        await operar('readwrite', s => s.delete(it.chave));
        enviados++;
      }
    }catch(e){ erro = e; }
    finally{
      enviando = false;
      if (enviados && typeof showToast === 'function') showToast(`☁️ ${enviados === 1 ? 'Word enviado' : enviados + ' Word enviados'} para a central`, 3000);
      if (erro && !erro.offline && typeof showToast === 'function') showToast('Central: ' + erro.message, 4000);
      cartao();
    }
  }

  // Botão ☁️: monta o Word com o mesmo código de sempre (buildWordRDO etc.), mas em
  // vez de baixar, o saveDocx manda o arquivo para a fila da central.
  const BUILD = { rdo: 'buildWordRDO', visita: 'buildWordVisita', entrega: 'buildWordEntrega', os: 'buildWordOS' };
  let paraCentral = false;
  const saveOriginal = window.saveDocx;
  if (typeof saveOriginal === 'function') window.saveDocx = async function(doc, filename, tela){
    if (!paraCentral) return saveOriginal.apply(this, arguments);
    const blob = await docx.Packer.toBlob(doc);
    await guardar(tela, blob, filename, 'docx');
  };
  function enviarParaCentral(tela){
    if (!C.sessao()){ entrar(() => enviarParaCentral(tela)); return; }
    runWithLoadingWord('btn-word-' + tela, async () => {
      paraCentral = true;
      try { await window[BUILD[tela]](); } finally { paraCentral = false; }
      if (!navigator.onLine) showToast('☁️ Sem internet: o Word ficou guardado e sobe sozinho quando o sinal voltar.', 4500);
    });
  }
  Object.keys(BUILD).forEach(tela => {
    const b = document.getElementById('btn-word-' + tela);
    if (!b || typeof window[BUILD[tela]] !== 'function') return;
    b.textContent = '☁️'; b.title = 'Enviar o Word para a central';
    b.setAttribute('aria-label', 'Enviar o Word para a central');
    b.onclick = () => enviarParaCentral(tela);
  });

  // Login (só na primeira vez; vale 60 dias)
  function entrar(depois){
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    box.innerHTML = `<div class="obras-box" style="background:#fff;width:100%;max-width:360px;margin:0">
      <div class="ob-title">☁️ Entrar na central</div>
      <div class="select-sub">Só na primeira vez (precisa de internet agora). O acesso vale 60 dias.</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
        <input data-m="u" placeholder="Usuário" autocomplete="username" autocapitalize="none" style="padding:12px;font-size:16px;border:1.5px solid var(--line);border-radius:10px">
        <input data-m="s" type="password" placeholder="Senha" autocomplete="current-password" style="padding:12px;font-size:16px;border:1.5px solid var(--line);border-radius:10px">
        <div class="draft-actions"><button type="button" class="obra-chip" data-m="ok">Entrar</button><button type="button" class="obra-chip" data-m="cancel">Cancelar</button></div>
      </div></div>`;
    document.body.appendChild(box);
    box.querySelector('[data-m=u]').focus();
    box.addEventListener('click', async e => {
      const b = e.target.closest('[data-m]');
      if (!b || b.tagName !== 'BUTTON') return;
      if (b.dataset.m === 'cancel'){ box.remove(); return; }
      b.disabled = true;
      try{
        await C.login(box.querySelector('[data-m=u]').value.trim(), box.querySelector('[data-m=s]').value);
        box.remove(); showToast('Conectado à central.', 2500); cartao();
        if (depois) depois(); else enviarFila();
      }catch(err){ showToast(err.message, 4000); b.disabled = false; }
    });
  }

  // Cartão na tela inicial: login e situação dos envios
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function cartao(){
    const tela = document.getElementById('screen-select');
    if (!tela) return;
    let el = document.getElementById('central-legado');
    if (!el){
      el = document.createElement('div');
      el.id = 'central-legado';
      el.className = 'obras-box';
      tela.appendChild(el);
    }
    let n = 0;
    try { n = (await fila()).length; } catch(e){}
    const s = C.sessao();
    const pend = n ? `<div class="select-sub" style="margin-top:6px"><b>${n}</b> Word esperando envio${navigator.onLine ? '' : ' (sem internet, sobe sozinho quando voltar o sinal)'}.</div>` : '';
    el.innerHTML = s
      ? `<div class="ob-title">☁️ Central de relatórios</div>
         <div class="select-sub">Conectado como <b>${esc(s.nome || s.usuario)}</b>. Use o botão ☁️ do relatório para mandar o Word para a central.</div>${pend}
         <div class="draft-actions">${n ? '<button type="button" class="obra-chip" data-cl="enviar">Enviar agora</button>' : ''}<button type="button" class="obra-chip" data-cl="sair">Sair</button></div>`
      : `<div class="ob-title">☁️ Central de relatórios</div>
         <div class="select-sub">Para mandar o Word dos relatórios para o SAT (botão ☁️ no rodapé de cada relatório), entre uma vez.</div>${pend}
         <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
           <input id="cl-usuario" placeholder="Usuário" autocomplete="username" autocapitalize="none" style="padding:12px;font-size:16px;border:1.5px solid var(--line);border-radius:10px">
           <input id="cl-senha" type="password" placeholder="Senha" autocomplete="current-password" style="padding:12px;font-size:16px;border:1.5px solid var(--line);border-radius:10px">
           <button type="button" class="obra-chip" data-cl="entrar">Entrar na central</button>
         </div>`;
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-cl]');
    if (!b) return;
    const acao = b.dataset.cl;
    if (acao === 'sair'){ C.sair(); cartao(); }
    else if (acao === 'enviar') enviarFila();
    else if (acao === 'entrar'){
      const u = document.getElementById('cl-usuario').value.trim(), p = document.getElementById('cl-senha').value;
      if (!u || !p){ if (typeof showToast === 'function') showToast('Informe usuário e senha.', 2500); return; }
      b.disabled = true; b.textContent = 'Entrando...';
      try { await C.login(u, p); if (typeof showToast === 'function') showToast('Conectado à central.', 2500); enviarFila(); }
      catch(err){ if (typeof showToast === 'function') showToast(err.message, 4000); }
      cartao();
    }
  });

  window.addEventListener('online', enviarFila);
  cartao();
  enviarFila();
  window.SM_CENTRAL_LEGADO = { fila, enviarFila };
})();
