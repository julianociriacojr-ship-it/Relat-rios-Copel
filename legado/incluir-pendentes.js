/* ======================================================================
   RDO, VISITA, ENTREGA E OS — NADA PREENCHIDO FICA DE FORA DO RELATÓRIO
   Etapas, pendências, pessoas, materiais e testes só entravam no relatório
   depois do toque em "✓ Incluir". Quem preenchia (foto, texto) e já ia em
   "Gerar PDF" perdia o item, inclusive ao editar um item já incluído.
   Agora, ao gerar o PDF, o Word ou enviar à central, o que estiver
   preenchido e aberto é incluído antes, como se o botão tivesse sido tocado.
====================================================================== */
(function(){
  const TELAS = { rdo: 'RDO', visita: 'Visita', entrega: 'Entrega', os: 'OS' };

  // Quadro aberto com algo preenchido: texto digitado ou foto na prévia
  function preenchido(card){
    const texto = [...card.querySelectorAll('input:not([type=file]):not([type=checkbox]), textarea')].some(el => el.value.trim());
    const fotos = [...card.querySelectorAll('[id$="fotos-preview"]')].some(el => el.children.length);
    return texto || fotos;
  }
  const abertos = tela => [...document.querySelectorAll(`#screen-${tela} .stage-card`)]
    .filter(card => card.style.display !== 'none' && preenchido(card));

  // Inclui o que ficou aberto. Devolve false se algo não pôde entrar e a
  // pessoa preferiu voltar para completar.
  function incluirPendentes(tela){
    const lista = abertos(tela);
    lista.forEach(card => { const b = card.querySelector('.btn-incluir'); if (b) b.click(); });
    const sobrou = abertos(tela);
    if (lista.length > sobrou.length && typeof showToast === 'function')
      showToast('✓ Item preenchido e não incluído entrou no relatório', 2500);
    if (sobrou.length){
      const ok = confirm('Há um item preenchido que não entrou no relatório porque falta o campo marcado em vermelho.\n\nOK: gerar mesmo assim (sem esse item)\nCancelar: voltar e completar');
      if (!ok){ sobrou[0].scrollIntoView({ behavior: 'smooth', block: 'center' }); return false; }
    }
    return true;
  }

  Object.entries(TELAS).forEach(([tela, nome]) => {
    ['gerarPDF' + nome, 'gerarWord' + nome].forEach(fn => {
      const original = window[fn];
      if (typeof original !== 'function') return;
      window[fn] = function(){ if (incluirPendentes(tela)) return original.apply(this, arguments); };
    });
  });
  window.SM_INCLUIR_PENDENTES = incluirPendentes;
})();
