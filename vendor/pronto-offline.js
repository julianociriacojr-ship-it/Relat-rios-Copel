/* ======================================================================
   "Pronto para usar sem internet?" — aviso visível na tela inicial
   Confere se o app está guardado no celular (service worker ativo e os
   arquivos principais no cache). Enquanto não estiver, pede para ficar
   conectado; quando estiver, mostra ✓. Serve para conferir antes de sair
   da pousada.
   SM_PRONTO_OFFLINE(elemento) preenche o elemento e se atualiza sozinho.
====================================================================== */
(function(){
  const ESSENCIAIS = ['index.html', 'inspecao-sas.html', 'inspecao-sas/app.js', 'inspecao-sas/report-docx.js', 'inspecao-sas/report-pdf.js',
    'vendor/docx.min.js', 'vendor/jspdf.umd.min.js', 'vendor/legado/docx-8.5.0.umd.js', 'vendor/legado/jspdf-2.5.1.umd.min.js'];
  const base = new URL('./', document.baseURI);   // as duas páginas ficam na raiz do app

  async function estado(){
    if (!('serviceWorker' in navigator) || !window.caches) return { ok: false, motivo: 'Este navegador não guarda o app para usar sem internet. Use o Chrome (Android) ou o Safari (iPhone).' };
    if (!navigator.serviceWorker.controller) return { ok: false, motivo: 'Guardando o app no celular… fique conectado e aguarde o ✓.' };
    const faltam = [];
    for (const f of ESSENCIAIS) if (!(await caches.match(new URL(f, base).href))) faltam.push(f);
    if (faltam.length) return { ok: false, motivo: `Guardando o app no celular (faltam ${faltam.length} arquivo${faltam.length > 1 ? 's' : ''})… fique conectado e aguarde o ✓.` };
    return { ok: true };
  }

  function SM_PRONTO_OFFLINE(el){
    if (!el) return;
    let parar = false;
    const desenhar = async () => {
      if (!el.isConnected){ parar = true; return; }
      const e = await estado().catch(() => ({ ok: false, motivo: 'Não foi possível conferir.' }));
      el.className = 'pronto-offline ' + (e.ok ? 'ok' : 'falta');
      el.setAttribute('role', 'status');
      el.innerHTML = e.ok
        ? '✓ <b>Pronto para usar sem internet</b>'
        : `⚠ <b>Ainda não está pronto para usar sem internet.</b><br><span>${e.motivo}</span>`;
      if (!e.ok && !parar) setTimeout(desenhar, 3000);
    };
    desenhar();
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', desenhar);
  }
  window.SM_PRONTO_OFFLINE = SM_PRONTO_OFFLINE;

  // Estilo próprio, igual nas duas telas (fundo forte, legível no sol)
  const css = document.createElement('style');
  css.textContent = `.pronto-offline{border-radius:10px;padding:10px 12px;margin:10px 0;font-size:14px;line-height:1.35;font-family:inherit}
    .pronto-offline.ok{background:#DCEFE3;color:#1F6B43;border:1.5px solid #9fd0b2}
    .pronto-offline.falta{background:#FFF4E0;color:#6b4a12;border:1.5px solid #e2bf86}
    .pronto-offline span{font-size:13px}`;
  document.head.appendChild(css);
})();
