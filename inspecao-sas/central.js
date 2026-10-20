/* ======================================================================
   INSPEÇÃO SAS — ENVIO PARA A CENTRAL DE RELATÓRIOS (VPS)
   O app continua 100% offline. Com sinal, as inspeções exportadas sobem
   para a central (docx, PDF e backup .zip), onde o SAT revisa.
   Endereço em SAS_CONFIG.central.url; vazio = recurso desligado.
====================================================================== */
(function(root){
  const KEY = 'sas_central_sessao';   // token do técnico (vale 60 dias)

  const url = () => String(((root.SAS_CONFIG || {}).central || {}).url || '').replace(/\/+$/, '');
  const ativo = () => !!url();
  function sessao(){ try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch(e){ return null; } }
  function guardar(s){ try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch(e){} }

  async function login(usuario, senha){
    let r;
    try{
      r = await fetch(url() + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario, senha }) });
    }catch(e){ throw new Error('Sem conexão com a central. Tente com internet.'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erro || 'Falha no login.');
    guardar({ token: d.token, usuario: d.usuario, nome: d.nome, papel: d.papel });
    return sessao();
  }
  function sair(){ guardar(null); }

  async function req(path, opts = {}){
    const s = sessao();
    if (!s) throw Object.assign(new Error('Entre na central para enviar.'), { auth: true });
    let r;
    try{
      r = await fetch(url() + path, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + s.token } });
    }catch(e){ throw Object.assign(new Error('Sem conexão com a central.'), { offline: true }); }
    if (r.status === 401){ guardar(null); throw Object.assign(new Error('Login da central expirou. Entre de novo.'), { auth: true }); }
    if (!r.ok){ const d = await r.json().catch(() => ({})); throw new Error(d.erro || ('Erro ' + r.status)); }
    return r.json().catch(() => ({}));
  }

  // Envia uma inspeção: dados (meta) e os arquivos. files = { docx, pdf, backup } (Blobs)
  // extra.soCopia = cópia de segurança automática (só o administrador vê)
  async function enviar(insp, comunidade, files, extra = {}){
    await req(`/api/inspecoes/${encodeURIComponent(insp.id)}/meta`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ houseCode: insp.houseCode, communityId: insp.communityId, comunidade, inspectionDate: insp.inspectionDate,
        technician: insp.technician, gps: insp.gps || null, updatedAt: insp.updatedAt, ...extra })
    });
    for (const tipo of ['docx', 'pdf', 'backup']){
      if (files[tipo]) await req(`/api/inspecoes/${encodeURIComponent(insp.id)}/arquivos/${tipo}`, { method: 'PUT', body: files[tipo] });
    }
  }

  root.SAS_CENTRAL = { ativo, url, sessao, login, sair, enviar, req };
})(window);
