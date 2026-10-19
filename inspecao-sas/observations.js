/* ======================================================================
   INSPEÇÃO SAS — CÓDIGO DA RESIDÊNCIA E OBSERVAÇÕES TÉCNICAS
   Lógica pura (sem DOM), usada pela tela e pelos testes em Node.
====================================================================== */
(function(root){
  const CFG = root.SAS_CONFIG || (typeof require !== 'undefined' ? require('./config.js') : null);

  function getCommunity(id){ return CFG.communities.find(c => c.id === id) || null; }

  function normalizeHouseNumber(n){
    const digits = String(n || '').replace(/\D/g, '').slice(0, 2);
    return digits ? digits.padStart(2, '0') : '';
  }

  // Erro de validação do número contra o total de moradias, ou null.
  function houseNumberError(communityId, houseNumber){
    const c = getCommunity(communityId);
    const num = parseInt(houseNumber, 10);
    if (!houseNumber) return 'Informe o número da residência.';
    if (!c) return null;
    if (!(num >= 1 && num <= c.moradias)) return `Número fora do intervalo: ${c.nome} tem ${c.moradias} moradias (01 a ${String(c.moradias).padStart(2, '0')}).`;
    return null;
  }

  // Código da residência (relatório, estaca, arquivos): prefixo + número,
  // ex.: POE01. Partes ausentes viram placeholder visível.
  function buildHouseCode(communityId, houseNumber){
    const c = getCommunity(communityId);
    const prefix = c ? (c.prefix || '[PREFIXO A CONFIRMAR]') : '[COMUNIDADE]';
    const num = normalizeHouseNumber(houseNumber) || '[Nº]';
    return prefix + num;
  }
  // Registro da residência no memorial descritivo (Tabela 1), como no
  // modelo: número do projeto + código, ex.: 86204POE01.
  function buildRegistryCode(communityId, houseNumber){
    return CFG.projectCode + buildHouseCode(communityId, houseNumber);
  }
  function houseCodeComplete(code){ return !!code && !code.includes('['); }

  /* ------------------------------------------------------------------
     CHIPS
     Somente a frase "poço + bombeamento sim" vem dos relatórios reais.
     TODAS as demais frases abaixo são RASCUNHOS DE REDAÇÃO PARA
     VALIDAÇÃO DO JULIANO (marcadas com "RASCUNHO").
  ------------------------------------------------------------------ */
  const CHIPS = [
    { key: 'agua', label: 'Origem da água fria', options: [
      { v: 'poco', t: 'Poço' }, { v: 'caixa', t: "Caixa d'água alta (central)" }, { v: 'outra', t: 'Outra', free: true } ] },
    { key: 'bomba', label: 'Bombeamento necessário', options: [
      { v: 'sim', t: 'Sim' }, { v: 'nao', t: 'Não' }, { v: 'verificar', t: 'A verificar' } ] },
    { key: 'banheiro', label: 'Banheiro', options: [
      { v: 'existe', t: 'Existe' }, { v: 'nao', t: 'Não existe' } ] },
    { key: 'chuveiro', label: 'Chuveiro', options: [
      { v: 'existe', t: 'Existe' }, { v: 'nao', t: 'Não existe' }, { v: 'nv', t: 'Não foi possível verificar' } ] },
    { key: 'sombra', label: 'Sombreamento sobre o local da estaca', options: [
      { v: 'sem', t: 'Sem sombreamento' }, { v: 'parcial', t: 'Parcial' }, { v: 'total', t: 'Total' } ] },
    { key: 'terreno', label: 'Terreno', options: [
      { v: 'estavel', t: 'Estável' }, { v: 'instavel', t: 'Instável', free: true } ] },
    { key: 'proximidade', label: 'Proximidade da estaca ao banheiro', options: [
      { v: 'adequada', t: 'Adequada' }, { v: 'distante', t: 'Distante', free: true } ] }
  ];

  function clean(s){ return String(s || '').trim().replace(/[.;,\s]+$/, ''); }
  function lowerFirst(s){ return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

  // chips: { agua: 'poco', agua_txt: '...', bomba: 'sim', ... }
  function buildChipSentences(chips){
    chips = chips || {};
    const out = [];

    // Água fria + bombeamento
    if (chips.agua){
      let origem;
      if (chips.agua === 'poco') origem = 'poço';
      else if (chips.agua === 'caixa') origem = "caixa d'água elevada, com abastecimento central"; // RASCUNHO
      else origem = clean(chips.agua_txt) ? lowerFirst(clean(chips.agua_txt)) : '[ORIGEM DA ÁGUA FRIA]';  // RASCUNHO

      let s = 'Como observação técnica, verificou-se que o abastecimento de água fria destinado à alimentação do reservatório térmico é proveniente de ' + origem;
      if (chips.bomba === 'sim') s += ', sendo necessária a utilização de sistema de bombeamento para garantir o fornecimento adequado de água ao sistema.';
      else if (chips.bomba === 'nao') s += ', não sendo necessária a utilização de sistema de bombeamento.'; // RASCUNHO
      else if (chips.bomba === 'verificar') s += ', devendo a necessidade de sistema de bombeamento ser verificada antes da execução.'; // RASCUNHO
      else s += '.';
      out.push(s);
    } else if (chips.bomba){
      // RASCUNHO: bombeamento informado sem origem da água
      if (chips.bomba === 'sim') out.push('Verificou-se a necessidade de utilização de sistema de bombeamento para garantir o fornecimento adequado de água fria ao sistema.');
      else if (chips.bomba === 'nao') out.push('Não foi identificada a necessidade de sistema de bombeamento para o fornecimento de água fria ao sistema.');
      else out.push('A necessidade de sistema de bombeamento para o fornecimento de água fria deverá ser verificada antes da execução.');
    }

    // RASCUNHO: banheiro
    if (chips.banheiro === 'existe') out.push('A residência possui banheiro.');
    else if (chips.banheiro === 'nao') out.push('Verificou-se que a residência não possui banheiro.');

    // RASCUNHO: chuveiro
    if (chips.chuveiro === 'existe') out.push('Verificou-se a existência de chuveiro na residência.');
    else if (chips.chuveiro === 'nao') out.push('Verificou-se que a residência não possui chuveiro.');
    else if (chips.chuveiro === 'nv') out.push('Não foi possível verificar a existência de chuveiro na residência.');

    // RASCUNHO: sombreamento
    if (chips.sombra === 'sem') out.push('O local definido para a instalação do sistema não apresenta sombreamento.');
    else if (chips.sombra === 'parcial') out.push('O local definido para a instalação do sistema apresenta sombreamento parcial.');
    else if (chips.sombra === 'total') out.push('O local definido para a instalação do sistema apresenta sombreamento total.');

    // RASCUNHO: terreno
    if (chips.terreno === 'estavel') out.push('O terreno no local previsto para a instalação apresenta-se estável.');
    else if (chips.terreno === 'instavel'){
      const d = clean(chips.terreno_txt);
      out.push('O terreno no local previsto para a instalação apresenta-se instável' + (d ? ' (' + lowerFirst(d) + ').' : '.'));
    }

    // RASCUNHO: proximidade da estaca ao banheiro
    if (chips.proximidade === 'adequada') out.push('O local da estaca encontra-se a uma distância adequada do banheiro.');
    else if (chips.proximidade === 'distante'){
      const d = clean(chips.proximidade_txt);
      out.push('O local da estaca encontra-se distante do banheiro' + (d ? ' (' + lowerFirst(d) + ').' : '.'));
    }

    return out;
  }

  // Segundo bloco das observações (chips + texto livre). O 1º parágrafo é fixo.
  function buildObservationText(chips, freeText){
    const parts = [];
    const s = buildChipSentences(chips);
    if (s.length) parts.push(s.join(' '));
    const free = String(freeText || '').trim();
    if (free) parts.push(free);
    return parts.join('\n\n');
  }

  // Remove travessões longos (regra do documento).
  function noLongDash(s){ return String(s || '').replace(/\s*[—–]\s*/g, ' - '); }

  const api = { CHIPS, getCommunity, normalizeHouseNumber, houseNumberError, buildHouseCode, buildRegistryCode, houseCodeComplete,
    buildChipSentences, buildObservationText, noLongDash };
  root.SAS_OBS = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
