/* ======================================================================
   INSPEÇÃO SAS — ARMAZENAMENTO LOCAL (IndexedDB)
   'inspections': registros (sem imagens)
   'photos':      imagens como Blob, referenciadas pelo id no registro
====================================================================== */
(function(root){
  const DB_NAME = 'solarminas-inspecao-sas';
  const DB_VERSION = 1;
  let dbPromise = null;

  function open(){
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('inspections')){
          const s = db.createObjectStore('inspections', { keyPath: 'id' });
          s.createIndex('communityId', 'communityId');
        }
        if (!db.objectStoreNames.contains('photos')){
          const p = db.createObjectStore('photos', { keyPath: 'id' });
          p.createIndex('inspectionId', 'inspectionId');
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => { dbPromise = null; reject(req.error); };
      req.onblocked = () => console.warn('IndexedDB bloqueado por outra aba aberta.');
    });
    return dbPromise;
  }

  function tx(storeNames, mode, fn){
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(storeNames, mode);
      let result;
      Promise.resolve(fn(t)).then(r => { result = r; }, reject);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transação abortada'));
    }));
  }
  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  const api = {
    open,
    listInspections: () => tx(['inspections'], 'readonly', t => reqP(t.objectStore('inspections').getAll())),
    getInspection: id => tx(['inspections'], 'readonly', t => reqP(t.objectStore('inspections').get(id))),
    putInspection: rec => tx(['inspections'], 'readwrite', t => { t.objectStore('inspections').put(rec); }),
    deleteInspection: id => tx(['inspections', 'photos'], 'readwrite', t => {
      t.objectStore('inspections').delete(id);
      const idx = t.objectStore('photos').index('inspectionId');
      return reqP(idx.getAllKeys(id)).then(keys => keys.forEach(k => t.objectStore('photos').delete(k)));
    }),
    putPhoto: photo => tx(['photos'], 'readwrite', t => { t.objectStore('photos').put(photo); }),
    getPhoto: id => id ? tx(['photos'], 'readonly', t => reqP(t.objectStore('photos').get(id))) : Promise.resolve(null),
    deletePhoto: id => id ? tx(['photos'], 'readwrite', t => { t.objectStore('photos').delete(id); }) : Promise.resolve(),

    // Pede ao navegador para não apagar os dados em caso de pouco espaço.
    async requestPersist(){
      try{
        if (navigator.storage && navigator.storage.persist){
          if (await navigator.storage.persisted()) return true;
          return await navigator.storage.persist();
        }
      }catch(e){}
      return false;
    },
    async estimate(){
      try{ return navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; }
      catch(e){ return null; }
    }
  };

  root.SAS_DB = api;
})(window);
