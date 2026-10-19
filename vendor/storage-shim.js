/* ======================================================================
   Rascunhos dos relatórios RDO, Visita, Entrega e OS.
   O index.html usa window.storage.get/set/delete, que só existe dentro do
   Claude (artefatos). Fora dele, todo salvamento falhava sem aviso.
   Aqui o mesmo jeito de usar grava no IndexedDB do aparelho (aguenta as
   fotos, que o localStorage não aguenta). Se window.storage já existir
   (rodando dentro do Claude), nada é trocado.
====================================================================== */
(function(){
  if (window.storage) return;
  const NOME = 'solarminas-rascunhos', LOJA = 'chaves';
  let aberto = null;
  function banco(){
    if (aberto) return aberto;
    aberto = new Promise((resolve, reject) => {
      const r = indexedDB.open(NOME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(LOJA);
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
  window.storage = {
    // mesmo formato de retorno do Claude: { key, value } ou null
    async get(key){ const v = await operar('readonly', s => s.get(String(key))); return v == null ? null : { key, value: v }; },
    async set(key, value){ await operar('readwrite', s => s.put(value, String(key))); return { key, value }; },
    async delete(key){ await operar('readwrite', s => s.delete(String(key))); return { key, deleted: true }; },
    async list(prefix){
      const keys = await operar('readonly', s => s.getAllKeys());
      return { keys: (keys || []).filter(k => !prefix || String(k).startsWith(prefix)) };
    }
  };
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch(e){}
})();
